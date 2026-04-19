// Lightweight proxy for CORS-blocked services
//
// GET /api/proxy?type=rss&url=RSS_URL
//   → fetches RSS feed, returns { ok, headlines: string[] }
//
// GET /api/proxy?type=weather&location=LOCATION&units=imperial|metric
//   → proxies OpenWeatherMap current + 3-day forecast
//   → Required env var: OPENWEATHER_API_KEY
//
// GET /api/proxy?type=googlereviews&placeId=PLACE_ID&minRating=4&maxReviews=3&sort=newest|relevant
//   → proxies Google Places reviews for a Place ID
//   → Required env var: GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY
//
// POST /api/proxy?type=instagram
//   body: { accessToken, accountId?, maxPosts? }
//   → proxies Instagram API media for a professional account or Instagram Login token

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const { type } = req.query;
  if (req.method === 'POST' && type !== 'instagram') {
    return res.status(405).json({ error: 'POST is only supported for Instagram' });
  }

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

  // ── Google Reviews proxy ─────────────────────────────────────────────────
  if (type === 'googlereviews') {
    const { placeId, minRating = '1', maxReviews = '3', sort = 'newest' } = req.query;
    if (!placeId) return res.status(400).json({ error: 'placeId is required' });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Google Places service not configured' });

    const cleanPlaceId = String(placeId).trim().replace(/^places\//, '');
    if (!/^[A-Za-z0-9_-]+$/.test(cleanPlaceId)) {
      return res.status(400).json({ error: 'Invalid Place ID' });
    }

    const ratingFloor = Math.max(1, Math.min(5, parseInt(minRating, 10) || 1));
    const reviewLimit = Math.max(1, Math.min(5, parseInt(maxReviews, 10) || 3));
    const sortBy = sort === 'relevant' ? 'most_relevant' : 'newest';
    const endpoint = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(cleanPlaceId)}&fields=name,rating,user_ratings_total,reviews&reviews_sort=${sortBy}&key=${apiKey}`;

    try {
      const upstream = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok || data.status !== 'OK') {
        const message = data.error_message || data.status || `Places API error ${upstream.status}`;
        const status = data.status === 'NOT_FOUND' || data.status === 'INVALID_REQUEST' ? 422 : 502;
        return res.status(status).json({ error: message });
      }

      const result = data.result || {};
      const reviews = (result.reviews || [])
        .filter(r => (r.rating || 0) >= ratingFloor && (r.text || '').trim())
        .slice(0, reviewLimit)
        .map(r => ({
          author: r.author_name || 'Google user',
          rating: r.rating || 0,
          text: stripHtml(r.text || ''),
          relativeTime: r.relative_time_description || '',
          time: r.time || null,
          profilePhotoUrl: r.profile_photo_url || '',
          authorUrl: r.author_url || '',
        }));

      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');
      return res.status(200).json({
        ok: true,
        placeId: cleanPlaceId,
        placeName: result.name || '',
        rating: result.rating || null,
        totalRatings: result.user_ratings_total || null,
        sort: sortBy,
        reviews,
      });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  // ── Instagram proxy ──────────────────────────────────────────────────────
  if (type === 'instagram') {
    let body = {};
    try {
      body = req.method === 'POST' ? await readJsonBody(req) : req.query;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const accessToken = String(body.accessToken || '').trim();
    if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

    const accountId = String(body.accountId || '').trim();
    if (accountId && !/^\d+$/.test(accountId)) {
      return res.status(400).json({ error: 'Invalid Instagram account ID' });
    }

    const limit = Math.max(1, Math.min(12, parseInt(body.maxPosts, 10) || 6));
    const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';
    const graphHost = accountId ? 'https://graph.facebook.com' : 'https://graph.instagram.com';
    const pathId = accountId || 'me';
    const endpoint = new URL(`${graphHost}/${graphVersion}/${pathId}/media`);
    endpoint.searchParams.set('fields', [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'username',
      'children{media_type,media_url,thumbnail_url,permalink}',
    ].join(','));
    endpoint.searchParams.set('limit', String(limit));
    endpoint.searchParams.set('access_token', accessToken);

    try {
      const upstream = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok || data.error) {
        const message = data.error?.message || `Instagram API error ${upstream.status}`;
        const status = upstream.status === 400 ? 422 : 502;
        return res.status(status).json({ error: message });
      }

      const posts = (data.data || [])
        .map(normalizeInstagramPost)
        .filter(p => p.mediaUrl || p.videoUrl)
        .slice(0, limit);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        accountId: accountId || 'me',
        username: posts.find(p => p.username)?.username || '',
        posts,
      });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'type must be "rss", "weather", "googlereviews", or "instagram"' });
};

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};

  let raw = '';
  for await (const chunk of req) raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
  return raw ? JSON.parse(raw) : {};
}

function normalizeInstagramPost(item) {
  const children = Array.isArray(item?.children?.data) ? item.children.data : [];
  const child = children.find(c => c.media_url || c.thumbnail_url) || {};
  const rawType = item.media_type || child.media_type || 'IMAGE';
  const mediaType = rawType === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : rawType;
  const imageUrl = rawType === 'VIDEO'
    ? (item.thumbnail_url || child.thumbnail_url || item.media_url || child.media_url || '')
    : (item.media_url || item.thumbnail_url || child.media_url || child.thumbnail_url || '');

  return {
    id: item.id || '',
    caption: stripHtml(item.caption || ''),
    mediaType,
    mediaUrl: imageUrl,
    thumbnailUrl: item.thumbnail_url || child.thumbnail_url || '',
    videoUrl: rawType === 'VIDEO' ? (item.media_url || child.media_url || '') : '',
    permalink: item.permalink || child.permalink || '',
    timestamp: item.timestamp || '',
    username: item.username || '',
  };
}

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

function stripHtml(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
