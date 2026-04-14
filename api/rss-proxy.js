// Vercel serverless function — fetches an RSS feed server-side (avoids CORS),
// parses <title> items, and returns a JSON array of headline strings.
// GET /api/rss-proxy?url=https://feeds.bbci.co.uk/news/rss.xml

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Validate URL
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Zigns/1.0 RSS Reader (+https://zigns.io)' },
      signal:  AbortSignal.timeout(8000),
    });
    if (!upstream.ok) return res.status(502).json({ error: `Upstream returned ${upstream.status}` });

    const xml       = await upstream.text();
    const headlines = parseRss(xml);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({ ok: true, headlines });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};

function parseRss(xml) {
  const headlines = [];
  // Match both plain and CDATA-wrapped <title> tags
  const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
  let m;
  let first = true;
  while ((m = re.exec(xml)) !== null) {
    if (first) { first = false; continue; } // skip the channel/feed <title>
    const t = decodeEntities(m[1].trim());
    if (t) headlines.push(t);
    if (headlines.length >= 20) break;
  }
  return headlines;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
