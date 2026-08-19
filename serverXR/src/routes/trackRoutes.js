// Anonymous, aggregate-only usage counts — deliberately NOT an analytics
// suite. Each row is "this happened, on this path, at this time" and nothing
// else: no IP, no user agent, no cookie, no session/user id, no cross-request
// identity of any kind. The privacy inventory (docs/ai/privacy-data-inventory.md)
// is the contract; keep any future column additions inside it.
const { getDb } = require('../db')

const EVENT_TYPES = new Set(['view', 'signup', 'guest_created'])
const MAX_PATH_LENGTH = 512
const STATS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

// Pathname only — the query string and hash are stripped server-side even
// though the client already sends a bare pathname, so a hand-rolled POST
// can't smuggle tokens/search terms into the table.
const toPathname = (value) => {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value, 'http://internal').pathname.slice(0, MAX_PATH_LENGTH)
  } catch {
    return null
  }
}

// Hostname only, never the full URL — and same-origin referrers store as
// null (internal navigation is not a referral).
const toReferrerHost = (value, ownHost) => {
  if (typeof value !== 'string' || !value) return null
  try {
    const host = new URL(value).hostname
    if (!host || (ownHost && host === ownHost)) return null
    return host.slice(0, MAX_PATH_LENGTH)
  } catch {
    return null
  }
}

function registerTrackRoutes(router, {
  trackLimiter,
  requireAdminAlways
}) {
  // Anonymous by necessity: a visitor's first page view happens before any
  // session exists, so this must be registered before the /api auth gates
  // (same as open-call submissions). The rate limiter is the only guard —
  // its per-IP key lives in memory and is never written anywhere.
  router.post('/api/track', trackLimiter, (req, res, next) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      if (!EVENT_TYPES.has(body.eventType)) {
        return res.status(400).json({ error: 'Unknown event type.' })
      }
      // The Referer header on a same-origin beacon is always our own page
      // URL, so the external referrer (reddit.com etc.) only exists as the
      // client-read document.referrer; the header is just a fallback.
      const ownHost = String(req.headers.host || '').split(':')[0]
      const referrerHost = toReferrerHost(body.referrer, ownHost)
        || toReferrerHost(req.headers.referer, ownHost)
      getDb().prepare(
        'INSERT INTO page_events (event_type, path, referrer_host, created_at) VALUES (?, ?, ?, ?)'
      ).run(body.eventType, toPathname(body.path), referrerHost, Date.now())
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/stats', requireAdminAlways, (req, res, next) => {
    try {
      const db = getDb()
      const since = Date.now() - STATS_WINDOW_MS
      const totals = {}
      for (const row of db.prepare(
        'SELECT event_type, COUNT(*) AS count FROM page_events WHERE created_at >= ? GROUP BY event_type'
      ).all(since)) {
        totals[row.event_type] = row.count
      }
      const byDay = db.prepare(
        "SELECT date(created_at / 1000, 'unixepoch') AS day, event_type, COUNT(*) AS count " +
        'FROM page_events WHERE created_at >= ? GROUP BY day, event_type ORDER BY day'
      ).all(since)
      const topPaths = db.prepare(
        "SELECT path, COUNT(*) AS count FROM page_events " +
        "WHERE created_at >= ? AND event_type = 'view' AND path IS NOT NULL " +
        'GROUP BY path ORDER BY count DESC, path LIMIT 10'
      ).all(since)
      const topReferrers = db.prepare(
        "SELECT referrer_host, COUNT(*) AS count FROM page_events " +
        "WHERE created_at >= ? AND event_type = 'view' AND referrer_host IS NOT NULL " +
        'GROUP BY referrer_host ORDER BY count DESC, referrer_host LIMIT 10'
      ).all(since)
      res.json({ since, windowDays: 30, totals, byDay, topPaths, topReferrers })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = {
  registerTrackRoutes
}
