// Google Photos Picker import helper.
//
// POST /api/google-photos
// Body: { idToken, accessToken, baseUrl, filename, mimeType, type }
// Returns: { ok, url, key, name, mediaType }

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Transform, Readable } = require('stream');
const crypto = require('crypto');
const { getAuth, getFirestore } = require('./_lib/firebase-admin');

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_OTHER_BYTES = 100 * 1024 * 1024;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { idToken, accessToken, baseUrl, filename, mimeType, type } = req.body || {};
  if (!idToken || !accessToken || !baseUrl) {
    return res.status(400).json({ error: 'idToken, accessToken, and baseUrl are required' });
  }

  try {
    const cfBase = (process.env.CLOUDFRONT_URL || process.env.CLOUDFRONT_BASE_URL || '').replace(/\/$/, '');
    if (!process.env.AWS_S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !cfBase) {
      return res.status(500).json({ error: 'S3/CloudFront env vars are not configured' });
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    const userSnap = await getFirestore().doc(`users/${decoded.uid}`).get();
    const user = userSnap.data() || {};
    if (!userSnap.exists || !user.orgId) return res.status(403).json({ error: 'User organization required' });
    if (!['admin', 'editor'].includes(user.role || 'viewer')) {
      return res.status(403).json({ error: 'Editor access required' });
    }

    const clean = normalizeImportInput({ baseUrl, filename, mimeType, type });
    const downloadUrl = `${clean.baseUrl}${clean.mediaType === 'video' ? '=dv' : '=d'}`;
    const googleResp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!googleResp.ok) {
      const text = await googleResp.text().catch(() => '');
      return res.status(googleResp.status).json({
        error: `Google Photos download failed (${googleResp.status})${text ? `: ${text.slice(0, 160)}` : ''}`,
      });
    }

    const contentType = googleResp.headers.get('content-type') || clean.mimeType || 'application/octet-stream';
    const contentLength = Number(googleResp.headers.get('content-length') || 0);
    const maxBytes = maxBytesFor(contentType, clean.mediaType);
    if (contentLength > maxBytes) {
      return res.status(413).json({ error: 'Google Photos item exceeds the upload size limit' });
    }

    const key = `signage/slides/${crypto.randomUUID()}.${extensionFor(clean.filename, contentType, clean.mediaType)}`;
    const { body, counter } = limitedBodyStream(googleResp, maxBytes);
    await s3.send(new PutObjectCommand({
      Bucket:        process.env.AWS_S3_BUCKET,
      Key:           key,
      Body:          body,
      ContentType:   contentType,
      ContentLength: contentLength > 0 ? contentLength : undefined,
    }));

    return res.status(200).json({
      ok: true,
      url: `${cfBase}/${key}`,
      key,
      name: clean.filename,
      mediaType: clean.mediaType,
      contentType,
      size: contentLength || counter.bytes,
    });
  } catch (err) {
    const status = err.statusCode || (err.message?.includes('exceeds') ? 413 : 500);
    return res.status(status).json({ error: err.message || 'Google Photos import failed' });
  }
};

module.exports.config = { maxDuration: 60 };

function normalizeImportInput(input) {
  const parsed = new URL(String(input.baseUrl || ''));
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || (host !== 'googleusercontent.com' && !host.endsWith('.googleusercontent.com'))) {
    const error = new Error('Invalid Google Photos base URL');
    error.statusCode = 400;
    throw error;
  }
  parsed.search = '';
  parsed.hash = '';

  const mime = String(input.mimeType || '').toLowerCase();
  const mediaType = input.type === 'video' || mime.startsWith('video/') ? 'video' : 'image';
  const filename = sanitizeFilename(input.filename || (mediaType === 'video' ? 'google-photos-video.mp4' : 'google-photos-image.jpg'));
  return { baseUrl: parsed.toString(), mimeType: mime, mediaType, filename };
}

function sanitizeFilename(value) {
  const name = String(value || 'google-photos-item')
    .split(/[\\/]/)
    .pop()
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  return name || 'google-photos-item';
}

function maxBytesFor(contentType, mediaType) {
  const ct = String(contentType || '').toLowerCase();
  if (mediaType === 'video' || ct.startsWith('video/')) return MAX_VIDEO_BYTES;
  if (ct.startsWith('image/')) return MAX_IMAGE_BYTES;
  return MAX_OTHER_BYTES;
}

function extensionFor(filename, contentType, mediaType) {
  const fromName = String(filename || '').match(/\.([a-z0-9]{2,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('jpeg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('quicktime')) return 'mov';
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

function limitedBodyStream(response, maxBytes) {
  const counter = { bytes: 0 };
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      counter.bytes += chunk.length;
      if (counter.bytes > maxBytes) {
        callback(new Error('Google Photos item exceeds the upload size limit'));
        return;
      }
      callback(null, chunk);
    },
  });
  const source = Readable.fromWeb
    ? Readable.fromWeb(response.body)
    : Readable.from(response.body);
  return { body: source.pipe(limit), counter };
}
