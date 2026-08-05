const crypto = require('node:crypto')
const passport = require('passport')
const { Strategy: GitHubStrategy } = require('passport-github2')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const { upsertUser } = require('../userStore')
const { signLoginState, verifyLoginState } = require('../loginState')
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
    res.redirect(`${frontendUrl || '/'}?auth=ok${kept ? '&kept=1' : ''}`)
  }

  if (oauth.github.enabled) {
    router.get('/api/auth/github',
      // `state` must be signed fresh on every request — passport.authenticate(name, opts)
      // is a middleware *factory*, but calling it here at route-registration time would
      // bake a single state value into the closure for the process's entire lifetime
      // (the exact bug this replaced: every login shared one state token, so it worked
      // only within STATE_TTL_MS of server start and failed for everyone after that).
      (req, res, next) =>
        passport.authenticate('github', { scope: ['user:email'], session: false, state: signLoginState(stateSecret) })(req, res, next)
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
        passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: signLoginState(stateSecret) })(req, res, next)
    )
    router.get('/api/auth/google/callback',
      requireValidLoginState,
      passport.authenticate('google', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res, next) => issueSessionAndRedirect(req, res, req.user).catch(next)
    )
  }

  router.get('/api/auth/providers', (_req, res) => {
    res.json({
      github: oauth.github.enabled,
      google: oauth.google.enabled
    })
  })

  return { GUEST_SPACES }
}

module.exports = { registerAuthRoutes, GUEST_SPACES }
