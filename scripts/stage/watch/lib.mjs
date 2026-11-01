// scripts/stage/watch/lib.mjs — the stage watch's parts that do not loop (gaps G04 and G11 of the show-day audit,
// 2026-11-01; plan slice S11). Every reader takes a root, so the tests run on a made-up /sys and /proc. Method, sources
// and limits: README.md next to this file. Nothing here names a production, a venue or a device of one show.
import fs from 'node:fs'
import path from 'node:path'

export const TICK_S = 5 // one sample every 5 s (G04)
export const LINK_EVERY_S = 60 // one link line a minute (G11)
export const RECENT_TICKS = 12 // the last 60 s of per-device error counts kept in latest.json (the 30 s re-check reads 6)
export const CLK_TCK = 100 // USER_HZ on Linux x86 and arm64 (proc(5): utime/stime "measured in clock ticks")

// The built-in thresholds. NOT validated: no stock default exists for any of them (node_exporter, its node-mixin alert
// pack, sysstat and collectd were checked, RESEARCH-show-safety §1). The venue profile's "watch" block overrides each
// one (S13); only a venue profile can say validated: true. The one measured number they rest on: the night of
// 2026-10-31 gave 79 649 "urb status -32" lines in 30 s (2 655 a second) from one device; a healthy device gives 0.
export const DEFAULT_THRESHOLDS = Object.freeze({
    validated: false,
    usbErrPerSec: 20, // per device, over one tick: 100 error lines in 5 s
    usbErrMinLines: 20, // fewer error lines than this in a tick is never called a flood
    journaldCpuPct: 25, // journald's share of one core (it read 82 % on the night)
    tempMarginC: 10, // ALERT this close to the sensor's own crit (else max); WARN at twice the margin
    tempFallbackCritC: 100, // when the sensor states neither crit nor max
    throttlePerTick: 1, // a new thermal_throttle event in one tick is a WARN
    gatewayMs: 250, // a slower gateway answer marks the link degraded
    handshakeAgeS: 180, // a tailscale peer handshake older than this marks the link degraded
    staleAfterS: 15 // latest.json older than three ticks: the watch is called stale by its readers
})

// ---- the venue profile's "watch" block (S13 owns the profile; this reads only its "watch" key) ----
export function loadVenueWatch(file) {
    const empty = { thresholds: { ...DEFAULT_THRESHOLDS }, usb: { mode: 'warn', protected: [], portPlan: [] }, link: {}, source: 'built-in defaults (unvalidated)' }
    if (!file) return empty
    let doc
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`venue profile ${file} unreadable: ${e.message}`, { cause: e }) }
    const w = doc && typeof doc === 'object' ? (doc.watch || {}) : {}
    const thresholds = { ...DEFAULT_THRESHOLDS }
    for (const [k, v] of Object.entries(w.thresholds || {})) if (k in DEFAULT_THRESHOLDS && k !== 'validated' && Number.isFinite(v)) thresholds[k] = v
    thresholds.validated = w.thresholds?.validated === true
    const usb = w.usb || {}
    return {
        thresholds,
        usb: {
            mode: usb.mode === 'cut' ? 'cut' : 'warn',
            // Kept as written, whatever its shape: usb.mjs checkProtected reads every entry and names what it cannot read (C2).
            protected: usb.protected === undefined ? [] : usb.protected,
            portPlan: Array.isArray(usb.portPlan) ? usb.portPlan : []
        },
        link: w.link && typeof w.link === 'object' ? w.link : {},
        record: typeof w.record === 'string' ? w.record : null,
        source: `${file} (watch block${thresholds.validated ? ', validated' : ', thresholds unvalidated'})`
    }
}

// ---- /dev/kmsg (Documentation/ABI/testing/dev-kmsg): "prio,seq,usec,flags[,…];message" then " KEY=value" lines ----
export function parseKmsgRecord(line) {
    const semi = line.indexOf(';')
    if (semi < 0) return null
    const head = line.slice(0, semi).split(',')
    const pf = Number(head[0])
    if (!Number.isFinite(pf)) return null
    return { prio: pf & 7, facility: pf >> 3, seq: Number(head[1]), usec: Number(head[2]), msg: line.slice(semi + 1) }
}

// Lines in, records out: a read of /dev/kmsg is one record; a pipe or a file gives any chunk. A line that starts with a
// space is a record's dictionary (SUBSYSTEM=, DEVICE=) and is skipped: the message line already names the device.
export function makeSplitter(onRecord) {
    let rest = ''
    return (chunk) => {
        const text = rest + (typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
        const lines = text.split('\n')
        rest = lines.pop()
        for (const l of lines) {
            if (!l || l.charCodeAt(0) === 32) continue
            const r = parseKmsgRecord(l)
            if (r) onRecord(r)
        }
    }
}

// The USB device a kernel line is about. dev_err() prints "<driver> <device name>: …" (include/linux/dev_printk.h):
//   "usb 1-2.1: urb status -32"              a device         -> 1-2.1
//   "snd-usb-audio 1-2.1:1.0: …"             an interface     -> 1-2.1, interface 1.0
//   "r8152 1-2.4:1.0 enp0s20u2u4: …"         a net interface  -> 1-2.4, interface 1.0
//   "usb 1-2-port1: over-current condition"  a hub's port     -> the device on it, 1-2.1
//   "usb usb1-port2: …"                      a root hub port  -> 1-2
export function usbDeviceOf(msg) {
    let m = /^\S+ usb(\d+)-port(\d+)[: ]/.exec(msg)
    if (m) return { port: `${m[1]}-${m[2]}`, iface: null }
    m = /^\S+ (\d+-\d+(?:\.\d+)*)(?:-port(\d+)|:(\d+\.\d+))?[: ]/.exec(msg)
    if (!m) return null
    if (m[2]) return { port: `${m[1]}.${m[2]}`, iface: null }
    return { port: m[1], iface: m[3] || null }
}

export const isUsbError = (rec) => rec.prio <= 3 || /urb status -\d+/.test(rec.msg)

// Per-device error counts for the running tick, with an early call the moment one device crosses its tick's limit
// (so a flood at the night's rate is called in milliseconds, not at the end of the tick).
export class FloodCounter {
    constructor({ thresholds = DEFAULT_THRESHOLDS, tickS = TICK_S, onEarly = () => {} } = {}) {
        this.limit = Math.max(thresholds.usbErrMinLines, thresholds.usbErrPerSec * tickS)
        this.onEarly = onEarly
        this.reset()
    }
    reset() { this.counts = new Map(); this.flagged = new Set(); this.lines = 0 }
    add(rec, atMs = Date.now()) {
        this.lines += 1
        if (!isUsbError(rec)) return
        const dev = usbDeviceOf(rec.msg)
        if (!dev) return
        const n = (this.counts.get(dev.port) || 0) + 1
        this.counts.set(dev.port, n)
        if (n >= this.limit && !this.flagged.has(dev.port)) { this.flagged.add(dev.port); this.onEarly({ port: dev.port, count: n, atMs }) }
    }
    take() {
        const out = { usb: Object.fromEntries(this.counts), lines: this.lines, flagged: [...this.flagged] }
        this.reset()
        return out
    }
}

// ---- readers (each returns null fields when the machine has no such file; a missing sensor is said, never guessed) ----
const readText = (f) => { try { return fs.readFileSync(f, 'utf8').trim() } catch { return null } }
const readNum = (f) => { const t = readText(f); const n = t === null ? NaN : Number(t); return Number.isFinite(n) ? n : null }
const list = (d) => { try { return fs.readdirSync(d) } catch { return [] } }

// hwmon (Documentation/hwmon/sysfs-interface.rst): temp*_input in millidegrees, with the sensor's own _crit and _max.
export function readHwmon(root = '/') {
    const base = path.join(root, 'sys/class/hwmon')
    let best = null
    for (const h of list(base)) {
        const dir = path.join(base, h)
        const chip = readText(path.join(dir, 'name')) || h
        for (const f of list(dir)) {
            const m = /^temp(\d+)_input$/.exec(f)
            if (!m) continue
            const v = readNum(path.join(dir, f))
            if (v === null) continue
            const c = v / 1000
            if (!best || c > best.maxC) {
                const crit = readNum(path.join(dir, `temp${m[1]}_crit`))
                const max = readNum(path.join(dir, `temp${m[1]}_max`))
                const label = readText(path.join(dir, `temp${m[1]}_label`))
                best = { maxC: c, sensor: `${chip}${label ? ' ' + label : ''}`, critC: crit !== null ? crit / 1000 : (max !== null ? max / 1000 : null) }
            }
        }
    }
    return best || { maxC: null, sensor: null, critC: null }
}

// thermal_throttle (the counters node_exporter's cpu collector reads): core counts summed, package counts once per package.
export function readThrottle(root = '/') {
    const base = path.join(root, 'sys/devices/system/cpu')
    let core = null; const pkg = new Map()
    for (const c of list(base)) {
        if (!/^cpu\d+$/.test(c)) continue
        const d = path.join(base, c, 'thermal_throttle')
        const cc = readNum(path.join(d, 'core_throttle_count'))
        if (cc !== null) core = (core || 0) + cc
        const pc = readNum(path.join(d, 'package_throttle_count'))
        const pid = readText(path.join(base, c, 'topology/physical_package_id')) || '0'
        if (pc !== null) pkg.set(pid, Math.max(pkg.get(pid) || 0, pc))
    }
    return { coreTotal: core, pkgTotal: pkg.size ? [...pkg.values()].reduce((a, b) => a + b, 0) : null }
}

export function readCpufreq(root = '/') {
    const base = path.join(root, 'sys/devices/system/cpu')
    const mhz = []
    for (const c of list(base)) {
        if (!/^cpu\d+$/.test(c)) continue
        const k = readNum(path.join(base, c, 'cpufreq/scaling_cur_freq'))
        if (k !== null) mhz.push(k / 1000)
    }
    if (!mhz.length) return { avgMhz: null, maxMhz: null }
    return { avgMhz: Math.round(mhz.reduce((a, b) => a + b, 0) / mhz.length), maxMhz: Math.round(Math.max(...mhz)) }
}

// Per-process CPU from /proc/<pid>/stat (proc(5)): utime and stime are fields 14 and 15; comm may hold spaces and ')'.
export function readProcTicks(root = '/') {
    const out = new Map()
    const base = path.join(root, 'proc')
    for (const p of list(base)) {
        if (!/^\d+$/.test(p)) continue
        const s = readText(path.join(base, p, 'stat'))
        if (!s) continue
        const open = s.indexOf('('); const close = s.lastIndexOf(')')
        if (open < 0 || close < open) continue
        const f = s.slice(close + 2).split(' ')
        const ticks = Number(f[11]) + Number(f[12])
        if (Number.isFinite(ticks)) out.set(p, { comm: s.slice(open + 1, close), ticks })
    }
    return out
}

export function cpuShares(prev, next, elapsedS) {
    const rows = []
    if (!prev || !(elapsedS > 0)) return { top3: [], journaldPct: null }
    let journald = null
    for (const [pid, n] of next) {
        const p = prev.get(pid)
        if (!p || p.comm !== n.comm) continue
        const pct = ((n.ticks - p.ticks) / (CLK_TCK * elapsedS)) * 100
        if (n.comm === 'systemd-journal') journald = (journald || 0) + pct
        if (pct > 0) rows.push({ comm: n.comm, pid: Number(pid), pct })
    }
    rows.sort((a, b) => b.pct - a.pct)
    return { top3: rows.slice(0, 3).map((r) => ({ ...r, pct: Math.round(r.pct * 10) / 10 })), journaldPct: journald === null ? null : Math.round(journald * 10) / 10 }
}

// MIDI Rx bytes from /proc/asound/card*/midi* (sound/core/rawmidi.c prints "Rx bytes : N" for an open input).
// The exact text was not read on the stage machine: the sum is null when nothing matches, and the column is unvalidated.
export function readMidiRx(root = '/') {
    const base = path.join(root, 'proc/asound')
    let sum = null
    for (const card of list(base)) {
        if (!/^card\d+$/.test(card)) continue
        for (const f of list(path.join(base, card))) {
            if (!/^midi\d+$/.test(f)) continue
            const t = readText(path.join(base, card, f)) || ''
            for (const m of t.matchAll(/Rx bytes\s*:\s*(\d+)/g)) sum = (sum || 0) + Number(m[1])
        }
    }
    return sum
}

// A NIC's counters (Documentation/ABI/testing/sysfs-class-net*): carrier, carrier_changes, statistics/rx_errors.
export function readNic(root = '/', iface) {
    if (!iface) return { iface: null, carrier: null, carrierChanges: null, rxErrors: null }
    const d = path.join(root, 'sys/class/net', iface)
    return { iface, carrier: readNum(path.join(d, 'carrier')), carrierChanges: readNum(path.join(d, 'carrier_changes')), rxErrors: readNum(path.join(d, 'statistics/rx_errors')) }
}

// The default gateway from /proc/net/route (little-endian hex, Destination 00000000).
export function readDefaultGateway(root = '/') {
    const t = readText(path.join(root, 'proc/net/route'))
    if (!t) return null
    for (const line of t.split('\n').slice(1)) {
        const f = line.trim().split(/\s+/)
        if (f[1] === '00000000' && f[2] && f[2] !== '00000000') {
            const h = f[2]
            return { iface: f[0], ip: [6, 4, 2, 0].map((i) => parseInt(h.slice(i, i + 2), 16)).join('.') }
        }
    }
    return null
}

// ---- judging one sample ----
export function evaluate(sample, th = DEFAULT_THRESHOLDS, tickS = TICK_S) {
    const alerts = []
    const add = (key, level, text) => alerts.push({ key, level, text })
    for (const [port, n] of Object.entries(sample.usb || {})) {
        const perS = n / tickS
        if (n >= th.usbErrMinLines && perS >= th.usbErrPerSec) add(`usb:${port}`, 'alert', `usb flood ${port}: ${Math.round(perS)} error lines/s`)
    }
    if (sample.journaldPct !== null && sample.journaldPct !== undefined && sample.journaldPct >= th.journaldCpuPct) add('journald', 'warn', `journald ${sample.journaldPct} % CPU`)
    const h = sample.heat || {}
    if (h.maxC !== null && h.maxC !== undefined) {
        const crit = h.critC ?? th.tempFallbackCritC
        if (h.maxC >= crit - th.tempMarginC) add('heat', 'alert', `${h.maxC} °C (crit ${crit})`)
        else if (h.maxC >= crit - 2 * th.tempMarginC) add('heat', 'warn', `${h.maxC} °C (crit ${crit})`)
    }
    if ((sample.throttleDelta || 0) >= th.throttlePerTick) add('throttle', 'warn', `${sample.throttleDelta} new throttle events`)
    if ((sample.kmsgDropped || 0) > 0) add('kmsg', 'warn', `kernel log overran: ${sample.kmsgDropped} gaps (the watch missed lines)`)
    const state = alerts.some((a) => a.level === 'alert') ? 'alert' : alerts.length ? 'warn' : 'ok'
    return { state, alerts }
}

// ---- the link line (G11) ----
export function parsePingMs(stdout) {
    const m = /time[=<]([\d.]+)\s*ms/.exec(stdout || '')
    return m ? Number(m[1]) : null
}

// tailscale status --json: PeerStatus has CurAddr (non-empty = direct), Relay (DERP region), LastHandshake, Online,
// Active (field names read from aylmo's own tailscale, 2026-11-01). A zero time is "0001-01-01T00:00:00Z": never.
export function parseTailscale(doc, peerName, nowMs = Date.now()) {
    if (!doc || typeof doc !== 'object') return { state: null }
    const out = { state: doc.BackendState || null, selfOnline: doc.Self ? Boolean(doc.Self.Online) : null, peer: null }
    const peers = Object.values(doc.Peer || {})
    const want = peerName ? String(peerName).toLowerCase() : null
    const pick = want ? peers.find((p) => String(p.HostName || '').toLowerCase() === want || String(p.DNSName || '').toLowerCase().startsWith(want + '.')) : null
    const view = (p) => {
        const hs = Date.parse(p.LastHandshake || '')
        const age = Number.isFinite(hs) && hs > 0 ? Math.round((nowMs - hs) / 1000) : null
        return { name: p.HostName || null, online: Boolean(p.Online), active: Boolean(p.Active), mode: p.CurAddr ? 'direct' : (p.Relay ? 'derp' : 'none'), relay: p.Relay || null, handshakeAgeS: age }
    }
    if (pick) out.peer = view(pick)
    const active = peers.filter((p) => p.Active)
    out.activePeers = active.length
    out.directPeers = active.filter((p) => p.CurAddr).length
    return out
}

export function linkState(l, th = DEFAULT_THRESHOLDS) {
    if (!l) return 'unknown'
    const gwDown = l.gatewayIp && l.gatewayMs === null
    const tsDown = l.tailscale && l.tailscale.state && l.tailscale.state !== 'Running'
    if (gwDown && (tsDown || l.tailscale?.selfOnline === false)) return 'lost'
    if (gwDown || tsDown || l.dnsOk === false) return 'degraded'
    if (l.gatewayMs !== null && l.gatewayMs > th.gatewayMs) return 'degraded'
    const p = l.tailscale?.peer
    if (p && (p.mode !== 'direct' || (p.handshakeAgeS !== null && p.handshakeAgeS > th.handshakeAgeS))) return 'degraded'
    if (Array.isArray(l.cubes) && l.cubes.some((c) => c.ms === null)) return 'degraded'
    return 'ok'
}

// ---- the record: RFC 4180 CSV, one header, every row the same width ----
export const WATCH_COLUMNS = Object.freeze([
    't_iso', 'tick', 'state', 'alerts',
    'usb_top_port', 'usb_top_lines', 'usb_err_lines_total', 'kmsg_lines', 'kmsg_dropped',
    'journald_cpu_pct', 'top3',
    'temp_max_c', 'temp_sensor', 'temp_crit_c', 'throttle_core_total', 'throttle_pkg_total', 'throttle_delta',
    'cpufreq_avg_mhz', 'cpufreq_max_mhz',
    'midi_rx_bytes', 'midi_rx_delta', 'laser_stops_total',
    'nic', 'nic_carrier', 'nic_carrier_changes', 'nic_rx_errors',
    'usb_mode', 'usb_actions', 'self_cpu_pct'
])
export const LINK_COLUMNS = Object.freeze([
    't_iso', 'state', 'gateway_ip', 'gateway_ms', 'dns_name', 'dns_ok', 'dns_ms',
    'ts_state', 'ts_self_online', 'ts_peer', 'ts_peer_mode', 'ts_peer_relay', 'ts_handshake_age_s', 'ts_active_peers', 'ts_direct_peers',
    'nic', 'nic_carrier', 'nic_carrier_changes', 'nic_rx_errors', 'cubes'
])

export function csvField(v) {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const csvLine = (values) => values.map(csvField).join(',') + '\n'

export function watchRow(s) {
    const usb = Object.entries(s.usb || {}).sort((a, b) => b[1] - a[1])
    return [
        s.at, s.tick, s.state, (s.alerts || []).map((a) => `${a.level}:${a.text}`).join(' | '),
        usb[0]?.[0] ?? '', usb[0]?.[1] ?? 0, usb.reduce((a, [, n]) => a + n, 0), s.kmsgLines ?? 0, s.kmsgDropped ?? 0,
        s.journaldPct, (s.top3 || []).map((r) => `${r.comm} ${r.pct}%`).join('; '),
        s.heat?.maxC, s.heat?.sensor, s.heat?.critC, s.throttle?.coreTotal, s.throttle?.pkgTotal, s.throttleDelta ?? 0,
        s.cpufreq?.avgMhz, s.cpufreq?.maxMhz,
        s.midiRx, s.midiRxDelta, s.laserStops,
        s.nic?.iface, s.nic?.carrier, s.nic?.carrierChanges, s.nic?.rxErrors,
        s.usbMode, (s.usbActions || []).join(' | '), s.selfCpuPct
    ]
}

export function linkRow(l) {
    const t = l.tailscale || {}
    return [
        l.at, l.state, l.gatewayIp, l.gatewayMs, l.dnsName, l.dnsOk, l.dnsMs,
        t.state, t.selfOnline, t.peer?.name, t.peer?.mode, t.peer?.relay, t.peer?.handshakeAgeS, t.activePeers, t.directPeers,
        l.nic?.iface, l.nic?.carrier, l.nic?.carrierChanges, l.nic?.rxErrors,
        (l.cubes || []).map((c) => `${c.ip} ${c.ms === null ? 'no answer' : c.ms + ' ms'}`).join('; ')
    ]
}

// Write a file whole or not at all (a reader never sees half of latest.json).
export function writeAtomic(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
}
