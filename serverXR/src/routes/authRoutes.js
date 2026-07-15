const crypto = require('node:crypto')
const passport = require('passport')
const { Strategy: GitHubStrategy } = require('passport-github2')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const { upsertUser } = require('../userStore')
const { signLoginState, verifyLoginState } = require('../loginState')

// A random per-process secret when none is configured (e.g. REQUIRE_AUTH=false
// self-host setups) — avoids signing with a fixed, publicly-known string.
// State tokens are short-lived, so not surviving a restart is fine.
const FALLBACK_STATE_SECRET = crypto.randomBytes(32).toString('hex')

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
  const stateSecret = config.auth.sessionSecret || FALLBACK_STATE_SECRET

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
        ...(user.isUnrestricted ? { isUnrestricted: true } : {})
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
      passport.authenticate('github', { scope: ['user:email'], session: false, state: signLoginState(stateSecret) })
    )
    router.get('/api/auth/github/callback',
      requireValidLoginState,
      passport.authenticate('github', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res, next) => issueSessionAndRedirect(req, res, req.user).catch(next)
    )
  }

  if (oauth.google.enabled) {
    router.get('/api/auth/google',
      passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: signLoginState(stateSecret) })
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
