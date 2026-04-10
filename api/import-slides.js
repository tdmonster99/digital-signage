// Vercel serverless function — imports Google Slides as PNG images into S3.
// POST /api/import-slides
// Body: { accessToken, presentationId }
// Returns: { title, slides: [{ url, name }] }

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');
const http  = require('http');

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

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, res => {
      // Follow redirects (Google thumbnail URLs often redirect)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accessToken, presentationId } = req.body || {};
  if (!accessToken || !presentationId) {
    return res.status(400).json({ error: 'accessToken and presentationId are required' });
  }
  // Basic validation — presentation IDs are alphanumeric with dashes/underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(presentationId)) {
    return res.status(400).json({ error: 'Invalid presentationId' });
  }

  // 1. Fetch presentation metadata (to get slide page IDs and title)
  const metaRes = await fetchUrl(
    `https://slides.googleapis.com/v1/presentations/${presentationId}?fields=title,slides.objectId`,
    { Authorization: `Bearer ${accessToken}` }
  );
  if (metaRes.status !== 200) {
    const msg = metaRes.body.toString();
    return res.status(metaRes.status).json({ error: `Google Slides API error: ${msg}` });
  }
  const meta = JSON.parse(metaRes.body.toString());
  const title  = meta.title || 'Untitled Presentation';
  const pages  = (meta.slides || []).map(s => s.objectId);

  if (pages.length === 0) {
    return res.status(400).json({ error: 'Presentation has no slides' });
  }

  // 2. For each slide, fetch thumbnail and upload to S3
  const results = [];
  for (let i = 0; i < pages.length; i++) {
    const pageId = pages[i];

    // Get thumbnail URL from Google
    const thumbRes = await fetchUrl(
      `https://slides.googleapis.com/v1/presentations/${presentationId}/pages/${pageId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`,
      { Authorization: `Bearer ${accessToken}` }
    );
    if (thumbRes.status !== 200) {
      return res.status(thumbRes.status).json({ error: `Failed to get thumbnail for slide ${i + 1}` });
    }
    const { contentUrl } = JSON.parse(thumbRes.body.toString());

    // Download the actual PNG image
    const imgRes = await fetchUrl(contentUrl);
    if (imgRes.status !== 200) {
      return res.status(imgRes.status).json({ error: `Failed to download thumbnail for slide ${i + 1}` });
    }

    // Upload to S3
    const key = `signage/slides/${presentationId}_slide${i + 1}_${Date.now()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.AWS_S3_BUCKET,
      Key:         key,
      Body:        imgRes.body,
      ContentType: 'image/png',
    }));

    const cdnUrl = `${process.env.CLOUDFRONT_URL}/${key}`;
    results.push({ url: cdnUrl, name: `Slide ${i + 1}` });
  }

  return res.status(200).json({ title, slides: results });
};

module.exports.config = { maxDuration: 60 };
