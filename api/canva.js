// Canva Connect API — all Canva integration routes in one function
//
// GET  /api/canva?uid=UID&init=1               → redirect popup to Canva OAuth
// GET  /api/canva?code=CODE&state=UID          → OAuth callback → postMessage tokens to opener
// GET  /api/canva?action=designs&accessToken=T → list user's designs
// POST /api/canva  { action:'export', accessToken, designId, orgId } → export PNG → S3 → CF URL
//
// Required env vars: CANVA_CLIENT_ID, CANVA_CLIENT_SECRET
//   (shared) AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET, CLOUDFRONT_URL

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const CANVA_AUTH_URL  = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_API       = 'https://api.canva.com/rest/v1';
const SCOPE           = 'design:content:read';

function getRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}/api/canva`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const clientId     = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;

  if (req.method === 'GET') {
    const { action, uid, code, state, init, accessToken, continuation } = req.query;

    // ── OAuth initiation ───────────────────────────────────────────────────
    if (init === '1') {
      if (!clientId || !clientSecret) {
        return res.status(500).send('<p style="font-family:sans-serif;padding:40px">Canva integration not configured — add CANVA_CLIENT_ID and CANVA_CLIENT_SECRET to Vercel env vars.</p>');
      }
      if (!uid) return res.status(400).send('uid required');
      const params = new URLSearchParams({
        response_type: 'code',
        client_id:     clientId,
        redirect_uri:  getRedirectUri(req),
        scope:         SCOPE,
        state:         uid,
      });
      return res.redirect(302, `${CANVA_AUTH_URL}?${params}`);
    }

    // ── OAuth callback ─────────────────────────────────────────────────────
    if (code && state) {
      if (!clientId || !clientSecret) {
        return res.status(500).send('<p style="font-family:sans-serif;padding:40px">Canva integration not configured.</p>');
      }
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      let tokens;
      try {
        const r = await fetch(CANVA_TOKEN_URL, {
          method:  'POST',
          headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: getRedirectUri(req) }),
        });
        if (!r.ok) {
          const text = await r.text();
          return res.status(r.status).send(`<p style="font-family:sans-serif;padding:40px">Token exchange failed: ${text}</p>`);
        }
        tokens = await r.json();
      } catch (e) {
        return res.status(500).send(`<p style="font-family:sans-serif;padding:40px">Error: ${e.message}</p>`);
      }

      const payload = JSON.stringify({
        type:         'canva-auth-success',
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt:    Date.now() + (tokens.expires_in || 3600) * 1000,
      });
      return res.status(200).send(`<!DOCTYPE html><html><head><title>Canva Connected</title></head><body>
<script>
(function(){
  try { if (window.opener) window.opener.postMessage(${payload}, '*'); } catch(e) {}
  window.close();
})();
</script>
<p style="font-family:sans-serif;text-align:center;padding:60px;color:#555">
  Connected to Canva! You can close this window.
</p>
</body></html>`);
    }

    // ── List designs ───────────────────────────────────────────────────────
    if (action === 'designs') {
      if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
      const params = new URLSearchParams({ ownership: 'owned', limit: '50' });
      if (continuation) params.set('continuation', continuation);
      try {
        const r = await fetch(`${CANVA_API}/designs?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (r.status === 401) return res.status(401).json({ error: 'Canva token expired — please reconnect' });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          return res.status(r.status).json({ error: err.message || `Canva API error ${r.status}` });
        }
        const data    = await r.json();
        const designs = (data.items || []).map(d => ({
          id:        d.id,
          title:     d.title || 'Untitled',
          thumbnail: d.thumbnail?.url || null,
          updatedAt: d.updated_at || null,
        }));
        return res.status(200).json({ designs, continuation: data.continuation || null });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'POST') {
    const { action, accessToken, designId, orgId } = req.body || {};
    if (action !== 'export') return res.status(400).json({ error: 'action must be "export"' });
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });
    if (!designId)    return res.status(400).json({ error: 'designId required' });
    if (!orgId)       return res.status(400).json({ error: 'orgId required' });

    const bucket          = process.env.AWS_S3_BUCKET;
    const region          = process.env.AWS_REGION || 'us-east-2';
    const accessKeyId     = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const cfBase          = (process.env.CLOUDFRONT_URL || '').replace(/\/$/, '');
    if (!bucket || !accessKeyId || !secretAccessKey || !cfBase) {
      return res.status(500).json({ error: 'S3/CloudFront env vars not configured' });
    }

    // ── Create export job ──────────────────────────────────────────────────
    let jobId;
    try {
      const r = await fetch(`${CANVA_API}/exports`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ design_id: designId, format: { type: 'png', export_quality: 'regular', pages: [1] } }),
      });
      if (r.status === 401) return res.status(401).json({ error: 'Canva token expired — please reconnect' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.message || `Canva export error ${r.status}` });
      }
      const data = await r.json();
      jobId = data.job?.id || data.id;
      if (!jobId) return res.status(500).json({ error: 'No export job ID from Canva' });
    } catch (e) {
      return res.status(500).json({ error: `Export create failed: ${e.message}` });
    }

    // ── Poll until done (max 7s) ───────────────────────────────────────────
    let exportUrls = [];
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const r = await fetch(`${CANVA_API}/exports/${encodeURIComponent(jobId)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok) continue;
        const data = await r.json();
        const job  = data.job || data;
        if (job.status === 'failed') return res.status(500).json({ error: 'Canva export failed' });
        if (job.status === 'success' && job.urls?.length) { exportUrls = job.urls; break; }
      } catch (_) { /* keep polling */ }
    }
    if (!exportUrls.length) return res.status(504).json({ error: 'Canva export timed out — please try again' });

    // ── Download PNG from Canva ────────────────────────────────────────────
    let imageBuffer;
    try {
      const r  = await fetch(exportUrls[0]);
      if (!r.ok) return res.status(500).json({ error: `Failed to download PNG (${r.status})` });
      imageBuffer = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      return res.status(500).json({ error: `Download failed: ${e.message}` });
    }

    // ── Upload to S3 ───────────────────────────────────────────────────────
    const { randomUUID } = await import('crypto');
    const key = `canva-imports/${orgId}/${randomUUID()}.png`;
    try {
      const s3 = new S3Client({
        region, credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
        requestChecksumCalculation:  'WHEN_REQUIRED',
        responseChecksumValidation:  'WHEN_REQUIRED',
      });
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: imageBuffer, ContentType: 'image/png' }));
    } catch (e) {
      return res.status(500).json({ error: `S3 upload failed: ${e.message}` });
    }

    return res.status(200).json({ url: `${cfBase}/${key}` });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
