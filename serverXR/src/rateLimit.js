// Minimal fixed-window rate limiter — zero deps, same spirit as httpClient.js.
// Keyed by X-Forwarded-For, with req.ip as the direct-connection fallback.
// `trust proxy` is not enabled, so req.ip alone would put every real visitor
// in the proxy chain's single bucket.
//
// VPS topology: browser -> Caddy -> nginx (client container) -> this server —
// TWO trusted hops each append the true peer IP they saw. nginx's hop is
// LAST (always the same container IP, useless as a key); Caddy's hop is
// SECOND-TO-LAST and is the real client IP as seen directly by Caddy's TCP
// accept — not attacker-forgeable via a spoofed XFF header, unlike anything
// earlier in the list. Only trust the last two hops; if fewer than two
// proxies are in front of us, fall back to the last entry.
const clientKey = (req) => {
  const list = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.length >= 2) return list[list.length - 2]
  return list[list.length - 1] || req.ip || 'unknown'
}

// createRateLimiter({ windowMs, max, name }) -> Express middleware.
// Over-limit requests get 429 + Retry-After (seconds). Buckets are pruned on
// each sweep so an idle server holds no per-IP state.
// A limiter counts strangers. On `di up` there are none: the server binds
// loopback, auth is off, and the only address it can ever see is the person who
// started it. Counting them turns "put my library on my own machine" into "wait
// ten minutes" — 51 files against a 60-per-10-minutes cap written for a public
// address. Read per request rather than at boot so tests can toggle it, same as
// everywhere else DI_LOCAL is consulted.
const isLocalInstall = () => process.env.DI_LOCAL === '1'

function createRateLimiter({ windowMs = 60_000, max = 30, name = 'requests', keyFn = clientKey } = {}) {
  const buckets = new Map()
  let lastSweep = Date.now()

  return function rateLimit(req, res, next) {
    if (isLocalInstall()) return next()
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
