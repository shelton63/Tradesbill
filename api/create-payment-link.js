// api/create-payment-link.js
// Vercel Serverless Function — creates a Stripe Payment Link for an invoice
// This runs on Vercel's servers, never in the browser — your secret key is safe here

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers — allow your Vercel domain to call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const {
      customerName,
      customerEmail,
      jobDescription,
      amount,        // Amount in pence (e.g. £19.99 = 1999)
      invoiceNumber,
      vatRate        // e.g. 0, 5, or 20
    } = req.body;

    // Validate required fields
    if (!customerEmail || !amount || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields: customerEmail, amount, jobDescription' });
    }

    if (amount < 50) {
      return res.status(400).json({ error: 'Minimum amount is 50p' });
    }

    // Create or retrieve a Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        name: customerName || customerEmail,
        metadata: { source: 'TradesBill' }
      });
    }

    // Build the line item description
    const description = invoiceNumber
      ? `${jobDescription} (${invoiceNumber})`
      : jobDescription;

    // Create a Stripe Payment Link
    // This generates a hosted payment page — no PCI compliance needed on your end
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: description,
              metadata: {
                invoice_number: invoiceNumber || '',
                customer_name: customerName || ''
              }
            },
            unit_amount: Math.round(amount) // amount already in pence
          },
          quantity: 1
        }
      ],
      payment_method_types: ['card', 'bacs_debit'],
      customer_creation: 'if_required',
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Thank you for your payment${customerName ? ', ' + customerName : ''}! Your invoice has been paid.`
        }
      },
      metadata: {
        invoice_number: invoiceNumber || '',
        customer_name: customerName || '',
        customer_email: customerEmail,
        source: 'TradesBill'
      }
    });

    // Return the payment link URL
    return res.status(200).json({
      success: true,
      paymentUrl: paymentLink.url,
      paymentLinkId: paymentLink.id
    });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create payment link'
    });
  }
};
