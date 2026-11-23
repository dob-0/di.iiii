'use strict'

// The show status (2026-11-01; gaps G04, G11, G25 of the show-day audit, plan slice S11): what the stage machine says about
// the running show, as one JSON document. GET /show-status serves it (routes/showStatusRoutes.js), the Show desk's status
// line reads it, and a pusher sends it to the di.bo door every 30 s and on every change — off unless
// DI_SHOW_STATUS_PUSH_URL is set (the door's POST /show/status, with a show:push token in DI_SHOW_STATUS_PUSH_TOKEN).
// The door takes only its own schema v1 (S06), so the push sends toDoorV1(document), never the document itself; the
// door also needs the production's title (DI_SHOW_PRODUCTION) and refuses a status without one.
//
// Two clocks (RESEARCH-speed-assistant, gap 7; the healthchecks.io model of period + grace): `changed_at` moves only when
// a state field changes, so a card built from it is edited only on a change; `sent_at` moves on every send, and the
// door calls the stage lost after `period_s + grace_s` without one. 30 s + 60 s is the starting value, to be tuned.
//
// Read only. It reads the lighting desk and the laser engine only when they are already built (it never builds one), and
// the stage watch's latest.json (scripts/stage/watch). Fields another slice adds plug in by setProvider(): 'laserSafety'
// (S12: the laser's safety state in one place) and 'controller' (S14: MIDI heard). No production name anywhere.

const fs = require('fs')
const os = require('os')
const path = require('path')

const SCHEMA = 'di.show-status/1'
const PERIOD_S = 30
const GRACE_S = 60
const WATCH_STALE_S = 15 // three ticks of the watch
const LINK_STALE_S = 180 // three link lines
const DEFAULT_WATCH_LATEST = '/run/di-stage-watch/latest.json'
const STATES = { watch: ['ok', 'warn', 'alert', 'stale', 'off'], link: ['ok', 'degraded', 'lost', 'unknown'], heat: ['ok', 'warm', 'hot', 'unknown'] }

const iso = (ms) => new Date(ms).toISOString()
const ageS = (at, nowMs) => { const t = Date.parse(at || ''); return Number.isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 1000)) : null }

function readWatch(file, nowMs) {
    let d
    try { d = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return { state: 'off', at: null, age_s: null, alerts: [], usb_mode: null, latest: null } }
    const age = ageS(d.at, nowMs)
    const stale = age === null || age > WATCH_STALE_S
    const alerts = !stale && Array.isArray(d.alerts) ? d.alerts.slice(0, 5).map((a) => ({ key: String(a.key || ''), level: a.level === 'alert' ? 'alert' : 'warn', text: String(a.text || '') })) : []
    return { state: stale ? 'stale' : (STATES.watch.includes(d.state) ? d.state : 'ok'), at: d.at || null, age_s: age, alerts, usb_mode: d.usb?.mode || null, latest: d }
}

function heatOf(w) {
    const h = w.latest?.heat
    if (!h || w.state === 'off' || w.state === 'stale' || !Number.isFinite(h.maxC)) return { state: 'unknown', max_c: null, crit_c: null }
    const a = w.alerts.find((x) => x.key === 'heat')
    return { state: a ? (a.level === 'alert' ? 'hot' : 'warm') : 'ok', max_c: h.maxC, crit_c: Number.isFinite(h.critC) ? h.critC : null }
}

function linkOf(w, nowMs) {
    const l = w.latest?.link
    if (!l || w.state === 'off') return { state: 'unknown', at: null }
    const age = ageS(l.at, nowMs)
    const p = l.tailscale?.peer
    return {
        state: age === null || age > LINK_STALE_S ? 'unknown' : (STATES.link.includes(l.state) ? l.state : 'unknown'),
        at: l.at || null,
        gateway_ms: Number.isFinite(l.gatewayMs) ? l.gatewayMs : null,
        dns_ok: typeof l.dnsOk === 'boolean' ? l.dnsOk : null,
        tailscale: l.tailscale ? (p ? p.mode : (l.tailscale.state || null)) : null,
        handshake_age_s: p && Number.isFinite(p.handshakeAgeS) ? p.handshakeAgeS : null
    }
}

function lightOf(lighting) {
    try {
        if (!lighting || !lighting.hasDesk()) return { seen: false, scene: null, scene_id: null, blackout: null }
        const s = lighting.getDesk().summary()
        return { seen: true, scene: s.activeSceneName || s.activeScene || null, scene_id: s.activeScene || null, blackout: Boolean(s.blackout) }
    } catch { return { seen: false, scene: null, scene_id: null, blackout: null } }
}

function laserOf(lasers, safety) {
    let out = { seen: false, armed: null, sim: null, cubes: 0, connected: 0, stop_reason: null, stops_total: null }
    try {
        if (lasers && lasers.hasEngine()) {
            const st = lasers.getEngine().state()
            const cubes = Array.isArray(st.cubes) ? st.cubes : []
            const stopped = cubes.find((c) => c.stop)
            const stops = cubes.reduce((a, c) => a + Object.values(c.stops || {}).reduce((x, v) => x + (Number.isFinite(v) ? v : 0), 0), 0)
            out = {
                seen: true, armed: Boolean(st.armed) && cubes.some((c) => c.armed), sim: Boolean(st.sim), cubes: cubes.length,
                connected: cubes.filter((c) => c.connected).length,
                stop_reason: stopped ? String(stopped.stop.text || stopped.stop.reason || 'stopped') : null,
                stops_total: stops
            }
        }
    } catch { /* the engine answered nothing usable: seen stays false */ }
    if (safety && typeof safety === 'object') {
        out.safety = safety // S12's fields, as S12 states them
        if (typeof safety.armed === 'boolean') out.armed = safety.armed
        if (typeof safety.stopReason === 'string' || safety.stopReason === null) out.stop_reason = safety.stopReason ?? out.stop_reason
    }
    return out
}

function controllerOf(c) {
    if (!c || typeof c !== 'object') return { seen: null, heard_at: null, name: null, wired: false }
    return { seen: typeof c.seen === 'boolean' ? c.seen : null, heard_at: c.heardAt || c.heard_at || null, name: c.name || null, wired: true }
}

// The fields whose change moves changed_at (the card is edited only when one of them changes).
const stateKey = (d) => JSON.stringify([d.light.scene, d.light.blackout, d.laser.armed, d.laser.stop_reason, d.controller.seen, d.link.state, d.heat.state, d.watch.state, d.watch.alerts.map((a) => a.key + a.level)])
const KEY_NAMES = ['light.scene', 'light.blackout', 'laser.armed', 'laser.stop_reason', 'controller.seen', 'link.state', 'heat.state', 'watch.state', 'watch.alerts']

// The di.bo door's status push, schema v1 (S06: the crew-feed doc in the di-bo repo, section "The status push, schema v1";
// its reader is lib/card.mjs validateStatus there). No docs path is written for that file: it is not in this repo, and
// src/docPaths.test.js resolves every docs path in source against this one. A safety fact is never filled in: no laser
// block, or an armed state nobody read, is "unknown", never "disarmed". A controller or a link nobody knows is null (the
// door reads {seen:null} as "not seen").
const DOOR_LASER_STATES = ['armed', 'disarmed', 'stopped', 'unknown']
function toDoorV1(d, { production = null } = {}) {
    const z = d.laser || {}
    const state = !z.seen ? 'unknown' : z.stop_reason ? 'stopped' : z.armed === true ? 'armed' : z.armed === false ? 'disarmed' : 'unknown'
    const k = d.link || {}
    const linkKnown = ['ok', 'degraded', 'lost'].includes(k.state)
    return {
        v: 1,
        production,
        t: d.sent_at,
        light: d.light && d.light.seen ? { scene: d.light.scene ?? null } : null,
        laser: { state, stop_reason: state === 'stopped' ? String(z.stop_reason) : null },
        controller: d.controller && d.controller.wired && typeof d.controller.seen === 'boolean' ? { seen: d.controller.seen } : null,
        link: linkKnown ? { up: k.state !== 'lost', kind: k.state === 'lost' ? null : k.tailscale === 'direct' ? 'direct' : k.tailscale === 'derp' ? 'relay' : null } : null,
        heat: d.heat && Number.isFinite(d.heat.max_c) ? { c: d.heat.max_c } : null,
        changed_at: d.changed_at || null,
        human: null
    }
}

// The door's v1 rules as S06's validateStatus states them, a little stricter (an object never carries a null it would
// misread), so this side cannot drift from the door. Returns the problems; [] means the door takes it.
function validateDoorV1(b, { now = Date.now(), maxSkewMs = 10 * 60000 } = {}) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return ['not an object']
    const p = []
    const need = (cond, msg) => { if (!cond) p.push(msg) }
    const isoMs = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)
    const obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    need(b.v === 1, 'v is 1')
    const t = isoMs(b.t)
    need(t !== null && Math.abs(now - t) <= maxSkewMs, 't: an ISO time within 10 min of the door clock')
    const pr = b.production
    need((typeof pr === 'string' && pr.trim() !== '') || (obj(pr) && String(pr.title || pr.id || '').trim() !== ''), 'production (a title)')
    need(b.light === null || (obj(b.light) && (b.light.scene === null || typeof b.light.scene === 'string')), 'light: {scene} or null')
    need(obj(b.laser) && DOOR_LASER_STATES.includes(b.laser.state) && (b.laser.stop_reason === null || typeof b.laser.stop_reason === 'string'), 'laser: {state, stop_reason}')
    need(b.controller === null || (obj(b.controller) && typeof b.controller.seen === 'boolean'), 'controller: {seen} or null')
    need(b.link === null || (obj(b.link) && typeof b.link.up === 'boolean' && [null, 'direct', 'relay'].includes(b.link.kind)), 'link: {up, kind} or null')
    need(b.heat === null || (obj(b.heat) && Number.isFinite(b.heat.c)), 'heat: {c} or null')
    need(b.changed_at === null || isoMs(b.changed_at) !== null, 'changed_at')
    need(b.human === null || obj(b.human), 'human')
    return p
}

function createShowStatus({ lighting = null, lasers = null, watchFile = process.env.DI_STAGE_WATCH_LATEST || DEFAULT_WATCH_LATEST, now = () => Date.now(), hostname = os.hostname(), log = () => {} } = {}) {
    const providers = {}
    let prev = null; let changedAt = null; let lastChange = null; let seq = 0
    const push = { enabled: false, last_ok_at: null, failures: 0, last_error: null }

    function build() {
        const t = now()
        const call = (name) => { try { return providers[name] ? providers[name]() : null } catch { return null } }
        const w = readWatch(watchFile, t)
        const doc = {
            schema: SCHEMA, machine: hostname, seq: ++seq, sent_at: iso(t), changed_at: null, period_s: PERIOD_S, grace_s: GRACE_S,
            light: lightOf(lighting),
            laser: laserOf(lasers, call('laserSafety')),
            controller: controllerOf(call('controller')),
            link: linkOf(w, t),
            heat: heatOf(w),
            watch: { state: w.state, at: w.at, age_s: w.age_s, alerts: w.alerts, usb_mode: w.usb_mode },
            last_change: null,
            push: { ...push }
        }
        const key = stateKey(doc)
        if (prev === null || key !== prev.key) {
            const was = prev ? JSON.parse(prev.key) : null
            const now_ = JSON.parse(key)
            const what = was ? KEY_NAMES.filter((_, i) => JSON.stringify(was[i]) !== JSON.stringify(now_[i])) : ['start']
            changedAt = iso(t); lastChange = { at: changedAt, what }
            prev = { key }
        }
        doc.changed_at = changedAt
        doc.last_change = lastChange
        return doc
    }

    let timer = null; let lastPushedChange = null; let lastPushAt = 0; let inFlight = false
    function startPush({ url = process.env.DI_SHOW_STATUS_PUSH_URL, token = process.env.DI_SHOW_STATUS_PUSH_TOKEN, file = process.env.DI_SHOW_STATUS_FILE, production = process.env.DI_SHOW_PRODUCTION || null, everyMs = 5000, fetchImpl = globalThis.fetch } = {}) {
        if (timer || (!url && !file)) return { enabled: Boolean(timer) }
        push.enabled = Boolean(url)
        const once = async () => {
            if (inFlight) return
            inFlight = true
            try {
                const doc = build()
                if (file) {
                    try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(doc)); fs.renameSync(tmp, file) } catch (e) { log(`show-status: file ${file}: ${e.code || e.message}`) }
                }
                if (!url) return
                const due = doc.changed_at !== lastPushedChange || now() - lastPushAt >= PERIOD_S * 1000
                if (!due) return
                if (!production) {
                    push.failures += 1; push.last_error = 'no production (DI_SHOW_PRODUCTION)'
                    if (push.failures === 1) log('show-status: the door needs the production\'s title (DI_SHOW_PRODUCTION); nothing is sent until it is set')
                    return
                }
                const headers = { 'content-type': 'application/json', 'idempotency-key': `${doc.machine}:${doc.seq}` }
                if (token) headers.authorization = `Bearer ${token}`
                try {
                    const r = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(toDoorV1(doc, { production })), signal: AbortSignal.timeout(5000) })
                    if (!r.ok) throw Object.assign(new Error(`refused (${r.status})`), { code: `HTTP ${r.status}` })
                    if (push.failures) log(`show-status: the door answers again after ${push.failures} failed sends`)
                    lastPushedChange = doc.changed_at; lastPushAt = now(); push.last_ok_at = iso(lastPushAt); push.failures = 0; push.last_error = null
                } catch (e) {
                    push.failures += 1; push.last_error = String(e.code || e.name || 'error')
                    if (push.failures === 1) log(`show-status: the door did not take the status (${push.last_error}); retrying every ${everyMs / 1000} s`)
                }
            } finally { inFlight = false }
        }
        timer = setInterval(once, everyMs)
        if (timer.unref) timer.unref()
        once()
        return { enabled: true, once }
    }
    function stopPush() { if (timer) clearInterval(timer); timer = null }
    function setProvider(name, fn) { if (typeof fn === 'function') providers[name] = fn; else delete providers[name] }
    return { build, startPush, stopPush, setProvider, _push: push }
}

// The document's shape, as code (S06's card and the tests check against it). Returns the problems; [] means valid.
function validateShowStatus(d) {
    const p = []
    const need = (cond, msg) => { if (!cond) p.push(msg) }
    const isIso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v))
    const nOrNull = (v) => v === null || Number.isFinite(v)
    const bOrNull = (v) => v === null || typeof v === 'boolean'
    const sOrNull = (v) => v === null || typeof v === 'string'
    need(d && typeof d === 'object', 'not an object')
    if (!d || typeof d !== 'object') return p
    need(d.schema === SCHEMA, `schema is ${SCHEMA}`)
    need(typeof d.machine === 'string' && d.machine.length > 0, 'machine')
    need(Number.isInteger(d.seq) && d.seq > 0, 'seq')
    need(isIso(d.sent_at), 'sent_at')
    need(isIso(d.changed_at), 'changed_at')
    need(d.period_s === PERIOD_S && d.grace_s === GRACE_S, 'period_s, grace_s')
    const l = d.light || {}
    need(typeof l.seen === 'boolean' && sOrNull(l.scene) && bOrNull(l.blackout), 'light')
    const z = d.laser || {}
    need(typeof z.seen === 'boolean' && bOrNull(z.armed) && sOrNull(z.stop_reason) && Number.isInteger(z.cubes) && nOrNull(z.stops_total), 'laser')
    const c = d.controller || {}
    need(bOrNull(c.seen) && (c.heard_at === null || isIso(c.heard_at)) && typeof c.wired === 'boolean', 'controller')
    const k = d.link || {}
    need(STATES.link.includes(k.state), 'link.state')
    const h = d.heat || {}
    need(STATES.heat.includes(h.state) && nOrNull(h.max_c ?? null), 'heat')
    const w = d.watch || {}
    need(STATES.watch.includes(w.state) && Array.isArray(w.alerts) && w.alerts.every((a) => ['warn', 'alert'].includes(a.level) && typeof a.text === 'string'), 'watch')
    need(d.last_change && isIso(d.last_change.at) && Array.isArray(d.last_change.what), 'last_change')
    need(d.push && typeof d.push.enabled === 'boolean' && Number.isInteger(d.push.failures), 'push')
    return p
}

module.exports = { createShowStatus, validateShowStatus, toDoorV1, validateDoorV1, SCHEMA, PERIOD_S, GRACE_S, WATCH_STALE_S, DEFAULT_WATCH_LATEST }
