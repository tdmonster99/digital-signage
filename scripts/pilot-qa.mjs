#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
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
  baseUrl: String(
    args['base-url'] ||
    process.env.ZIGNS_PILOT_BASE_URL ||
    process.env.ZIGNS_SMOKE_BASE_URL ||
    process.env.ZIGNS_BROWSER_BASE_URL ||
    'https://app.zigns.io'
  ).replace(/\/+$/, ''),
  mutate: Boolean(
    args.mutate ||
    process.env.ZIGNS_PILOT_MUTATE === '1' ||
    process.env.ZIGNS_BROWSER_MUTATE === '1' ||
    process.env.ZIGNS_SMOKE_MUTATE === '1'
  ),
  json: Boolean(args.json || process.env.ZIGNS_PILOT_JSON === '1'),
  includeTags: Boolean(args['include-tags'] || process.env.ZIGNS_PILOT_INCLUDE_TAGS === '1'),
  includeRules: Boolean(args['include-rules'] || process.env.ZIGNS_PILOT_INCLUDE_RULES === '1'),
  includeInvite: Boolean(args['include-invite'] || process.env.ZIGNS_PILOT_INCLUDE_INVITE === '1'),
  skipAccount: Boolean(args['skip-account'] || process.env.ZIGNS_PILOT_SKIP_ACCOUNT === '1'),
  skipBrowser: Boolean(args['skip-browser'] || process.env.ZIGNS_PILOT_SKIP_BROWSER === '1'),
  skipEditor: Boolean(args['skip-editor'] || process.env.ZIGNS_PILOT_SKIP_EDITOR === '1'),
  skipRendering: Boolean(args['skip-rendering'] || process.env.ZIGNS_PILOT_SKIP_RENDERING === '1'),
  timeout: args.timeout || process.env.ZIGNS_PILOT_TIMEOUT_MS || '',
  browserTimeout: args['browser-timeout'] || process.env.ZIGNS_PILOT_BROWSER_TIMEOUT_MS || '90000',
};

const results = [];

function addResult(status, name, details = '') {
  results.push({ status, name, details });
}

function hasCredentials() {
  return Boolean(
    (process.env.ZIGNS_BROWSER_EMAIL || process.env.ZIGNS_SMOKE_EMAIL) &&
    (process.env.ZIGNS_BROWSER_PASSWORD || process.env.ZIGNS_SMOKE_PASSWORD)
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

function hasBrowserAccess() {
  if (process.env.ZIGNS_BROWSER_CDP_URL) return true;
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
  return candidates.some(candidate => fs.existsSync(candidate));
}

function scriptArgs(script, extra = []) {
  return [path.join('scripts', script), ...extra];
}

function commandLabel(argv) {
  return ['node', ...argv].join(' ');
}

function runStep(name, argv, options = {}) {
  const env = {
    ...process.env,
    ...(options.env || {}),
  };

  if (!config.json) {
    console.log(`\n== ${name} ==`);
    console.log(`$ ${commandLabel(argv)}`);
  }

  return new Promise(resolve => {
    const child = spawn(process.execPath, argv, {
      cwd: ROOT,
      env,
      stdio: config.json ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (config.json) {
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
    }
    child.on('error', error => {
      addResult('fail', name, error.message);
      resolve();
    });
    child.on('exit', code => {
      if (code === 0) addResult('pass', name);
      else addResult('fail', name, `exited with code ${code}`);
      if (config.json) {
        const result = results[results.length - 1];
        result.stdout = stdout.trim();
        result.stderr = stderr.trim();
      }
      resolve();
    });
  });
}

function skip(name, details) {
  addResult('warn', name, `skipped; ${details}`);
  if (!config.json) console.log(`WARN ${name} - skipped; ${details}`);
}

function baseUrlArgs() {
  return ['--base-url', config.baseUrl];
}

function timeoutArgs(timeout = config.timeout) {
  return timeout ? ['--timeout', timeout] : [];
}

function browserTimeoutArgs() {
  return timeoutArgs(config.browserTimeout);
}

async function main() {
  const credentials = hasCredentials();
  const browser = hasBrowserAccess();

  if (!config.json) {
    console.log('Zigns Pilot QA');
    console.log(`Base URL: ${config.baseUrl}`);
    console.log(`Mutating checks: ${config.mutate ? 'enabled' : 'disabled'}`);
    console.log(`Credentials: ${credentials ? 'configured' : 'missing'}`);
    console.log(`Browser: ${browser ? 'available' : 'missing'}`);
  }

  await runStep('Static smoke', scriptArgs('pilot-smoke.mjs', ['--static']));
  await runStep('Public and account smoke', scriptArgs('pilot-smoke.mjs', [
    ...baseUrlArgs(),
    ...(config.skipAccount ? ['--skip-auth'] : []),
    ...timeoutArgs(),
  ]), {
    env: config.includeInvite ? {} : { ZIGNS_SMOKE_INVITE_EMAIL: '', ZIGNS_SMOKE_INVITE_ROLE: '' },
  });

  if (config.skipBrowser) {
    skip('Browser UI smoke', 'ZIGNS_PILOT_SKIP_BROWSER=1 or --skip-browser was set');
  } else if (!credentials) {
    skip('Browser UI smoke', 'set ZIGNS_BROWSER_EMAIL/ZIGNS_BROWSER_PASSWORD or ZIGNS_SMOKE_EMAIL/ZIGNS_SMOKE_PASSWORD');
  } else if (!browser) {
    skip('Browser UI smoke', 'Chrome or Edge was not found; set ZIGNS_BROWSER_PATH or ZIGNS_BROWSER_CDP_URL');
  } else {
    await runStep('Browser UI smoke', scriptArgs('browser-smoke.mjs', [
      ...baseUrlArgs(),
      ...browserTimeoutArgs(),
      ...(config.mutate ? ['--mutate'] : []),
    ]), {
      env: config.mutate ? { ZIGNS_BROWSER_MUTATE: '1' } : {},
    });
  }

  if (config.skipEditor) {
    skip('Editor save/publish smoke', 'ZIGNS_PILOT_SKIP_EDITOR=1 or --skip-editor was set');
  } else if (!config.mutate) {
    skip('Editor save/publish smoke', 'enable --mutate, ZIGNS_PILOT_MUTATE=1, or ZIGNS_BROWSER_MUTATE=1 to allow temporary test slideshows');
  } else if (!credentials) {
    skip('Editor save/publish smoke', 'set smoke account email/password env vars');
  } else if (!browser) {
    skip('Editor save/publish smoke', 'Chrome or Edge was not found; set ZIGNS_BROWSER_PATH or ZIGNS_BROWSER_CDP_URL');
  } else {
    await runStep('Editor save/publish smoke', scriptArgs('browser-smoke.mjs', [
      '--editor',
      ...baseUrlArgs(),
      ...browserTimeoutArgs(),
    ]));
  }

  if (config.skipRendering) {
    skip('Rendering smoke', 'ZIGNS_PILOT_SKIP_RENDERING=1 or --skip-rendering was set');
  } else if (!config.mutate) {
    skip('Rendering smoke', 'enable --mutate, ZIGNS_PILOT_MUTATE=1, or ZIGNS_BROWSER_MUTATE=1 to allow temporary test slideshows');
  } else if (!credentials) {
    skip('Rendering smoke', 'set smoke account email/password env vars');
  } else if (!browser) {
    skip('Rendering smoke', 'Chrome or Edge was not found; set ZIGNS_BROWSER_PATH or ZIGNS_BROWSER_CDP_URL');
  } else {
    await runStep('Rendering smoke', scriptArgs('rendering-smoke.mjs', [
      ...baseUrlArgs(),
      ...browserTimeoutArgs(),
    ]));
  }

  if (config.includeTags) {
    if (!credentials) {
      skip('Tag propagation smoke', 'set smoke account email/password env vars');
    } else {
      await runStep('Tag propagation smoke', scriptArgs('tag-propagation-smoke.mjs', [
        ...baseUrlArgs(),
        ...timeoutArgs('30000'),
      ]));
    }
  }

  if (config.includeRules) {
    if (!credentials) {
      skip('Rules denial smoke', 'set smoke account email/password env vars');
    } else {
      await runStep('Rules denial smoke', scriptArgs('rules-denial-smoke.mjs', [
        ...baseUrlArgs(),
        ...timeoutArgs('30000'),
      ]));
    }
  }

  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});

  if (config.json) {
    console.log(JSON.stringify({
      config: {
        baseUrl: config.baseUrl,
        mutate: config.mutate,
        includeTags: config.includeTags,
        includeRules: config.includeRules,
        includeInvite: config.includeInvite,
        skipAccount: config.skipAccount,
      },
      counts,
      results,
    }, null, 2));
  } else {
    console.log(`\nZigns pilot QA: ${counts.pass || 0} pass, ${counts.warn || 0} warn, ${counts.fail || 0} fail`);
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
