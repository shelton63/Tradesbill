// api/create-connect-account.js
// Creates a Stripe Connect Express account and returns a hosted onboarding URL
// Uses Account Links API — no Client ID needed, just STRIPE_SECRET_KEY

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const { email, userId } = req.body;

    // Create a Stripe Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: email || undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: { userId: userId || '' }
    });

    // Create an Account Link for hosted onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: process.env.SITE_URL + '/onboarding-payments.html?reconnect=true',
      return_url:  process.env.SITE_URL + '/onboarding-payments.html?connected=true&account_id=' + account.id,
      type: 'account_onboarding',
    });

    return res.status(200).json({
      url: accountLink.url,
      accountId: account.id
    });

  } catch(err) {
    console.error('Connect error:', err);
    return res.status(500).json({ error: err.message });
  }
};
