// What a terminal login may reach — the request half. The storage half is
// cliLoginStore.js; the routes that make and end one are routes/cliLoginRoutes.js;
// the method is docs/architecture/CLI_LOGIN.md.
//
// A request carrying `Authorization: Bearer dii_cli_<id>.<secret>` resolves to
// the person's own session-equivalent auth state (index.js), marked
// `actor: 'di.cli'`, and capped like a di.bo member (role no higher than editor,
// no unrestricted reach). That is the whole grant. This gate adds what a key
// that lives in a file on a laptop must never do, even when the person
// themselves could do it in their own browser:
//
//   1. Everything a di.bo act token is refused (actTokenGate.js,
//      REFUSED_THROUGH_DI_BO): accounts, sign-in, keys, integrations, DMs,
//      approvals, invite redeem, ownership. A borrowed key never mints another
//      key. The two routes under /api/auth that a login needs for ITSELF are
//      the only exception (OWN_ROUTES).
//   2. Every route the CATALOGUE marks `reach: 'public'` (serverXR/src/catalogue):
//      opening a space, minting an invite, sharing, deleting a project or a
//      space, changing a space's settings. docs/architecture/SPEC_agent_door.md
//      §6: "never public. There is no flag that lifts this for a key." And any
//      /api route the catalogue does not describe, because a rule cannot be
//      applied to a route nobody classified.
//   3. The platform's settings (REFUSED_BELOW_ROOT), as for a di.bo member.
//   4. An unknown, expired or revoked token answers 401 and never falls back to
//      a guest — a terminal that thinks it is signed in must hear that it is not.
//   5. The response can never carry a session cookie: a login in a file must not
//      turn into a 12-hour browser session by way of a route that re-issues the
//      caller's cookie (creating a space does, for a person).
//   6. Every write is logged once, when the response finishes: subject, token
//      id (never the token), method, path, status.
//
// 1-3 are judged BEFORE the token is looked at, so a probe with a dead token
// learns nothing about which routes a live one could reach.

const { refusalFor, tierRefusalFor, holdBackSessionCookie, WRITE_METHODS } = require('./actTokenGate')
const { matchEntries } = require('./catalogue/match')
const { TOKEN_PREFIX } = require('./cliLoginStore')

// The two routes a terminal login may call under /api/auth: ask who it is, and
// end itself. Each affects only the token that is calling.
const OWN_ROUTES = Object.freeze([
  { method: 'GET', test: /^\/api\/auth\/cli\/whoami\/?$/i },
  { method: 'DELETE', test: /^\/api\/auth\/cli\/token\/?$/i }
])

const isOwnRoute = (method, path) => {
  const verb = String(method || '').toUpperCase()
  return OWN_ROUTES.some((route) => route.method === verb && route.test.test(String(path || '')))
}

// "Reach: public" is the catalogue's word for a move that opens a door
// (sdk/reach.js). Several entries can match one path; any one being public is
// enough to refuse, because the guard cannot know which handler Express runs.
const reachRefusalFor = (method, path) => {
  const where = String(path || '')
  const entries = matchEntries(method, where)
  const open = entries.find((entry) => entry.reach === 'public')
  if (open) {
    return {
      rule: `${open.route} (reach: public)`,
      reason: 'This opens a door — a new audience could see, edit or reach something, or it deletes — and a terminal login never does that. Do it in the browser, signed in as yourself.'
    }
  }
  if (!entries.length && /^\/api(?:\/|$)/i.test(where)) {
    return {
      rule: 'an /api route the catalogue does not describe',
      reason: 'A terminal login reaches only routes the server has described and classified (serverXR/src/catalogue); this one is not among them.'
    }
  }
  return null
}

// readToken(req)           -> the bearer, or null
// resolveState(req, token) -> the auth state the token stands for, or null
const createCliTokenGate = ({ readToken, resolveState, cookieName, logger }) => (req, res, next) => {
  const token = readToken(req)
  if (!token || !String(token).startsWith(TOKEN_PREFIX)) return next()

  if (!isOwnRoute(req.method, req.path)) {
    const refusal = refusalFor(req.method, req.path, req.body) || reachRefusalFor(req.method, req.path)
    if (refusal) {
      logger.info(`[cli-token] refused ${JSON.stringify({ method: req.method, path: req.path, rule: refusal.rule })}`)
      return res.status(403).json({ error: 'not_through_cli', rule: refusal.rule, reason: refusal.reason })
    }
  }

  const state = resolveState(req, token)
  if (!state) {
    return res.status(401).json({
      error: 'cli_token_invalid',
      reason: 'This terminal login is unknown, expired or ended. Run `di login` again.'
    })
  }

  if (!isOwnRoute(req.method, req.path)) {
    const tierRefusal = tierRefusalFor('member', req.method, req.path)
    if (tierRefusal) {
      logger.info(`[cli-token] refused ${JSON.stringify({ method: req.method, path: req.path, rule: tierRefusal.rule })}`)
      return res.status(403).json({ error: 'not_through_cli', rule: tierRefusal.rule, reason: tierRefusal.reason })
    }
  }

  holdBackSessionCookie(res, cookieName, () => {
    logger.warn(`[cli-token] held back a session cookie ${JSON.stringify({ subject: state.subject, method: req.method, path: req.path })}`)
  })

  if (WRITE_METHODS.has(String(req.method).toUpperCase())) {
    const path = req.path
    res.on('finish', () => {
      logger.info(`[cli-token] write ${JSON.stringify({
        subject: state.subject,
        actor: 'di.cli',
        tokenId: state.cliTokenId || null,
        method: req.method,
        path,
        status: res.statusCode
      })}`)
    })
  }
  next()
}

module.exports = { createCliTokenGate, reachRefusalFor, isOwnRoute, OWN_ROUTES }
