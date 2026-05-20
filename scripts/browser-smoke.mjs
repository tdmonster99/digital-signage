#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
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
  baseUrl: String(args['base-url'] || process.env.ZIGNS_BROWSER_BASE_URL || 'https://app.zigns.io').replace(/\/+$/, ''),
  email: args.email || process.env.ZIGNS_BROWSER_EMAIL || process.env.ZIGNS_SMOKE_EMAIL || '',
  password: args.password || process.env.ZIGNS_BROWSER_PASSWORD || process.env.ZIGNS_SMOKE_PASSWORD || '',
  expectedRole: args['expected-role'] || process.env.ZIGNS_BROWSER_EXPECTED_ROLE || process.env.ZIGNS_SMOKE_EXPECTED_ROLE || '',
  expectedOrg: args['expected-org'] || process.env.ZIGNS_BROWSER_EXPECTED_ORG || process.env.ZIGNS_SMOKE_EXPECTED_ORG || '',
  browserPath: args['browser-path'] || process.env.ZIGNS_BROWSER_PATH || '',
  cdpUrl: args['cdp-url'] || process.env.ZIGNS_BROWSER_CDP_URL || '',
  headed: Boolean(args.headed || process.env.ZIGNS_BROWSER_HEADED === '1'),
  keepOpen: Boolean(args['keep-open'] || process.env.ZIGNS_BROWSER_KEEP_OPEN === '1'),
  mutate: Boolean(args.mutate || process.env.ZIGNS_BROWSER_MUTATE === '1'),
  editor: Boolean(args.editor || process.env.ZIGNS_BROWSER_EDITOR === '1'),
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_BROWSER_TIMEOUT_MS || '60000', 10),
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    assert(resp.ok, `${url} returned HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
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
    config.browserPath,
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
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
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
      return await fetchJson(`${baseUrl}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }
  throw lastError || new Error('browser did not expose a DevTools endpoint');
}

async function startBrowser() {
  if (config.cdpUrl) {
    return { browserBaseUrl: config.cdpUrl, cleanup: async () => {} };
  }

  const executable = findBrowserExecutable();
  assert(executable, 'Chrome or Edge was not found. Set ZIGNS_BROWSER_PATH or ZIGNS_BROWSER_CDP_URL.');

  const port = await getOpenPort();
  const tempRoot = process.env.ZIGNS_BROWSER_TMPDIR || (fs.existsSync('/tmp') ? '/tmp' : os.tmpdir());
  const userDataDir = fs.mkdtempSync(path.join(tempRoot, 'zigns-browser-smoke-'));
  const browserArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--no-sandbox',
    '--window-size=1440,1000',
    'about:blank',
  ];
  if (!config.headed) browserArgs.unshift('--headless=new');

  const child = spawn(executable, browserArgs, { stdio: ['ignore', 'ignore', 'pipe'], detached: false });
  let browserStderr = '';
  child.stderr?.on('data', chunk => {
    browserStderr = `${browserStderr}${chunk}`.slice(-4000);
  });

  const browserBaseUrl = `http://127.0.0.1:${port}`;
  try {
    await Promise.race([
      waitForJsonVersion(browserBaseUrl),
      new Promise((_, reject) => child.once('error', reject)),
      new Promise((_, reject) => child.once('exit', code => {
        const stderr = browserStderr.trim();
        const detail = stderr ? `; stderr: ${stderr}` : '';
        reject(new Error(`browser exited before DevTools was ready (code ${code}); path=${executable}${detail}`));
      })),
    ]);
  } catch (error) {
    child.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    throw error;
  }

  return {
    browserBaseUrl,
    cleanup: async () => {
      if (!config.keepOpen) {
        child.kill();
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
      }
    },
  };
}

class RawWebSocket {
  constructor(wsUrl) {
    this.url = new URL(wsUrl);
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.messageHandlers = new Set();
  }

  connect() {
    assert(this.url.protocol === 'ws:', 'Only ws:// DevTools endpoints are supported.');
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const port = Number(this.url.port || 80);
      this.socket = net.connect({ host: this.url.hostname, port }, () => {
        this.socket.write([
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1`,
          `Host: ${this.url.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'));
      });
      this.socket.once('error', reject);
      this.socket.on('data', chunk => {
        if (!this.connected) {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          const end = this.buffer.indexOf('\r\n\r\n');
          if (end === -1) return;
          const head = this.buffer.slice(0, end).toString('utf8');
          if (!head.includes(' 101 ')) {
            reject(new Error(`WebSocket handshake failed: ${head.split('\r\n')[0]}`));
            return;
          }
          this.connected = true;
          const rest = this.buffer.slice(end + 4);
          this.buffer = Buffer.alloc(0);
          if (rest.length) this.handleFrames(rest);
          resolve();
          return;
        }
        this.handleFrames(chunk);
      });
    });
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
  }

  sendText(text) {
    const payload = Buffer.from(text);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = payload.length | 0x80;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126 | 0x80;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127 | 0x80;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    header[0] = 0x81;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  handleFrames(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      let mask;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) return;
      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      if (masked) {
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      if (opcode === 0x1) {
        const text = payload.toString('utf8');
        this.messageHandlers.forEach(handler => handler(text));
      } else if (opcode === 0x8) {
        this.socket.end();
      } else if (opcode === 0x9) {
        this.socket.write(Buffer.from([0x8a, 0]));
      }
    }
  }

  close() {
    this.socket?.end();
  }
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.ws.onMessage(text => this.handleMessage(text));
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method) {
      for (const listener of [...this.listeners]) {
        listener(message);
      }
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.sendText(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, config.timeoutMs);
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  waitForEvent(method, predicate = () => true, timeoutMs = config.timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      const listener = message => {
        if (message.method !== method || !predicate(message.params || {})) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(message.params || {});
      };
      this.listeners.add(listener);
    });
  }
}

async function createPage(browserBaseUrl) {
  if (browserBaseUrl.startsWith('ws://')) return browserBaseUrl;
  const base = browserBaseUrl.replace(/\/+$/, '');
  const target = await fetchJson(`${base}/json/new?about:blank`, { method: 'PUT' });
  assert(target.webSocketDebuggerUrl, 'new browser target did not return a webSocketDebuggerUrl');
  return target.webSocketDebuggerUrl;
}

async function createClient(wsUrl) {
  const ws = new RawWebSocket(wsUrl);
  await ws.connect();
  const cdp = new CdpClient(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { cdp, ws };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'browser evaluation failed');
  }
  return result.result?.value;
}

async function navigate(cdp, url) {
  const load = cdp.waitForEvent('Page.loadEventFired').catch(() => null);
  await cdp.send('Page.navigate', { url });
  await load;
  await sleep(500);
}

async function waitFor(cdp, expression, label, timeoutMs = config.timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, `Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

async function fill(cdp, selector, value) {
  const ok = await evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(value)});
    else el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert(ok, `Could not fill ${selector}`);
}

async function click(cdp, selector) {
  const ok = await evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  assert(ok, `Could not click ${selector}`);
}

async function runReadOnlyAuthenticatedChecks(cdp) {
  let sessionDetails = null;

  await check('Authenticated login/session', async () => {
    await fill(cdp, '#authEmail', config.email);
    await fill(cdp, '#authPassword', config.password);
    await click(cdp, '#signInBtn');
    await waitFor(cdp, `location.pathname.endsWith('/admin.html') || document.querySelector('#page-dashboard')`, 'admin shell after login', 30000);
    await waitFor(cdp, `document.querySelector('#page-dashboard') && document.body.textContent.includes('Dashboard')`, 'dashboard content', 30000);
    await waitFor(cdp, `typeof window.openInviteModal === 'function' && typeof window.openShowOptions === 'function' && typeof window.newShowPrompt === 'function'`, 'admin module helpers', 30000);
    await waitFor(cdp, `document.querySelector('#roleBadge')?.textContent?.trim()`, 'role badge', 30000);
    await evaluate(cdp, `window.showPage?.('settings'); window.showSettingsSub?.('org'); true`);
    if (config.expectedOrg) {
      await waitFor(cdp, `document.querySelector('#orgNameInput')?.value?.trim()`, 'organization name', 10000);
    }
    const details = await evaluate(cdp, `(() => {
      const email = document.querySelector('.sidebar-user-email')?.textContent?.trim() || '';
      const role = document.querySelector('#roleBadge')?.textContent?.trim() || '';
      let org = '';
      org = document.querySelector('#orgNameInput')?.value?.trim() || '';
      window.showPage?.('dashboard');
      return { email, role, org };
    })()`);
    if (config.expectedRole) assert(String(details.role || '').toLowerCase() === config.expectedRole.toLowerCase(), `expected role ${config.expectedRole}, got ${details.role || 'unknown'}`);
    if (config.expectedOrg) assert(details.org === config.expectedOrg, `expected org ${config.expectedOrg}, got ${details.org || 'unknown'}`);
    sessionDetails = details;
    return `user=${details.email || config.email}; org=${details.org || 'unknown'}; role=${details.role || 'unknown'}`;
  });

  if (!sessionDetails) {
    warn('Authenticated follow-up checks', 'skipped; login/session check did not pass');
    return null;
  }

  if (!config.expectedOrg || !config.expectedRole) {
    warn('Smoke account expectations', 'set ZIGNS_BROWSER_EXPECTED_ORG and ZIGNS_BROWSER_EXPECTED_ROLE so org/role drift fails early');
  }

  const actualRole = String(sessionDetails.role || '').toLowerCase();
  const isAdmin = actualRole === 'admin';

  if (isAdmin) {
    await check('Team invite modal opens', async () => {
      await evaluate(cdp, `window.showPage('settings'); window.showSettingsSub?.('team'); window.openInviteModal?.(); true`);
      await waitFor(cdp, `getComputedStyle(document.querySelector('#inviteModal')).display !== 'none'`, 'invite modal');
      const role = await evaluate(cdp, `document.querySelector('#inviteRole')?.value || ''`);
      assert(role === 'editor', `expected invite role default editor, got ${role || 'blank'}`);
      await evaluate(cdp, `window.closeInviteModal?.(); true`);
      return 'invite modal defaulted to editor';
    });
  } else {
    warn('Admin-only browser checks', `skipped team invite and emergency manager; authenticated role is ${sessionDetails.role || 'unknown'}`);
  }

  await check('Slideshow tags modal opens', async () => {
    await evaluate(cdp, `window.showPage('slideshows'); window.openShowOptions?.(); true`);
    await waitFor(cdp, `getComputedStyle(document.querySelector('#showOptionsModal')).display !== 'none'`, 'slideshow tags modal');
    const labels = await evaluate(cdp, `(() => ({
      hasTags: Boolean(document.querySelector('#showOptionsTags')),
      hasAuto: Boolean(document.querySelector('#showOptionsAutoTags')),
      hasEmergency: Boolean(document.querySelector('#showOptionsEmergency')),
    }))()`);
    assert(labels.hasTags && labels.hasAuto && labels.hasEmergency, 'tags modal is missing an expected field');
    await evaluate(cdp, `window.closeShowOptionsModal?.(); true`);
    return 'tags, auto-include, emergency controls present';
  });

  await check('Add Media includes Google Photos', async () => {
    await evaluate(cdp, `window.showPage('slideshows'); window.openAddMediaModal?.(); true`);
    await waitFor(cdp, `document.querySelector('#addMediaModal.open')`, 'add media modal');
    const labels = await evaluate(cdp, `Array.from(document.querySelectorAll('#addMediaModal .add-media-btn')).map(btn => btn.textContent.trim())`);
    assert(labels.includes('Google Photos'), `Google Photos missing from Add Media sources: ${labels.join(', ')}`);
    await evaluate(cdp, `window.closeAddMediaModal?.(); true`);
    return labels.join(', ');
  });

  if (isAdmin) {
    await check('Emergency playlist manager opens', async () => {
      await evaluate(cdp, `window.showPage('screens'); window.openEmergencyPlaylistManager?.(); true`);
      await waitFor(cdp, `getComputedStyle(document.querySelector('#emergencyPlaylistManagerModal')).display !== 'none'`, 'emergency playlist manager');
      const details = await evaluate(cdp, `(() => ({
        hasPanel: Boolean(document.querySelector('#emergencyPlaylistPanel')),
        hasAudit: Boolean(document.querySelector('#emergencyAuditPanel') && document.querySelector('#emergencyAuditList')),
        hasSummary: Boolean(document.querySelector('#emergencyPlaylistManagerSummary')?.textContent?.trim()),
        rowCount: document.querySelectorAll('#emergencyPlaylistManagerList .emergency-playlist-row').length,
      }))()`);
      assert(details.hasPanel && details.hasAudit && details.hasSummary, 'emergency playlist manager missing expected shell');
      await evaluate(cdp, `window.closeEmergencyPlaylistManager?.(); true`);
      return `manager rows=${details.rowCount}`;
    });
  }

  await check('Pairing modal opens', async () => {
    await evaluate(cdp, `window.showPage('screens'); window.openAddScreenModal?.(); true`);
    await waitFor(cdp, `document.querySelector('#pairingModal') && (getComputedStyle(document.querySelector('#pairingModal')).display !== 'none' || document.body.textContent.includes('Screen limit reached'))`, 'pairing modal or limit prompt');
    const opened = await evaluate(cdp, `getComputedStyle(document.querySelector('#pairingModal')).display !== 'none'`);
    if (opened) {
      const hasInput = await evaluate(cdp, `Boolean(document.querySelector('#pairingCodeInput'))`);
      assert(hasInput, 'pairing code input missing');
      await evaluate(cdp, `window.closePairingModal?.(); true`);
      return 'pairing modal ready';
    }
    return 'screen limit prompt shown';
  });

  await check('Issue report modal opens', async () => {
    await evaluate(cdp, `window.showPage('profile'); window.openIssueReportModal?.(); true`);
    await waitFor(cdp, `getComputedStyle(document.querySelector('#issueReportModal')).display !== 'none'`, 'issue report modal');
    const text = await evaluate(cdp, `document.querySelector('#issueReportText')?.value || ''`);
    assert(text.includes('Zigns issue report') && text.includes('Context'), 'issue report text missing expected context');
    await evaluate(cdp, `window.closeIssueReportModal?.(); true`);
    return 'issue report context generated';
  });

  return sessionDetails;
}

function editorDisplayStateExpression() {
  return `(() => {
    const byId = id => document.getElementById(id);
    const stage = byId('stageDesigned');
    const opacity = stage ? Number.parseFloat(stage.style.opacity || getComputedStyle(stage).opacity || '0') || 0 : 0;
    const canvas = byId('fabricDisplay');
    let canvasNonBlank = false;
    let canvasSampleError = '';
    if (opacity > 0.01 && canvas && canvas.width && canvas.height) {
      try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const stepX = Math.max(1, Math.floor(width / 14));
        const stepY = Math.max(1, Math.floor(height / 14));
        for (let y = 0; y < height && !canvasNonBlank; y += stepY) {
          for (let x = 0; x < width; x += stepX) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            if (p[3] > 0 && (p[0] > 12 || p[1] > 12 || p[2] > 12)) {
              canvasNonBlank = true;
              break;
            }
          }
        }
      } catch (error) {
        canvasSampleError = error?.message || String(error);
      }
    }
    const errBox = byId('errBox');
    return {
      designedVisible: opacity > 0.01,
      canvasNonBlank,
      canvasSampleError,
      errorVisible: errBox ? getComputedStyle(errBox).display !== 'none' : false,
      errorText: byId('errMsg')?.textContent?.trim() || '',
    };
  })()`;
}

function assertDesignedSlideSummary(summary, label) {
  assert(summary, `${label}: missing slide summary`);
  assert(summary.type === 'designed', `${label}: expected designed slide, got ${summary.type || 'unknown'}`);
  assert(summary.objectCount >= 8, `${label}: expected at least 8 canvas objects, got ${summary.objectCount}`);
  const types = summary.objectTypes || summary.types || [];
  const texts = summary.texts || [];
  assert(types.includes('rect'), `${label}: saved canvas is missing a rect object`);
  assert(types.includes('circle'), `${label}: saved canvas is missing a circle object`);
  assert(types.includes('line'), `${label}: saved canvas is missing a line object`);
  assert(types.includes('image'), `${label}: saved canvas is missing an image object`);
  assert(texts.some(text => text.includes('Layer 3 Editor Smoke')), `${label}: saved canvas is missing smoke title text`);
}

async function waitForEditorHarness(cdp) {
  await waitFor(cdp, `window.__zignsEditorSmoke && typeof window.__zignsEditorSmoke.populateCanvas === 'function'`, 'editor smoke harness', 30000);
}

async function waitForEditorDisplayPreview(cdp, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, editorDisplayStateExpression()).catch(error => ({ evaluationError: error.message }));
    if (lastState && !lastState.evaluationError && !lastState.errorVisible && lastState.designedVisible && lastState.canvasNonBlank) {
      return lastState;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for published designed slide preview; lastState=${JSON.stringify(lastState)}`);
}

async function waitForAdminShell(cdp) {
  await waitFor(cdp, `location.pathname.endsWith('/admin.html') || document.querySelector('#page-dashboard')`, 'admin shell', 30000);
  await waitFor(cdp, `document.querySelector('#page-dashboard') && document.body.textContent.includes('Dashboard')`, 'dashboard content', 30000);
  await waitFor(cdp, `typeof window.newShowPrompt === 'function' && typeof window.deleteCurrentSlideshow === 'function'`, 'admin slideshow helpers', 30000);
}

async function runEditorSavePublishChecks(cdp, sessionDetails) {
  await check('Editor Save/Publish smoke', async () => {
    assert(String(sessionDetails?.role || '').toLowerCase() === 'admin', `editor save/publish cleanup requires an admin smoke account, got ${sessionDetails?.role || 'unknown'}`);

    const showName = `Editor Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const slideName = `Layer 3 Editor Smoke ${Date.now().toString(36)}`;
    let created = null;
    let cleanupNote = 'not needed';

    try {
      created = await evaluate(cdp, `(async () => {
        await window.__zignsEditorSmoke.selectShow(document.querySelector('#showList .show-item.active')?.dataset.id || 'main').catch(() => null);
        const oldPrompt = window.prompt;
        window.prompt = () => ${JSON.stringify(showName)};
        try {
          await window.newShowPrompt();
        } finally {
          window.prompt = oldPrompt;
        }
        const active = document.querySelector('#showList .show-item.active');
        return {
          id: active?.dataset.id || '',
          name: document.querySelector('#showTitle')?.textContent?.trim() || active?.querySelector('.show-item-name')?.textContent?.trim() || '',
        };
      })()`);
      assert(created?.id, 'editor smoke slideshow was not created');
      assert(created.name === showName, `created slideshow name mismatch: ${JSON.stringify(created)}`);

      const saved = await evaluate(cdp, `(async () => {
        const h = window.__zignsEditorSmoke;
        await h.selectShow(${JSON.stringify(created.id)});
        const opened = await h.openBlankDesigner(${JSON.stringify(slideName)});
        const populated = await h.populateCanvas(${JSON.stringify(slideName)});
        const slides = await h.saveDesigner(${JSON.stringify(slideName)});
        return {
          opened,
          populated,
          slides,
          savedSlide: slides.find(slide => slide.name === ${JSON.stringify(slideName)}) || null,
          context: h.context(),
        };
      })()`);
      assert(saved.populated?.objectCount >= 8, `designer canvas did not populate expected objects: ${JSON.stringify(saved.populated)}`);
      assertDesignedSlideSummary(saved.savedSlide, 'saved draft');
      assert(saved.context?.slideCount === 1, `expected one saved slide in editor state, got ${saved.context?.slideCount}`);

      await navigate(cdp, `${config.baseUrl}/admin.html`);
      await waitForAdminShell(cdp);
      await waitForEditorHarness(cdp);

      const reopened = await evaluate(cdp, `(async () => {
        const h = window.__zignsEditorSmoke;
        await h.selectShow(${JSON.stringify(created.id)});
        const canvas = await h.reopenDesigned(${JSON.stringify(slideName)});
        const slides = h.slides();
        h.closeDesigner();
        return {
          slides,
          savedSlide: slides.find(slide => slide.name === ${JSON.stringify(slideName)}) || null,
          canvas,
          context: h.context(),
        };
      })()`);
      assertDesignedSlideSummary(reopened.savedSlide, 'reopened persisted draft');
      assert(reopened.canvas?.objectCount >= 8, `reopened designer canvas lost objects: ${JSON.stringify(reopened.canvas)}`);
      assert((reopened.canvas?.texts || []).some(text => text.includes('Layer 3 Editor Smoke')), 'reopened designer canvas lost title text');

      const published = await evaluate(cdp, `(async () => {
        const h = window.__zignsEditorSmoke;
        await h.selectShow(${JSON.stringify(created.id)});
        return h.publishCurrent(${JSON.stringify(slideName)});
      })()`);
      assert(published.publishedSlidesCount === 1, `expected one published slide, got ${published.publishedSlidesCount}`);

      await navigate(cdp, `${config.baseUrl}/display.html?slideshow=${encodeURIComponent(created.id)}`);
      await waitFor(cdp, `document.querySelector('#stageDesigned') && document.querySelector('#fabricDisplay')`, 'display designed stage');
      await waitFor(cdp, `getComputedStyle(document.querySelector('#loader')).display === 'none' || getComputedStyle(document.querySelector('#errBox')).display !== 'none'`, 'display preview load completion', 30000);
      const displayState = await waitForEditorDisplayPreview(cdp, 30000);
      assert(!displayState.errorVisible, displayState.errorText || 'display preview reported an error');
      assert(displayState.canvasNonBlank, `display preview canvas was blank: ${JSON.stringify(displayState)}`);

      return `show=${created.id}; slide=${slideName}; objects=${reopened.canvas.objectCount}; published=${published.publishedSlidesCount}`;
    } finally {
      if (created?.id) {
        try {
          await navigate(cdp, `${config.baseUrl}/admin.html`);
          await waitForAdminShell(cdp);
          await waitForEditorHarness(cdp);
          cleanupNote = await evaluate(cdp, `(async () => {
            const showId = ${JSON.stringify(created.id)};
            const h = window.__zignsEditorSmoke;
            await h.selectShow(showId);
            const oldConfirm = window.confirm;
            window.confirm = () => true;
            try {
              await window.deleteCurrentSlideshow();
            } finally {
              window.confirm = oldConfirm;
            }
            return 'delete requested';
          })()`);
          await waitFor(cdp, `!document.querySelector('#showList .show-item[data-id="' + CSS.escape(${JSON.stringify(created.id)}) + '"]')`, 'editor smoke slideshow deletion', 30000);
        } catch (error) {
          cleanupNote = `cleanup failed: ${error.message}`;
          warn('Editor Save/Publish cleanup', cleanupNote);
        }
      }
      assert(!cleanupNote.includes('failed'), cleanupNote);
    }
  });
}

async function runMutatingChecks(cdp) {
  await check('Slideshow CRUD smoke', async () => {
    const name = `Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let created = null;
    let cleanupNote = 'not needed';
    try {
      created = await evaluate(cdp, `(async () => {
        const oldPrompt = window.prompt;
        window.prompt = () => ${JSON.stringify(name)};
        try {
          await window.newShowPrompt();
        } finally {
          window.prompt = oldPrompt;
        }
        const active = document.querySelector('#showList .show-item.active');
        return {
          id: active?.dataset.id || '',
          name: document.querySelector('#showTitle')?.textContent?.trim() || active?.querySelector('.show-item-name')?.textContent?.trim() || '',
        };
      })()`);
      assert(created.name === name, `slideshow create did not select "${name}"`);
      assert(created.id, 'slideshow create did not expose a selected id');
      const saveState = await evaluate(cdp, `(async () => {
        const showId = ${JSON.stringify(created.id)};
        const item = document.querySelector('#showList .show-item[data-id="' + CSS.escape(showId) + '"]');
        item?.click();
        window.openShowOptions(showId);
        document.querySelector('#showOptionsTags').value = 'smoke';
        document.querySelector('#showOptionsAutoTags').value = '';
        document.querySelector('#showOptionsEmergency').checked = false;
        await window.saveShowOptions();
        const tagsText = document.querySelector('#showList .show-item[data-id="' + CSS.escape(showId) + '"] .show-item-tags')?.textContent || '';
        const errorText = document.querySelector('#showOptionsError')?.textContent?.trim() || '';
        const modalDisplay = getComputedStyle(document.querySelector('#showOptionsModal')).display;
        const toastText = document.querySelector('#toast')?.textContent?.trim() || '';
        return { tagsText, errorText, modalDisplay, toastText };
      })()`);
      assert(saveState.tagsText.includes('smoke'), `slideshow tag did not render after save: ${JSON.stringify(saveState)}`);
      const emergencyState = await evaluate(cdp, `(async () => {
        const showId = ${JSON.stringify(created.id)};
        const oldConfirm = window.confirm;
        window.confirm = () => true;
        try {
          window.openEmergencyPlaylistManager();
          await window.toggleEmergencyPlaylist(showId);
          const afterEnable = document.querySelector('#emergencyPlaylistManagerList .emergency-playlist-row[data-show-id="' + CSS.escape(showId) + '"]')?.classList.contains('ready') === true;
          const panelAfterEnable = document.querySelector('#emergencyPlaylistPreview')?.textContent || '';
          await window.toggleEmergencyPlaylist(showId);
          const afterDisable = document.querySelector('#emergencyPlaylistManagerList .emergency-playlist-row[data-show-id="' + CSS.escape(showId) + '"]')?.classList.contains('ready') === true;
          window.closeEmergencyPlaylistManager();
          return { afterEnable, afterDisable, panelAfterEnable };
        } finally {
          window.confirm = oldConfirm;
        }
      })()`);
      assert(emergencyState.afterEnable === true, `emergency manager did not mark temporary slideshow ready: ${JSON.stringify(emergencyState)}`);
      assert(emergencyState.afterDisable === false, `emergency manager did not clear temporary slideshow: ${JSON.stringify(emergencyState)}`);
    } finally {
      if (created?.id) {
        cleanupNote = await evaluate(cdp, `(async () => {
          const showId = ${JSON.stringify(created.id)};
          const item = document.querySelector('#showList .show-item[data-id="' + CSS.escape(showId) + '"]');
          if (!item) return 'already removed';
          item.click();
          const oldConfirm = window.confirm;
          window.confirm = () => true;
          try {
            await window.deleteCurrentSlideshow();
          } finally {
            window.confirm = oldConfirm;
          }
          return 'delete requested';
        })()`).catch(error => `cleanup failed: ${error.message}`);
        await waitFor(cdp, `!document.querySelector('#showList .show-item[data-id="' + CSS.escape(${JSON.stringify(created.id)}) + '"]')`, 'smoke slideshow deletion')
          .catch(error => { cleanupNote = `${cleanupNote}; deletion wait failed: ${error.message}`; });
      }
    }
    assert(!cleanupNote.includes('failed'), cleanupNote);
    return `created, tagged, and deleted ${created.id}; cleanup=${cleanupNote}`;
  });
}

async function main() {
  let browser;
  let ws;
  try {
    browser = await startBrowser();
    const wsUrl = await createPage(browser.browserBaseUrl);
    const client = await createClient(wsUrl);
    ws = client.ws;
    const { cdp } = client;

    await check('Login page browser UI', async () => {
      await navigate(cdp, `${config.baseUrl}/login.html`);
      if (config.editor) {
        await evaluate(cdp, `localStorage.setItem('zignsSmokeHarness', '1'); true`);
      }
      await waitFor(cdp, `document.querySelector('#authEmail') && document.querySelector('#authPassword') && document.querySelector('#signInBtn')`, 'login form controls');
      const title = await evaluate(cdp, `document.title`);
      return title || 'login form visible';
    });

    if (!config.email || !config.password) {
      warn('Authenticated browser flow', 'skipped; set ZIGNS_BROWSER_EMAIL and ZIGNS_BROWSER_PASSWORD for a dedicated test account');
    } else {
      const sessionDetails = await runReadOnlyAuthenticatedChecks(cdp);
      if (config.mutate) {
        if (!sessionDetails) {
          warn('Slideshow CRUD smoke', 'skipped; authenticated session did not complete');
        } else if (String(sessionDetails.role || '').toLowerCase() !== 'admin') {
          warn('Slideshow CRUD smoke', `skipped; mutating emergency playlist coverage requires an admin smoke account, got ${sessionDetails.role || 'unknown'}`);
        } else {
          await runMutatingChecks(cdp);
        }
      } else {
        if (!config.editor) warn('Slideshow CRUD smoke', 'skipped; set ZIGNS_BROWSER_MUTATE=1 to create/tag/delete a temporary slideshow');
      }

      if (config.editor) {
        if (!sessionDetails) {
          warn('Editor Save/Publish smoke', 'skipped; authenticated session did not complete');
        } else {
          await waitForEditorHarness(cdp);
          await runEditorSavePublishChecks(cdp, sessionDetails);
        }
      }
    }
  } finally {
    ws?.close();
    await browser?.cleanup?.();
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Zigns browser smoke: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
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
