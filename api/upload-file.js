// Same-origin upload fallback for browsers that cannot PUT directly to S3.
// POST /api/upload-file
// Body: { key, contentType, dataBase64 }
// Returns: { url, cdnUrl, key }

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

  try {
    const { key, contentType, dataBase64 } = req.body || {};
    if (!key || !contentType || !dataBase64) {
      return res.status(400).json({ error: 'key, contentType, and dataBase64 are required' });
    }
    if (key.includes('..') || key.startsWith('/') || !key.startsWith('signage/')) {
      return res.status(400).json({ error: 'Invalid key' });
    }

    const bucket = process.env.AWS_S3_BUCKET;
    const cfBase = (process.env.CLOUDFRONT_URL || process.env.CLOUDFRONT_BASE_URL || '').replace(/\/$/, '');
    if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !cfBase) {
      return res.status(500).json({ error: 'S3/CloudFront env vars are not configured' });
    }

    const buffer = Buffer.from(String(dataBase64), 'base64');
    const maxBytes = maxBytesFor(contentType);
    if (!buffer.length) return res.status(400).json({ error: 'Empty files cannot be uploaded' });
    if (buffer.length > maxBytes) return res.status(413).json({ error: 'File exceeds upload size limit' });

    await s3.send(new PutObjectCommand({
      Bucket:        bucket,
      Key:           key,
      Body:          buffer,
      ContentType:   contentType,
      ContentLength: buffer.length,
    }));

    const cdnUrl = `${cfBase}/${key}`;
    return res.status(200).json({ url: cdnUrl, cdnUrl, key, size: buffer.length });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Upload failed' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
  maxDuration: 60,
};

function maxBytesFor(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return MAX_IMAGE_BYTES;
  if (ct.startsWith('video/')) return MAX_VIDEO_BYTES;
  return MAX_OTHER_BYTES;
}
