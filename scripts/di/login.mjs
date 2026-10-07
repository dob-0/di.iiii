// `di login` · `di logout` · `di whoami` — the terminal half of
// docs/architecture/CLI_LOGIN.md (read it: the wire format is there).
//
// The method is the OAuth 2.0 Device Authorization Grant, RFC 8628, the flow
// `gh auth login` and `az login` use: the terminal shows a short code, the
// person types it in a browser they are already signed in with, the terminal
// polls until it is told yes, no, or too late. What is written here is the
// polling rules of RFC 8628 §3.5 (wait `interval`; `slow_down` adds to it;
// `authorization_pending` goes on; `access_denied` and `expired_token` stop) and
// the two cautions of §5: the code is TYPED by the person (nothing here puts it
// in a link — §5.4, remote phishing) and the token is never printed.
//
// Everything that touches the world is injected (`deps`), so the whole flow
// runs in a test with no network, no clock, no terminal and no browser:
//   { fetch, sleep, now, say, fail, warn, open, home, env, hostname, version, platform, signal }
// The functions return the exit code (0, 1, or 130 for Ctrl-C); the `run*`
// wrappers at the bottom are what cli.mjs registers: real deps, real exit code.
//
// What this file never does: print the token (not even part of it), put it in
// an argument or an error message, or write anything when the person stops.

import { spawn } from 'node:child_process'
import os from 'node:os'
import process from 'node:process'

import { isTrustedCleartext } from './follow.mjs'
import { SITES, loginKeyFor, originOf, readLogin, removeLogin, tierOfOrigin, writeLogin } from './loginStore.mjs'
import { fail as printFail, ui, warn as printWarn } from './ui.mjs'

const REQUEST_MS = 15_000
const GIVE_UP_AFTER = 5
const DEFAULT_INTERVAL_S = 5
const DEFAULT_EXPIRES_S = 600

// ── small pure helpers ────────────────────────────────────────────────────

/** Text another machine sent, made safe to print and to store: no control or format characters (escape sequences, bidi overrides), one line, cut. */
export const cleanText = (value, max = 80) => Array.from(
    String(value ?? '')
        .replace(/[\t\n\r]+/g, ' ')
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
        .trim()
).slice(0, max).join('')

export const defaultLabel = ({ hostname, version }) => cleanText(`${hostname || 'this machine'} (di${version ? ` ${version}` : ''})`)

/** `--label` if it says anything once cleaned, else `<hostname> (di <version>)`. */
export const labelFor = ({ flag, hostname, version }) => cleanText(flag === true ? '' : flag) || defaultLabel({ hostname, version })

/**
 * Can a browser be opened FOR the person from here? Linux wants a display
 * (X11 `DISPLAY`, Wayland `WAYLAND_DISPLAY`); macOS and Windows always have
 * one. Over ssh (OpenSSH sets SSH_CONNECTION, SSH_CLIENT and SSH_TTY — ssh(1),
 * ENVIRONMENT) a browser opened here would open on the wrong machine, so no.
 * Either way the address is printed; this only decides whether we also try.
 */
export const hasDisplay = ({ platform = process.platform, env = process.env } = {}) => {
    if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return false
    if (platform === 'win32' || platform === 'darwin') return true
    return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY)
}

/**
 * Open an address in the person's browser. A machine with a display but no
 * opener (no xdg-open) reports that as an 'error' event on the child, and an
 * event nobody listens to is a crash — which would kill a login whose address
 * is already on the screen. So it is listened to, and ignored.
 */
export const openInBrowser = (url, { platform = process.platform, spawnImpl = spawn } = {}) => {
    const [command, args] = platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
    try {
        const child = spawnImpl(command, args, { stdio: 'ignore', detached: true })
        child.on('error', () => {})
        child.unref()
    } catch {
        // the address is already printed
    }
}

const sleepFor = (ms, signal) => new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return }
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
})

const withDefaults = (deps = {}) => ({
    fetch: (...parameters) => globalThis.fetch(...parameters),
    sleep: sleepFor,
    now: () => Date.now(),
    // Awaited for the prompt: an agent reading this terminal must have the
    // address and the code before the first poll, so the write is flushed.
    say: (text) => new Promise((resolve) => { process.stdout.write(`${text}\n`, () => resolve()) }),
    fail: printFail,
    warn: printWarn,
    open: openInBrowser,
    home: os.homedir(),
    env: process.env,
    hostname: os.hostname(),
    version: null,
    platform: process.platform,
    signal: null,
    ...deps
})

/** Which host, which key, which API base — from `--tier` / `--to`; the default is dev, the team's hub. */
export const resolveTarget = (flags = {}) => {
    const tierGiven = Object.hasOwn(flags, 'tier')
    const toGiven = Object.hasOwn(flags, 'to')
    if (tierGiven && toGiven) return { error: ui.loginTargetBoth() }
    if (toGiven) {
        const site = originOf(flags.to)
        if (!site) return { error: ui.loginBadAddress(flags.to) }
        return { site, base: `${site}/serverXR`, key: loginKeyFor({ to: site }), host: new URL(site).host }
    }
    const tier = tierGiven ? flags.tier : 'dev'
    if (tier === 'staging') return { error: '"staging" is now "dev"' }
    if (!tier || !Object.hasOwn(SITES, tier)) return { error: ui.loginBadTier(tier) }
    const site = SITES[tier]
    return { site, base: `${site}/serverXR`, key: tier, host: new URL(site).host }
}

const dateOf = (value) => {
    const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
    const ms = typeof number === 'number' ? (number < 1e11 ? number * 1000 : number) : Date.parse(String(number ?? ''))
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null
}

const nameOf = (user) => cleanText(user?.name) || cleanText(user?.id) || 'your account'

const envWins = (env) => (String(env?.DI_TOKEN || '').trim() ? ui.loginEnvWins() : null)

// ── one request ───────────────────────────────────────────────────────────

/** Never throws: `{ down: true }` for a network error or a timeout, else `{ status, body, retryAfter, location }`. */
const ask = async (d, method, url, { body = null, token = null } = {}) => {
    const headers = { accept: 'application/json' }
    if (body) headers['content-type'] = 'application/json'
    // The token goes in the header and nowhere else.
    if (token) headers.authorization = `Bearer ${token}`
    const signals = [AbortSignal.timeout(REQUEST_MS)]
    if (d.signal) signals.push(d.signal)
    let response
    try {
        // `manual`: a redirect is never followed, so a token is never sent on to a host the person did not name.
        response = await d.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.any(signals) })
    } catch {
        return { down: true }
    }
    let parsed = {}
    try {
        const text = await response.text()
        parsed = text ? JSON.parse(text) : {}
    } catch { /* an answer that is not JSON is an answer with no fields */ }
    if (!parsed || typeof parsed !== 'object') parsed = {}
    return {
        status: response.status,
        body: parsed,
        retryAfter: Number(response.headers?.get?.('retry-after')) || 0,
        location: cleanText(response.headers?.get?.('location') || '', 120)
    }
}

const errorCode = (answer) => (typeof answer.body?.error === 'string' ? cleanText(answer.body.error, 40) : '')

/** Why a request that was not an answer we can use is not one, in words. Null if it is fine. */
const refusal = (answer, host, { site, wanted = [200] } = {}) => {
    if (answer.down) return ui.loginDown(host, 1)
    if (answer.status >= 300 && answer.status < 400) return ui.loginRedirected(host, answer.location)
    if (answer.status === 404 && errorCode(answer) === 'login_not_available') return ui.loginNoAccounts()
    if (answer.status === 404) return ui.loginNotHere(host, site)
    if (answer.status === 429) return ui.loginRateLimited()
    if (!wanted.includes(answer.status)) return ui.loginRefused(host, answer.status, errorCode(answer))
    return null
}

// ── di login ──────────────────────────────────────────────────────────────

const clampedSeconds = (value, fallback, min, max) => (Number.isFinite(value) && value > 0 ? Math.min(max, Math.max(min, value)) : fallback)

const readGrant = (body) => {
    const deviceCode = typeof body.deviceCode === 'string' ? body.deviceCode : ''
    const userCode = typeof body.userCode === 'string' ? body.userCode.trim() : ''
    if (!/^\S{8,}$/.test(deviceCode) || !/^[A-Za-z0-9-]{4,24}$/.test(userCode)) return null
    return {
        deviceCode,
        userCode,
        verificationPath: typeof body.verificationPath === 'string' && /^\/[\w./-]*$/.test(body.verificationPath) ? body.verificationPath : '/device',
        expiresIn: clampedSeconds(body.expiresIn, DEFAULT_EXPIRES_S, 1, 3600),
        interval: clampedSeconds(body.interval, DEFAULT_INTERVAL_S, 1, 60)
    }
}

const readToken = (body) => {
    const token = typeof body.token === 'string' ? body.token : ''
    if (!/^dii_cli_\S{8,}$/.test(token)) return null
    return { token, user: body.user && typeof body.user === 'object' ? body.user : {}, expiresAt: body.expiresAt ?? null }
}

/** Poll until yes, no, or too late. `{ ok, grant }` or `{ code, message }`. */
const pollForToken = async (d, { base, host, grant }) => {
    const deadline = d.now() + grant.expiresIn * 1000
    let waitS = grant.interval
    let downInARow = 0
    for (;;) {
        await d.sleep(waitS * 1000, d.signal)
        if (d.signal?.aborted) return { code: 130, message: ui.loginStopped() }
        // Our own clock too: the server's `expiresIn` is a promise, not the only way out.
        if (d.now() >= deadline) return { code: 1, message: ui.loginRanOut() }
        const answer = await ask(d, 'POST', `${base}/api/auth/device/token`, { body: { deviceCode: grant.deviceCode } })
        if (d.signal?.aborted) return { code: 130, message: ui.loginStopped() }

        // A network error, a timeout or a 5xx is not a refusal: same wait, again.
        if (answer.down || answer.status >= 500) {
            downInARow += 1
            if (downInARow >= GIVE_UP_AFTER) return { code: 1, message: ui.loginDown(host, GIVE_UP_AFTER) }
            continue
        }
        downInARow = 0
        if (answer.status === 429) { waitS = Math.max(waitS + 5, answer.retryAfter); continue }
        if (answer.status === 200) {
            const got = readToken(answer.body)
            return got ? { ok: true, got } : { code: 1, message: ui.loginOdd(host) }
        }
        const code = errorCode(answer)
        if (answer.status === 404 && code === 'login_not_available') return { code: 1, message: ui.loginNoAccounts() }
        if (code === 'authorization_pending') continue
        if (code === 'slow_down') {
            // RFC 8628 §3.5: slower, for this and every later request. The server says how much; if it does not, five seconds.
            const sent = Number(answer.body.interval)
            waitS = Number.isFinite(sent) && sent > 0 ? Math.min(60, Math.max(waitS, sent)) : waitS + 5
            continue
        }
        if (code === 'access_denied') return { code: 1, message: ui.loginDenied() }
        if (code === 'expired_token') return { code: 1, message: ui.loginRanOut() }
        return { code: 1, message: refusal(answer, host, { wanted: [] }) }
    }
}

export const cmdLogin = async (args, deps) => {
    const d = withDefaults(deps)
    const flags = args?.flags || {}
    const target = resolveTarget(flags)
    if (target.error) { d.fail(target.error); return 1 }
    const { site, base, key, host } = target
    // RFC 6749 §3.2 asks for TLS on the token endpoint. The same rule `di follow` keeps for its keys: https, or a
    // machine that is yours (loopback, .local, a private or Tailscale address); anything else needs --insecure.
    if (!flags.insecure && !isTrustedCleartext(site)) { d.fail(ui.loginCleartext(host)); return 1 }

    const stored = readLogin({ home: d.home, key })
    if (stored && !flags.force) {
        const check = await ask(d, 'GET', `${base}/api/auth/cli/whoami`, { token: stored.token })
        if (check.status === 200 && check.body.user) {
            d.say(ui.loginAlready(host, nameOf(check.body.user)))
            const note = envWins(d.env)
            if (note) d.say(note)
            return 0
        }
        if (check.status === 401) d.say(ui.loginEnded(host))
        // Anything else (the host is down, an older server): go on. The start below says why, if it is real.
    }

    const started = await ask(d, 'POST', `${base}/api/auth/device/start`, { body: { label: labelFor({ flag: flags.label, hostname: d.hostname, version: d.version }) } })
    if (d.signal?.aborted) { d.say(ui.loginStopped()); return 130 }
    const refused = refusal(started, host, { site, wanted: [200, 201] })
    if (refused) { d.fail(refused); return 1 }
    const grant = readGrant(started.body)
    if (!grant) { d.fail(ui.loginOdd(host)); return 1 }

    // The address and the code, on the screen BEFORE the first poll. Only the bare address is ever opened for the
    // person: a link that carried the code would be the one-click approval RFC 8628 §5.4 warns about.
    const address = `${site}${grant.verificationPath}`
    const opening = !flags['no-open'] && hasDisplay({ platform: d.platform, env: d.env })
    await d.say(ui.loginAsk({ host, address, code: grant.userCode, minutes: Math.max(1, Math.round(grant.expiresIn / 60)), opening }))
    if (opening) { try { d.open(address) } catch { /* the address is printed */ } }

    const result = await pollForToken(d, { base, host, grant })
    if (!result.ok) {
        if (result.code === 130) d.say(result.message)
        else d.fail(result.message)
        return result.code
    }

    const { got } = result
    const user = { id: got.user.id ?? null, name: nameOf(got.user) }
    try {
        writeLogin({ home: d.home, key, now: d.now, entry: { token: got.token, base, site, user, expiresAt: got.expiresAt, savedAt: new Date(d.now()).toISOString() } })
    } catch (error) {
        // The code is spent: there is nothing to retry, only to say. The reason is the system's word (EACCES…), never the token.
        d.fail(ui.loginNotSaved(host, cleanText(error?.code || 'unknown error', 40)))
        return 1
    }
    await d.say(ui.loginDone(host, user.name))
    const note = envWins(d.env)
    if (note) d.say(note)
    return 0
}

// ── di whoami ─────────────────────────────────────────────────────────────

export const cmdWhoami = async (args, deps) => {
    const d = withDefaults(deps)
    const target = resolveTarget(args?.flags || {})
    if (target.error) { d.fail(target.error); return 1 }
    const { site, base, key, host } = target
    const note = envWins(d.env)
    const stored = readLogin({ home: d.home, key })
    if (!stored) {
        d.say(ui.whoamiNone(host, ui.loginAgain(target)))
        if (note) d.say(note)
        return 1
    }
    const answer = await ask(d, 'GET', `${base}/api/auth/cli/whoami`, { token: stored.token })
    if (answer.status === 401) {
        d.say(ui.whoamiEnded(host, ui.loginAgain(target)))
        if (note) d.say(note)
        return 1
    }
    const refused = refusal(answer, host, { site })
    if (refused) { d.fail(answer.down ? ui.whoamiDown(host) : refused); return 1 }
    if (!answer.body.user) { d.fail(ui.loginOdd(host)); return 1 }
    d.say(ui.whoamiIs({
        host,
        name: nameOf(answer.body.user),
        label: cleanText(answer.body.token?.label),
        ends: dateOf(answer.body.token?.expiresAt ?? stored.expiresAt)
    }))
    if (note) d.say(note)
    return 0
}

// ── di logout ─────────────────────────────────────────────────────────────

export const cmdLogout = async (args, deps) => {
    const d = withDefaults(deps)
    const target = resolveTarget(args?.flags || {})
    if (target.error) { d.fail(target.error); return 1 }
    const { base, key, host, site } = target
    const stored = readLogin({ home: d.home, key })
    if (!stored) { d.say(ui.logoutNone(host)); return 0 }

    // Best effort: end it on the host first, but the local entry goes either way — it is what this machine holds.
    const answer = await ask(d, 'DELETE', `${base}/api/auth/cli/token`, { token: stored.token })
    let told
    if (answer.status === 200) told = 'ended'
    else if (answer.status === 401) told = 'already'
    else told = 'no'
    try {
        removeLogin({ home: d.home, key, now: d.now })
    } catch (error) {
        d.fail(ui.logoutNotRemoved(host, cleanText(error?.code || 'unknown error', 40)))
        return 1
    }
    if (told === 'ended') d.say(ui.logoutDone(host))
    else if (told === 'already') d.say(ui.logoutAlready(host))
    else d.warn(ui.logoutNotTold(host, `${site}/device`))
    const note = envWins(d.env)
    if (note) d.say(note)
    return 0
}

// ── what the other commands take from the store ───────────────────────────

/**
 * The argv `di mcp` hands the SDK entry (sdk/mcp.mjs). With no flag it is
 * what it has always been: this machine's own di.iiii, on its port. `--tier`
 * and `--base` are passed through. The token is NOT: it is read by the SDK
 * itself (DI_TOKEN, the tier's variable, then the file `di login` wrote), so it
 * never appears in an argument or in a process list.
 */
export const mcpArgs = ({ flags = {}, port } = {}) => {
    const tier = typeof flags.tier === 'string' && flags.tier ? flags.tier : null
    let base = typeof flags.base === 'string' && flags.base ? flags.base : null
    if (!tier && !base) return ['--base', `http://localhost:${port}/serverXR`]
    // A base that is one of ours is that tier: its token, its site. (The entry's own default would call it `local`.)
    const derived = !tier && base ? tierOfOrigin(originOf(base)) : null
    // `--tier local` has always had a port of its own on `di mcp`.
    if (tier === 'local' && !base) base = `http://localhost:${port}/serverXR`
    const argv = []
    if (tier || derived) argv.push('--tier', tier || derived)
    if (base) argv.push('--base', base)
    return argv
}

/** The token `di move --from URL` sends: DI_TOKEN as before, else the login `di login` stored for that very origin. '' when there is none. */
export const moveToken = ({ from, env = process.env, home = os.homedir() } = {}) => {
    const given = String(env.DI_TOKEN || '').trim()
    if (given) return given
    const key = loginKeyFor({ to: from })
    return (key && readLogin({ home, key })?.token) || ''
}

// ── what cli.mjs registers ────────────────────────────────────────────────

export const runLogin = async (args, extra = {}) => {
    // Ctrl-C stops the wait and writes nothing; a second one is the default (kill).
    const controller = new AbortController()
    const stop = () => controller.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
        process.exitCode = await cmdLogin(args, { ...extra, signal: controller.signal })
    } finally {
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)
    }
}

export const runLogout = async (args, extra = {}) => { process.exitCode = await cmdLogout(args, extra) }
export const runWhoami = async (args, extra = {}) => { process.exitCode = await cmdWhoami(args, extra) }
