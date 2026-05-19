#!/usr/bin/env node

import crypto from 'node:crypto';
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
    if (arg.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
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
  email: args.email || process.env.ZIGNS_SMOKE_EMAIL || process.env.ZIGNS_BROWSER_EMAIL || '',
  password: args.password || process.env.ZIGNS_SMOKE_PASSWORD || process.env.ZIGNS_BROWSER_PASSWORD || '',
  expectedOrg: args['expected-org'] || process.env.ZIGNS_SMOKE_EXPECTED_ORG || process.env.ZIGNS_BROWSER_EXPECTED_ORG || 'Zigns Smoke Test',
  expectedRole: args['expected-role'] || process.env.ZIGNS_SMOKE_EXPECTED_ROLE || process.env.ZIGNS_BROWSER_EXPECTED_ROLE || 'admin',
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_SMOKE_TIMEOUT_MS || '30000', 10),
};

const PROJECT_ID = 'digital-signage-2';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const results = [];
let idToken = '';

function addResult(status, name, details = '') {
  results.push({ status, name, details });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    const details = await fn();
    addResult('pass', name, details || '');
  } catch (error) {
    addResult('fail', name, error?.message || String(error));
  }
}

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'ZignsTagSmoke/1.0',
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timeout));
}

async function readText(file) {
  return fs.readFile(path.join(ROOT, file), 'utf8');
}

function extractFirebaseApiKey(source) {
  const match = source.match(/apiKey:\s*["']([^"']+)["']/);
  return match?.[1] || '';
}

function collectionUrl(...segments) {
  return `${FIRESTORE_BASE}/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]));
}

async function createDoc(collectionSegments, documentId, data) {
  const resp = await fetchWithTimeout(`${collectionUrl(...collectionSegments)}?documentId=${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`CREATE ${[...collectionSegments, documentId].join('/')} failed: ${body.error?.message || `HTTP ${resp.status}`}`);
  }
  return body;
}

function randomPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

async function signIn() {
  assert(config.email && config.password, 'set ZIGNS_SMOKE_EMAIL and ZIGNS_SMOKE_PASSWORD');
  const adminHtml = await readText('admin.html');
  const apiKey = extractFirebaseApiKey(adminHtml);
  assert(apiKey, 'could not find Firebase web API key in admin.html');
  const resp = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      returnSecureToken: true,
    }),
  });
  const body = await resp.json().catch(() => ({}));
  assert(resp.ok && body.idToken, `Firebase sign-in failed: ${body.error?.message || `HTTP ${resp.status}`}`);
  idToken = body.idToken;
}

async function account(action, payload = {}) {
  const resp = await fetchWithTimeout(`${config.baseUrl}/api/link-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, idToken, ...payload }),
  });
  const body = await resp.json().catch(() => ({}));
  assert(resp.ok && body.ok !== false, `${action} failed: ${body.error || `HTTP ${resp.status}`}`);
  return body;
}

function expectTagState(label, tags, present, absent) {
  const clean = Array.isArray(tags) ? tags.map(normalizeTag) : [];
  assert(clean.includes(present), `${label} is missing ${present}: ${clean.join(',') || 'none'}`);
  assert(!clean.includes(absent), `${label} still contains ${absent}: ${clean.join(',') || 'none'}`);
}

function expectTagGone(label, tags, absent) {
  const clean = Array.isArray(tags) ? tags.map(normalizeTag) : [];
  assert(!clean.includes(absent), `${label} still contains ${absent}: ${clean.join(',') || 'none'}`);
}

function expectStatAtLeast(stats, key, minimum = 1) {
  const value = Number(stats?.[key] || 0);
  assert(value >= minimum, `expected ${key} >= ${minimum}, got ${value}`);
}

async function main() {
  await signIn();

  let boot;
  await check('Authenticated smoke org', async () => {
    boot = await account('bootstrap');
    const orgName = boot.org?.name || '';
    const role = boot.user?.role || '';
    assert(orgName === config.expectedOrg, `expected org "${config.expectedOrg}", got "${orgName || 'unknown'}"`);
    assert(String(role).toLowerCase() === config.expectedRole.toLowerCase(), `expected role "${config.expectedRole}", got "${role || 'unknown'}"`);
    return `org=${orgName}; role=${role}`;
  });
  if (results.some(result => result.status === 'fail')) return finish();

  const orgId = boot.org?.id;
  const stamp = Date.now().toString(36);
  const oldTag = normalizeTag(`phase51-old-${stamp}`);
  const newTag = normalizeTag(`phase51-new-${stamp}`);
  const showId = `phase51_${stamp}`;
  let screenId = '';
  const mediaId = `phase51-${stamp}`;
  const now = new Date().toISOString();
  const slideUrl = 'https://dummyimage.com/1280x720/0043ce/ffffff.png&text=Zigns+Phase+5.1+Smoke';

  const created = {
    tag: false,
    show: false,
    screen: false,
    media: false,
  };
  try {
    await check('Seed tagged records', async () => {
      await account('syncOrgTags', { tags: [oldTag] });
      created.tag = true;
      await account('createSlideshow', { showId, name: `Phase 5.1 Smoke ${stamp}` });
      created.show = true;
      await account('saveSlideshowMetadata', {
        showId,
        patch: { tags: [oldTag], autoIncludeTags: [oldTag], emergencyPlaylist: false },
      });
      await account('publishSlideshow', {
        showId,
        slides: [{ id: 'published-tagged', type: 'image', name: 'Published tagged', url: slideUrl, active: true, tags: [oldTag] }],
        patch: { tags: [oldTag], autoIncludeTags: [oldTag], emergencyPlaylist: false },
        screenIds: [],
      });
      await account('saveDraftSlides', {
        showId,
        slides: [{ id: 'draft-tagged', type: 'image', name: 'Draft tagged', url: slideUrl, active: true, tags: [oldTag] }],
        patch: {},
      });

      const pairingCode = randomPairingCode();
      await createDoc(['pairingCodes'], pairingCode, {
        status: 'pending',
        createdAt: now,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        screenCredentialHash: crypto.randomBytes(32).toString('hex'),
        credentialVersion: 1,
      });
      const paired = await account('pairScreen', { code: pairingCode });
      screenId = paired.screenId || '';
      assert(screenId, 'pairScreen did not return a screenId');
      await account('saveScreenSettings', {
        screenId,
        patch: {
          name: `Phase 5.1 Smoke ${stamp}`,
          slideshowId: showId,
          tags: [oldTag],
        },
      });
      created.screen = true;

      await account('upsertMediaRecord', {
        mediaId,
        patch: {
          name: `Phase 5.1 Smoke ${stamp}`,
          type: 'image',
          url: slideUrl,
          tags: [oldTag],
          createdAt: now,
        },
      });
      created.media = true;
      return `show=${showId}; screen=${screenId}; media=${mediaId}`;
    });

    await check('Rename tag propagates', async () => {
      const result = await account('mutateOrgTag', { oldTag, newTag });
      expectTagState('org tag registry', result.tags, newTag, oldTag);
      const renamedBoot = await account('bootstrap');
      const showMeta = (renamedBoot.slideshows || []).find(show => show.id === showId) || {};
      expectTagState('slideshow tags', showMeta.tags, newTag, oldTag);
      expectTagState('slideshow auto tags', showMeta.autoIncludeTags, newTag, oldTag);
      expectStatAtLeast(result.stats, 'screensUpdated');
      expectStatAtLeast(result.stats, 'slideshowsUpdated');
      expectStatAtLeast(result.stats, 'publishedSlidesUpdated');
      expectStatAtLeast(result.stats, 'draftSlidesUpdated');
      expectStatAtLeast(result.stats, 'mediaUpdated');
      return `renamed ${oldTag} -> ${newTag}; stats=${JSON.stringify(result.stats || {})}`;
    });

    await check('Delete tag propagates', async () => {
      const result = await account('mutateOrgTag', { oldTag: newTag, newTag: null });
      expectTagGone('org tag registry', result.tags, newTag);
      const deletedBoot = await account('bootstrap');
      const showMeta = (deletedBoot.slideshows || []).find(show => show.id === showId) || {};
      expectTagGone('slideshow tags', showMeta.tags, newTag);
      expectTagGone('slideshow auto tags', showMeta.autoIncludeTags, newTag);
      expectStatAtLeast(result.stats, 'screensUpdated');
      expectStatAtLeast(result.stats, 'slideshowsUpdated');
      expectStatAtLeast(result.stats, 'publishedSlidesUpdated');
      expectStatAtLeast(result.stats, 'draftSlidesUpdated');
      expectStatAtLeast(result.stats, 'mediaUpdated');
      return `deleted ${newTag}; stats=${JSON.stringify(result.stats || {})}`;
    });
  } finally {
    await check('Cleanup tagged records', async () => {
      if (created.show) await account('deleteSlideshow', { showId }).catch(error => addResult('warn', 'Cleanup slideshow', error.message));
      if (created.screen && screenId) await account('deleteScreen', { screenId }).catch(error => addResult('warn', 'Cleanup screen', error.message));
      if (created.media) await account('deleteMediaRecord', { mediaId }).catch(error => addResult('warn', 'Cleanup media', error.message));
      if (created.tag) {
        await account('mutateOrgTag', { oldTag, newTag: null }).catch(error => addResult('warn', 'Cleanup old tag', error.message));
        await account('mutateOrgTag', { oldTag: newTag, newTag: null }).catch(error => addResult('warn', 'Cleanup new tag', error.message));
      }
      return 'temporary records removed';
    });
  }

  finish();
}

function finish() {
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Zigns tag propagation smoke: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
  for (const result of results) {
    const label = result.status.toUpperCase().padEnd(4);
    console.log(`${label} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
  }
  if (counts.fail) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
