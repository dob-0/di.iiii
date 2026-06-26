const passport = require('passport')
const { Strategy: GitHubStrategy } = require('passport-github2')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const { upsertUser } = require('../userStore')

// Dev-only override: comma-separated space ids guests can use without signing in.
// Defaults to ['main'] in any environment where it isn't set (staging/production
// should never set this).
const GUEST_SPACES = process.env.GUEST_SPACES
  ? process.env.GUEST_SPACES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['main']

const registerAuthRoutes = (router, {
  config,
  createAuthSessionValue,
  setAuthSessionCookie
}) => {
  const frontendUrl = config.oauth.frontendUrl
  const { oauth } = config

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

  const issueSessionAndRedirect = (res, user) => {
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
    res.redirect(frontendUrl || '/')
  }

  if (oauth.github.enabled) {
    router.get('/api/auth/github',
      passport.authenticate('github', { scope: ['user:email'], session: false })
    )
    router.get('/api/auth/github/callback',
      passport.authenticate('github', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res) => issueSessionAndRedirect(res, req.user)
    )
  }

  if (oauth.google.enabled) {
    router.get('/api/auth/google',
      passport.authenticate('google', { scope: ['profile', 'email'], session: false })
    )
    router.get('/api/auth/google/callback',
      passport.authenticate('google', { failureRedirect: `${frontendUrl || '/'}?auth=error`, session: false }),
      (req, res) => issueSessionAndRedirect(res, req.user)
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
