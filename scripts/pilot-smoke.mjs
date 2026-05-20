#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSmokeEnv } from './smoke-env.mjs';

loadSmokeEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--static') {
      out.static = true;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--')) {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const config = {
  baseUrl: String(args['base-url'] || process.env.ZIGNS_SMOKE_BASE_URL || 'https://app.zigns.io').replace(/\/+$/, ''),
  staticOnly: Boolean(args.static || process.env.ZIGNS_SMOKE_STATIC === '1'),
  skipAuth: Boolean(args['skip-auth'] || process.env.ZIGNS_SMOKE_SKIP_AUTH === '1'),
  json: Boolean(args.json || process.env.ZIGNS_SMOKE_JSON === '1'),
  email: args.email || process.env.ZIGNS_SMOKE_EMAIL || '',
  password: args.password || process.env.ZIGNS_SMOKE_PASSWORD || '',
  expectedOrg: args['expected-org'] || process.env.ZIGNS_SMOKE_EXPECTED_ORG || '',
  expectedRole: args['expected-role'] || process.env.ZIGNS_SMOKE_EXPECTED_ROLE || '',
  inviteEmail: args['invite-email'] || process.env.ZIGNS_SMOKE_INVITE_EMAIL || '',
  inviteRole: args['invite-role'] || process.env.ZIGNS_SMOKE_INVITE_ROLE || 'viewer',
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_SMOKE_TIMEOUT_MS || '12000', 10),
};

const results = [];

function addResult(status, name, details = '') {
  results.push({ status, name, details });
}

async function check(name, fn) {
  try {
    const details = await fn();
    addResult('pass', name, details || '');
  } catch (error) {
    addResult('fail', name, error?.message || String(error));
  }
}

function warn(name, details) {
  addResult('warn', name, details);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readText(file) {
  return fs.readFile(path.join(ROOT, file), 'utf8');
}

async function assertFileContains(file, patterns) {
  const text = await readText(file);
  for (const pattern of patterns) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    assert(ok, `${file} is missing ${String(pattern)}`);
  }
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'ZignsPilotSmoke/1.0',
      ...(options.headers || {}),
    },
  }).catch(error => {
    const cause = error?.cause;
    const detail = cause?.code
      ? `${cause.code}${cause.hostname ? ` ${cause.hostname}` : ''}`
      : (error?.message || String(error));
    throw new Error(`Request failed for ${redactUrlForLog(url)}: ${detail}`);
  }).finally(() => clearTimeout(timeout));
}

function redactUrlForLog(input) {
  try {
    const url = new URL(input);
    for (const key of ['key', 'token', 'idToken', 'password']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
    }
    return url.toString();
  } catch {
    return String(input).replace(/([?&](?:key|token|idToken|password)=)[^&\s]+/gi, '$1[redacted]');
  }
}

async function checkPublicPage(route, expectedText) {
  const url = `${config.baseUrl}${route}`;
  const resp = await fetchWithTimeout(url);
  assert(resp.ok, `${url} returned HTTP ${resp.status}`);
  const text = await resp.text();
  assert(text.includes(expectedText), `${url} did not include expected marker: ${expectedText}`);
  return `HTTP ${resp.status}`;
}

function extractFirebaseApiKey(source) {
  const match = source.match(/apiKey:\s*["']([^"']+)["']/);
  return match?.[1] || '';
}

async function runAuthBootstrapCheck() {
  if (!config.email || !config.password) {
    warn('Authenticated bootstrap', 'skipped; set ZIGNS_SMOKE_EMAIL and ZIGNS_SMOKE_PASSWORD for a dedicated email/password test account');
    return;
  }

  const adminHtml = await readText('admin.html');
  const apiKey = extractFirebaseApiKey(adminHtml);
  assert(apiKey, 'could not find Firebase web API key in admin.html');

  const authResp = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      returnSecureToken: true,
    }),
  });
  const authBody = await authResp.json().catch(() => ({}));
  assert(authResp.ok, `Firebase sign-in failed: ${authBody.error?.message || `HTTP ${authResp.status}`}`);
  assert(authBody.idToken, 'Firebase sign-in did not return an idToken');

  const bootstrapResp = await fetchWithTimeout(`${config.baseUrl}/api/link-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'bootstrap', idToken: authBody.idToken }),
  });
  const boot = await bootstrapResp.json().catch(() => ({}));
  assert(bootstrapResp.ok && boot.ok === true, `bootstrap failed: ${boot.error || `HTTP ${bootstrapResp.status}`}`);

  const orgName = boot.org?.name || '';
  const role = boot.user?.role || '';
  if (config.expectedOrg) {
    assert(orgName === config.expectedOrg, `expected org "${config.expectedOrg}", got "${orgName || 'unknown'}"`);
  }
  if (config.expectedRole) {
    assert(role === config.expectedRole, `expected role "${config.expectedRole}", got "${role || 'unknown'}"`);
  }

  addResult('pass', 'Authenticated bootstrap', `user=${authBody.email || config.email}; org=${orgName || 'unknown'}; role=${role || 'unknown'}`);

  if (config.inviteEmail) {
    const inviteResp = await fetchWithTimeout(`${config.baseUrl}/api/link-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createInvitation',
        idToken: authBody.idToken,
        email: config.inviteEmail,
        role: config.inviteRole,
      }),
    });
    const invite = await inviteResp.json().catch(() => ({}));
    assert(inviteResp.ok && invite.ok === true, `invite creation failed: ${invite.error || `HTTP ${inviteResp.status}`}`);
    assert(invite.inviteId, 'invite creation did not return an inviteId');
    assert(invite.emailSent === true, `invite email was not accepted for delivery: ${invite.emailError || 'unknown error'}`);
    addResult('pass', 'Invite email accepted', `invitee=${config.inviteEmail}; role=${config.inviteRole}; id=${invite.emailId || 'not returned'}`);
  } else {
    warn('Invite email accepted', 'skipped; set ZIGNS_SMOKE_INVITE_EMAIL to send a real invite from the authenticated admin test account');
  }
}

async function main() {
  await check('Static admin hooks', () => assertFileContains('admin.html', [
    'openIssueReportModal',
    'pairingNameSection',
    'copyPlayerSetupUrl',
    'https://app.zigns.io/display.html',
    'emergencyPlaylist',
    'priority',
    'sepCapEnabled',
    'sendCapTestAlert',
    'clearCapTestAlert',
    'sepCapSendTestBtn',
    'applyCapStateSuggestion',
    'normalizeCapFipsField',
    'sepCapStateSuggestions',
    'addFromGooglePhotos',
    'dashAddFromGooglePhotos',
    'designerImageFromGooglePhotos',
    'photospicker.googleapis.com',
    'gphotosModal',
    'gphotosSignIn',
    'gphotosSelectMedia',
    'gphotosAuthBtn',
    'gphotosSelectBtn',
    'gphotosSetupChecklist',
    'Google setup checklist',
    'photospicker.mediaitems.readonly',
    'Google Photos Picker API',
    'capSupportGuidance',
    'sepCapLanguage',
    'sepCapSpanishNote',
    'renderCapLanguageHelp',
    'Schools: start with Severe/Extreme',
    'Healthcare: use campus county FIPS',
    'Manufacturing: use whole-state targeting',
    'emergencyAuditList',
    'loadEmergencyAuditHistory',
    'setEmergencyBroadcast',
    'clearEmergencyBroadcast',
    'shouldProbeUnmarkedSubcollections',
    "callAccountApi('createOrganization'",
    "callAccountApi('saveOrganizationSettings'",
    "callAccountApi('sendApprovalNotification'",
    'createInvitation',
    "callAccountApi('removeMember'",
    'emailSent',
    'showOptionsModal',
    'showOptionsTags',
    'showOptionsAutoTags',
    'emergencyPlaylistManagerModal',
    'openEmergencyPlaylistManager',
    'broadcastConfirm',
    'No emergency playlists marked',
    'No emergency playlists ready',
    'assets/brand/google-drive.png',
    'assets/brand/google-photos.svg',
    'assets/brand/onedrive.svg',
    'assets/brand/dropbox.svg',
    'assets/brand/youtube.png',
    'assets/brand/canva.svg',
    'sortScreensForDisplay',
    'isStaleScreen',
    'screens-stale-banner',
    'screen-stale-chip',
  ]));

  await check('Static team removal API', () => assertFileContains('api/link-account.js', [
    "req.body.action === 'removeMember'",
    'Cannot remove the organization owner.',
    'Cannot remove the last admin. Promote another member to admin first.',
    'removedMembers',
  ]));

  await check('Static organization creation API', async () => {
    const adminHtml = await readText('admin.html');
    const apiText = await readText('api/link-account.js');
    const rulesText = await readText('firestore.rules');
    const createOrgMatch = adminHtml.match(/async function createOrg\(user\) \{[\s\S]*?\n\}/);
    assert(createOrgMatch, 'admin.html is missing createOrg(user)');
    assert(createOrgMatch[0].includes("callAccountApi('createOrganization'"), 'createOrg still bypasses the account API');
    assert(!createOrgMatch[0].includes("setDoc(doc(db, 'organizations'"), 'createOrg still writes organizations directly');
    assert(apiText.includes("req.body.action === 'createOrganization'"), 'api/link-account.js is missing createOrganization');
    assert(apiText.includes('FREE_SUBSCRIPTION'), 'api/link-account.js is missing server-controlled free subscription defaults');
    assert(rulesText.includes('allow create: if false;'), 'firestore.rules still allows client organization creates');
  });

  await check('Static organization settings API', async () => {
    const adminHtml = await readText('admin.html');
    const apiText = await readText('api/link-account.js');
    const rulesText = await readText('firestore.rules');
    assert(apiText.includes("req.body.action === 'saveOrganizationSettings'"), 'api/link-account.js is missing saveOrganizationSettings');
    assert(apiText.includes("planHasFeature(orgData.subscription || {}, 'approvalWorkflow')"), 'saveOrganizationSettings does not enforce approval plan entitlement');
    assert(!adminHtml.includes("updateDoc(doc(db, 'organizations'"), 'admin.html still updates organization docs directly');
    assert(!adminHtml.includes("setDoc(doc(db, 'organizations'"), 'admin.html still sets organization docs directly');
    assert(rulesText.includes('request.resource.data.diff(resource.data).affectedKeys().hasOnly'), 'firestore.rules is missing narrow org update diff checks');
    assert(rulesText.includes("'screenLimitEnforcement'"), 'firestore.rules is missing the screenLimitEnforcement exception');
    assert(!rulesText.includes('allow update: if isAdmin(orgId);'), 'firestore.rules still allows broad organization updates');
  });

  await check('Static user document rules', async () => {
    const rulesText = await readText('firestore.rules');
    const usersBlock = rulesText.match(/match \/users\/\{uid\} \{[\s\S]*?\n    \}/);
    assert(usersBlock, 'firestore.rules is missing users/{uid} rules');
    assert(rulesText.includes('membership, role, and email identity are server-owned'), 'firestore.rules is missing the user ownership note');
    assert(usersBlock[0].includes('allow create: if false;'), 'firestore.rules still allows client user document creates');
    assert(usersBlock[0].includes("'onboardingComplete'"), 'firestore.rules is missing onboardingComplete from safe user fields');
    assert(usersBlock[0].includes("'canvaToken'"), 'firestore.rules is missing canvaToken from safe user fields');
    assert(!usersBlock[0].includes('allow read, write: if request.auth != null && request.auth.uid == uid;'), 'firestore.rules still allows broad user self-writes');
  });

  await check('Static invitation rules', async () => {
    const rulesText = await readText('firestore.rules');
    const inviteBlock = rulesText.match(/match \/invitations\/\{inviteId\} \{[\s\S]*?\n    \}/);
    assert(inviteBlock, 'firestore.rules is missing invitations/{inviteId} rules');
    assert(rulesText.includes('Invitation lookup, creation, cancellation, resend, and acceptance all run'), 'firestore.rules is missing the server-owned invitation note');
    assert(inviteBlock[0].includes('allow read, create, update: if false;'), 'firestore.rules still allows client invitation reads or writes');
    assert(inviteBlock[0].includes('allow delete: if false;'), 'firestore.rules still allows client invitation deletes');
  });

  await check('Static screen org scoping guard', async () => {
    const adminHtml = await readText('admin.html');
    assert(adminHtml.includes('Screens listener waiting for organization context'), 'admin.html is missing the screen org readiness guard');
    assert(adminHtml.includes('_screensListenerOrgId'), 'admin.html is missing screen listener org tracking');
    assert(!adminHtml.includes(": collection(db, 'screens');"), 'admin.html still falls back to an unscoped screens collection listener');
  });

  await check('Static slideshow sidebar count hydration', async () => {
    const adminHtml = await readText('admin.html');
    assert(adminHtml.includes('shouldHydrateShowCountMeta'), 'admin.html is missing stale slideshow count hydration');
    assert(adminHtml.includes('loadShowMetaForSidebarCount'), 'admin.html is missing sidebar count loader fallback');
    assert(!adminHtml.includes('if (!hasCount && !hasInlineSlides)'), 'admin.html still trusts stale zero slideshow count metadata');
  });

  await check('Static authenticated email senders', async () => {
    const adminHtml = await readText('admin.html');
    assert(!adminHtml.includes("fetch('/api/send-invite'"), 'admin.html still calls the public email endpoint');
    await assertFileContains('api/link-account.js', [
    'sendTeamInvitationEmail',
    'sendApprovalNotificationEmail',
    "req.body.action === 'sendApprovalNotification'",
    'Zigns <hello@zigns.io>',
    'emailSent',
    ]);
    await assertFileContains('api/send-invite.js', [
      'Email sends now require authenticated account actions.',
      'status(410)',
    ]);
  });

  await check('Static CAP test actions', () => assertFileContains('api/link-account.js', [
    'sendCapTestAlert',
    'clearCapTestAlert',
    'Zigns Test',
    'normalizeCapFipsList',
    'setEmergencyBroadcast',
    'clearEmergencyBroadcast',
    'listEmergencyAudit',
    'emergencyAudit',
  ]));

  await check('Static slideshow metadata safety', () => assertFileContains('api/link-account.js', [
    'shouldProbeUnmarkedSubcollections',
    'nonNameMetadataKeys',
    "publishedStorage: 'subcollection'",
  ]));

  await check('Static Google Photos import helper', () => assertFileContains('api/google-photos.js', [
    'Google Photos Picker import helper',
    'verifyIdToken',
    'googleusercontent.com',
    'PutObjectCommand',
  ]));

  await check('Static brand asset ledger', () => assertFileContains('assets/brand/BRAND_ASSETS.md', [
    'Third-party provider marks',
    'official or official-hosted brand resources',
    'google-drive.png',
    'google-photos.svg',
    'onedrive.svg',
    'dropbox.svg',
    'youtube.png',
    'canva.svg',
  ]));

  await check('Static mobile hooks', () => assertFileContains('mobile.html', [
    'copyMobileIssueReport',
    'markShowPublishedLocally',
    'Publishing',
    'Up to date',
  ]));

  await check('Static display hooks', () => assertFileContains('display.html', [
    'capAlerts',
    '_capPresentation',
    'CAP_DEFAULT_SPANISH_NOTE',
    'language: _capPresentation.language',
    'broadcasts',
    'playlist_slide_skipped',
    'playerVersion',
    'startPreviewFallbackPolling',
    'previewAuthUnsub',
  ]));

  await check('Static screen diagnostics panel', () => assertFileContains('admin.html', [
    'Screen Diagnostics',
    'renderScreenDiagnosticsSummary',
    'diagnoseScreenHealth',
    'Last heartbeat',
    'Recent player events',
    'Refresh diagnostics',
    'heartbeat stopped without a final event',
  ]));

  await check('Static player diagnostic events', () => assertFileContains('display.html', [
    'player_heartbeat_error',
    'visibility_visible',
    'pagehide',
  ]));

  await check('Pilot docs exist', () => assertFileContains('docs/PILOT_SMOKE_TEST.md', [
    'Account And Role Smoke',
    'Display Pairing Smoke',
    'Tags, Priority, And Emergency Smoke',
    'Team Invite Smoke',
    'One-Command Pilot QA',
    'Browser Smoke',
    'Editor Save/Publish Smoke',
    'Rendering Smoke',
    'tag propagation pass',
    'CAP Alert Smoke',
  ]));

  await check('Static browser smoke script', () => assertFileContains('scripts/browser-smoke.mjs', [
    'Zigns browser smoke',
    'Slideshow tags modal opens',
    'Add Media includes Google Photos',
    'Slideshow CRUD smoke',
    'Editor Save/Publish smoke',
  ]));

  await check('Static editor smoke harness', () => assertFileContains('admin.html', [
    'zignsSmokeHarness',
    '__zignsEditorSmoke',
    'populateCanvas',
    'publishCurrent',
  ]));

  await check('Static tag propagation smoke script', () => assertFileContains('scripts/tag-propagation-smoke.mjs', [
    'Zigns tag propagation smoke',
    'Rename tag propagates',
    'Delete tag propagates',
  ]));

  await check('Static rules denial smoke script', () => assertFileContains('scripts/rules-denial-smoke.mjs', [
    'Zigns rules denial smoke',
    'NEVER_UPDATE_TIME',
    'Deny user role self-write',
    'Deny organization subscription write',
    'Deny invitation collection read',
  ]));

  await check('Static rendering smoke script', () => assertFileContains('scripts/rendering-smoke.mjs', [
    'Zigns rendering smoke',
    'display.html?slideshow=',
    'Display preview renders slide mix',
    'Republish removes deleted YouTube slide',
  ]));

  await check('Static pilot QA runner', () => assertFileContains('scripts/pilot-qa.mjs', [
    'Zigns Pilot QA',
    'Editor save/publish smoke',
    'Rendering smoke',
    'ZIGNS_PILOT_MUTATE',
    'ZIGNS_PILOT_INCLUDE_INVITE',
    'ZIGNS_PILOT_SKIP_ACCOUNT',
  ]));

  await check('Static smoke doctor script', () => assertFileContains('scripts/smoke-doctor.mjs', [
    'Zigns smoke doctor',
    'Firebase auth DNS',
    'Browser launch',
    'ZIGNS_BROWSER_CDP_URL',
  ]));

  if (!config.staticOnly) {
    await check('Live login page', () => checkPublicPage('/login.html', 'Zigns'));
    await check('Live admin shell', () => checkPublicPage('/admin.html', 'Dashboard'));
    await check('Live display player', () => checkPublicPage('/display.html', 'Zigns'));
    await check('Live mobile shell', () => checkPublicPage('/mobile.html', 'Zigns'));
    if (config.skipAuth) {
      warn('Authenticated bootstrap', 'skipped by --skip-auth');
    } else {
      await runAuthBootstrapCheck();
    }
  } else {
    warn('Live public pages', 'skipped by --static');
    warn('Authenticated bootstrap', 'skipped by --static');
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  if (config.json) {
    console.log(JSON.stringify({ config: { baseUrl: config.baseUrl, staticOnly: config.staticOnly, skipAuth: config.skipAuth }, counts, results }, null, 2));
  } else {
    console.log(`Zigns pilot smoke: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
    for (const result of results) {
      const label = result.status.toUpperCase().padEnd(4);
      console.log(`${label} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
    }
  }

  if (counts.fail) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
