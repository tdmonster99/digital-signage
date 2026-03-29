// Vercel serverless function — sends invitation emails via Resend.
// Set RESEND_API_KEY in Vercel Dashboard → Project Settings → Environment Variables.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured.' });

  const { email, inviteId, inviterEmail, orgName, role } = req.body || {};
  if (!email || !inviteId) return res.status(400).json({ error: 'email and inviteId are required' });

  const inviteUrl  = `https://digital-signage-pi.vercel.app/admin.html?invite=${inviteId}`;
  const roleLabels = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
  const roleLabel  = roleLabels[role] || 'Editor';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:#111111;padding:28px 40px">
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Digital Signage</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111">You're invited!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6">
            <strong style="color:#111111">${escHtmlEmail(inviterEmail)}</strong> has invited you to join
            <strong style="color:#111111">${escHtmlEmail(orgName)}</strong> on Digital Signage
            as <strong style="color:#111111">${roleLabel}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
            <tr><td style="background:#111111;border-radius:8px;padding:14px 28px">
              <a href="${inviteUrl}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Accept Invitation →</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#888888">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;color:#888888;word-break:break-all;font-family:'Courier New',monospace">${inviteUrl}</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid #eeeeee">
          <p style="margin:0;font-size:12px;color:#aaaaaa">
            If you weren't expecting this invitation, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  function escHtmlEmail(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  try {
    const upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Digital Signage <onboarding@resend.dev>',
        to:      [email],
        subject: `${inviterEmail} invited you to ${orgName}`,
        html,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.message || `Email error ${upstream.status}` });
    }
    return res.status(200).json({ ok: true });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
