// Stripe webhook handler â€” updated for Zigns.io integration
const Stripe = require('stripe');
function getStripe(livemode) {
  const key = livemode
    ? process.env.STRIPE_SECRET_KEY
    : (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY);
  return Stripe(key);
}
let   admin;

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
  starter: { screensAllowed: 1, usersAllowed: 1, storageGb: 1  },
  pro:     { screensAllowed: 1, usersAllowed: 5, storageGb: 10 },
  'early-adopter': { screensAllowed: 9999, usersAllowed: 9999, storageGb: 50 },
  free:    { screensAllowed: 1, usersAllowed: 1, storageGb: 1  },
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

  // Try primary secret, then fall back to test secret if set separately
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_TEST,
  ].filter(Boolean);

  console.log('Webhook secrets available:', secrets.length);

  if (secrets.length === 0) {
    console.error('No webhook secrets configured (STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_TEST)');
    return res.status(500).send('Webhook Error: No secrets configured');
  }

  let lastErr;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    console.error('Webhook signature verification failed:', lastErr.message);
    console.error('  raw body length:', rawBody.length);
    console.error('  stripe-signature present:', !!sig);
    console.error('  secrets tried:', secrets.length);
    return res.status(400).send(`Webhook Error: ${lastErr.message}`);
  }

  const db = getFirestore();
  const stripe = getStripe(event.livemode);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orgId   = session.metadata?.orgId;
        const plan    = session.metadata?.plan || 'starter';
        const source  = session.metadata?.source;

        // Fetch subscription to get quantity (number of screens)
        let screensCount = 1;
        if (plan === 'pro') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          screensCount = subscription.items.data[0].quantity || 1;
        }

        const subscriptionData = {
          plan,
          status: 'active',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          ...(PLAN_LIMITS[plan] || PLAN_LIMITS.starter),
          screensAllowed: plan === 'pro' ? screensCount : (PLAN_LIMITS[plan]?.screensAllowed || 1),
        };

        if (orgId) {
          await updateOrgSubscription(db, orgId, subscriptionData);
        } else if (source === 'marketing_site') {
          const email = session.customer_details?.email;
          if (email) {
            await db.collection('pending_subscriptions').doc(email.toLowerCase()).set({
              ...subscriptionData,
              email: email.toLowerCase(),
              updatedAt: new Date().toISOString()
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub   = event.data.object;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const priceId = sub.items?.data?.[0]?.price?.id;
        let plan = 'starter';
        if (priceId === 'price_1TK02WRuAPPHV19GvMremOT1' || priceId === 'price_1TK03GRuAPPHV19GG2FZJFsi') plan = 'pro';
        if (priceId === 'price_1TK09LRuAPPHV19GsVkAieXE' || priceId === 'price_1TK09LRuAPPHV19GZIGFuNIG') plan = 'early-adopter';

        const screensCount = sub.items?.data?.[0]?.quantity || 1;

        await updateOrgSubscription(db, orgId, {
          plan,
          status:               sub.status,
          stripeCustomerId:     sub.customer,
          stripeSubscriptionId: sub.id,
          screensAllowed:       plan === 'pro' ? screensCount : (PLAN_LIMITS[plan]?.screensAllowed || 1),
          currentPeriodEnd:     new Date(sub.current_period_end * 1000).toISOString(),
          ...(PLAN_LIMITS[plan] || PLAN_LIMITS.starter),
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
