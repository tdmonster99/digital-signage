// Vercel serverless function — proxies OpenWeatherMap to avoid CORS and hide the API key.
// Required env var: OPENWEATHER_API_KEY (free tier at openweathermap.org)
// GET /api/weather?location=Chicago,IL&units=imperial

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { location, units = 'imperial' } = req.query;
  if (!location) return res.status(400).json({ error: 'location is required' });

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey)  return res.status(500).json({ error: 'Weather service not configured' });

  const u = units === 'metric' ? 'metric' : 'imperial';
  // Normalize common "City, ST" US formats → "City,ST,US" so OWM can resolve them.
  // OWM accepts city / city,country / city,state,country but NOT "City, ST" (space + no country).
  const normalized = location.replace(/^([^,]+),\s*([A-Z]{2})\s*$/, '$1,$2,US');
  const q = encodeURIComponent(normalized);

  try {
    const [curRes, fcastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${q}&units=${u}&appid=${apiKey}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${q}&units=${u}&cnt=40&appid=${apiKey}`),
    ]);

    if (!curRes.ok) {
      // Cache error responses at the CDN too — otherwise every display call during a
      // rate-limit block still hits OpenWeather, which keeps extending the block.
      // 429/403 = account blocked → cache 15 min; other errors → cache 5 min.
      const ttl = (curRes.status === 429 || curRes.status === 403) ? 900 : 300;
      res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=60`);
      const err = await curRes.json().catch(() => ({}));
      // Map OWM's 404 ("city not found") to 422 so our API doesn't return a
      // misleading 404 that looks like the endpoint itself is missing.
      const clientStatus = curRes.status === 404 ? 422 : curRes.status;
      return res.status(clientStatus).json({ error: err.message || `Weather API error ${curRes.status}` });
    }

    const cur   = await curRes.json();
    const fcast = fcastRes.ok ? await fcastRes.json() : null;

    // Build 3-day forecast: pick the entry closest to noon for each future day
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
};
