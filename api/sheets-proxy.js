// Vercel serverless function — proxies Google Sheets API to avoid CORS and hide the key.
// Required env var: GOOGLE_SHEETS_API_KEY
// The sheet must be publicly readable ("Anyone with link can view").
// GET /api/sheets-proxy?sheetId=ABC123&range=Sheet1!A1:D10

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { sheetId, range } = req.query;
  if (!sheetId) return res.status(400).json({ error: 'sheetId is required' });
  if (!range)   return res.status(400).json({ error: 'range is required' });

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey)  return res.status(500).json({ error: 'Google Sheets API not configured — add GOOGLE_SHEETS_API_KEY to Vercel env vars' });

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const r = await fetch(url);

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const msg = err.error?.message || `Sheets API error ${r.status}`;
      return res.status(r.status).json({ error: msg });
    }

    const data = await r.json();
    // Cache: short TTL so live data stays fresh, SWR serves from cache while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ ok: true, values: data.values || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
