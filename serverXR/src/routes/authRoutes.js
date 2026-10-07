const crypto = require('node:crypto')
const passport = require('passport')
const { Strategy: GitHubStrategy } = require('passport-github2')
const { Strategy: GoogleStrategy } = require('passport-google-oauth20')
const { upsertUser, findUserByProvider } = require('../userStore')
const { signLoginState, verifyLoginState, readLoginState, sanitizeReturnTo } = require('../loginState')
const hubLib = require('../authHub')
const { readCookie } = require('../authSession')
const { httpRequest } = require('../httpClient')
const logger = require('../logger')
const mailer = require('../mailer')

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
// Defaults to ['main'] in any environment where it isn't set (the dev tier and
// production should never set this).
const GUEST_SPACES = process.env.GUEST_SPACES
  ? process.env.GUEST_SPACES.split(',').map((s) => s.trim()).filter(Boolean)
  : ['main']

const registerAuthRoutes = (router, {
  config,
  createAuthSessionValue,
  setAuthSessionCookie,
  onSessionUpgrade = null,
  // Space metadata, for the bot's read-only "what am I signed in to" answer.
  // Passed in rather than required here: this module knows about identity, and
  // giving it the space store would let a later edit reach much further than
  // identity ever should.
  listSpaces = null,
  // Injected for the same reason the session helpers are: a route that reaches
  // into a module-level database cannot be exercised without one.
  findUser = findUserByProvider,
  // Injected so tests can stand a hub up without the network.
  fetchImpl = (url, opts) => httpRequest(url, opts),
  upsertUserImpl = upsertUser
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

  // ---- The sign-in hub (authHub.js) ------------------------------------
  // isHub:     this server holds the provider registrations AND the signing key,
  //            and will vouch for people on behalf of other servers.
  // hubClient: this server has no registration for a provider but knows a hub
  //            (AUTH_HUB_URL + its pinned public key), so /api/auth/<provider>
  //            goes via the hub and /api/auth/hub/callback turns a pass into a
  //            session HERE. Offline, the hub is unreachable and /providers says
  //            so; everything local (this machine, password, invites) still works.
  const hubCfg = config.authHub || {}
  const isHub = Boolean(hubCfg.signingKey)
  const hubClient = Boolean(hubCfg.url && hubCfg.publicKey)
  const hubPublicPem = hubCfg.publicKey ? hubCfg.publicKey.export({ type: 'spki', format: 'pem' }) : null
  const seenPasses = hubLib.createSeenSet()
  const HUB_COOKIE = 'di_hub'
  // The address the browser used to reach THIS server, which is the only
  // audience a pass for us may carry. req.protocol honours X-Forwarded-Proto
  // only from a trusted proxy (proxyTrust.js).
  const ownHubCallback = (req) => `${req.protocol}://${req.get('host')}${req.baseUrl || ''}${hubLib.CALLBACK_PATH}`
  const hubFailed = (res) => res.redirect(`${frontendUrl || '/'}?auth=error&reason=hub`)

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
        tokenVersion: user.tokenVersion,
        // A person signed in (OAuth, the hub, Telegram): the one stamp that may
        // mint a manage sync key (SPEC_space_sync_keys.md §13.4).
        via: 'signin'
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

  // After Google/GitHub: a hub round trip mints a pass for the server that asked;
  // anything else is an ordinary sign-in here.
  const finishOAuth = async (req, res, user) => {
    const h = readLoginState(stateSecret, req.query.state)?.h
    if (!h?.ret) return issueSessionAndRedirect(req, res, user)
    if (!isHub || !hubLib.isAllowedReturn(h.ret, hubCfg.allowedReturns) || !hubLib.isValidNonce(h.nonce)) return hubFailed(res)
    const pass = hubLib.signPass(hubCfg.signingKey, {
      iss: oauth.callbackBase || null,
      aud: h.ret,
      nonce: h.nonce,
      provider: user.provider,
      providerId: String(user.provider_id),
      email: user.email || null,
      name: user.display_name || null,
      avatar: user.avatar_url || null
    })
    logger.info(`[auth-hub] pass for ${user.provider} → ${new URL(h.ret).host}`)
    res.redirect(`${h.ret}?pass=${encodeURIComponent(pass)}`)
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
      (req, res, next) => finishOAuth(req, res, req.user).catch(next)
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
      (req, res, next) => finishOAuth(req, res, req.user).catch(next)
    )
  }

  const HUB_SCOPES = { github: ['user:email'], google: ['profile', 'email'] }

  if (isHub) {
    // Another server sends a person here to be signed in with a provider this
    // hub is registered for. Nothing is minted until the provider says who it is.
    router.get('/api/auth/hub/start', (req, res, next) => {
      const provider = String(req.query.provider || '')
      const ret = String(req.query.return || '')
      const nonce = String(req.query.nonce || '')
      if (!hubLib.HUB_PROVIDERS.includes(provider) || !oauth[provider]?.enabled) return res.status(400).json({ error: 'That sign-in is not offered here.' })
      if (!hubLib.isAllowedReturn(ret, hubCfg.allowedReturns)) return res.status(400).json({ error: 'That address is not allowed to sign in through this hub.' })
      if (!hubLib.isValidNonce(nonce)) return res.status(400).json({ error: 'Bad request.' })
      passport.authenticate(provider, { scope: HUB_SCOPES[provider], session: false, state: signLoginState(stateSecret, { hub: { ret, nonce } }) })(req, res, next)
    })
    // Public by design: the key other servers pin, and what this hub offers.
    // A server compares this key with the one it pinned before trusting the hub.
    router.get('/api/auth/hub/key', (_req, res) => {
      res.set('Cache-Control', 'public, max-age=300')
      res.json({
        publicKey: require('node:crypto').createPublicKey(hubCfg.signingKey).export({ type: 'spki', format: 'pem' }),
        providers: hubLib.HUB_PROVIDERS.filter((p) => oauth[p]?.enabled)
      })
    })
  }

  // Is the hub reachable, is it the hub we pinned, and what does it offer?
  // Cached so /providers stays fast: 60 s when it answers, 20 s when it does not.
  let hubStatus = { at: 0, ok: false, providers: [] }
  const readHubStatus = async () => {
    if (!hubClient) return { ok: false, providers: [] }
    const age = Date.now() - hubStatus.at
    if (age < (hubStatus.ok ? 60000 : 20000)) return hubStatus
    try {
      const r = await fetchImpl(`${hubCfg.url}/api/auth/hub/key`, { timeoutMs: 3000 })
      const body = r.ok ? await r.json() : null
      const sameKey = body?.publicKey && require('node:crypto').createPublicKey(body.publicKey)
        .export({ type: 'spki', format: 'pem' }) === hubPublicPem
      if (body && !sameKey) logger.warn(`[auth-hub] ${hubCfg.url} answers with a different key than AUTH_HUB_PUBLIC_KEY; hub sign-in stays off.`)
      hubStatus = { at: Date.now(), ok: Boolean(sameKey), providers: sameKey && Array.isArray(body.providers) ? body.providers : [] }
    } catch {
      hubStatus = { at: Date.now(), ok: false, providers: [] }
    }
    return hubStatus
  }

  if (hubClient) {
    // For every provider this server is NOT registered for: go via the hub. The
    // nonce lives in a signed, HttpOnly, short cookie in this person's browser,
    // so a pass minted for someone else cannot sign them in here.
    for (const provider of hubLib.HUB_PROVIDERS.filter((p) => !oauth[p]?.enabled)) {
      router.get(`/api/auth/${provider}`, (req, res) => {
        const nonce = hubLib.newNonce()
        const cookie = signLoginState(stateSecret, { returnTo: req.query.returnTo, hub: { nonce } })
        res.append('Set-Cookie', `${HUB_COOKIE}=${cookie}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${config.authSession?.cookieSecure ? '; Secure' : ''}`)
        const q = new URLSearchParams({ provider, return: ownHubCallback(req), nonce })
        res.redirect(`${hubCfg.url}/api/auth/hub/start?${q}`)
      })
    }
    router.get(hubLib.CALLBACK_PATH, async (req, res, next) => {
      try {
        const st = readLoginState(stateSecret, readCookie(req.get('cookie') || '', HUB_COOKIE))
        const checked = hubLib.verifyPass(hubCfg.publicKey, req.query.pass, { aud: ownHubCallback(req), nonce: st?.h?.nonce, seen: seenPasses })
        if (!checked.ok) {
          logger.warn(`[auth-hub] pass refused: ${checked.reason}`)
          return hubFailed(res)
        }
        const c = checked.claims
        const user = upsertUserImpl({ provider: c.provider, providerId: c.providerId, email: c.email, displayName: c.name, avatarUrl: c.avatar })
        req.query.state = signLoginState(stateSecret, { returnTo: st?.r })
        await issueSessionAndRedirect(req, res, user)
      } catch (error) { next(error) }
    })
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

    // "Who am I, and what can I open?" — bot-only, and a READ. The bot asks on
    // behalf of a Telegram person and gets back that person's own name and the
    // spaces their account already reaches. No token is minted, nothing is
    // written, and the answer is exactly the scope the person's own session
    // would carry, never more.
    //
    // This is the floor under a Telegram person doing anything in di.iiii: the
    // bot could not previously tell whether a chat belonged to an account at
    // all, so every answer it gave about "your spaces" was a guess or a
    // question. It deliberately stops here — a lookup is not a login, and any
    // WRITE from a chat needs its own decision, not this endpoint quietly
    // growing one.
    router.post('/api/auth/telegram/whoami', async (req, res, next) => {
      try {
        if (!secretMatches(req.get('x-telegram-login-secret'))) {
          return res.status(401).json({ error: 'auth_required' })
        }
        const telegramId = String(req.body?.telegramId || '').trim()
        if (!/^\d{1,20}$/.test(telegramId)) {
          return res.status(400).json({ error: 'A numeric Telegram id is required.' })
        }
        const user = findUser('telegram', telegramId)
        // Not an error, and not a 404: "nobody has signed in from this chat" is
        // a true, ordinary answer, and the bot's reply to it is /login.
        if (!user) return res.json({ bound: false })

        const scoped = Array.isArray(user.spaces) ? user.spaces : []
        let spaces = scoped.map((id) => ({ id, label: null }))
        // An unrestricted account reaches everything, which is a list nobody
        // wants in a chat message. Say so instead of printing an estate.
        const everything = Boolean(user.isUnrestricted)
        if (typeof listSpaces === 'function') {
          try {
            const all = await listSpaces()
            const byId = new Map((all || []).map((meta) => [meta.id, meta]))
            spaces = everything
              ? []
              : spaces.map(({ id }) => ({ id, label: byId.get(id)?.label || null }))
          } catch {
            // A label is a nicety; the ids are the answer.
          }
        }
        res.json({
          bound: true,
          label: user.display_name || user.id,
          role: user.role,
          everything,
          spaces
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

  router.get('/api/auth/providers', async (_req, res) => {
    const hubNow = await readHubStatus()
    const viaHub = (p) => !oauth[p]?.enabled && hubNow.ok && hubNow.providers.includes(p)
    res.json({
      github: oauth.github.enabled || viaHub('github'),
      google: oauth.google.enabled || viaHub('google'),
      // Which sign-ins go through the hub, and whether it answered just now
      // (false offline: the page then offers only what works here).
      ...(hubClient ? { hub: { reachable: hubNow.ok, via: hubLib.HUB_PROVIDERS.filter(viaHub) } } : {}),
      telegram: Boolean(telegram.enabled),
      // First-party accounts are always on: they are the door that needs no
      // other company's permission, and an install that offered no way in at
      // all would be a locked building. `mail` says whether the two things
      // that need delivery — a reset link, a sign-in link — can be offered.
      password: true,
      mail: mailer.isConfigured(),
      // Empty unless configured; a client uses it to name the bot on the
      // button and must cope with it being absent.
      ...(telegram.enabled && telegram.botUsername ? { telegramBot: telegram.botUsername } : {})
    })
  })

  return { GUEST_SPACES }
}

module.exports = { registerAuthRoutes, GUEST_SPACES }
