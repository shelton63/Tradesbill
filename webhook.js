// api/webhook.js
// Vercel Serverless Function — listens for Stripe payment and subscription events

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Map Stripe Price IDs to plan names
const PRICE_TO_PLAN = {
  'price_1TqhlGCsuXSeLOJoipwzrQmj': 'starter',   // £15/month
  'price_1TqhmyCsuXSeLOJoai0a855Z': 'pro',        // £29/month
  'price_1Tqho7CsuXSeLOJogi0UPm3D': 'business',   // £49/month
};

// Find a Supabase user by email and update their subscription status
async function updateUserSubscription(email, subscriptionActive, plan) {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) { console.error('Supabase listUsers error:', error); return; }

    const user = users.find(u => u.email?.toLowerCase() === email?.toLowerCase());
    if (!user) { console.log('No Supabase user found for:', email); return; }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        subscription_active: subscriptionActive,
        subscription_plan: subscriptionActive ? plan : null,
      },
    });

    if (updateError) {
      console.error('Failed to update subscription:', updateError);
    } else {
      console.log(`Updated ${email} → plan: ${plan}, active: ${subscriptionActive}`);
    }
  } catch (err) {
    console.error('updateUserSubscription error:', err);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  switch (event.type) {

    // ── Invoice payments (existing) ───────────────────────────────────────
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const invoiceNumber = paymentIntent.metadata?.invoice_number;
      const amount = paymentIntent.amount_received;
      console.log(`Payment succeeded: ${invoiceNumber} — £${(amount / 100).toFixed(2)}`);
      break;
    }

    case 'payment_link.completed': {
      const paymentLink = event.data.object;
      console.log('Payment link completed:', paymentLink.id);
      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      console.log('Dispute created for charge:', dispute.charge);
      break;
    }

    // ── Subscriptions (new) ───────────────────────────────────────────────
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      if (subscription.status !== 'active' && subscription.status !== 'trialing') break;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId] || 'starter';
      await updateUserSubscription(customer.email, true, plan);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      await updateUserSubscription(customer.email, false, null);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const customer = await stripe.customers.retrieve(invoice.customer);
        console.log('Payment failed for:', customer.email);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return res.status(200).json({ received: true });
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
