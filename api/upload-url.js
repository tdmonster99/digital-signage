// Vercel serverless function — generates a presigned S3 PUT URL for direct browser-to-S3 uploads.
// Browser calls: GET /api/upload-url?key=signage/slides/uuid.jpg&contentType=image/jpeg
// Returns: { uploadUrl, cdnUrl }

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { key, contentType } = req.query;
  if (!key || !contentType) {
    return res.status(400).json({ error: 'key and contentType query params are required' });
  }

  // Prevent path traversal
  if (key.includes('..') || key.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid key' });
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
