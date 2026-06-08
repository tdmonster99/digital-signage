#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`\\nfunction ${name}\\s*\\(`).exec(source);
  assert.ok(match, `Could not find function ${name}`);
  const start = match.index + 1;
  let parenDepth = 0;
  let braceStart = -1;
  for (let i = source.indexOf('(', start); i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (parenDepth === 0) {
      braceStart = source.indexOf('{', i);
      break;
    }
  }
  assert.notEqual(braceStart, -1, `Could not find body for function ${name}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract function ${name}`);
}

const names = [
  'slideshowMetadataCount',
  'hasInlineSlidePayload',
  'hasSubcollectionSlideStorage',
  'shouldProbeUnmarkedSubcollections',
  'shouldHydrateShowCountMeta',
];
const context = { SLIDE_STORAGE_VERSION: 2 };
vm.createContext(context);
vm.runInContext(names.map(extractFunction).join('\n'), context);

const legacyInlineEmptySubcollectionShow = {
  slides: [],
  publishedStorage: 'subcollection',
};

assert.equal(
  context.shouldHydrateShowCountMeta(legacyInlineEmptySubcollectionShow),
  true,
  'sidebar counts should hydrate when subcollection storage is authoritative even if a stale inline slides array exists'
);

assert.equal(
  context.shouldHydrateShowCountMeta({ slides: [{ id: 'inline-slide' }] }),
  false,
  'sidebar counts should not hydrate when inline slides are the authoritative payload'
);

console.log('slideshow sidebar count smoke passed');
