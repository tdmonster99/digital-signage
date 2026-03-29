// Stripe webhook handler — listens for subscription events and updates Firestore.
//
// Required env vars (Vercel Dashboard → Settings → Environment Variables):
//   STRIPE_SECRET_KEY              — Stripe secret key
//   STRIPE_WEBHOOK_SECRET          — from Stripe Dashboard → Developers → Webhooks → signing secret
//   FIREBASE_SERVICE_ACCOUNT_JSON  — Firebase service account JSON (as a string)
//                                    Get from: Firebase Console → Project Settings →
//                                    Service Accounts → Generate New Private Key
//
// Register this webhook in Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL: https://digital-signage-pi.vercel.app/api/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//            customer.subscription.deleted

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
let   admin;  // lazily initialized

function getFirestore() {
  if (!admin) {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  }
  return admin.firestore();
}

// Stripe requires the raw body for signature verification
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const PLAN_LIMITS = {
  starter: { screensAllowed: 3,   usersAllowed: 3,   storageGb: 5  },
  pro:     { screensAllowed: 9999, usersAllowed: 9999, storageGb: 50 },
  free:    { screensAllowed: 1,   usersAllowed: 1,   storageGb: 1  },
};

async function updateOrgSubscription(db, orgId, data) {
  await db.collection('organizations').doc(orgId).update({
    subscription: { ...data, updatedAt: new Date().toISOString() },
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);
  let   event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getFirestore();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId   = session.metadata?.orgId;
        const plan    = session.metadata?.plan || 'starter';
        if (!orgId) break;

        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
        await updateOrgSubscription(db, orgId, {
          plan,
          status:               'active',
          stripeCustomerId:     session.customer,
          stripeSubscriptionId: session.subscription,
          ...limits,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub   = event.data.object;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        // Determine plan from price ID
        const priceId = sub.items?.data?.[0]?.price?.id;
        let plan = 'starter';
        if (priceId === process.env.STRIPE_PRO_PRICE_ID)     plan = 'pro';
        if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = 'starter';

        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
        await updateOrgSubscription(db, orgId, {
          plan,
          status:               sub.status,
          stripeCustomerId:     sub.customer,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd:     new Date(sub.current_period_end * 1000).toISOString(),
          ...limits,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub   = event.data.object;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        await updateOrgSubscription(db, orgId, {
          plan:                 'free',
          status:               'canceled',
          stripeSubscriptionId: null,
          ...PLAN_LIMITS.free,
        });
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
