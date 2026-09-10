// First-party accounts: an email and a password, no Google, no GitHub, no
// Telegram. Three doors, one account shape.
//
//   · register + sign in with a password
//   · sign in WITHOUT one, by a link in your mail (magic)
//   · a username and a password on an install with no mail at all
//
// The last is not a lesser mode, it is the camp: a laptop with no mail, five
// kids, and nobody's phone number. It comes with one honest limit, said in the
// UI and again here — nobody can prove such an account is theirs, so only an
// admin can recover it.
//
// What this file refuses is more of its substance than what it allows:
//
//   · registration NEVER grants a role or a space. Every account starts scoped
//     to nothing, like the Telegram one does. An account is an identity, not a
//     permission, and the day those two are the same thing is the day signing
//     up is a privilege escalation.
//   · "is this address registered?" is never answerable. Forgot-password and
//     magic-link answer identically whether or not the address exists, and
//     register refuses a taken address with the same wording it uses for a
//     refused one. An endpoint that tells a stranger which of your people have
//     accounts is an endpoint that enumerates your people.
//   · a wrong password and an unknown account take the same path, including
//     the cost of a hash, so the shape of the delay says nothing either.

const { hashPassword, verifyPassword, needsRehash } = require('../passwordHash')
const {
  findPasswordUser,
  findPasswordUserByEmail,
  createPasswordUser,
  setUserPasswordHash,
  markEmailVerified,
  findUserById,
  normalizeEmail,
  normalizeUsername,
  isValidUsername
} = require('../userStore')
const { mintAuthToken, consumeAuthToken, KINDS } = require('../authTokenStore')
const mailer = require('../mailer')
const logger = require('../logger')

// Long enough to be worth the scrypt cost, short enough that a person at a
// camp laptop will actually finish typing it. Length is the only rule: a
// composition rule ("one capital, one digit") buys almost nothing and pushes
// people towards Passw0rd! every time.
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 512

// Deliberately loose. A validator that is stricter than the RFC is a validator
// that one day refuses somebody's real address, and the address is proven by
// the mail arriving, not by this.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(String(value || '').trim())

const registerPasswordAuthRoutes = (router, {
  // ASYNC, and awaited at every call site: the host's implementation promotes a
  // guest's sandbox onto the new identity before it writes the cookie, and a
  // promise spread into a JSON body is an empty object — which is exactly what
  // register answered with until this was awaited.
  issueSessionForUser,
  frontendUrl = '/',
  limiter = null,
  // Injected so the suite can exercise every branch without a database or an
  // SMTP server — the same shape registerAuthRoutes already uses.
  deps = {}
}) => {
  const store = {
    findPasswordUser,
    findPasswordUserByEmail,
    createPasswordUser,
    setUserPasswordHash,
    markEmailVerified,
    findUserById,
    ...deps.store
  }
  const mail = { ...mailer, ...deps.mailer }
  const tokens = { mintAuthToken, consumeAuthToken, ...deps.tokens }

  const guard = limiter ? [limiter] : []
  const site = () => String(mail.readConfig().siteUrl || frontendUrl || '').replace(/\/+$/, '')

  // One sentence for every "did that address exist" question. Said the same
  // way whether we sent anything or not.
  const SENT_IF_KNOWN = 'If that address has an account, a message is on its way.'

  const passwordProblem = (password) => {
    const value = String(password || '')
    if (value.length < MIN_PASSWORD_LENGTH) return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`
    if (value.length > MAX_PASSWORD_LENGTH) return 'That password is too long.'
    return null
  }

  const mailAvailable = () => mail.isConfigured()

  const sendToken = async ({ user, kind, subject, line, path }) => {
    const minted = tokens.mintAuthToken({ kind, userId: user.id })
    if (!minted) return { ok: false, reason: 'mint_failed' }
    const url = `${site()}${path}?token=${encodeURIComponent(minted.token)}`
    return mail.sendMail({
      to: user.email,
      subject,
      text: `${line}\n\n${url}\n\nIf you did not ask for this, nothing has happened and you can ignore this message.`
    })
  }

  // ── register ────────────────────────────────────────────────────────────
  router.post('/api/auth/password/register', ...guard, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const username = normalizeUsername(req.body?.username)
      const password = String(req.body?.password || '')
      const displayName = String(req.body?.displayName || '').trim().slice(0, 80) || null

      if (!email && !username) {
        return res.status(400).json({ error: 'Give an email address, or a username if you have no mail here.' })
      }
      if (email && !looksLikeEmail(email)) {
        return res.status(400).json({ error: 'That does not look like an email address.' })
      }
      if (username && !isValidUsername(username)) {
        return res.status(400).json({
          error: 'A username is 3–32 characters: letters, numbers, - and _, starting with a letter or number.'
        })
      }
      const problem = passwordProblem(password)
      if (problem) return res.status(400).json({ error: problem })

      const passwordHash = await hashPassword(password)
      const created = store.createPasswordUser({ email: email || null, username: username || null, displayName, passwordHash })
      if (created.error) {
        // Taken and invalid answer alike, and neither says which address or
        // name it was. See the header: this endpoint must not enumerate.
        const message = created.error === 'username_invalid'
          ? 'A username is 3–32 characters: letters, numbers, - and _, starting with a letter or number.'
          : 'That address or username cannot be used. If it is yours, sign in instead — or ask for a new password.'
        return res.status(409).json({ error: message })
      }

      const user = created.user
      logger.info('[auth] a first-party account was created')

      // Verification is a message, never a gate: an account with no spaces can
      // do nothing anyway, and locking somebody out of a room they were invited
      // to because a mail server was slow is a worse failure than an unverified
      // address on an account that holds nothing.
      let verification = 'not_sent'
      if (user.email && mailAvailable()) {
        const sent = await sendToken({
          user,
          kind: KINDS.VERIFY,
          subject: 'Confirm your di.iiii address',
          line: 'Confirm this address belongs to you:',
          path: '/serverXR/api/auth/password/verify'
        })
        verification = sent.ok ? 'sent' : 'failed'
      } else if (user.email) {
        verification = 'no_mailer'
      }

      const session = await issueSessionForUser(res, user)
      return res.status(201).json({
        ...session,
        verification,
        // The camp case, said out loud rather than discovered later.
        ...(user.email ? {} : { note: 'This account has no email address, so nobody but an admin can recover it if the password is lost.' })
      })
    } catch (error) { next(error) }
  })

  // ── sign in ─────────────────────────────────────────────────────────────
  router.post('/api/auth/password/login', ...guard, async (req, res, next) => {
    try {
      const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '').trim()
      const password = String(req.body?.password || '')
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Both a name or address and a password.' })
      }

      const user = store.findPasswordUser(identifier)
      // Hash even when there is no account, against the same cost, so that
      // "no such person" and "wrong password" cannot be told apart by a clock.
      const stored = user?.password_hash || 'scrypt$65536$8$1$bm90LWEtc2FsdA==$bm90LWEtaGFzaA=='
      const ok = await verifyPassword(password, stored)
      if (!user || !ok) {
        return res.status(401).json({ error: 'That name or password is not right.' })
      }

      // A password proven against an old, cheaper hash is a password we can
      // rewrite at today's cost, once, without asking anybody to do anything.
      if (needsRehash(user.password_hash)) {
        try {
          store.setUserPasswordHash(user.id, await hashPassword(password))
        } catch (error) {
          logger.warn(`[auth] could not rehash a password: ${error.message}`)
        }
      }

      return res.json(await issueSessionForUser(res, store.findUserById(user.id) || user))
    } catch (error) { next(error) }
  })

  // ── forgot / reset ──────────────────────────────────────────────────────
  router.post('/api/auth/password/forgot', ...guard, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email)
      if (!email) return res.status(400).json({ error: 'An email address.' })
      if (!mailAvailable()) {
        // Not a lie and not a silence: this copy genuinely cannot send, and a
        // person who waits for a message that can never arrive is worse off
        // than one who is told to ask an admin.
        return res.status(503).json({ error: 'This di.iiii cannot send mail, so it cannot reset a password. Ask an admin.' })
      }
      const user = store.findPasswordUserByEmail(email)
      if (user) {
        await sendToken({
          user,
          kind: KINDS.RESET,
          subject: 'Set a new di.iiii password',
          line: 'Set a new password for your di.iiii account:',
          path: '/serverXR/api/auth/password/reset'
        })
      }
      return res.json({ ok: true, message: SENT_IF_KNOWN })
    } catch (error) { next(error) }
  })

  // The link lands here as a GET and hands the browser the form; the form POSTs
  // back with the token. The token is spent by the POST, not by the GET — a
  // mail client that pre-fetches links would otherwise burn every reset before
  // the person ever saw it.
  router.get('/api/auth/password/reset', (req, res) => {
    const token = String(req.query?.token || '')
    return res.redirect(`${frontendUrl || '/'}?auth=reset&token=${encodeURIComponent(token)}`)
  })

  router.post('/api/auth/password/reset', ...guard, async (req, res, next) => {
    try {
      const token = String(req.body?.token || '')
      const password = String(req.body?.password || '')
      const problem = passwordProblem(password)
      if (problem) return res.status(400).json({ error: problem })

      const claim = tokens.consumeAuthToken(token, KINDS.RESET)
      if (!claim) return res.status(400).json({ error: 'That link has been used already, or it has expired. Ask for another.' })
      const user = store.findUserById(claim.userId)
      if (!user) return res.status(400).json({ error: 'That link has been used already, or it has expired. Ask for another.' })

      store.setUserPasswordHash(user.id, await hashPassword(password))
      // Proving control of the mailbox is the same proof verification asks for.
      if (user.email && !user.email_verified_at) store.markEmailVerified(user.id)
      logger.info('[auth] a first-party password was reset')
      return res.json(await issueSessionForUser(res, store.findUserById(user.id)))
    } catch (error) { next(error) }
  })

  // ── sign in without a password ──────────────────────────────────────────
  router.post('/api/auth/password/magic', ...guard, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email)
      if (!email) return res.status(400).json({ error: 'An email address.' })
      if (!mailAvailable()) {
        return res.status(503).json({ error: 'This di.iiii cannot send mail, so it cannot send a sign-in link.' })
      }
      const user = store.findPasswordUserByEmail(email)
      if (user) {
        await sendToken({
          user,
          kind: KINDS.MAGIC,
          subject: 'Your di.iiii sign-in link',
          line: 'Open this to sign in. It works once, and only for the next fifteen minutes:',
          path: '/serverXR/api/auth/password/magic'
        })
      }
      return res.json({ ok: true, message: SENT_IF_KNOWN })
    } catch (error) { next(error) }
  })

  router.get('/api/auth/password/magic', async (req, res, next) => {
    try {
      const claim = tokens.consumeAuthToken(String(req.query?.token || ''), KINDS.MAGIC)
      if (!claim) return res.redirect(`${frontendUrl || '/'}?auth=error&reason=link`)
      const user = store.findUserById(claim.userId)
      if (!user) return res.redirect(`${frontendUrl || '/'}?auth=error&reason=link`)
      if (user.email && !user.email_verified_at) store.markEmailVerified(user.id)
      await issueSessionForUser(res, store.findUserById(user.id))
      return res.redirect(`${frontendUrl || '/'}?auth=ok`)
    } catch (error) { next(error) }
  })

  // ── verify an address ───────────────────────────────────────────────────
  router.get('/api/auth/password/verify', async (req, res, next) => {
    try {
      const claim = tokens.consumeAuthToken(String(req.query?.token || ''), KINDS.VERIFY)
      if (!claim) return res.redirect(`${frontendUrl || '/'}?auth=error&reason=link`)
      store.markEmailVerified(claim.userId)
      logger.info('[auth] an address was verified')
      return res.redirect(`${frontendUrl || '/'}?auth=verified`)
    } catch (error) { next(error) }
  })
}

module.exports = { registerPasswordAuthRoutes, MIN_PASSWORD_LENGTH, looksLikeEmail }
