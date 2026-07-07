// Minimal fixed-window rate limiter — zero deps, same spirit as httpClient.js.
// Keyed by first-hop X-Forwarded-For (cPanel/nginx sits in front of this app and
// `trust proxy` is not enabled, so req.ip alone would put every real visitor in
// the proxy's single bucket) with req.ip as the direct-connection fallback.

const clientKey = (req) =>
  (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.ip || 'unknown'

// createRateLimiter({ windowMs, max, name }) -> Express middleware.
// Over-limit requests get 429 + Retry-After (seconds). Buckets are pruned on
// each sweep so an idle server holds no per-IP state.
function createRateLimiter({ windowMs = 60_000, max = 30, name = 'requests', keyFn = clientKey } = {}) {
  const buckets = new Map()
  let lastSweep = Date.now()

  return function rateLimit(req, res, next) {
    const now = Date.now()

    if (now - lastSweep > windowMs) {
      lastSweep = now
      for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) buckets.delete(key)
      }
    }

    const key = keyFn(req)
    let bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        error: `Too many ${name} from this address — retry in ${retryAfterSeconds}s.`
      })
    }
    next()
  }
}

module.exports = { createRateLimiter, clientKey }
