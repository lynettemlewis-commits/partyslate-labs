// Vercel Serverless Function: fetches a partyslate.com URL server-side and
// hands the response back to the browser.
//
// This exists so the Signature Banner Builder (banner-builder.html) doesn't
// have to depend on free, third-party public CORS-proxy services to read
// PartySlate's own public profile pages/photos. Those services are outside
// PartySlate's control and can go down, rate-limit, or get shut off entirely
// without notice — this endpoint runs on PartySlate's own Vercel project, so
// it's part of the same deployment as the page that calls it. That also means
// the browser request is same-origin, which sidesteps CORS entirely — no
// special headers needed here for the browser to be able to read the result.
//
// IMPORTANT: this must never become an open proxy for arbitrary URLs. It only
// ever fetches from partyslate.com (and its subdomains).

const ALLOWED_HOST_RE = /(^|\.)partyslate\.com$/i;
const UPSTREAM_TIMEOUT_MS = 15000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const target = req.query && req.query.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'missing_url' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    res.status(400).json({ error: 'invalid_url' });
    return;
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOST_RE.test(parsed.hostname)) {
    res.status(403).json({ error: 'host_not_allowed', message: 'This endpoint only fetches partyslate.com URLs.' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'PartySlateBannerBuilder/1.0 (+https://partyslate.com)' },
    });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'upstream_fetch_failed', message: String((e && e.message) || e) });
  } finally {
    clearTimeout(timer);
  }
};
