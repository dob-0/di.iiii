const crypto = require('node:crypto')
const passport = require('passport')
const { Strategy: GitHubStrategy } = require('passport-github2')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const { upsertUser } = require('../userStore')
const { signLoginState, verifyLoginState, readLoginState, sanitizeReturnTo } = require('../loginState')
const logger = require('../logger')

// Derive a stable fallback secret from OAuth client secrets when no
// AUTH_SESSION_SECRET/API_TOKEN is configured (e.g. REQUIRE_AUTH=false
// self-host setups). Must stay identical across processes/restarts on the
// same deployment — a random-per-process secret breaks state verification
// whenever the authorize and callback hops land on different processes
// (e.g. cPanel/Passenger spawning or recycling workers).
const deriveFallbackStateSecret = (oauth) => {
  const material = [oauth?.github?.clientSecret, oauth?.google?.clientSecret]
    .filter(Boolean)
    .join('|')
  if (!material) return crypto.randomBytes(32).toString('hex')
  return crypto.createHash('sha256').update(`login-state:${material}`).digest('hex')
}

// Dev-only override: comma-separated space ids guests can use without signing in.
// Defaults to ['main'] in any environment where it isn't set (staging/production
// should never set this).
const GUEST_SPACES = process.env.GUEST_SPACES
  ? process.env.GUEST_SPACES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['main']

const registerAuthRoutes = (router, {
  config,
  createAuthSessionValue,
  setAuthSessionCookie,
  onSessionUpgrade = null
}) => {
  const frontendUrl = config.oauth.frontendUrl
  const { oauth } = config
  if (!config.auth.sessionSecret) {
    logger.warn(
      '[serverXR] No AUTH_SESSION_SECRET/API_TOKEN configured — OAuth login-state is signed with ' +
      'a secret derived from the OAuth client secrets. Fine for a self-host/no-auth deployment; ' +
      'set AUTH_SESSION_SECRET if this is meant to be a hardened deployment.'
    )
  }
  const stateSecret = config.auth.sessionSecret || deriveFallbackStateSecret(oauth)

  const requireValidLoginState = (req, res, next) => {
    if (!verifyLoginState(stateSecret, req.query.state)) {
      return res.redirect(`${frontendUrl || '/'}?auth=error`)
    }
    next()
  }

  if (oauth.github.enabled) {
    passport.use(new GitHubStrategy(
      {
        clientID: oauth.github.clientId,
        clientSecret: oauth.github.clientSecret,
        callbackURL: `${oauth.callbackBase}/api/auth/github/callback`
      },
      (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = upsertUser({
            provider: 'github',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || null,
            displayName: profile.displayName || profile.username,
            avatarUrl: profile.photos?.[0]?.value || null
          })
          done(null, user)
        } catch (err) {
          done(err)
        }
      }
    ))
  }

  if (oauth.google.enabled) {
    passport.use(new GoogleStrategy(
      {
        clientID: oauth.google.clientId,
        clientSecret: oauth.google.clientSecret,
        callbackURL: `${oauth.callbackBase}/api/auth/google/callback`
      },
      (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = upsertUser({
            provider: 'google',
            providerId: profile.id,
            email: profile.emails?.[0]?.value || null,
            displayName: profile.displayName,
            avatarUrl: profile.photos?.[0]?.value || null
          })
          done(null, user)
        } catch (err) {
          done(err)
        }
      }
    ))
  }

  router.use(passport.initialize())

  const issueSessionAndRedirect = async (req, res, user) => {
    // Before the new cookie replaces the old one, give the host a chance to
    // carry guest work across the identity switch (sandbox promotion).
    let kept = false
    if (typeof onSessionUpgrade === 'function') {
      try {
        kept = Boolean(await onSessionUpgrade(req, user))
      } catch {
        kept = false
      }
    }
    const session = createAuthSessionValue({
      secret: config.auth.sessionSecret,
      ttlMs: config.authSession.ttlMs,
      session: {
        subject: user.id,
        label: user.display_name || user.email || user.id,
        role: user.role,
        spaces: Array.isArray(user.spaces) ? user.spaces : [],
        ...(user.isUnrestricted ? { isUnrestricted: true } : {}),
        tokenVersion: user.tokenVersion
      }
    })
    setAuthSessionCookie(res, session.value)
    // ?auth=ok lets the client confirm the sign-in (AuthReturnNotice) —
    // OAuth used to return with no marker at all, so success was silent.
    // &kept=1 tells the toast the guest's sandbox came along.
    // The signed state carries the path the person signed in FROM (r):
    // without it every sign-in dumped them on the landing page, and an
    // ?invite= token riding the original URL was lost with it.
    const returnTo = sanitizeReturnTo(readLoginState(stateSecret, req.query.state)?.r)
    // frontendUrl defaults to '/', and returnTo always starts with '/': joined
    // raw that makes '//spaces', a protocol-relative URL the browser resolves
    // as host `spaces` (DNS_PROBE_FINISHED_NXDOMAIN) instead of our own path.
    const base = frontendUrl && frontendUrl !== '/' ? frontendUrl.replace(/\/+$/, '') : ''
    const destination = returnTo ? `${base}${returnTo}` : (frontendUrl || '/')
    const separator = destination.includes('?') ? '&' : '?'
    res.redirect(`${destination}${separator}auth=ok${kept ? '&kept=1' : ''}`)
  }

  if (oauth.github.enabled) {
    router.get('/api/auth/github',
      // `state` must be signed fresh on every request — passport.authenticate(name, opts)
      // is a middleware *factory*, but calling it here at route-registration time would
      // bake a single state value into the closure for the process's entire lifetime
      // (the exact bug this replaced: every login shared one state token, so it worked
      // only within STATE_TTL_MS of server start and failed for everyone after that).
      (req, res, next) =>
        passport.authenticate('github', { scope: ['user:email'], session: false, state: signLoginState(stateSecret, { returnTo: req.query.returnTo }) })(req, res, next)
    )
    router.get('/api/auth/github/callback',
      requireValidLoginState,
      passport.authenticate('github', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res, next) => issueSessionAndRedirect(req, res, req.user).catch(next)
    )
  }

  if (oauth.google.enabled) {
    router.get('/api/auth/google',
      (req, res, next) =>
        passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: signLoginState(stateSecret, { returnTo: req.query.returnTo }) })(req, res, next)
    )
    router.get('/api/auth/google/callback',
      requireValidLoginState,
      passport.authenticate('google', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res, next) => issueSessionAndRedirect(req, res, req.user).catch(next)
    )
  }

  // ---- Sign in with Telegram -------------------------------------------
  //
  // Two halves. di.bo mints (it knows who the person is, because Telegram
  // delivered a message to them); the person opens the link here and becomes
  // a signed-in account. Everything after that is identical to GitHub and
  // Google — same upsertUser, same session, same sandbox hand-off — so a
  // Telegram account is not a lesser kind of account.
  //
  // Why it exists: the people who need it most cannot hold a Google account.
  // A workshop that shares one login on six laptops has no way to say who
  // made what, which is exactly what happened at the Dilijan camp.
  const telegram = oauth.telegram || { enabled: false, loginSecret: '', botUsername: '' }

  // Constant-time, and length-safe: timingSafeEqual throws on a length
  // mismatch, which would itself be a timing signal.
  const secretMatches = (presented) => {
    const a = Buffer.from(String(presented || ''))
    const b = Buffer.from(String(telegram.loginSecret || ''))
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  if (telegram.enabled) {
    // Bot-only. The bot is the only party that can assert a Telegram id, so
    // this endpoint is the whole trust boundary of the feature.
    router.post('/api/auth/telegram/login-link', async (req, res, next) => {
      try {
        if (!secretMatches(req.get('x-telegram-login-secret'))) {
          return res.status(401).json({ error: 'auth_required' })
        }
        const telegramId = String(req.body?.telegramId || '').trim()
        // Telegram ids are numeric. Anything else is a caller sending us
        // something it made up, and it must not become a provider_id.
        if (!/^\d{1,20}$/.test(telegramId)) {
          return res.status(400).json({ error: 'A numeric Telegram id is required.' })
        }
        // This link is going into a chat message, so it MUST be absolute.
        // Deriving the origin from the request would mean trusting a Host
        // header to say where people sign in — refuse instead, loudly, at
        // mint time rather than silently sending someone a dead link.
        const base = (oauth.callbackBase || '').replace(/\/+$/, '')
        if (!/^https?:\/\//i.test(base)) {
          logger.warn('[auth] Telegram login is enabled but OAUTH_CALLBACK_BASE_URL is not set — cannot mint an absolute link.')
          return res.status(503).json({ error: 'Telegram login is not fully configured: OAUTH_CALLBACK_BASE_URL is required.' })
        }
        const { mintLoginToken } = require('../telegramLoginStore')
        const { token, expiresAt } = mintLoginToken({
          telegramId,
          displayName: String(req.body?.displayName || '').trim().slice(0, 80) || null,
          // Only Telegram's own CDN, so a caller cannot point an avatar at
          // anything it likes and have us render it as this person's face.
          avatarUrl: /^https:\/\/[a-z0-9.-]*\.(?:telegram|telesco)\.(?:org|pe)\//i.test(String(req.body?.avatarUrl || ''))
            ? String(req.body.avatarUrl)
            : null,
          returnTo: sanitizeReturnTo(req.body?.returnTo) || null
        })
        res.status(201).json({
          ok: true,
          url: `${base}/api/auth/telegram/callback?token=${encodeURIComponent(token)}`,
          expiresAt,
          note: 'Single use, and it expires. Mint a new one rather than resending this.'
        })
      } catch (error) { next(error) }
    })

    // The person's hop. No secret here — the token IS the credential, which is
    // why it is single-use and short-lived.
    router.get('/api/auth/telegram/callback', async (req, res, next) => {
      try {
        const { consumeLoginToken } = require('../telegramLoginStore')
        const claim = consumeLoginToken(req.query.token)
        // One message for every failure — unknown, expired, spent, forged.
        // Telling them apart only helps someone probing.
        if (!claim) return res.redirect(`${frontendUrl || '/'}?auth=error&reason=link`)
        const user = upsertUser({
          provider: 'telegram',
          providerId: claim.telegramId,
          email: null,
          displayName: claim.displayName,
          avatarUrl: claim.avatarUrl
        })
        // issueSessionAndRedirect reads returnTo off the signed OAuth state,
        // which this flow has no equivalent of — the token carried it instead,
        // and consumeLoginToken has already vouched for it.
        req.query.state = signLoginState(stateSecret, { returnTo: claim.returnTo })
        await issueSessionAndRedirect(req, res, user)
      } catch (error) { next(error) }
    })
  }

  router.get('/api/auth/providers', (_req, res) => {
    res.json({
      github: oauth.github.enabled,
      google: oauth.google.enabled,
      telegram: Boolean(telegram.enabled),
      // Empty unless configured; a client uses it to name the bot on the
      // button and must cope with it being absent.
      ...(telegram.enabled && telegram.botUsername ? { telegramBot: telegram.botUsername } : {})
    })
  })

  return { GUEST_SPACES }
}

module.exports = { registerAuthRoutes, GUEST_SPACES }
