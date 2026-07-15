// ── Add this to your existing webhook.js ────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Use your existing service key variable name
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Replace these with your real Stripe Price IDs ────────────────────────────
// Find them: Stripe dashboard → Products → click each plan → copy Price ID
const PRICE_TO_PLAN = {
  'price_1TqhlGCsuXSeLOJoipwzrQmj':  'starter',
  'price_1TqhmyCsuXSeLOJoai0a855Z':      'pro',
  'price_1Tqho7CsuXSeLOJogi0UPm3D': 'business',
};

// ── Helper: find Supabase user by email and update subscription status ────────
async function updateUserSubscription(email, subscriptionActive, plan) {
  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) { console.error('Supabase listUsers error:', error); return; }

    const user = users.find(u => u.email?.toLowerCase() === email?.toLowerCase());
    if (!user) { console.log('No Supabase user found for:', email); return; }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
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

// ── Add these cases inside your existing switch(event.type) block ─────────────

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
