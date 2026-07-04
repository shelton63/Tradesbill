// api/create-subscription.js
// Creates a Stripe Checkout Session for a monthly subscription
// Returns a redirect URL to Stripe's hosted checkout page

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { priceId, plan, customerEmail, successUrl, cancelUrl, couponId } = req.body;

    if (!priceId || priceId.includes('_ID_HERE')) {
      return res.status(400).json({ error: 'Stripe Price ID not configured yet. Add your price IDs to upgrade.html.' });
    }

    // Find or create Stripe customer
    let customer;
    const existing = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: { plan, source: 'Primo Invoice' }
      });
    }

    // Build session params
    const sessionParams = {
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl + '&plan=' + plan + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      subscription_data: {
        metadata: { plan, source: 'Primo Invoice' }
      },
      metadata: { plan, customerEmail, source: 'Primo Invoice' }
    };

    // Apply retention discount coupon if provided
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch(err) {
    console.error('Subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
};
