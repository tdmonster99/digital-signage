#!/usr/bin/env node

import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { loadSmokeEnv } from './smoke-env.mjs';

loadSmokeEnv();

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
  baseUrl: String(
    args['base-url'] ||
    process.env.ZIGNS_PILOT_BASE_URL ||
    process.env.ZIGNS_SMOKE_BASE_URL ||
    process.env.ZIGNS_BROWSER_BASE_URL ||
    'https://app.zigns.io'
  ).replace(/\/+$/, ''),
  skipAccount: Boolean(args['skip-account'] || process.env.ZIGNS_PILOT_SKIP_ACCOUNT === '1'),
  skipBrowser: Boolean(args['skip-browser'] || process.env.ZIGNS_PILOT_SKIP_BROWSER === '1'),
  json: Boolean(args.json || process.env.ZIGNS_DOCTOR_JSON === '1'),
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_DOCTOR_TIMEOUT_MS || '15000', 10),
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

function isLoopbackHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

function parseBaseUrl() {
  try {
    const url = new URL(config.baseUrl);
    assert(['http:', 'https:'].includes(url.protocol), `base URL must use http or https, got ${url.protocol}`);
    return url;
  } catch (error) {
    throw new Error(`invalid base URL "${config.baseUrl}": ${error.message}`);
  }
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'ZignsSmokeDoctor/1.0',
      ...(options.headers || {}),
    },
  }).catch(error => {
    const cause = error?.cause;
    const detail = cause?.code
      ? `${cause.code}${cause.hostname ? ` ${cause.hostname}` : ''}`
      : (error?.message || String(error));
    throw new Error(detail);
  }).finally(() => clearTimeout(timeout));
}

function hasCredentials() {
  return Boolean(
    (process.env.ZIGNS_BROWSER_EMAIL || process.env.ZIGNS_SMOKE_EMAIL) &&
    (process.env.ZIGNS_BROWSER_PASSWORD || process.env.ZIGNS_SMOKE_PASSWORD)
  );
}

function hasExpectations() {
  return Boolean(
    (process.env.ZIGNS_BROWSER_EXPECTED_ORG || process.env.ZIGNS_SMOKE_EXPECTED_ORG) &&
    (process.env.ZIGNS_BROWSER_EXPECTED_ROLE || process.env.ZIGNS_SMOKE_EXPECTED_ROLE)
  );
}

function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }
  return '';
}

function findPlaywrightBrowsers() {
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root)) {
    out.push(path.join(root, entry, 'chrome-linux64', 'chrome'));
    out.push(path.join(root, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
    out.push(path.join(root, entry, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
    out.push(path.join(root, entry, 'chrome-mac', 'headless_shell'));
  }
  return out.filter(candidate => fs.existsSync(candidate));
}

function findBrowserExecutable() {
  const candidates = [
    process.env.ZIGNS_BROWSER_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    ...findPlaywrightBrowsers(),
    findOnPath('google-chrome'),
    findOnPath('chromium'),
    findOnPath('chromium-browser'),
    findOnPath('microsoft-edge'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || '';
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForJsonVersion(baseUrl) {
  const deadline = Date.now() + config.timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const resp = await fetchWithTimeout(`${baseUrl}/json/version`);
      assert(resp.ok, `DevTools endpoint returned HTTP ${resp.status}`);
      return await resp.json();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  throw lastError || new Error('browser did not expose a DevTools endpoint');
}

async function probeBrowserLaunch(executable) {
  const port = await getOpenPort();
  const tempRoot = process.env.ZIGNS_BROWSER_TMPDIR || (fs.existsSync('/tmp') ? '/tmp' : os.tmpdir());
  const userDataDir = fs.mkdtempSync(path.join(tempRoot, 'zigns-smoke-doctor-'));
  const browserArgs = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--no-sandbox',
    'about:blank',
  ];

  const child = spawn(executable, browserArgs, { stdio: ['ignore', 'ignore', 'pipe'], detached: false });
  let browserStderr = '';
  child.stderr?.on('data', chunk => {
    browserStderr = `${browserStderr}${chunk}`.slice(-4000);
  });

  try {
    const version = await Promise.race([
      waitForJsonVersion(`http://127.0.0.1:${port}`),
      new Promise((_, reject) => child.once('error', reject)),
      new Promise((_, reject) => child.once('exit', code => {
        const stderr = browserStderr.trim();
        const detail = stderr ? `; stderr: ${stderr}` : '';
        reject(new Error(`browser exited before DevTools was ready (code ${code}); path=${executable}${detail}`));
      })),
    ]);
    return `${version.Browser || 'browser'} at ${executable}`;
  } finally {
    child.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

async function main() {
  const base = parseBaseUrl();

  await check('Base URL', async () => `${base.origin}`);

  if (isLoopbackHost(base.hostname)) {
    warn('Base URL DNS', `skipped for loopback host ${base.hostname}`);
  } else {
    await check('Base URL DNS', async () => {
      const result = await dns.lookup(base.hostname);
      return `${base.hostname} -> ${result.address}`;
    });
  }

  await check('Base URL reachability', async () => {
    const resp = await fetchWithTimeout(`${config.baseUrl}/login.html`, { method: 'HEAD' });
    assert(resp.ok, `login page returned HTTP ${resp.status}`);
    return `HTTP ${resp.status}`;
  });

  if (config.skipAccount) {
    warn('Firebase auth DNS', 'skipped by --skip-account');
    warn('Smoke credentials', 'skipped by --skip-account');
  } else {
    await check('Firebase auth DNS', async () => {
      const result = await dns.lookup('identitytoolkit.googleapis.com');
      return `identitytoolkit.googleapis.com -> ${result.address}`;
    });
    await check('Smoke credentials', async () => {
      assert(hasCredentials(), 'set ZIGNS_SMOKE_EMAIL/ZIGNS_SMOKE_PASSWORD or ZIGNS_BROWSER_EMAIL/ZIGNS_BROWSER_PASSWORD');
      return 'configured';
    });
    if (hasExpectations()) warn('Smoke org/role expectations', 'configured');
    else warn('Smoke org/role expectations', 'set ZIGNS_SMOKE_EXPECTED_ORG and ZIGNS_SMOKE_EXPECTED_ROLE so org drift fails early');
  }

  if (config.skipBrowser) {
    warn('Browser launch', 'skipped by --skip-browser');
  } else if (process.env.ZIGNS_BROWSER_CDP_URL) {
    await check('Browser CDP endpoint', async () => {
      const resp = await fetchWithTimeout(`${process.env.ZIGNS_BROWSER_CDP_URL.replace(/\/+$/, '')}/json/version`);
      assert(resp.ok, `CDP endpoint returned HTTP ${resp.status}`);
      return process.env.ZIGNS_BROWSER_CDP_URL;
    });
  } else {
    const executable = findBrowserExecutable();
    await check('Browser executable', async () => {
      assert(executable, 'Chrome or Edge was not found. Set ZIGNS_BROWSER_PATH or ZIGNS_BROWSER_CDP_URL.');
      return executable;
    });
    if (executable) {
      await check('Browser launch', () => probeBrowserLaunch(executable));
    }
  }

  if (process.env.ZIGNS_PILOT_MUTATE === '1' || process.env.ZIGNS_BROWSER_MUTATE === '1') {
    warn('Mutation mode', 'enabled; smoke:pilot will create and clean up temporary test data');
  } else {
    warn('Mutation mode', 'disabled; set ZIGNS_PILOT_MUTATE=1 only for dedicated smoke organizations');
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  if (config.json) {
    console.log(JSON.stringify({ config: { baseUrl: config.baseUrl, skipAccount: config.skipAccount, skipBrowser: config.skipBrowser }, counts, results }, null, 2));
  } else {
    console.log(`Zigns smoke doctor: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
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
