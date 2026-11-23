/**
 * `di name` — this install's network name, and its own certificate for it.
 *
 * Design: docs/ai/team-sync-by-network-name.md §4–§6, §9, §10. After `di login` the install CLAIMS a label at the name
 * broker (`<handle>-<4 chars>` under the zone), keeps an Ed25519 install key that signs every later call, and gets its
 * certificate for `<name>` and `*.<name>` from Let's Encrypt by ACME DNS-01 (RFC 8555 §8.4) — the broker only writes
 * the TXT record, on a signed request, under the caller's own label. The TLS key is made here and never leaves.
 *
 * Method: ACME (RFC 8555) through the `acme-client` package; Ed25519 signatures (RFC 8032) through node:crypto. The
 * signature input is `${method}\n${path}\n${ts}\n${sha256hex(body)}`, the broker's contract (PR 1).
 *
 * Nothing here reads `~/.di/tls/` or touches `http://diiii.localhost/`. The network, the clock and acme-client are
 * injected, so the tests run with a fake broker and a fake ACME client and never call a real one.
 */
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { paths } from './paths.mjs'
import { loginKeyFor, readLogin } from './loginStore.mjs'
import { forgetName, nameFiles, readCertInfo, readName, ensureAcmeAccountKey, ensureInstallKey, makeKeyPem, writeCert, writeName } from './nameStore.mjs'
import { readState, writeState } from './state.mjs'
import { DI_USER_AGENT } from './userAgent.mjs'

export const DEFAULT_BROKER = 'https://name.diiii.xyz'
export const LE_PRODUCTION = 'https://acme-v02.api.letsencrypt.org/directory'
export const LE_STAGING = 'https://acme-staging-v02.api.letsencrypt.org/directory'
export const RENEW_BELOW_DAYS = 30
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000
const BROKER_TIMEOUT_MS = 15000
const DAY_MS = 24 * 60 * 60 * 1000

export const brokerUrlFrom = (env = process.env, record = null) =>
    String(env.DI_NAME_BROKER || record?.brokerUrl || DEFAULT_BROKER).replace(/\/+$/, '')

// ── signing ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const sha256hex = (text) => crypto.createHash('sha256').update(text).digest('hex')

export const signingInput = ({ method, path: urlPath, ts, body = '' }) => `${method}\n${urlPath}\n${ts}\n${sha256hex(body)}`

export const signRequest = ({ method, path: urlPath, ts, body = '', privateKeyPem }) =>
    crypto.sign(null, Buffer.from(signingInput({ method, path: urlPath, ts, body })), crypto.createPrivateKey(privateKeyPem)).toString('base64url')

/** What the broker does with a signed call: true when `sig` was made by the key whose raw public half is `publicKey`. */
export const verifyRequest = ({ method, path: urlPath, ts, body = '', sig, publicKey }) => {
    const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' })
    return crypto.verify(null, Buffer.from(signingInput({ method, path: urlPath, ts, body })), key, Buffer.from(sig, 'base64url'))
}

// ── the broker ──────────────────────────────────────────────────────────────────────────────────────────────────
const brokerFail = (status, body, fallback) => {
    const error = new Error(`broker answered ${status}: ${body?.error || fallback}`)
    error.status = status
    return error
}

const send = async (d, url, init) => {
    let res
    try {
        res = await d.fetchImpl(url, { ...init, signal: AbortSignal.timeout(BROKER_TIMEOUT_MS), headers: { 'user-agent': DI_USER_AGENT, ...init.headers } })
    } catch (error) {
        throw new Error(`broker unreachable (${url}): ${error?.message || error}`, { cause: error })
    }
    let body = null
    try { body = res.status === 204 ? null : await res.json() } catch { /* an error page, not JSON */ }
    return { status: res.status, body }
}

/** One signed call under this install's label. 2xx → body; anything else throws with the broker's own words. */
export const signedCall = async (d, { label, privateKeyPem, brokerUrl, method, path: urlPath, payload }) => {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    const ts = String(Math.floor(d.now() / 1000))
    const sig = signRequest({ method, path: urlPath, ts, body, privateKeyPem })
    const res = await send(d, `${brokerUrl}${urlPath}`, {
        method,
        body: body || undefined,
        headers: { 'content-type': 'application/json', 'x-di-label': label, 'x-di-ts': ts, 'x-di-sig': sig }
    })
    if (res.status < 200 || res.status > 299) throw brokerFail(res.status, res.body, 'no reason given')
    return res.body
}

export const setTxt = (d, ctx, value) => signedCall(d, { ...ctx, method: 'PUT', path: `/v1/labels/${ctx.label}/txt`, payload: { name: '_acme-challenge', value } })
export const deleteTxt = (d, ctx) => signedCall(d, { ...ctx, method: 'DELETE', path: `/v1/labels/${ctx.label}/txt`, payload: { name: '_acme-challenge' } })

// ── claim ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** `Taron Aylmo` → `taron-aylmo`: a handle for a DNS label (Certificate Transparency publishes it, so a handle, never a full name). */
export const handleOf = (user) => String(user?.name || user?.id || '')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20)

export const claimName = async (d, { tier = 'dev', to = null } = {}) => {
    const key = loginKeyFor({ tier: to ? null : tier, to })
    const login = key ? readLogin({ home: d.loginHome, key }) : null
    if (!login) throw new Error(`not signed in — run: di login${key && key !== 'dev' ? ` --tier ${key}` : ''}`)
    const { publicKey } = await ensureInstallKey(d.home)
    const brokerUrl = brokerUrlFrom(d.env)
    const labelHint = handleOf(login.user)
    const res = await send(d, `${brokerUrl}/v1/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pubkey: publicKey, loginToken: login.token, ...(labelHint ? { labelHint } : {}) })
    })
    if (res.status === 409) throw new Error('this account already has 3 names — free one with the owner before claiming another')
    if (res.status !== 201 || !res.body?.label || !res.body?.name) throw brokerFail(res.status, res.body, 'no label in the answer')
    const record = { label: res.body.label, zone: res.body.zone, name: res.body.name, claimedAt: new Date(d.now()).toISOString(), brokerUrl }
    await writeName(d.home, record)
    return record
}

// ── certificate ─────────────────────────────────────────────────────────────────────────────────────────────────
/** acme-client lives in serverXR/node_modules (what an install runs `npm ci` for). From a checkout or from `cli/` of a pack. */
export const loadAcme = async () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const seen = []
    for (const manifest of [path.join(here, '..', 'serverXR', 'package.json'), path.join(here, '..', '..', 'serverXR', 'package.json')]) {
        try {
            const mod = createRequire(manifest)('acme-client')
            return mod.default || mod
        } catch (error) { seen.push(error) }
    }
    try {
        const mod = await import('acme-client')
        return mod.default || mod
    } catch (error) { seen.push(error) }
    const error = new Error('certificates are not installed in this copy of di (acme-client is missing) — run `di update`')
    error.code = 'ACME_NOT_INSTALLED'
    throw error
}

/**
 * Order the certificate for `<name>` and `*.<name>`. Both authorisations answer at `_acme-challenge.<name>`, and the broker
 * holds ONE value there, so the two run one after the other (a lock from create to remove).
 */
export const orderCertificate = async (d, record, { staging = false } = {}) => {
    const acme = await d.loadAcme()
    const { privateKeyPem } = await ensureInstallKey(d.home)
    const ctx = { label: record.label, privateKeyPem, brokerUrl: brokerUrlFrom(d.env, record) }
    const accountKey = await ensureAcmeAccountKey(d.home)
    const directoryUrl = d.env.DI_ACME_DIRECTORY || (staging ? LE_STAGING : LE_PRODUCTION)
    const keyPem = makeKeyPem('ec')
    const names = [record.name, `*.${record.name}`]
    const [, csr] = await acme.crypto.createCsr({ commonName: record.name, altNames: names }, keyPem)
    const client = new acme.Client({ directoryUrl, accountKey })

    let release = null
    let queue = Promise.resolve()
    const certPem = await client.auto({
        csr,
        termsOfServiceAgreed: true,
        challengePriority: ['dns-01'],
        challengeCreateFn: async (_authz, _challenge, keyAuthorization) => {
            let mine
            const turn = queue
            queue = new Promise((resolve) => { mine = resolve })
            await turn
            // Only the holder of the lock sets `release`, so the remove below frees the right turn.
            release = mine
            await setTxt(d, ctx, keyAuthorization)
        },
        challengeRemoveFn: async () => {
            try { await deleteTxt(d, ctx) } finally { release?.() }
        }
    })
    const certInfo = acme.crypto.readCertificateInfo(certPem)
    const info = {
        notAfter: new Date(certInfo.notAfter).toISOString(),
        issuedAt: new Date(d.now()).toISOString(),
        names
    }
    await writeCert(d.home, { keyPem, certPem, info })
    return info
}

export const daysLeft = (info, now = Date.now()) => (Date.parse(info.notAfter) - now) / DAY_MS

export const needsRenewal = (info, now = Date.now(), below = RENEW_BELOW_DAYS) => !info || daysLeft(info, now) < below

/** { outcome: 'none' | 'fresh' | 'renewed' | 'failed', info, error } — never throws. */
export const renewIfDue = async (d, { force = false, staging = false } = {}) => {
    const record = readName(d.home)
    if (!record) return { outcome: 'none' }
    const before = readCertInfo(d.home)
    if (!force && !needsRenewal(before, d.now())) return { outcome: 'fresh', info: before }
    try {
        return { outcome: 'renewed', info: await orderCertificate(d, record, { staging }) }
    } catch (error) {
        return { outcome: 'failed', info: before, error: String(error?.message || error) }
    }
}

// ── what the CLI says ───────────────────────────────────────────────────────────────────────────────────────────
const dateOf = (iso) => String(iso).slice(0, 10)

/** The line `di status` prints. Local files only — no network. */
export const statusLine = (home) => {
    const record = readName(home)
    if (!record) return 'name: none — run di name'
    const cert = readCertInfo(home)
    return cert
        ? `name: ${record.name} · certificate until ${dateOf(cert.notAfter)}`
        : `name: ${record.name} · no certificate yet — run di name`
}

export const logFile = (home) => path.join(paths(home).logs, 'name.log')

const logLine = async (home, line, now) => {
    try {
        await fsp.mkdir(paths(home).logs, { recursive: true })
        await fsp.appendFile(logFile(home), `${new Date(now).toISOString()} ${line}\n`)
    } catch { /* a log that cannot be written is not worth failing a start over */ }
}

/**
 * The no-hands renewal: `di up` calls it at start, and the install's daily timer (`di autoupdate run`) calls it on each tick.
 * Asked at most once a day (state.json lastNameCheck, written BEFORE the order like lastUpdateCheck), renews below 30 days,
 * writes ONE line to ~/.di/logs/name.log on a renewal or a failure, and never touches the running server or its address.
 */
export const maybeRenewName = async (d) => {
    if (!readName(d.home)) return { outcome: 'none' }
    const last = Date.parse(readState(d.home).lastNameCheck || '') || 0
    if (d.now() - last < CHECK_EVERY_MS) return { outcome: 'skipped' }
    await writeState(d.home, { lastNameCheck: new Date(d.now()).toISOString() })
    const result = await renewIfDue(d)
    if (result.outcome === 'renewed') await logLine(d.home, `renewed ${readName(d.home).name} until ${dateOf(result.info.notAfter)}`, d.now())
    if (result.outcome === 'failed') await logLine(d.home, `renewal failed: ${result.error} (certificate until ${result.info ? dateOf(result.info.notAfter) : 'none'})`, d.now())
    return result
}

export const nameUsage = () => [
    'di name                 claim this install\'s network name (after di login) and get its certificate',
    'di name --status        what this install has, from its own files',
    'di name --renew         renew the certificate now (it renews itself below 30 days)',
    'di name --forget        remove the local name files; the broker keeps the label until it is revoked',
    '  --staging             order from Let\'s Encrypt staging (a test certificate, no limits)',
    '  --tier dev|prod       which login proves who you are (default dev)',
    '',
    `  broker: ${DEFAULT_BROKER} (override: DI_NAME_BROKER). files: ~/.di/name/`
].join('\n')

const withDefaults = (deps = {}) => ({
    home: paths().home,
    loginHome: os.homedir(),
    env: process.env,
    fetchImpl: globalThis.fetch,
    loadAcme,
    now: Date.now,
    say: (text) => process.stdout.write(`${text}\n`),
    fail: (text) => process.stderr.write(`${text}\n`),
    ...deps
})

/** `di name [--status | --renew | --forget] [--staging] [--tier T]`. Returns the exit code. */
export const cmdName = async (args, deps) => {
    const d = withDefaults(deps)
    const flags = args?.flags || {}
    const staging = Boolean(flags.staging)

    if (flags.status) {
        d.say(statusLine(d.home))
        const record = readName(d.home)
        if (record) d.say(`  claimed ${dateOf(record.claimedAt)} at ${record.brokerUrl} · files ${nameFiles(d.home).dir}`)
        return 0
    }
    if (flags.forget) {
        const removed = await forgetName(d.home)
        d.say(removed.length
            ? `forgot this install's name locally (${removed.length} files removed). The broker keeps the label until it is revoked.`
            : 'nothing to forget — no name files here.')
        return 0
    }

    try {
        if (flags.renew) {
            if (!readName(d.home)) { d.fail('no name yet — run: di name'); return 1 }
            const before = readCertInfo(d.home)
            if (before && !needsRenewal(before, d.now())) {
                d.say(`certificate good until ${dateOf(before.notAfter)} (${Math.floor(daysLeft(before, d.now()))} days) — it renews below ${RENEW_BELOW_DAYS}. nothing changed.`)
                return 0
            }
            const result = await renewIfDue(d, { force: true, staging })
            if (result.outcome === 'failed') { d.fail(`renewal failed: ${result.error}\n  the old certificate is untouched.`); return 1 }
            d.say(`renewed — certificate until ${dateOf(result.info.notAfter)}`)
            return 0
        }

        let record = readName(d.home)
        if (!record) {
            record = await claimName(d, { tier: flags.tier || 'dev', to: flags.to || null })
            d.say(`claimed ${record.name}`)
        }
        const cert = readCertInfo(d.home)
        if (cert && !needsRenewal(cert, d.now())) {
            d.say(statusLine(d.home))
            return 0
        }
        d.say(`asking for a certificate for ${record.name} and *.${record.name} …`)
        const info = await orderCertificate(d, record, { staging })
        d.say(`${record.name} · certificate until ${dateOf(info.notAfter)}${staging ? ' (STAGING — not trusted by browsers)' : ''}`)
        return 0
    } catch (error) {
        d.fail(`name: ${String(error?.message || error)}`)
        return 1
    }
}

export const runName = async (args, extra = {}) => { process.exitCode = await cmdName(args, extra) }
