#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
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
  baseUrl: String(args['base-url'] || process.env.ZIGNS_SMOKE_BASE_URL || process.env.ZIGNS_BROWSER_BASE_URL || 'https://app.zigns.io').replace(/\/+$/, ''),
  email: args.email || process.env.ZIGNS_SMOKE_EMAIL || process.env.ZIGNS_BROWSER_EMAIL || '',
  password: args.password || process.env.ZIGNS_SMOKE_PASSWORD || process.env.ZIGNS_BROWSER_PASSWORD || '',
  expectedOrg: args['expected-org'] || process.env.ZIGNS_SMOKE_EXPECTED_ORG || process.env.ZIGNS_BROWSER_EXPECTED_ORG || 'Zigns Smoke Test',
  expectedRole: args['expected-role'] || process.env.ZIGNS_SMOKE_EXPECTED_ROLE || process.env.ZIGNS_BROWSER_EXPECTED_ROLE || 'admin',
  browserPath: args['browser-path'] || process.env.ZIGNS_BROWSER_PATH || '',
  cdpUrl: args['cdp-url'] || process.env.ZIGNS_BROWSER_CDP_URL || '',
  headed: Boolean(args.headed || process.env.ZIGNS_BROWSER_HEADED === '1'),
  keepOpen: Boolean(args['keep-open'] || process.env.ZIGNS_BROWSER_KEEP_OPEN === '1'),
  timeoutMs: Number.parseInt(args.timeout || process.env.ZIGNS_SMOKE_TIMEOUT_MS || process.env.ZIGNS_BROWSER_TIMEOUT_MS || '60000', 10),
};

const PROJECT_ID = 'digital-signage-2';
const results = [];
let idToken = '';

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

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'ZignsRenderingSmoke/1.0',
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timeout));
}

async function fetchJson(url, options = {}) {
  const resp = await fetchWithTimeout(url, options);
  const body = await resp.json().catch(() => ({}));
  assert(resp.ok, `${url} returned HTTP ${resp.status}`);
  return body;
}

async function readText(file) {
  return fsp.readFile(path.join(ROOT, file), 'utf8');
}

function extractFirebaseApiKey(source) {
  const match = source.match(/apiKey:\s*["']([^"']+)["']/);
  return match?.[1] || '';
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
  const userDataDir = fs.mkdtempSync(path.join(tempRoot, 'zigns-rendering-smoke-'));
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
        this.messageHandlers.forEach(handler => handler(payload.toString('utf8')));
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

function designedCanvasJson(label = 'RENDERING SMOKE DESIGNED SLIDE') {
  return JSON.stringify({
    version: '5.3.0',
    background: '#07111f',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#07111f', selectable: false },
      { type: 'rect', left: 112, top: 118, width: 1696, height: 844, fill: '#0f1f35', stroke: '#1e4fd6', strokeWidth: 8, rx: 28, ry: 28 },
      { type: 'rect', left: 174, top: 206, width: 500, height: 330, fill: '#0043ce', rx: 22, ry: 22 },
      { type: 'rect', left: 732, top: 206, width: 500, height: 330, fill: '#15a068', rx: 22, ry: 22 },
      { type: 'rect', left: 1290, top: 206, width: 340, height: 330, fill: '#f5b400', rx: 22, ry: 22 },
      { type: 'textbox', left: 174, top: 610, width: 1430, text: label, fontFamily: 'Arial', fontWeight: '700', fontSize: 82, fill: '#ffffff' },
      { type: 'textbox', left: 178, top: 730, width: 980, text: 'Multiple Fabric objects should render together in preview.', fontFamily: 'Arial', fontSize: 42, fill: '#c7d2fe' },
      { type: 'textbox', left: 1350, top: 720, width: 300, text: 'OK', fontFamily: 'Arial', fontWeight: '700', fontSize: 96, fill: '#07111f', textAlign: 'center' },
    ],
  });
}

function buildSlides({ includeYoutube, variant = 'initial' }) {
  const suffix = variant === 'post-delete' ? '-clean' : '';
  const designedLabel = variant === 'post-delete'
    ? 'RENDERING SMOKE AFTER DELETE'
    : 'RENDERING SMOKE DESIGNED SLIDE';
  const dwell = 2;
  const slides = [
    {
      id: 'render-image-one',
      type: 'image',
      name: 'Rendering smoke image one',
      url: `https://dummyimage.com/1280x720/0043ce/ffffff.png&text=zigns-render-one${suffix}`,
      active: true,
      dwell,
      fit: 'contain',
      bg: '#dbeafe',
    },
    {
      id: 'render-designed',
      type: 'designed',
      name: 'Rendering smoke designed slide',
      active: true,
      dwell,
      canvasJson: designedCanvasJson(designedLabel),
    },
    {
      id: 'render-image-two',
      type: 'image',
      name: 'Rendering smoke image two',
      url: `https://dummyimage.com/1280x720/111827/ffffff.png&text=zigns-render-two${suffix}`,
      active: true,
      dwell,
      fit: 'contain',
      bg: '#dbeafe',
    },
  ];

  if (includeYoutube) {
    slides.push({
      id: 'render-youtube',
      type: 'youtube',
      name: 'Rendering smoke YouTube',
      active: true,
      dwell,
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  }

  return slides;
}

function postDeletePlaylistVisibleExpression() {
  return `(() => {
    const bg = [
      getComputedStyle(document.querySelector('#stageA') || document.body).backgroundImage || '',
      getComputedStyle(document.querySelector('#stageB') || document.body).backgroundImage || '',
    ].join(' ').toLowerCase();
    return bg.includes('zigns-render-one-clean') || bg.includes('zigns-render-two-clean');
  })()`;
}

function previewStateExpression() {
  return `(() => {
    const byId = id => document.getElementById(id);
    const stage = id => {
      const el = byId(id);
      if (!el) return { exists: false, visible: false, opacity: 0, bg: '', text: '', iframeSrc: '' };
      const style = getComputedStyle(el);
      const opacity = Number.parseFloat(el.style.opacity || style.opacity || '0') || 0;
      return {
        exists: true,
        visible: opacity > 0.01,
        opacity,
        bg: style.backgroundImage || '',
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 500),
        iframeSrc: el.querySelector('iframe')?.src || '',
      };
    };
    const designed = stage('stageDesigned');
    const canvas = byId('fabricDisplay');
    let canvasNonBlank = false;
    let canvasSampleError = '';
    if (designed.visible && canvas && canvas.width && canvas.height) {
      try {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const stepX = Math.max(1, Math.floor(width / 12));
        const stepY = Math.max(1, Math.floor(height / 12));
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
      title: document.title,
      path: location.pathname,
      search: location.search,
      loaderVisible: getComputedStyle(byId('loader') || document.body).display !== 'none',
      errorVisible: errBox ? getComputedStyle(errBox).display !== 'none' : false,
      errorText: byId('errMsg')?.textContent?.trim() || '',
      stageA: stage('stageA'),
      stageB: stage('stageB'),
      designed: { ...designed, canvasNonBlank, canvasSampleError },
      youtube: {
        ...stage('stageYoutube'),
        iframeSrc: byId('iframeYoutube')?.src || '',
        fallbackTitle: byId('youtubeFallbackTitle')?.textContent?.trim() || '',
        fallbackStatus: byId('youtubeFallbackStatus')?.textContent?.trim() || '',
      },
    };
  })()`;
}

function mergeObservation(observed, state) {
  const bg = `${state.stageA?.bg || ''} ${state.stageB?.bg || ''}`.toLowerCase();
  if (bg.includes('zigns-render-one')) observed.imageOne = true;
  if (bg.includes('zigns-render-two')) observed.imageTwo = true;
  if (state.designed?.visible && state.designed?.canvasNonBlank) observed.designed = true;
  if (state.youtube?.visible) observed.youtube = true;
  if (state.errorVisible || state.errorText) observed.errors.push(state.errorText || 'preview error visible');
  if (state.designed?.canvasSampleError) observed.canvasSampleErrors.push(state.designed.canvasSampleError);
}

async function collectPreviewObservations(cdp, durationMs, isComplete = null) {
  const observed = {
    imageOne: false,
    imageTwo: false,
    designed: false,
    youtube: false,
    errors: [],
    canvasSampleErrors: [],
    samples: 0,
  };
  const deadline = Date.now() + durationMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(cdp, previewStateExpression());
    observed.samples += 1;
    mergeObservation(observed, lastState);
    if (typeof isComplete === 'function' && isComplete(observed, lastState)) break;
    await sleep(350);
  }
  return { observed, lastState };
}

function observedFullSlideMix(observed) {
  return observed.imageOne && observed.imageTwo && observed.designed && observed.youtube;
}

function observedPublishedSlideMix(observed) {
  return observed.imageOne && observed.imageTwo && observed.designed;
}

async function loginBrowser(cdp) {
  await navigate(cdp, `${config.baseUrl}/login.html`);
  await waitFor(cdp, `document.querySelector('#authEmail') && document.querySelector('#authPassword') && document.querySelector('#signInBtn')`, 'login form controls');
  await fill(cdp, '#authEmail', config.email);
  await fill(cdp, '#authPassword', config.password);
  await click(cdp, '#signInBtn');
  await waitFor(cdp, `location.pathname.endsWith('/admin.html') || document.querySelector('#page-dashboard')`, 'admin shell after login', 30000);
  await waitFor(cdp, `document.querySelector('#page-dashboard') && document.body.textContent.includes('Dashboard')`, 'dashboard content', 30000);
}

async function waitForPreviewReady(cdp, showId) {
  await navigate(cdp, `${config.baseUrl}/display.html?slideshow=${encodeURIComponent(showId)}`);
  await waitFor(cdp, `location.pathname.endsWith('/display.html') && location.search.includes(${JSON.stringify(showId)})`, 'display preview route');
  await waitFor(cdp, `document.querySelector('#stageA') && document.querySelector('#stageB') && document.querySelector('#stageDesigned')`, 'display stages');
  await waitFor(cdp, `getComputedStyle(document.querySelector('#loader')).display === 'none' || getComputedStyle(document.querySelector('#errBox')).display !== 'none'`, 'preview load completion', 30000);
  const state = await evaluate(cdp, previewStateExpression());
  assert(!state.errorVisible, state.errorText || 'preview loaded with an error');
}

async function waitForYoutubeGone(cdp) {
  await waitFor(cdp, `(() => {
    const yt = document.querySelector('#stageYoutube');
    const iframe = document.querySelector('#iframeYoutube');
    const opacity = yt ? Number.parseFloat(yt.style.opacity || getComputedStyle(yt).opacity || '0') : 0;
    return opacity <= 0.01 && (!iframe || iframe.src === 'about:blank');
  })()`, 'YouTube stage to be hidden after republish', 20000);
}

function summarizeObserved(observed) {
  return [
    observed.imageOne ? 'image-one' : '',
    observed.imageTwo ? 'image-two' : '',
    observed.designed ? 'designed' : '',
    observed.youtube ? 'youtube' : '',
  ].filter(Boolean).join(', ') || 'none';
}

async function main() {
  await signIn();

  let boot;
  await check('Authenticated rendering smoke org', async () => {
    boot = await account('bootstrap');
    const orgName = boot.org?.name || '';
    const role = boot.user?.role || '';
    assert(orgName === config.expectedOrg, `expected org "${config.expectedOrg}", got "${orgName || 'unknown'}"`);
    assert(String(role).toLowerCase() === config.expectedRole.toLowerCase(), `expected role "${config.expectedRole}", got "${role || 'unknown'}"`);
    assert(String(role).toLowerCase() === 'admin', 'rendering smoke needs an Admin account so it can delete its temporary slideshow');
    return `org=${orgName}; role=${role}`;
  });
  if (results.some(result => result.status === 'fail')) return finish();

  const stamp = Date.now().toString(36);
  const showId = `render_${stamp}`;
  const slidePatch = {
    defaultDwell: 2,
    fitMode: 'contain',
    transition: 'none',
    transitionSpeed: 'fast',
    tags: ['smoke', 'rendering'],
    autoIncludeTags: [],
    emergencyPlaylist: false,
  };
  let createdShow = false;
  let browser;
  let ws;

  try {
    await check('Publish temporary rendering slideshow', async () => {
      await account('createSlideshow', { showId, name: `Rendering Smoke ${stamp}` });
      createdShow = true;
      const slides = buildSlides({ includeYoutube: true });
      const result = await account('publishSlideshow', {
        showId,
        slides,
        patch: slidePatch,
        screenIds: [],
      });
      assert(result.publishedSlidesCount === slides.length, `expected ${slides.length} published slides, got ${result.publishedSlidesCount}`);
      return `show=${showId}; slides=${slides.length}`;
    });

    if (results.some(result => result.status === 'fail')) return;

    browser = await startBrowser();
    const wsUrl = await createPage(browser.browserBaseUrl);
    const client = await createClient(wsUrl);
    ws = client.ws;
    const { cdp } = client;

    await check('Authenticated display preview session', async () => {
      await loginBrowser(cdp);
      await waitForPreviewReady(cdp, showId);
      return `preview=/display.html?slideshow=${showId}`;
    });

    await check('Display preview renders slide mix', async () => {
      const { observed } = await collectPreviewObservations(cdp, 22000, observedFullSlideMix);
      assert(!observed.errors.length, `preview errors: ${observed.errors.join('; ')}`);
      assert(observed.imageOne, `first image slide was not observed; saw ${summarizeObserved(observed)}`);
      assert(observed.imageTwo, `second image slide was not observed; saw ${summarizeObserved(observed)}`);
      assert(observed.designed, `designed Fabric slide did not render nonblank canvas; saw ${summarizeObserved(observed)}`);
      assert(observed.youtube, `YouTube slide stage was not observed; saw ${summarizeObserved(observed)}`);
      return `observed ${summarizeObserved(observed)} across ${observed.samples} samples`;
    });

    await check('Republish removes deleted YouTube slide', async () => {
      const slides = buildSlides({ includeYoutube: false, variant: 'post-delete' });
      const result = await account('publishSlideshow', {
        showId,
        slides,
        patch: slidePatch,
        screenIds: [],
      });
      assert(result.publishedSlidesCount === slides.length, `expected ${slides.length} published slides after republish, got ${result.publishedSlidesCount}`);
      const snapshot = await account('showSnapshot', { showId });
      const published = Array.isArray(snapshot.slides) ? snapshot.slides : [];
      assert(published.length === slides.length, `snapshot has ${published.length} slides after republish, expected ${slides.length}`);
      assert(!published.some(slide => slide.type === 'youtube'), 'showSnapshot still contains a YouTube slide after republish');
      await waitFor(cdp, postDeletePlaylistVisibleExpression(), 'post-delete playlist to render in preview', 20000);
      await waitForYoutubeGone(cdp);
      const { observed } = await collectPreviewObservations(cdp, 12000, observedPublishedSlideMix);
      assert(!observed.youtube, `preview still showed YouTube after republish; saw ${summarizeObserved(observed)}`);
      assert(observed.imageOne && observed.imageTwo && observed.designed, `republished preview did not cycle through remaining slides; saw ${summarizeObserved(observed)}`);
      return `snapshot=${published.length} slides; observed ${summarizeObserved(observed)}`;
    });
  } finally {
    ws?.close();
    await browser?.cleanup?.();
    if (createdShow) {
      await check('Cleanup rendering slideshow', async () => {
        await account('deleteSlideshow', { showId });
        return `removed ${showId}`;
      });
    } else {
      warn('Cleanup rendering slideshow', 'skipped; temporary slideshow was not created');
    }
  }

  finish();
}

function finish() {
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Zigns rendering smoke: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
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
