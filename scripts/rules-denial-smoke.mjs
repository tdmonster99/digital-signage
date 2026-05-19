#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSmokeEnv } from './smoke-env.mjs';

loadSmokeEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NEVER_UPDATE_TIME = '1970-01-01T00:00:00.000000Z';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
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
  email: args.email || process.env.ZIGNS_SMOKE_EMAIL || process.env.ZIGNS_BROWSER_EMAIL || '',
  password: args.password || process.env.ZIGNS_SMOKE_PASSWORD || process.env.ZIGNS_BROWSER_PASSWORD || '',
  expectedOrg: args['expected-org'] || process.env.ZIGNS_SMOKE_EXPECTED_ORG || process.env.ZIGNS_BROWSER_EXPECTED_ORG || 'Zigns Smoke Test',
  expectedRole: args['expected-role'] || process.env.ZIGNS_SMOKE_EXPECTED_ROLE || process.env.ZIGNS_BROWSER_EXPECTED_ROLE || 'admin',
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_SMOKE_TIMEOUT_MS || '30000', 10),
  json: Boolean(args.json || process.env.ZIGNS_SMOKE_JSON === '1'),
};

const results = [];
let projectId = '';
let documentsRoot = '';
let idToken = '';
let authEmail = '';
let uid = '';
let boot = null;

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

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'ZignsRulesDenialSmoke/1.0',
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timeout));
}

async function readText(file) {
  return fs.readFile(path.join(ROOT, file), 'utf8');
}

function extractFirebaseConfig(source) {
  const apiKey = source.match(/apiKey:\s*["']([^"']+)["']/)?.[1] || '';
  const foundProjectId = source.match(/projectId:\s*["']([^"']+)["']/)?.[1] || '';
  return { apiKey, projectId: foundProjectId };
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

function fromFirestoreValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return undefined;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function docName(documentPath) {
  return `${documentsRoot}/${documentPath}`;
}

function docUrl(documentPath) {
  return `https://firestore.googleapis.com/v1/${docName(documentPath)}`;
}

function commitUrl() {
  return `https://firestore.googleapis.com/v1/${documentsRoot}:commit`;
}

function runQueryUrl() {
  return `https://firestore.googleapis.com/v1/${documentsRoot}:runQuery`;
}

async function firestoreJson(url, options = {}) {
  const resp = await fetchWithTimeout(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await resp.json().catch(() => ({}));
  return { resp, body };
}

async function commitWrite(write) {
  return firestoreJson(commitUrl(), {
    method: 'POST',
    body: JSON.stringify({ writes: [write] }),
  });
}

function makeUpdateWrite(documentPath, fields, fieldPaths, currentDocument) {
  return {
    update: {
      name: docName(documentPath),
      fields: toFirestoreFields(fields),
    },
    updateMask: { fieldPaths },
    currentDocument,
  };
}

async function getDocument(documentPath) {
  const { resp, body } = await firestoreJson(docUrl(documentPath));
  assert(resp.ok, `GET ${documentPath} failed: ${body.error?.message || `HTTP ${resp.status}`}`);
  return {
    body,
    data: fromFirestoreFields(body.fields || {}),
    updateTime: body.updateTime,
  };
}

function statusLabel(resp, body) {
  return body.error?.status || body.error?.message || `HTTP ${resp.status}`;
}

function expectPermissionDenied(resp, body, label) {
  const status = body.error?.status || '';
  const message = body.error?.message || '';
  const denied = resp.status === 403 || status === 'PERMISSION_DENIED' || /permission/i.test(message);
  if (denied) return status || `HTTP ${resp.status}`;

  const preconditionFailed = status === 'FAILED_PRECONDITION' || resp.status === 400 || resp.status === 409;
  if (preconditionFailed) {
    throw new Error(`${label} was allowed by rules; only the smoke precondition prevented mutation (${statusLabel(resp, body)})`);
  }
  if (resp.ok) {
    throw new Error(`${label} unexpectedly succeeded`);
  }
  throw new Error(`${label} returned ${statusLabel(resp, body)} instead of PERMISSION_DENIED`);
}

async function signIn() {
  assert(config.email && config.password, 'set ZIGNS_SMOKE_EMAIL and ZIGNS_SMOKE_PASSWORD');
  const adminHtml = await readText('admin.html');
  const firebase = extractFirebaseConfig(adminHtml);
  assert(firebase.apiKey, 'could not find Firebase web API key in admin.html');
  assert(firebase.projectId, 'could not find Firebase projectId in admin.html');
  projectId = firebase.projectId;
  documentsRoot = `projects/${projectId}/databases/(default)/documents`;

  const resp = await fetchWithTimeout(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebase.apiKey)}`, {
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
  authEmail = body.email || config.email;
  uid = body.localId || '';
  assert(uid, 'Firebase sign-in did not return localId');
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

async function main() {
  await signIn();

  await check('Authenticated smoke org', async () => {
    boot = await account('bootstrap');
    const orgName = boot.org?.name || '';
    const role = boot.user?.role || '';
    assert(orgName === config.expectedOrg, `expected org "${config.expectedOrg}", got "${orgName || 'unknown'}"`);
    assert(String(role).toLowerCase() === config.expectedRole.toLowerCase(), `expected role "${config.expectedRole}", got "${role || 'unknown'}"`);
    return `user=${authEmail}; org=${orgName}; role=${role}`;
  });
  if (results.some(result => result.status === 'fail')) return finish();

  const orgId = boot.org?.id || '';
  assert(orgId, 'bootstrap did not return org id');

  await check('Allowed user preference write', async () => {
    const userDoc = await getDocument(`users/${uid}`);
    const currentValue = userDoc.data.notifNewLogin === true;
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `users/${uid}`,
      { notifNewLogin: currentValue },
      ['notifNewLogin'],
      { updateTime: userDoc.updateTime }
    ));
    assert(resp.ok, `allowed preference write failed: ${body.error?.message || `HTTP ${resp.status}`}`);
    return 'users/{uid}.notifNewLogin accepted';
  });

  await check('Deny user role self-write', async () => {
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `users/${uid}`,
      { role: 'viewer' },
      ['role'],
      { updateTime: NEVER_UPDATE_TIME }
    ));
    return expectPermissionDenied(resp, body, 'users/{uid}.role self-write');
  });

  await check('Deny user org self-write', async () => {
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `users/${uid}`,
      { orgId: 'not-the-smoke-org' },
      ['orgId'],
      { updateTime: NEVER_UPDATE_TIME }
    ));
    return expectPermissionDenied(resp, body, 'users/{uid}.orgId self-write');
  });

  await check('Deny organization subscription write', async () => {
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `organizations/${orgId}`,
      { subscription: { plan: 'enterprise', status: 'active', usersAllowed: 9999 } },
      ['subscription'],
      { updateTime: NEVER_UPDATE_TIME }
    ));
    return expectPermissionDenied(resp, body, 'organizations/{orgId}.subscription write');
  });

  await check('Deny organization membership write', async () => {
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `organizations/${orgId}`,
      { members: [] },
      ['members'],
      { updateTime: NEVER_UPDATE_TIME }
    ));
    return expectPermissionDenied(resp, body, 'organizations/{orgId}.members write');
  });

  await check('Deny organization create', async () => {
    const fakeOrgId = `rules-denial-${Date.now().toString(36)}`;
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `organizations/${fakeOrgId}`,
      { name: 'Rules Denial Smoke', ownerId: uid, members: [] },
      ['name', 'ownerId', 'members'],
      { exists: true }
    ));
    return expectPermissionDenied(resp, body, 'organizations/{newOrgId} create');
  });

  await check('Deny invitation collection read', async () => {
    const { resp, body } = await firestoreJson(runQueryUrl(), {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'invitations' }],
          limit: 1,
        },
      }),
    });
    return expectPermissionDenied(resp, body, 'invitations query');
  });

  await check('Deny invitation write', async () => {
    const fakeInviteId = `rules-denial-${Date.now().toString(36)}`;
    const { resp, body } = await commitWrite(makeUpdateWrite(
      `invitations/${fakeInviteId}`,
      { email: authEmail, orgId, role: 'admin', status: 'pending' },
      ['email', 'orgId', 'role', 'status'],
      { exists: true }
    ));
    return expectPermissionDenied(resp, body, 'invitations/{inviteId} write');
  });

  finish();
}

function finish() {
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  if (config.json) {
    console.log(JSON.stringify({ counts, results }, null, 2));
  } else {
    console.log(`Zigns rules denial smoke: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
    for (const result of results) {
      const prefix = result.status.toUpperCase();
      console.log(`${prefix} ${result.name}${result.details ? ` - ${result.details}` : ''}`);
    }
  }

  if (counts.fail) process.exitCode = 1;
}

main().catch(error => {
  addResult('fail', 'Rules denial smoke harness', error?.message || String(error));
  finish();
});
