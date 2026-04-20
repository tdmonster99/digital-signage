// Stripe webhook handler â€” updated for Zigns.io integration
const Stripe = require('stripe');
// Used only for signature verification — no API calls, key doesn't matter
const stripeVerifier = Stripe('dummy');
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
  free:            { screensAllowed: 1,    usersAllowed: 1,    storageGb: 1   },
  standard:        { screensAllowed: 1,    usersAllowed: 3,    storageGb: 10  },
  premium:         { screensAllowed: 1,    usersAllowed: 10,   storageGb: 50  },
  'early-adopter': { screensAllowed: 9999, usersAllowed: 9999, storageGb: 50 },
  enterprise:      { screensAllowed: 9999, usersAllowed: 9999, storageGb: 100 },
  // Legacy plan keys map to the new public pricing structure.
  starter:         { screensAllowed: 1,    usersAllowed: 3,    storageGb: 10  },
  pro:             { screensAllowed: 1,    usersAllowed: 10,   storageGb: 50  },
};

const PLAN_LABELS = {
  'free':          'Starter',
  'starter':       'Standard',
  'standard':      'Standard',
  'pro':           'Premium',
  'premium':       'Premium',
  'early-adopter': 'Early Adopter',
  'enterprise':    'Enterprise',
};

const PER_SCREEN_PLANS = new Set(['standard', 'premium', 'starter', 'pro']);

function canonicalPlanKey(plan) {
  if (plan === 'starter') return 'standard';
  if (plan === 'pro') return 'premium';
  if (plan === 'ea') return 'early-adopter';
  return plan || 'free';
}

function planFromPriceId(priceId) {
  const mappings = [
    [process.env.STRIPE_STANDARD_PRICE_ID, 'standard'],
    [process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID, 'standard'],
    [process.env.STRIPE_STANDARD_ANNUAL_PRICE_ID, 'standard'],
    [process.env.STRIPE_PREMIUM_PRICE_ID, 'premium'],
    [process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID, 'premium'],
    [process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID, 'premium'],
    [process.env.STRIPE_EARLY_ADOPTER_PRICE_ID, 'early-adopter'],
    [process.env.STRIPE_EARLY_ADOPTER_MONTHLY_PRICE_ID, 'early-adopter'],
    [process.env.STRIPE_EARLY_ADOPTER_ANNUAL_PRICE_ID, 'early-adopter'],
    // Existing marketing-site price IDs: $5 per-screen and $50 early-adopter.
    ['price_1TK02WRuAPPHV19GvMremOT1', 'standard'],
    ['price_1TK03GRuAPPHV19GG2FZJFsi', 'standard'],
    ['price_1TK0rRRudWboEbYXjnNkzBNO', 'standard'],
    ['price_1TK0rORudWboEbYXWdnlb1EI', 'standard'],
    ['price_1TK09LRuAPPHV19GsVkAieXE', 'early-adopter'],
    ['price_1TK09LRuAPPHV19GZIGFuNIG', 'early-adopter'],
    ['price_1TK0rQRudWboEbYXZNxV8ql3', 'early-adopter'],
    ['price_1TK0rPRudWboEbYXod5Jjvqt', 'early-adopter'],
  ];
  const match = mappings.find(([id]) => id && id === priceId);
  return match ? match[1] : null;
}

async function sendWelcomeEmail(email, plan) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('RESEND_API_KEY not set — skipping welcome email'); return; }

  const planLabel = PLAN_LABELS[canonicalPlanKey(plan)] || plan;
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a2e44">
      <div style="margin-bottom:32px">
        <a href="https://www.zigns.io" style="text-decoration:none;display:inline-block">
          <span style="border:4px solid #0f1b29;width:40px;height:40px;line-height:40px;display:inline-block;text-align:center;font-weight:700;font-size:28px;color:#0f1b29;vertical-align:middle">Z</span>
          <span style="font-size:34px;font-weight:700;color:#0f1b29;letter-spacing:0.05em;vertical-align:middle;margin-left:4px">IGNS</span>
        </a>
      </div>
      <h1 style="font-size:24px;margin:0 0 12px">You're all set.</h1>
      <p style="font-size:16px;color:#4b5563;line-height:1.6;margin:0 0 8px">
        Thanks for subscribing to the <strong>${planLabel}</strong> plan.
      </p>
      <p style="font-size:16px;color:#4b5563;line-height:1.6;margin:0 0 32px">
        Sign in with this email address to activate your account and get your first screen live.
      </p>
      <a href="https://app.zigns.io" style="display:inline-block;background:#0043ce;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">
        Get Started →
      </a>
      <p style="font-size:14px;color:#9ca3af;margin-top:40px">
        The Zigns Team<br>
        <a href="mailto:hello@zigns.io" style="color:#9ca3af">hello@zigns.io</a>
      </p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Zigns <hello@zigns.io>', to: email, subject: `Welcome to Zigns ${planLabel}`, html }),
  });
  if (!res.ok) console.error('Welcome email failed:', await res.text());
}

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
      event = stripeVerifier.webhooks.constructEvent(rawBody, sig, secret);
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
        const plan    = canonicalPlanKey(session.metadata?.plan || 'standard');
        const source  = session.metadata?.source;

        // Fetch subscription to get quantity (number of screens)
        let screensCount = 1;
        if (PER_SCREEN_PLANS.has(plan)) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          screensCount = subscription.items.data[0].quantity || 1;
        }

        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.standard;
        const subscriptionData = {
          ...limits,
          plan,
          status: 'active',
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          screensAllowed: PER_SCREEN_PLANS.has(plan) ? screensCount : limits.screensAllowed,
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
            await sendWelcomeEmail(email, plan);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub   = event.data.object;
        const orgId = sub.metadata?.orgId;
        if (!orgId) break;

        const priceId = sub.items?.data?.[0]?.price?.id;
        let plan = canonicalPlanKey(sub.metadata?.plan || planFromPriceId(priceId) || 'standard');
        if (!PLAN_LIMITS[plan]) plan = 'standard';

        const screensCount = sub.items?.data?.[0]?.quantity || 1;
        const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.standard;

        await updateOrgSubscription(db, orgId, {
          ...limits,
          plan,
          status:               sub.status,
          stripeCustomerId:     sub.customer,
          stripeSubscriptionId: sub.id,
          screensAllowed:       PER_SCREEN_PLANS.has(plan) ? screensCount : limits.screensAllowed,
          currentPeriodEnd:     new Date(sub.current_period_end * 1000).toISOString(),
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
