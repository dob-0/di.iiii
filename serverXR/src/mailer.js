// Sending mail, and being honest when it cannot.
//
// di.iiii had no way to send an email at all until first-party accounts needed
// one. Three things depend on it — verify an address, reset a password, sign in
// by link — and each of them is worthless if the message does not arrive, so
// the one thing this module must never do is pretend.
//
// Unconfigured is a FIRST-CLASS state, not an error: an offline install and a
// camp laptop are meant to run without mail, and there the answer to "email me
// a link" is "this copy cannot send mail", said plainly, rather than a spinner
// or a lie about a message on its way. `isConfigured()` is what the routes ask
// before offering anything that depends on delivery.

const logger = require('./logger')

const readConfig = (env = process.env) => {
  const host = String(env.SMTP_HOST || '').trim()
  const from = String(env.MAIL_FROM || '').trim()
  const port = Number(env.SMTP_PORT || 587)
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    // Implicit TLS on 465, STARTTLS everywhere else — the convention every
    // provider follows, overridable for the one that does not.
    secure: env.SMTP_SECURE ? String(env.SMTP_SECURE) === 'true' : Number(port) === 465,
    user: String(env.SMTP_USER || '').trim(),
    pass: String(env.SMTP_PASS || ''),
    from,
    // A message about an account has to name the place the account is at, and
    // it has to be a real address a person can click.
    siteUrl: String(env.OAUTH_CALLBACK_BASE_URL || env.MAIL_SITE_URL || '').replace(/\/+$/, '')
  }
}

let transportFactory = null

/** Tests (and any future provider) hand in their own sender. */
const setTransportFactory = (factory) => { transportFactory = factory }

const createTransport = (config) => {
  if (transportFactory) return transportFactory(config)
  // Required lazily: an install with no SMTP configured should not pay for the
  // module at boot, and a missing optional dependency should not stop a server
  // whose people all sign in with Google.
  const nodemailer = require('nodemailer')
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {})
  })
}

const isConfigured = (env = process.env) => {
  const config = readConfig(env)
  return Boolean(config.host && config.from)
}

/**
 * Returns { ok } or { ok: false, reason }. Never throws: a failure to send is a
 * thing the caller must be able to say out loud to the person waiting, not an
 * exception that becomes a 500 with no explanation in it.
 */
const sendMail = async ({ to, subject, text, html = null }, env = process.env) => {
  const config = readConfig(env)
  if (!config.host || !config.from) return { ok: false, reason: 'not_configured' }
  if (!to || !subject || !text) return { ok: false, reason: 'incomplete' }
  try {
    const transport = createTransport(config)
    await transport.sendMail({ from: config.from, to, subject, text, ...(html ? { html } : {}) })
    // The address is not logged. A log line is a copy of who is signing up,
    // kept somewhere with none of the protections the users table has.
    logger.info('[mail] sent a message')
    return { ok: true }
  } catch (error) {
    logger.error(`[mail] could not send: ${error.message}`)
    return { ok: false, reason: 'send_failed' }
  }
}

module.exports = { sendMail, isConfigured, readConfig, setTransportFactory }
