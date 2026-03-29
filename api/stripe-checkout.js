// Creates a Stripe Checkout session and returns the session URL.
// Required env vars (Vercel Dashboard → Settings → Environment Variables):
//   STRIPE_SECRET_KEY      — from Stripe Dashboard → Developers → API Keys
//   STRIPE_STARTER_PRICE_ID — Price ID for Starter plan ($9/mo)
//   STRIPE_PRO_PRICE_ID     — Price ID for Pro plan ($19/mo)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  starter: { priceId: process.env.STRIPE_STARTER_PRICE_ID, name: 'Starter' },
  pro:     { priceId: process.env.STRIPE_PRO_PRICE_ID,     name: 'Pro'     },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured.' });
  }

  const { orgId, plan, customerEmail, stripeCustomerId } = req.body || {};
  if (!orgId || !plan) return res.status(400).json({ error: 'orgId and plan are required' });

  const planConfig = PLANS[plan];
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan: ' + plan });
  if (!planConfig.priceId) return res.status(500).json({ error: `Price ID for ${plan} plan not configured.` });

  const baseUrl = process.env.VERCEL_URL
    ? 'https://' + process.env.VERCEL_URL
    : 'https://digital-signage-pi.vercel.app';

  try {
    const sessionParams = {
      mode:                'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${baseUrl}/admin.html?billing=success&plan=${plan}`,
      cancel_url:  `${baseUrl}/admin.html?billing=cancelled`,
      metadata:    { orgId, plan },
      subscription_data: { metadata: { orgId, plan } },
    };

    // Attach to existing customer if we have one, otherwise collect email
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
