// api/webhook.js — Stripe webhook handler
// Automatically marks invoices as paid when customer pays via Stripe

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  try {
    switch (event.type) {

      // Payment link paid — main trigger for our invoices
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.payment_link) {
          // Find invoice by payment link ID or URL
          const plinkId = session.payment_link;
          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, user_id, customer_name, amount')
            .ilike('stripe_payment_link', '%' + plinkId + '%')
            .limit(1);

          if (invoices && invoices.length > 0) {
            const inv = invoices[0];
            await supabase.from('invoices').update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_session_id: session.id,
              payment_method: getPaymentMethod(session.payment_method_types)
            }).eq('id', inv.id);

            console.log(`✅ Invoice paid: ${inv.id} — ${inv.customer_name} — £${(inv.amount)}`);
          }
        }
        break;
      }

      // Direct payment intent (card/Apple Pay/Google Pay)
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const invNum = pi.metadata?.invoice_number;
        const plinkId = pi.metadata?.payment_link;

        if (invNum) {
          await supabase.from('invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_id: pi.id,
            payment_method: pi.payment_method_types?.[0] || 'card'
          }).eq('number', invNum);
        }

        if (plinkId) {
          await supabase.from('invoices').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_id: pi.id,
          }).ilike('stripe_payment_link', '%' + plinkId + '%');
        }
        break;
      }

      // Dispute — flag the invoice
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        await supabase.from('invoices').update({
          status: 'disputed',
          dispute_id: dispute.id
        }).eq('stripe_payment_id', dispute.payment_intent);
        console.log('⚠️ Dispute:', dispute.id);
        break;
      }

      // Refund
      case 'charge.refunded': {
        const charge = event.data.object;
        await supabase.from('invoices').update({
          status: 'refunded',
          refunded_at: new Date().toISOString()
        }).eq('stripe_payment_id', charge.payment_intent);
        break;
      }

      default:
        console.log('Unhandled event:', event.type);
    }
  } catch(err) {
    console.error('Webhook handler error:', err);
  }

  return res.status(200).json({ received: true });
};

function getPaymentMethod(types) {
  if (!types || !types.length) return 'card';
  if (types.includes('apple_pay')) return 'apple_pay';
  if (types.includes('google_pay')) return 'google_pay';
  return types[0] || 'card';
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
