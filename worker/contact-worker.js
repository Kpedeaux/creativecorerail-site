/**
 * CoreRail contact form handler — Cloudflare Worker
 *
 * Route:  POST /api/contact
 * Method: JSON body from contact.html
 * Email:  delivered via Resend (https://resend.com) — set RESEND_API_KEY as a Worker secret
 *
 * To deploy:
 *   1. wrangler login
 *   2. wrangler deploy
 *   3. Set the route in Cloudflare dashboard: creativecorerail.com/api/contact → this worker
 *   4. wrangler secret put RESEND_API_KEY
 *      (Get the key from https://resend.com after verifying your sending domain)
 *   5. Set environment vars in wrangler.toml: TO_EMAIL, FROM_EMAIL
 *
 * See wrangler.toml in this directory.
 */

const ALLOWED_ORIGINS = [
  'https://creativecorerail.com',
  'https://www.creativecorerail.com',
];

// In-memory rate limit (Workers are stateless across invocations, but Durable Objects
// or a KV-backed limiter is overkill for a contact form. The honeypot + length checks
// catch most bots. If spam becomes an issue, swap to Turnstile.)

const MAX_FIELD_LEN = 5000;
const MIN_MESSAGE_LEN = 10;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight (same-origin posts skip this, but be defensive)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname !== '/api/contact') {
      return json({ error: 'Not found' }, 404, request);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, request);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, request);
    }

    // Honeypot: real users can't see the "website" field.
    if (body.website) {
      return json({ ok: true }, 200, request); // silently accept
    }

    // Required field validation
    const name = sanitize(body.name);
    const email = sanitize(body.email);
    const message = sanitize(body.message);
    if (!name || !email || !message) {
      return json({ error: 'Missing required fields' }, 400, request);
    }
    if (message.length < MIN_MESSAGE_LEN) {
      return json({ error: 'Message too short' }, 400, request);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Invalid email' }, 400, request);
    }

    const company = sanitize(body.company);
    const role = sanitize(body.role);
    const operationType = sanitize(body.operation_type);
    const howHeard = sanitize(body.how_heard);
    const submittedAt = sanitize(body.submitted_at) || new Date().toISOString();
    const cfMeta = request.cf || {};

    const subject = `CoreRail inquiry — ${name}${company ? ' (' + company + ')' : ''}`;
    const text = [
      `New contact form submission`,
      ``,
      `Name:        ${name}`,
      `Email:       ${email}`,
      `Company:     ${company || '—'}`,
      `Role:        ${role || '—'}`,
      `Op type:     ${operationType || '—'}`,
      `Heard via:   ${howHeard || '—'}`,
      ``,
      `Message:`,
      message,
      ``,
      `---`,
      `Submitted:   ${submittedAt}`,
      `Country:     ${cfMeta.country || '—'}`,
      `City:        ${cfMeta.city || '—'}`,
      `UA:          ${request.headers.get('user-agent') || '—'}`,
    ].join('\n');

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1F2220;">
  <h2 style="font-family:Georgia,serif;margin:0 0 12px;">CoreRail inquiry</h2>
  <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
    <tr><td style="color:#6B7F5E;width:120px;">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
    <tr><td style="color:#6B7F5E;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="color:#6B7F5E;">Company</td><td>${escapeHtml(company) || '—'}</td></tr>
    <tr><td style="color:#6B7F5E;">Role</td><td>${escapeHtml(role) || '—'}</td></tr>
    <tr><td style="color:#6B7F5E;">Op type</td><td>${escapeHtml(operationType) || '—'}</td></tr>
    <tr><td style="color:#6B7F5E;">Heard via</td><td>${escapeHtml(howHeard) || '—'}</td></tr>
  </table>
  <h3 style="font-family:Georgia,serif;margin:24px 0 8px;">Message</h3>
  <div style="white-space:pre-wrap;border-left:3px solid #6B7F5E;padding-left:16px;color:#3D4038;">${escapeHtml(message)}</div>
  <hr style="border:none;border-top:1px solid #E0DDD6;margin:24px 0;">
  <p style="font-size:12px;color:#6B6F66;">
    Submitted ${escapeHtml(submittedAt)}<br>
    From ${escapeHtml(cfMeta.city || '—')}, ${escapeHtml(cfMeta.country || '—')}
  </p>
</div>`.trim();

    // Send via Resend
    if (!env.RESEND_API_KEY) {
      return json({ error: 'Server misconfigured (no RESEND_API_KEY)' }, 500, request);
    }

    const toEmail = env.TO_EMAIL || 'pedeaux@gmail.com';
    const fromEmail = env.FROM_EMAIL || 'CoreRail Site <noreply@creativecorerail.com>';

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          reply_to: email,
          subject: subject,
          text: text,
          html: html,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.error('Resend error', resp.status, err);
        return json({ error: 'Email delivery failed' }, 502, request);
      }
    } catch (err) {
      console.error('Fetch error', err);
      return json({ error: 'Email delivery failed' }, 502, request);
    }

    return json({ ok: true }, 200, request);
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

function sanitize(v) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, MAX_FIELD_LEN);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}
