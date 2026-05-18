// Public client configuration for the GIPHY browser in the designer.
// GIPHY media/search calls are made directly from the browser, per GIPHY's API guidance.

const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GIPHY_API_KEY || process.env.GIPHY_WEB_API_KEY || readLocalGiphyKey();
  return res.status(200).json({
    configured: Boolean(apiKey),
    apiKey,
  });
};

function readLocalGiphyKey() {
  if (process.env.NODE_ENV === 'production') return '';
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const env = fs.readFileSync(envPath, 'utf8');
    const parsed = {};
    env.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*(GIPHY_API_KEY|GIPHY_WEB_API_KEY)\s*=\s*(.*)\s*$/);
      if (!match) return;
      parsed[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    });
    return parsed.GIPHY_API_KEY || parsed.GIPHY_WEB_API_KEY || '';
  } catch (_) {
    return '';
  }
}
