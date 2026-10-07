// What a di.bo act token may reach — the request half. The storage half is
// telegramActTokenStore.js; the route that mints one is
// POST /api/auth/telegram/act-token (routes/authRoutes.js).
//
// A request carrying `Authorization: Bearer dii_tgact_<id>.<secret>` resolves
// to the person's own session-equivalent auth state (same role, same spaces,
// same restrictions as their browser), marked `actor: 'di.bo'`. That is the
// whole grant. This gate adds the things a borrowed key must never do, even
// when the person themselves could do them in their own browser:
//
//   1. REFUSED_THROUGH_DI_BO below — one list, each with its reason. A refused
//      route answers 403 before any handler sees the request, whether or not
//      the token is valid, so a probe learns nothing about the token either.
//   2. An invalid, expired or revoked token answers 401. It never falls back
//      to a guest: a bot that thinks it is acting for someone must hear that
//      it is not, instead of quietly creating guest work.
//   3. The response can never carry a session cookie. A 15-minute token must
//      not turn into a 12-hour browser session by way of a route that
//      re-issues the caller's cookie (space creation does, for a person).
//   4. Every write (anything but GET/HEAD/OPTIONS) is logged once, when the
//      response finishes: subject, actor di.bo, token id, tier, method, path,
//      status.
//   5. Below root, the platform's settings (REFUSED_BELOW_ROOT); the tier and
//      the cap it puts on the account are actTokenTier.js.

// Each rule: which requests, and why they stay in the person's own hands.
// Paths are matched against req.path inside the router (so `/api/...`, with
// the /serverXR mount already stripped), case-insensitively, as Express
// itself routes.
const REFUSED_THROUGH_DI_BO = Object.freeze([
  {
    rule: 'ANY /api/auth/**',
    test: (method, path) => /^\/api\/auth(?:\/|$)/i.test(path),
    reason: 'Signing in or out, sessions, passwords and Telegram links are the account\'s own doors. A borrowed key never mints another key (this route included) or a session.'
  },
  {
    rule: 'ANY /api/users and /api/users/**',
    test: (method, path) => /^\/api\/users(?:\/|$)/i.test(path),
    reason: 'Accounts, roles and space scopes are changed by a person, in person — never through a bot, even for an admin.'
  },
  {
    rule: 'ANY /api/spaces/:spaceId/sync-keys/**',
    test: (method, path) => /^\/api\/spaces\/[^/]+\/sync-keys(?:\/|$)/i.test(path),
    reason: 'A sync key lives for months; a 15-minute token must not be able to leave a long-lived key behind.'
  },
  {
    rule: 'ANY /api/integrations/**',
    test: (method, path) => /^\/api\/integrations(?:\/|$)/i.test(path),
    reason: 'The person\'s own third-party credentials (their Claude key, their Google Drive grant) are theirs to connect, read or remove.'
  },
  {
    rule: 'ANY /api/dm/**',
    test: (method, path) => /^\/api\/dm(?:\/|$)/i.test(path),
    reason: 'Private conversations are end-to-end between people\'s own devices; a bot publishing or revoking a device key would sit inside them.'
  },
  {
    rule: 'ANY /api/approvals/**',
    test: (method, path) => /^\/api\/approvals(?:\/|$)/i.test(path),
    reason: 'An approval is a person\'s decision, by definition.'
  },
  {
    rule: 'POST /api/invites/redeem',
    test: (method, path) => method === 'POST' && /^\/api\/invites\/redeem\/?$/i.test(path),
    reason: 'Redeeming an invite widens the account\'s own scope; the person opens the invite link themselves. (Minting and revoking invites for a space they own stays allowed.)'
  },
  {
    rule: 'PATCH /api/spaces/:spaceId with ownerUserId or trustedUserIds',
    test: (method, path, body) => method === 'PATCH'
      && /^\/api\/spaces\/[^/]+\/?$/i.test(path)
      && Boolean(body) && typeof body === 'object'
      && (Object.prototype.hasOwnProperty.call(body, 'ownerUserId') || Object.prototype.hasOwnProperty.call(body, 'trustedUserIds')),
    reason: 'Who owns a space, and who else may edit it, is changed by a person, in person.'
  }
])

// The platform's own settings: refused to every tier but root (actTokenTier.js).
// Judged after the token resolves — the tier lives on the state — so a probe
// with a dead token still hears 401, never which tier would have been refused.
const REFUSED_BELOW_ROOT = Object.freeze([
  {
    rule: 'PATCH /api/config',
    test: (method, path) => method === 'PATCH' && /^\/api\/config\/?$/i.test(path),
    reason: 'The default and shared space of the whole server are the platform\'s settings; only root changes them through di.bo.'
  },
  {
    rule: 'ANY /api/admin/**',
    test: (method, path) => /^\/api\/admin(?:\/|$)/i.test(path),
    reason: 'Blocking callers and purging sandboxes act on everyone; only root does that through di.bo.'
  },
  {
    rule: 'ANY /api/estate/**',
    test: (method, path) => /^\/api\/estate(?:\/|$)/i.test(path),
    reason: 'The estate map names every machine, address and store; it is not read through a chat below root.'
  },
  {
    rule: 'DELETE /api/commons/assets/:assetId',
    test: (method, path) => method === 'DELETE' && /^\/api\/commons\/assets\/[^/]+\/?$/i.test(path),
    reason: 'Moderating the public commons is a judgement made in the browser, below root.'
  },
  {
    rule: 'DELETE /api/spaces/:spaceId',
    test: (method, path) => method === 'DELETE' && /^\/api\/spaces\/[^/]+\/?$/i.test(path),
    reason: 'A whole space — scene, history, projects — is deleted in the browser, by a person, below root.'
  }
])

const tierRefusalFor = (tier, method, path) => {
  if (tier === 'root') return null
  const verb = String(method || '').toUpperCase()
  const where = String(path || '')
  return REFUSED_BELOW_ROOT.find((entry) => entry.test(verb, where)) || null
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const refusalFor = (method, path, body = null) => {
  const verb = String(method || '').toUpperCase()
  const where = String(path || '')
  return REFUSED_THROUGH_DI_BO.find((entry) => entry.test(verb, where, body)) || null
}

// Drop any session cookie from this one response. Other cookies (none today)
// pass untouched; the session cookie is the only one that is a credential.
const holdBackSessionCookie = (res, cookieName, onDropped) => {
  const isSessionCookie = (value) => String(value || '').trim().startsWith(`${cookieName}=`)
  const filter = (value) => {
    if (Array.isArray(value)) {
      const kept = value.filter((v) => !isSessionCookie(v))
      if (kept.length !== value.length) onDropped()
      return kept
    }
    if (isSessionCookie(value)) { onDropped(); return null }
    return value
  }
  const setHeader = res.setHeader.bind(res)
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() !== 'set-cookie') return setHeader(name, value)
    const kept = filter(value)
    if (kept === null || (Array.isArray(kept) && kept.length === 0)) return res
    return setHeader(name, kept)
  }
  const append = typeof res.append === 'function' ? res.append.bind(res) : null
  if (append) {
    res.append = (name, value) => {
      if (String(name).toLowerCase() !== 'set-cookie') return append(name, value)
      const kept = filter(value)
      if (kept === null || (Array.isArray(kept) && kept.length === 0)) return res
      return append(name, kept)
    }
  }
}

// readToken(req)      -> the bearer, or null
// resolveState(req, token) -> the auth state the token stands for, or null
const createActTokenGate = ({ prefix, readToken, resolveState, cookieName, logger }) => (req, res, next) => {
  const token = readToken(req)
  if (!token || !String(token).startsWith(prefix)) return next()

  const refusal = refusalFor(req.method, req.path, req.body)
  if (refusal) {
    logger.info(`[act-token] refused ${JSON.stringify({ method: req.method, path: req.path, rule: refusal.rule })}`)
    return res.status(403).json({ error: 'not_through_di_bo', rule: refusal.rule, reason: refusal.reason })
  }

  const state = resolveState(req, token)
  if (!state) {
    return res.status(401).json({
      error: 'act_token_invalid',
      reason: 'This di.bo token is unknown, expired or revoked (signing out everywhere revokes it). Mint a new one.'
    })
  }

  // A state with no tier is a member's: the narrowest reach is the default.
  const tier = state.actTier || 'member'
  const tierRefusal = tierRefusalFor(tier, req.method, req.path)
  if (tierRefusal) {
    logger.info(`[act-token] refused ${JSON.stringify({ method: req.method, path: req.path, rule: tierRefusal.rule, tier })}`)
    return res.status(403).json({ error: 'not_through_di_bo', rule: tierRefusal.rule, reason: tierRefusal.reason, tier })
  }

  holdBackSessionCookie(res, cookieName, () => {
    logger.warn(`[act-token] held back a session cookie ${JSON.stringify({ subject: state.subject, method: req.method, path: req.path })}`)
  })

  if (WRITE_METHODS.has(String(req.method).toUpperCase())) {
    const path = req.path
    res.on('finish', () => {
      logger.info(`[act-token] write ${JSON.stringify({
        subject: state.subject,
        actor: 'di.bo',
        tokenId: state.actTokenId || null,
        tier,
        method: req.method,
        path,
        status: res.statusCode
      })}`)
    })
  }
  next()
}

module.exports = { REFUSED_THROUGH_DI_BO, REFUSED_BELOW_ROOT, refusalFor, tierRefusalFor, createActTokenGate, holdBackSessionCookie, WRITE_METHODS }
