# CoreRail Contact Worker

A Cloudflare Worker that handles `POST /api/contact` from the contact form on creativecorerail.com.
Validates input, applies a honeypot anti-spam check, and delivers email via Resend.

## Why Resend (and not MailChannels)

Cloudflare deprecated the free MailChannels integration for new Workers accounts in 2024. Resend is now the standard transactional-email path for Workers, with 3,000 free emails/month — more than enough for a contact form. (You can swap in Postmark or SendGrid with minimal changes to `contact-worker.js`.)

## One-time setup

1. **Install Wrangler** (Cloudflare's CLI) if you don't have it:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create a Resend account** at https://resend.com, then:
   - Add `creativecorerail.com` as a sending domain
   - Add the DNS records Resend gives you (TXT, MX-style) in Cloudflare DNS
   - Wait for verification (usually under 5 minutes)
   - Create an API key in Resend → API Keys → Create

3. **Deploy the Worker:**
   ```bash
   cd worker
   wrangler deploy
   ```

4. **Add the API key as a Worker secret:**
   ```bash
   wrangler secret put RESEND_API_KEY
   # paste the key when prompted
   ```

5. **Verify the route** is set in the Cloudflare dashboard under Workers & Pages → corerail-contact → Triggers. It should match `creativecorerail.com/api/contact`. The `wrangler deploy` should have configured this automatically from `wrangler.toml`, but double-check.

6. **Test it.** Submit the form on the live site (or use `curl`):
   ```bash
   curl -X POST https://creativecorerail.com/api/contact \
     -H 'Content-Type: application/json' \
     -d '{"name":"Test","email":"you@example.com","message":"Testing the worker — please ignore."}'
   ```
   You should receive a formatted email at `kevin@creativecorerail.com`.

## Environment configuration

In `wrangler.toml`:
- `TO_EMAIL` — where form submissions go (default: `kevin@creativecorerail.com`)
- `FROM_EMAIL` — the sender envelope (default: `CoreRail Site <noreply@creativecorerail.com>`)

Secrets (via `wrangler secret put NAME`):
- `RESEND_API_KEY` — **required**

## Local development

```bash
wrangler dev
```

That spins up a local Worker at `http://localhost:8787`. Note that emails won't actually send unless you also set `RESEND_API_KEY` locally — easiest is to use a `.dev.vars` file (gitignored):

```
# .dev.vars
RESEND_API_KEY = "re_your_test_key_here"
```

## Cost expectations

- **Worker invocations:** Cloudflare's free tier covers 100,000 requests/day. A contact form does single digits per day. Effectively free.
- **Resend:** 3,000 emails/month free, then $20/mo for 50k. Not a concern at this volume.

## Spam mitigation

The form ships with:
- Honeypot field (`website`, hidden from humans)
- Min-length check on message body
- Email format validation

If spam becomes an issue, swap in **Cloudflare Turnstile** (free, invisible captcha — drop a `<div class="cf-turnstile" data-sitekey="...">` into `contact.html` and verify the token in the Worker).

## Where to find things in the dashboard

- **Workers & Pages → corerail-contact** — status, logs (tail in real-time)
- **Workers & Pages → corerail-contact → Settings → Variables** — view `TO_EMAIL`, `FROM_EMAIL`, and confirm `RESEND_API_KEY` exists as a secret
- **Cloudflare DNS** — Resend verification records
- **Resend dashboard** — delivery logs, bounce/spam tracking
