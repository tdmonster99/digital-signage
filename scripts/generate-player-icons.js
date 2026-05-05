#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const BLUE = [0x00, 0x43, 0xce, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT = [0x00, 0x00, 0x00, 0x00];

const targets = [
  { file: 'player-tizen/icon.png', size: 256 },
  { file: 'player-webos/icon.png', size: 80 },
  { file: 'player-webos/largeicon.png', size: 130 },
];

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 8 + data.length);
  return out;
}

function insideRoundedRect(x, y, size, radius) {
  const max = size - 1;
  const cx = x < radius ? radius : x > max - radius ? max - radius : x;
  const cy = y < radius ? radius : y > max - radius ? max - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function zPolygon(size) {
  const scale = size / 256;
  return [
    [74, 74], [182, 74], [182, 102], [116, 174],
    [184, 174], [184, 202], [72, 202], [72, 174],
    [138, 102], [74, 102],
  ].map(([x, y]) => [x * scale, y * scale]);
}

function setPixel(buf, width, x, y, color) {
  const idx = (y * (width * 4 + 1)) + 1 + (x * 4);
  buf[idx] = color[0];
  buf[idx + 1] = color[1];
  buf[idx + 2] = color[2];
  buf[idx + 3] = color[3];
}

function renderPng(size) {
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  const radius = Math.round(size * 0.1875);
  const z = zPolygon(size);

  for (let y = 0; y < size; y += 1) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x += 1) {
      let color = insideRoundedRect(x, y, size, radius) ? BLUE : TRANSPARENT;
      if (color === BLUE && pointInPolygon(x + 0.5, y + 0.5, z)) color = WHITE;
      setPixel(raw, size, x, y, color);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const target of targets) {
  const out = path.join(ROOT, target.file);
  fs.writeFileSync(out, renderPng(target.size));
  console.log(`wrote ${target.file} (${target.size}x${target.size})`);
}
