// api/webhook.js
// Vercel Serverless Function — listens for Stripe payment events
// When a customer pays, Stripe calls this endpoint automatically
// This marks the invoice as paid in Supabase and can trigger notifications

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// You'll need to add STRIPE_WEBHOOK_SECRET to your Vercel env variables
// Get it from: Stripe Dashboard → Developers → Webhooks → Add endpoint
// Endpoint URL: https://yoursite.vercel.app/api/webhook
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Supabase client for updating invoice status
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Use service key here (server-side only, never in browser)
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the webhook came from Stripe (not a fake request)
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the events we care about
  switch (event.type) {

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const invoiceNumber = paymentIntent.metadata?.invoice_number;
      const customerEmail = paymentIntent.metadata?.customer_email;
      const amount = paymentIntent.amount_received; // in pence

      console.log(`Payment succeeded: ${invoiceNumber} — £${(amount / 100).toFixed(2)}`);

      // TODO: Update invoice status in Supabase when you have an invoices table
      // Example:
      // await supabase
      //   .from('invoices')
      //   .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_id: paymentIntent.id })
      //   .eq('invoice_number', invoiceNumber);

      break;
    }

    case 'payment_link.completed': {
      const paymentLink = event.data.object;
      console.log('Payment link completed:', paymentLink.id);
      break;
    }

    case 'charge.dispute.created': {
      // A customer has disputed a payment — flag it
      const dispute = event.data.object;
      console.log('Dispute created for charge:', dispute.charge);
      // TODO: notify the tradesperson via email
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Always return 200 to Stripe so it knows you received the event
  return res.status(200).json({ received: true });
};

// Helper to get raw request body (needed for Stripe signature verification)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
