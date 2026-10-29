// Signing in from a terminal — the routes. Method, flow and wire format:
// docs/architecture/CLI_LOGIN.md. Storage: ../cliLoginStore.js. What a terminal
// login may reach once it has one: ../cliTokenGate.js.
//
// Three kinds of caller meet here, and each route says which it takes:
//   anyone       the terminal starting and polling — it has no login yet;
//   an account   a person in a browser, with a real account's cookie session —
//                answering a code, listing and ending their terminals;
//   a terminal   a request carrying its own `dii_cli_` token — asking who it is
//                or ending itself, the only routes under /api/auth it may call.
// An account route refuses a guest, a sync key, a static API token, a di.bo
// token and a terminal token alike (the gates refuse the last two before they
// get here; the check below is the second lock on the same door).

const {
  startDeviceLogin, describePending, decide, exchangeDeviceCode, listCliTokens, revokeCliToken, normalizeUserCode
} = require('../cliLoginStore')

const VERIFICATION_PATH = '/device'
const CLI_ACTOR = 'di.cli'

// The address as the approval page shows it: enough to tell "my own network"
// from "somewhere else", not enough to locate a person.
const shortAddress = (value) => {
  const text = String(value || '').trim().replace(/^::ffff:/i, '')
  if (!text || text === 'unknown') return null
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) return `${text.split('.').slice(0, 2).join('.')}.x.x`
  if (text.includes(':')) return `${text.split(':').filter(Boolean).slice(0, 2).join(':')}:…`
  return null
}

const noStore = (res) => { res.set('Cache-Control', 'no-store') }

const registerCliLoginRoutes = (router, {
  logger,
  getAuthState,
  findUserById,
  clientKey,
  isAvailable = () => true,
  startLimiter = (req, res, next) => next(),
  pollLimiter = (req, res, next) => next(),
  answerLimiters = []
}) => {
  const unavailable = (res) => res.status(404).json({ error: 'login_not_available' })

  // A real account's cookie session, and nothing else. Answers for the caller
  // when it is not one, and returns null.
  const requireAccount = (req, res) => {
    const state = getAuthState(req)
    if (!state?.authenticated) { res.status(401).json({ error: 'auth_required' }); return null }
    const subject = state.subject ? String(state.subject) : ''
    const isCookieSession = state.type === 'session' && !state.actor && subject && !subject.startsWith('guest:')
    const user = isCookieSession ? findUserById(subject) : null
    if (!user) { res.status(403).json({ error: 'account_required' }); return null }
    return { state, user }
  }

  const nameOf = (user) => String(user?.display_name || user?.email || user?.id || '').trim() || null

  // ── the terminal ──────────────────────────────────────────────────────────

  router.post('/api/auth/device/start', startLimiter, (req, res, next) => {
    try {
      if (!isAvailable()) return unavailable(res)
      noStore(res)
      const started = startDeviceLogin({ label: req.body?.label, from: shortAddress(clientKey(req)) })
      res.status(201).json({ ...started, verificationPath: VERIFICATION_PATH })
    } catch (error) {
      if (error?.code === 'busy') return res.status(503).json({ error: 'busy', message: error.message })
      next(error)
    }
  })

  router.post('/api/auth/device/token', pollLimiter, (req, res, next) => {
    try {
      if (!isAvailable()) return unavailable(res)
      noStore(res)
      const deviceCode = typeof req.body?.deviceCode === 'string' ? req.body.deviceCode : ''
      const answer = exchangeDeviceCode({ deviceCode, canIssueFor: (userId) => Boolean(findUserById(userId)) })
      if (answer.status === 'approved') {
        const user = findUserById(answer.userId)
        logger.info(`[cli-token] minted ${JSON.stringify({ tokenId: answer.tokenId, subject: answer.userId, actor: CLI_ACTOR, expiresAt: answer.expiresAt })}`)
        return res.status(200).json({
          token: answer.token,
          expiresAt: answer.expiresAt,
          user: { id: answer.userId, name: nameOf(user) }
        })
      }
      const body = {
        pending: { error: 'authorization_pending' },
        slow_down: { error: 'slow_down', interval: answer.interval },
        denied: { error: 'access_denied' },
        expired: { error: 'expired_token' }
      }[answer.status] || { error: 'expired_token' }
      res.status(400).json(body)
    } catch (error) { next(error) }
  })

  // ── a person, in a browser ────────────────────────────────────────────────

  router.post('/api/auth/device/lookup', ...answerLimiters, (req, res, next) => {
    try {
      if (!isAvailable()) return unavailable(res)
      noStore(res)
      const who = requireAccount(req, res)
      if (!who) return
      const pending = describePending(req.body?.userCode)
      if (!pending) return res.status(404).json({ error: 'unknown_code' })
      res.json(pending)
    } catch (error) { next(error) }
  })

  router.post('/api/auth/device/decision', ...answerLimiters, (req, res, next) => {
    try {
      if (!isAvailable()) return unavailable(res)
      noStore(res)
      const who = requireAccount(req, res)
      if (!who) return
      if (typeof req.body?.approve !== 'boolean') return res.status(400).json({ error: 'approve must be true or false' })
      const answered = decide({ userCode: req.body?.userCode, userId: who.user.id, approve: req.body.approve })
      if (!answered) return res.status(404).json({ error: 'unknown_code' })
      logger.info(`[cli-token] decision ${JSON.stringify({ subject: who.user.id, approved: answered.approved })}`)
      res.json({ approved: answered.approved })
    } catch (error) { next(error) }
  })

  router.get('/api/auth/cli/tokens', (req, res, next) => {
    try {
      noStore(res)
      const who = requireAccount(req, res)
      if (!who) return
      res.json({ tokens: listCliTokens(who.user.id) })
    } catch (error) { next(error) }
  })

  router.delete('/api/auth/cli/tokens/:id', (req, res, next) => {
    try {
      noStore(res)
      const who = requireAccount(req, res)
      if (!who) return
      const ended = revokeCliToken({ id: req.params.id, userId: who.user.id })
      if (!ended) return res.status(404).json({ error: 'not_found' })
      logger.info(`[cli-token] revoked ${JSON.stringify({ tokenId: String(req.params.id).slice(0, 32), subject: who.user.id, by: 'account' })}`)
      res.json({ revoked: true })
    } catch (error) { next(error) }
  })

  // ── a terminal, about itself ──────────────────────────────────────────────

  const requireTerminal = (req, res) => {
    const state = getAuthState(req)
    if (!state?.authenticated || state.actor !== CLI_ACTOR || !state.cliTokenId) {
      res.status(401).json({ error: 'cli_token_invalid' })
      return null
    }
    return state
  }

  router.get('/api/auth/cli/whoami', (req, res, next) => {
    try {
      noStore(res)
      const state = requireTerminal(req, res)
      if (!state) return
      res.json({
        user: { id: state.subject, name: state.label || null },
        token: { id: state.cliTokenId, label: state.cliTokenLabel || null, expiresAt: state.cliTokenExpiresAt || null }
      })
    } catch (error) { next(error) }
  })

  router.delete('/api/auth/cli/token', (req, res, next) => {
    try {
      noStore(res)
      const state = requireTerminal(req, res)
      if (!state) return
      revokeCliToken({ id: state.cliTokenId })
      logger.info(`[cli-token] revoked ${JSON.stringify({ tokenId: state.cliTokenId, subject: state.subject, by: 'terminal' })}`)
      res.json({ revoked: true })
    } catch (error) { next(error) }
  })
}

module.exports = { registerCliLoginRoutes, shortAddress, normalizeUserCode, VERIFICATION_PATH, CLI_ACTOR }
