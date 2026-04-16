// Vercel serverless function — converts a PowerPoint (.pptx) file to per-slide
// PNG images using CloudConvert, and stores the output directly in S3.
//
// Required env vars:
//   CLOUDCONVERT_API_KEY  — from cloudconvert.com (sandbox keys work for testing)
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION
//   CLOUDFRONT_BASE_URL
//
// POST /api/import-pptx
//   Body: { s3Key, basename, orgId }   ← s3Key is the S3 object key of the uploaded .pptx
//   → { jobId, batchId }
//
// GET  /api/import-pptx?jobId=&batchId=&orgId=
//   → { status: 'processing' }
//   → { status: 'finished', urls: [...], count: N }
//   → { status: 'error', error: '...' }

const CC_API = 'https://api.cloudconvert.com/v2';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'CLOUDCONVERT_API_KEY not configured — add it to Vercel env vars' });

  if (req.method === 'POST') return createJob(req, res, apiKey);
  if (req.method === 'GET')  return checkJob(req, res, apiKey);
  return res.status(405).json({ error: 'Method not allowed' });
};

// ── POST: Create conversion job ───────────────────────────────────────────────
async function createJob(req, res, apiKey) {
  const { s3Key, basename, orgId } = req.body || {};
  if (!s3Key)   return res.status(400).json({ error: 's3Key is required' });
  if (!orgId)   return res.status(400).json({ error: 'orgId is required' });

  const bucket          = process.env.AWS_S3_BUCKET;
  const region          = process.env.AWS_REGION || 'us-east-2';
  const accessKeyId     = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return res.status(500).json({ error: 'S3 env vars not configured' });
  }

  // Generate a unique prefix for this batch so multiple jobs don't collide
  const { randomUUID } = await import('crypto');
  const batchId = randomUUID();
  const keyPrefix = `pptx-imports/${orgId}/${batchId}`;

  const jobBody = {
    tasks: {
      // Import directly from S3 using IAM credentials — more reliable than
      // importing via a CloudFront URL which may not be publicly accessible.
      'import-file': {
        operation: 'import/s3',
        bucket,
        region,
        key: s3Key,
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey,
      },
      'convert-slides': {
        operation: 'convert',
        input: 'import-file',
        output_format: 'png',
        engine: 'libreoffice',
      },
      'export-to-s3': {
        operation: 'export/s3',
        input: 'convert-slides',
        bucket,
        region,
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey,
        key: `${keyPrefix}/{{filename}}`,
        // No acl field — modern S3 buckets have ACLs disabled (BucketOwnerEnforced)
      },
    },
  };

  try {
    const r = await fetch(`${CC_API}/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobBody),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const msg = err.message || (err.errors && Object.values(err.errors).flat().join('; ')) || `CloudConvert error ${r.status}`;
      return res.status(r.status).json({ error: msg });
    }

    const data = await r.json();
    return res.status(200).json({ jobId: data.data.id, batchId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── GET: Poll job status ──────────────────────────────────────────────────────
async function checkJob(req, res, apiKey) {
  const { jobId, batchId, orgId } = req.query;
  if (!jobId)   return res.status(400).json({ error: 'jobId is required' });
  if (!batchId) return res.status(400).json({ error: 'batchId is required' });
  if (!orgId)   return res.status(400).json({ error: 'orgId is required' });

  try {
    const r = await fetch(`${CC_API}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || `CloudConvert error ${r.status}` });
    }

    const data = await r.json();
    const job  = data.data;

    if (job.status === 'error') {
      const errTask = (job.tasks || []).find(t => t.status === 'error');
      return res.status(200).json({ status: 'error', error: errTask?.message || 'Conversion failed' });
    }

    if (job.status !== 'finished') {
      return res.status(200).json({ status: 'processing' });
    }

    // Build CloudFront URLs from the export/s3 task result files
    const exportTask = (job.tasks || []).find(t => t.name === 'export-to-s3');
    const files      = exportTask?.result?.files || [];

    if (!files.length) {
      return res.status(200).json({ status: 'error', error: 'Conversion produced no output files' });
    }

    // Sort numerically so slides appear in deck order (LibreOffice outputs 0001.png, 0002.png …)
    files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' }));

    // CLOUDFRONT_URL is the env var used by upload-url.js (e.g. https://dXXX.cloudfront.net)
    const cfBase = (process.env.CLOUDFRONT_URL || '').replace(/\/$/, '');
    // encodeURIComponent the filename — LibreOffice preserves the original PPTX name
    // (e.g. "My Deck-0001.png") so spaces must be encoded for the URL to work.
    const urls   = files.map(f => `${cfBase}/pptx-imports/${orgId}/${batchId}/${encodeURIComponent(f.filename)}`);

    return res.status(200).json({ status: 'finished', urls, count: urls.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
