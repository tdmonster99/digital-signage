// Lightweight proxy for CORS-blocked services
//
// GET /api/proxy?type=rss&url=RSS_URL
//   → fetches RSS feed, returns { ok, headlines: string[] }
//
// GET /api/proxy?type=weather&location=LOCATION&units=imperial|metric
//   → proxies OpenWeatherMap current + 3-day forecast
//   → Required env var: OPENWEATHER_API_KEY

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { type } = req.query;

  // ── RSS proxy ─────────────────────────────────────────────────────────────
  if (type === 'rss') {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url is required' });

    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
      const upstream = await fetch(url, {
        headers: { 'User-Agent': 'Zigns/1.0 RSS Reader (+https://zigns.io)' },
        signal:  AbortSignal.timeout(8000),
      });
      if (!upstream.ok) return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      const headlines = parseRss(await upstream.text());
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
      return res.status(200).json({ ok: true, headlines });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  // ── Weather proxy ─────────────────────────────────────────────────────────
  if (type === 'weather') {
    const { location, units = 'imperial' } = req.query;
    if (!location) return res.status(400).json({ error: 'location is required' });

    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey)  return res.status(500).json({ error: 'Weather service not configured' });

    const u          = units === 'metric' ? 'metric' : 'imperial';
    const normalized = location.replace(/^([^,]+),\s*([A-Z]{2})\s*$/, '$1,$2,US');
    const q          = encodeURIComponent(normalized);

    try {
      const [curRes, fcastRes] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/weather?q=${q}&units=${u}&appid=${apiKey}`),
        fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${q}&units=${u}&cnt=40&appid=${apiKey}`),
      ]);

      if (!curRes.ok) {
        const ttl = (curRes.status === 429 || curRes.status === 403) ? 900 : 300;
        res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=60`);
        const err = await curRes.json().catch(() => ({}));
        const clientStatus = curRes.status === 404 ? 422 : curRes.status;
        return res.status(clientStatus).json({ error: err.message || `Weather API error ${curRes.status}` });
      }

      const cur   = await curRes.json();
      const fcast = fcastRes.ok ? await fcastRes.json() : null;

      const days = [];
      if (fcast?.list) {
        const seen = new Set();
        for (const item of fcast.list) {
          const date = new Date(item.dt * 1000);
          const day  = date.toLocaleDateString('en-US', { weekday: 'short' });
          const h    = date.getHours();
          if (seen.has(day)) continue;
          if (h < 11 || h > 14) continue;
          seen.add(day);
          days.push({
            day,
            dt:   item.dt,
            high: Math.round(item.main.temp_max),
            low:  Math.round(item.main.temp_min),
            icon: item.weather[0].icon,
            desc: item.weather[0].description,
          });
          if (days.length >= 5) break;
        }
      }

      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=120');
      return res.status(200).json({
        ok: true,
        units: u,
        current: {
          temp:      Math.round(cur.main.temp),
          feelsLike: Math.round(cur.main.feels_like),
          humidity:  cur.main.humidity,
          desc:      cur.weather[0].description,
          icon:      cur.weather[0].icon,
          city:      cur.name,
          country:   cur.sys.country,
        },
        forecast: days,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'type must be "rss" or "weather"' });
};

function parseRss(xml) {
  const headlines = [];
  const re = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
  let m, first = true;
  while ((m = re.exec(xml)) !== null) {
    if (first) { first = false; continue; }
    const t = decodeEntities(m[1].trim());
    if (t) headlines.push(t);
    if (headlines.length >= 8) break;
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
