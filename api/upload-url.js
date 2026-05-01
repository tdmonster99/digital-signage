// Vercel serverless function — generates a presigned S3 PUT URL for direct browser-to-S3 uploads.
// Browser calls: GET /api/upload-url?key=signage/slides/uuid.jpg&contentType=image/jpeg&size=12345
// Returns: { uploadUrl, cdnUrl }

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_OTHER_BYTES = 100 * 1024 * 1024;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  // Force path-style URLs (s3.region.amazonaws.com/bucket/key) to avoid
  // virtual-hosted redirects that strip CORS headers from preflight responses.
  forcePathStyle: true,
  // Disable automatic CRC32 checksums — they add extra headers that fail
  // CORS preflight checks when the browser PUTs directly to S3.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = firstQueryValue(req.query.key);
  const contentType = firstQueryValue(req.query.contentType);
  const size = Number(firstQueryValue(req.query.size));
  if (!key || !contentType || !Number.isFinite(size)) {
    return res.status(400).json({ error: 'key, contentType, and size query params are required' });
  }

  // Prevent path traversal and keep browser uploads inside the app media prefix.
  if (key.includes('..') || key.startsWith('/') || !key.startsWith('signage/')) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  if (size <= 0) {
    return res.status(400).json({ error: 'Empty files cannot be uploaded' });
  }

  const ct = String(contentType).toLowerCase();
  const maxBytes = ct.startsWith('image/')
    ? MAX_IMAGE_BYTES
    : ct.startsWith('video/')
      ? MAX_VIDEO_BYTES
      : MAX_OTHER_BYTES;
  if (size > maxBytes) {
    return res.status(413).json({ error: 'File exceeds upload size limit' });
  }

  const command = new PutObjectCommand({
    Bucket:      process.env.AWS_S3_BUCKET,
    Key:         key,
    ContentType: contentType,
  });

  try {
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
    const cdnUrl    = `${process.env.CLOUDFRONT_URL}/${key}`;
    return res.status(200).json({ uploadUrl, cdnUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}
