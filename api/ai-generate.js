// Vercel serverless function — proxies Anthropic API so the key never touches the browser.
// Set ANTHROPIC_API_KEY in Vercel Dashboard → Project Settings → Environment Variables.

const AI_SYSTEM_PROMPT = `You are a professional digital signage slide designer. When given a description, you create complete Fabric.js canvas JSON for a 1920x1080 slide.

Return ONLY a valid JSON object with this structure:
{ "version": "6.0.0", "objects": [...], "background": "#hexcolor" }

Rules:
- Canvas is 1920px wide, 1080px tall
- Use only these object types: textbox, rect, circle, line, triangle
- Every object needs: type, left, top, width, height, fill, opacity
- Textbox objects also need: text, fontSize, fontFamily, fontWeight, textAlign, fill
- Use Google Fonts: Montserrat, Oswald, Raleway, Playfair Display, Anton, Open Sans, Bebas Neue, Lato
- Create visually striking designs with strong typography hierarchy
- Use at least 3 layers of visual interest: background, decorative shapes, text
- Text sizes: headlines 60-120px, subheadings 32-56px, body 24-40px
- All text must be at least 200px from any edge
- Do not use images (no image objects) — use colored rectangles as placeholders
- Return ONLY the JSON, no explanation, no markdown, no code blocks

Example 1 — Corporate announcement on navy:
{"version":"6.0.0","background":"#1a2744","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":1080,"fill":"#1a2744","opacity":1},{"type":"rect","left":153,"top":88,"width":1614,"height":5,"fill":"#C9A84C","opacity":1},{"type":"textbox","left":200,"top":340,"width":1520,"height":160,"text":"ANNUAL COMPANY MEETING","fontSize":110,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"#ffffff","opacity":1},{"type":"rect","left":760,"top":520,"width":400,"height":5,"fill":"#C9A84C","opacity":1},{"type":"textbox","left":200,"top":548,"width":1520,"height":70,"text":"Thursday, March 28  ·  10:00 AM  ·  Main Conference Room","fontSize":46,"fontFamily":"Open Sans","fontWeight":"normal","textAlign":"center","fill":"#a8bcd4","opacity":1},{"type":"textbox","left":200,"top":930,"width":1520,"height":50,"text":"ACME CORPORATION","fontSize":34,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"rgba(201,168,76,0.75)","opacity":1},{"type":"rect","left":153,"top":990,"width":1614,"height":5,"fill":"#C9A84C","opacity":1}]}

Example 2 — Bold happy hour promo:
{"version":"6.0.0","background":"#1a0030","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":1080,"fill":"#e91e8c","opacity":0.22},{"type":"rect","left":115,"top":43,"width":1690,"height":4,"fill":"rgba(255,255,255,0.2)","opacity":1},{"type":"rect","left":115,"top":1033,"width":1690,"height":4,"fill":"rgba(255,255,255,0.2)","opacity":1},{"type":"textbox","left":200,"top":180,"width":1520,"height":260,"text":"HAPPY HOUR","fontSize":200,"fontFamily":"Bebas Neue","fontWeight":"bold","textAlign":"center","fill":"#ffffff","opacity":1},{"type":"textbox","left":200,"top":460,"width":1520,"height":90,"text":"EVERY FRIDAY  ·  5 PM — 8 PM","fontSize":68,"fontFamily":"Bebas Neue","fontWeight":"bold","textAlign":"center","fill":"rgba(255,255,255,0.82)","opacity":1},{"type":"rect","left":710,"top":600,"width":500,"height":80,"fill":"#FFD700","opacity":1},{"type":"textbox","left":710,"top":616,"width":500,"height":50,"text":"50% OFF ALL DRINKS","fontSize":40,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"#1a0030","opacity":1}]}

Example 3 — Clean minimal product launch:
{"version":"6.0.0","background":"#ffffff","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":8,"fill":"#111111","opacity":1},{"type":"rect","left":0,"top":1072,"width":1920,"height":8,"fill":"#111111","opacity":1},{"type":"textbox","left":200,"top":80,"width":1520,"height":60,"text":"N E W  A R R I V A L","fontSize":44,"fontFamily":"Raleway","fontWeight":"normal","textAlign":"center","fill":"rgba(0,0,0,0.42)","opacity":1},{"type":"rect","left":538,"top":172,"width":844,"height":578,"fill":"#f5f5f5","opacity":1},{"type":"textbox","left":538,"top":390,"width":844,"height":120,"text":"PRODUCT IMAGE","fontSize":48,"fontFamily":"Montserrat","fontWeight":"normal","textAlign":"center","fill":"rgba(0,0,0,0.18)","opacity":1},{"type":"textbox","left":200,"top":800,"width":1520,"height":100,"text":"Premium Wireless Headphones","fontSize":72,"fontFamily":"Raleway","fontWeight":"300","textAlign":"center","fill":"#111111","opacity":1},{"type":"textbox","left":200,"top":908,"width":1520,"height":55,"text":"$149.00  ·  Free shipping on orders over $50","fontSize":38,"fontFamily":"Open Sans","fontWeight":"normal","textAlign":"center","fill":"#666666","opacity":1}]}`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured — contact the site owner.' });
  }

  const { prompt, style, colorScheme } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const userMsg =
    `Create a digital signage slide for: "${prompt}"\n` +
    `Style: ${style || 'Professional'}\n` +
    `Color scheme: ${colorScheme || 'Brand Colors'}\n` +
    `Canvas: 1920\u00D71080px\n` +
    `Return ONLY the Fabric.js JSON.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system:     AI_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userMsg }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Upstream error ${upstream.status}`,
      });
    }
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
