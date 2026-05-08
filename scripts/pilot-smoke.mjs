#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  }).finally(() => clearTimeout(timeout));
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
    'shouldProbeUnmarkedSubcollections',
    'createInvitation',
    'emailSent',
    'showOptionsModal',
    'showOptionsTags',
    'showOptionsAutoTags',
    'emergencyPlaylistManagerModal',
    'openEmergencyPlaylistManager',
    'broadcastConfirm',
    'No emergency playlists marked',
    'No emergency playlists ready',
  ]));

  await check('Static invite sender', () => assertFileContains('api/link-account.js', [
    'sendTeamInvitationEmail',
    'Zigns <hello@zigns.io>',
    'emailSent',
  ]));

  await check('Static CAP test actions', () => assertFileContains('api/link-account.js', [
    'sendCapTestAlert',
    'clearCapTestAlert',
    'Zigns Test',
    'normalizeCapFipsList',
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

  await check('Static mobile hooks', () => assertFileContains('mobile.html', [
    'copyMobileIssueReport',
    'markShowPublishedLocally',
    'Publishing',
    'Up to date',
  ]));

  await check('Static display hooks', () => assertFileContains('display.html', [
    'capAlerts',
    'broadcasts',
    'playlist_slide_skipped',
    'playerVersion',
  ]));

  await check('Pilot docs exist', () => assertFileContains('docs/PILOT_SMOKE_TEST.md', [
    'Account And Role Smoke',
    'Display Pairing Smoke',
    'Tags, Priority, And Emergency Smoke',
    'Team Invite Smoke',
    'Browser Smoke',
    'tag propagation pass',
    'CAP Alert Smoke',
  ]));

  await check('Static browser smoke script', () => assertFileContains('scripts/browser-smoke.mjs', [
    'Zigns browser smoke',
    'Slideshow tags modal opens',
    'Add Media includes Google Photos',
    'Slideshow CRUD smoke',
  ]));

  await check('Static tag propagation smoke script', () => assertFileContains('scripts/tag-propagation-smoke.mjs', [
    'Zigns tag propagation smoke',
    'Rename tag propagates',
    'Delete tag propagates',
  ]));

  if (!config.staticOnly) {
    await check('Live login page', () => checkPublicPage('/login.html', 'Zigns'));
    await check('Live admin shell', () => checkPublicPage('/admin.html', 'Dashboard'));
    await check('Live display player', () => checkPublicPage('/display.html', 'Zigns'));
    await check('Live mobile shell', () => checkPublicPage('/mobile.html', 'Zigns'));
    await runAuthBootstrapCheck();
  } else {
    warn('Live public pages', 'skipped by --static');
    warn('Authenticated bootstrap', 'skipped by --static');
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  if (config.json) {
    console.log(JSON.stringify({ config: { baseUrl: config.baseUrl, staticOnly: config.staticOnly }, counts, results }, null, 2));
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
