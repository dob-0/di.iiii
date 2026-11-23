// `di connect` · `di disconnect` — one sign-in, every space of the person on this machine.
// Method and wire format: docs/architecture/CLI_LOGIN.md, "Connecting a machine".
//
// The SAME machinery as `di login`: the OAuth 2.0 Device Authorization Grant, RFC 8628, with scope 'connect'.
// The terminal shows a short code; the person types it in a browser they are signed in with, ticks spaces and
// presses "Connect this machine"; the next poll hands over ONE editor sync key per ticked space, once.
// The terminal's own `dii_cli_` login is not used and cannot do this (cliTokenGate.js): the consent is the browser's.
//
// Each key then becomes a follow (`followSpace`, from now on). SAFETY: where a space of that name already exists
// here and holds a project the host lacks, that space is SKIPPED and reported — never merged, never overwritten.
// (The follower's own "this copy is ahead" check stays as the second lock for what a project list cannot show.)
//
// Keys live in memory and in follows.json (mode as before), never in argv, never printed, never logged.
// Everything that touches the world is injected, as in login.mjs.

import fs from 'node:fs'
import path from 'node:path'

import { writeFileAtomicSync } from './atomicWrite.mjs'
import { readFollows, removeFollow } from './follows.mjs'
import { ask, cleanText, hasDisplay, labelFor, nameOf, pollForToken, readGrant, refusal, resolveTarget, withDefaults } from './login.mjs'
import { paths } from './paths.mjs'
import { isTrustedCleartext } from './follow.mjs'
import { ui } from './ui.mjs'

const SPACE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const SYNC_KEY = /^dii_sync_\S{8,}$/

const readKeys = (body) => {
    if (body?.scope !== 'connect' || !Array.isArray(body.keys)) return null
    const keys = body.keys
        .filter((k) => k && typeof k.spaceId === 'string' && SPACE_ID.test(k.spaceId) && typeof k.key === 'string' && SYNC_KEY.test(k.key))
        .map((k) => ({ spaceId: k.spaceId, name: cleanText(k.name) || k.spaceId, key: k.key }))
    return { keys, user: body.user && typeof body.user === 'object' ? body.user : {} }
}

const connectFile = (home) => path.join(paths(home).data, 'connect.json')

/** What `di connect` did here, so `di disconnect` can undo exactly it. Holds no key: the keys are in follows.json. */
export const readConnected = (home) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(connectFile(home), 'utf8'))
        return parsed && Array.isArray(parsed.spaces) ? parsed : null
    } catch { return null }
}
const writeConnected = (home, record) => {
    fs.mkdirSync(paths(home).data, { recursive: true })
    writeFileAtomicSync(connectFile(home), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
}

// ── the safety check: what this machine holds that the host lacks ───────────

/** { exists, ids } — this install's projects in a space, from the running server or from its database. */
export const localProjects = async ({ home, spaceId, port, selfBase, adminToken, running }) => {
    if (running) {
        try {
            const res = await fetch(`${selfBase}/api/spaces/${encodeURIComponent(spaceId)}/projects`, { headers: adminToken ? { authorization: `Bearer ${adminToken}` } : {} })
            if (res.status === 404) return { exists: false, ids: [] }
            if (!res.ok) return { exists: true, ids: null }
            const body = await res.json()
            return { exists: true, ids: (body.projects || []).map((p) => String(p.id)) }
        } catch { return { exists: true, ids: null } }
    }
    const db = path.join(paths(home).data, 'di.db')
    if (!fs.existsSync(db)) return { exists: false, ids: [] }
    try {
        const { DatabaseSync } = await import('node:sqlite')
        const handle = new DatabaseSync(db, { readOnly: true })
        try {
            if (!handle.prepare('SELECT 1 FROM spaces WHERE id = ?').get(spaceId)) return { exists: false, ids: [] }
            return { exists: true, ids: handle.prepare('SELECT id FROM projects WHERE space_id = ?').all(spaceId).map((r) => String(r.id)) }
        } finally { handle.close() }
    } catch { return { exists: true, ids: null } }
}

export const hostProjects = async ({ base, spaceId, key }) => {
    try {
        const res = await fetch(`${base}/api/spaces/${encodeURIComponent(spaceId)}/projects`, { headers: { authorization: `Bearer ${key}` } })
        if (!res.ok) return null
        return ((await res.json()).projects || []).map((p) => String(p.id))
    } catch { return null }
}

// ── follow each key, with the safety check (shared by `di connect` and the stay-connected sync) ──

const followKeys = async (d, { site, base, keys }) => {
    const local = d.local || {}
    const followed = []
    const skipped = []
    for (const { spaceId, key } of keys) {
        const mine = await (local.projects || (async () => ({ exists: false, ids: [] })))(spaceId)
        let into = null
        if (mine.exists) {
            // A space of that name is here. Safe only when the host holds every project this copy holds.
            const theirs = await (d.hostProjects || (async () => null))({ base, spaceId, key })
            if (mine.ids === null || theirs === null) { skipped.push({ spaceId, why: 'could not compare this copy with the host' }); continue }
            const lacking = mine.ids.filter((id) => !theirs.includes(id))
            if (lacking.length) { skipped.push({ spaceId, work: lacking.length }); continue }
            into = spaceId
        }
        const out = await d.follow({ spaceId, key, from: site, into })
        if (out.ok) followed.push(spaceId)
        else skipped.push({ spaceId, why: out.reason === 'merge' ? 'a space of that name is here' : `refused (${out.reason})` })
    }
    return { followed, skipped }
}

const rememberConnected = (d, site, followed) => {
    const old = readConnected(d.home)
    const keep = (old?.remote === site ? old.spaces : []).filter((id) => !followed.includes(id))
    writeConnected(d.home, { remote: site, spaces: [...keep, ...followed], at: new Date(d.now()).toISOString() })
}

// ── di connect --sync: a connected machine stays connected ─────────────────

/**
 * Shows the host one of this machine's live connect keys and follows the spaces the person gained since.
 * Covered by the first consent; ended by `di disconnect` / the Disconnect button. Quiet when there is nothing new.
 * Returns { code, followed, skipped, said }: code 0 = fine or nothing connected here; 1 = the host refused or was unreachable.
 */
export const syncConnected = async (deps = {}, { quiet = false } = {}) => {
    const d = withDefaults(deps)
    const record = readConnected(d.home)
    if (!record || !record.spaces.length) return { code: 0, followed: [], skipped: [], said: false }
    const known = readFollows(paths(d.home).data)
    const site = record.remote
    const candidates = record.spaces.map((id) => known[id]).filter((f) => f && f.token && (f.remote === `${site}/serverXR` || f.remote === site))
    if (!candidates.length) { d.warn(ui.syncNoKey()); return { code: 1, followed: [], skipped: [], said: true } }
    let answer = null
    for (const follow of candidates) {
        answer = await ask(d, 'POST', `${follow.remote.replace(/\/+$/, '')}/api/auth/connect/sync`, { token: follow.token })
        if (answer.status === 200) break
    }
    if (answer?.status !== 200) {
        const host = new URL(site).host
        d.warn(ui.syncRefused(host, answer?.status || 0))
        return { code: 1, followed: [], skipped: [], said: true }
    }
    const got = readKeys(answer.body)
    const fresh = (got?.keys || []).filter((k) => !record.spaces.includes(k.spaceId))
    if (!fresh.length) { if (!quiet) d.say(ui.syncNothingNew()); return { code: 0, followed: [], skipped: [], said: !quiet } }
    const { followed, skipped } = await followKeys(d, { site, base: `${site}/serverXR`, keys: fresh })
    for (const id of followed) d.say(ui.connectFollowed(id))
    for (const s of skipped) d.say(s.work ? ui.connectSkippedWork(s.spaceId, s.work) : ui.connectSkippedWhy(s.spaceId, s.why))
    if (followed.length) rememberConnected(d, site, followed)
    return { code: 0, followed, skipped, said: true }
}

// ── di connect ─────────────────────────────────────────────────────────────

export const cmdConnect = async (args, deps = {}) => {
    const d = withDefaults(deps)
    const flags = { ...(args?.flags || {}) }
    if (flags.sync) return (await syncConnected(deps)).code
    if (Object.hasOwn(flags, 'from')) { flags.to = flags.from; delete flags.from }
    const target = resolveTarget(flags)
    if (target.error) { d.fail(target.error); return 1 }
    const { site, base, host } = target
    if (!flags.insecure && !isTrustedCleartext(site)) { d.fail(ui.loginCleartext(host)); return 1 }

    const started = await ask(d, 'POST', `${base}/api/auth/device/start`, { body: { scope: 'connect', label: labelFor({ flag: flags.label, hostname: d.hostname, version: d.version }) } })
    if (d.signal?.aborted) { d.say(ui.loginStopped()); return 130 }
    const refused = refusal(started, host, { site, wanted: [200, 201] })
    if (refused) { d.fail(refused); return 1 }
    const grant = readGrant(started.body)
    if (!grant) { d.fail(ui.loginOdd(host)); return 1 }

    // Only the bare address is opened for the person, never a link that carries the code (RFC 8628 §5.4).
    const address = `${site}${grant.verificationPath}`
    const opening = !flags['no-open'] && hasDisplay({ platform: d.platform, env: d.env })
    await d.say(ui.connectAsk({ host, address, code: grant.userCode, minutes: Math.max(1, Math.round(grant.expiresIn / 60)), opening }))
    if (opening) { try { d.open(address) } catch { /* the address is printed */ } }

    const result = await pollForToken(d, { base, host, grant, read: readKeys })
    if (!result.ok) {
        if (result.code === 130) d.say(result.message)
        else d.fail(result.message)
        return result.code
    }
    const { keys, user } = result.got
    const name = nameOf(user)
    if (!keys.length) { d.say(ui.connectNone(host)); return 0 }

    const { followed, skipped } = await followKeys(d, { site, base, keys })
    for (const id of followed) d.say(ui.connectFollowed(id))
    for (const s of skipped) d.say(s.work ? ui.connectSkippedWork(s.spaceId, s.work) : ui.connectSkippedWhy(s.spaceId, s.why))
    if (followed.length) rememberConnected(d, site, followed)
    d.say(ui.connectDone(host, name, followed.length, skipped.length))
    return followed.length || !skipped.length ? 0 : 1
}

// ── di disconnect ──────────────────────────────────────────────────────────

/** Stops every follow `di connect` made and ends its keys. Deletes no work: spaces and projects stay as they are. */
export const cmdDisconnect = async (args, deps = {}) => {
    const d = withDefaults(deps)
    const record = readConnected(d.home)
    if (!record || !record.spaces.length) { d.say(ui.disconnectNothing()); return 0 }
    const from = args?.flags?.from ? String(args.flags.from).replace(/\/+$/, '') : null
    if (from && from !== record.remote) { d.say(ui.disconnectNothing()); return 0 }
    const dataDir = paths(d.home).data
    let stopped = 0
    const kept = []
    for (const spaceId of record.spaces) {
        const follow = readFollows(dataDir)[spaceId]
        if (!follow || follow.remote !== `${record.remote}/serverXR` && follow.remote !== record.remote) { continue }
        const answer = await ask(d, 'POST', `${follow.remote.replace(/\/+$/, '')}/api/auth/connect/revoke`, { token: follow.token })
        // 200: ended now. 401: it was already dead. 404: not a connect key (made by hand since) — left exactly as it is.
        if (answer.status === 200 || answer.status === 401) {
            await removeFollow(dataDir, spaceId)
            stopped += 1
        } else if (answer.status === 404) kept.push(spaceId)
        else { d.fail(refusal(answer, new URL(record.remote).host, { wanted: [] }) || ui.loginOdd(new URL(record.remote).host)); kept.push(spaceId) }
    }
    writeConnected(d.home, { ...record, spaces: kept })
    d.say(ui.disconnectDone(stopped, kept.length))
    return 0
}
