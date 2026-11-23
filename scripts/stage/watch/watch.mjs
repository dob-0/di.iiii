#!/usr/bin/env node
// scripts/stage/watch/watch.mjs — the stage watch (gaps G04, G11 of the show-day audit, 2026-11-01; plan slice S11).
// A recorder for the machine that runs a show: needs no network, writes a CSV into the show record, says one line of
// state in latest.json (the Show desk's status line and serverXR's /show-status read it), and holds the USB policy.
// How it works, what is unvalidated and how to undo everything: README.md next to this file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dns from 'node:dns'
import { execFile } from 'node:child_process'
import * as L from './lib.mjs'
import { UsbPolicy, recheck, opText, checkProtected, cutRefusal } from './usb.mjs'

const HELP = `stage watch — a recorder for the show machine (scripts/stage/watch/README.md)

  watch.mjs run      [--venue FILE] [--usb-mode warn|cut] [--dry-run] [--source /dev/kmsg|-|FILE]
                     [--record DIR] [--state DIR] [--latest FILE] [--show-status URL|FILE] [--tick 5] [--no-link] [--for SECONDS]
  watch.mjs once     one sample of the machine, printed as JSON (no kernel log)
  watch.mjs link     one link line (gateway, DNS, tailscale, the laser NIC, the cubes), printed as JSON
  watch.mjs status   the state in latest.json, one line
  watch.mjs cut PORT [--level interface|device] [--dry-run]   a person's cut (protected devices are refused)
  watch.mjs undo     [--dry-run]   re-authorize everything this watch cut (one command)
  watch.mjs recheck PORT           the 30 s re-check after a hot-plug (the udev rule's timer runs it)
  watch.mjs check    --venue FILE  may cut mode start? exit 0 only when every protected entry names a device on the bus now

  Defaults: --source /dev/kmsg, --record /var/log/di-stage-watch, --state /var/lib/di-stage-watch,
  --latest /run/di-stage-watch/latest.json, --usb-mode from the venue profile, else warn. --sys-root / (tests: a made-up tree).
  Cut mode fails closed: every entry of the venue profile's watch.usb.protected (port 1-2.1, vidpid 1a86:7523, iface 1-2.1:1.0
  or a netdev name) must name a device on the bus at start, else the watch refuses the cut and runs warn; a protected device
  that leaves the bus turns cut mode to warn until a restart. An alert says why (events.log, latest.json, /show-status).
  A --record the watch cannot write falls back to --record-fallback (default /var/log/di-stage-watch), with an alert.`

const DEF = { source: '/dev/kmsg', record: '/var/log/di-stage-watch', state: '/var/lib/di-stage-watch', latest: '/run/di-stage-watch/latest.json' }

function parseArgs(argv) {
    const o = { _: [] }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (!a.startsWith('--')) { o._.push(a); continue }
        const k = a.slice(2)
        if (['dry-run', 'no-link', 'quiet', 'help'].includes(k)) o[k] = true
        else o[k] = argv[++i]
    }
    return o
}

const execJson = (cmd, args, timeout) => new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 << 20 }, (err, out) => {
        if (err && err.code === 'ENOENT') return resolve({ missing: true })
        try { resolve({ doc: JSON.parse(out) }) } catch { resolve({ doc: null }) }
    })
})
const ping = (ip) => new Promise((resolve) => execFile('ping', ['-n', '-c', '1', '-W', '1', ip], { timeout: 3000 }, (err, out) => resolve(err ? null : L.parsePingMs(out))))

export async function linkOnce(cfg = {}, root = '/', th = L.DEFAULT_THRESHOLDS) {
    const gw = cfg.gateway ? { ip: cfg.gateway } : L.readDefaultGateway(root)
    const gatewayMs = gw ? await ping(gw.ip) : null
    const dnsName = cfg.dnsName || 'diiii.xyz'
    const t0 = Date.now()
    const dnsOk = await Promise.race([dns.promises.lookup(dnsName).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 2000).unref())])
    const dnsMs = Date.now() - t0
    const ts = await execJson('tailscale', ['status', '--json'], 4000)
    const tailscale = ts.missing ? null : (ts.doc ? L.parseTailscale(ts.doc, cfg.tailscalePeer) : { state: 'no answer' })
    const cubes = []
    for (const ip of Array.isArray(cfg.cubeIps) ? cfg.cubeIps : []) cubes.push({ ip, ms: await ping(ip) })
    const l = { at: new Date().toISOString(), gatewayIp: gw?.ip ?? null, gatewayMs, dnsName, dnsOk, dnsMs, tailscale, nic: L.readNic(root, cfg.laserNic), cubes }
    l.state = L.linkState(l, th)
    return l
}

function sampleMachine(root, venue) {
    return { heat: L.readHwmon(root), throttle: L.readThrottle(root), cpufreq: L.readCpufreq(root), midiRx: L.readMidiRx(root), nic: L.readNic(root, venue.link.laserNic) }
}

async function run(o) {
    const venue = L.loadVenueWatch(o.venue)
    const th = venue.thresholds
    const tickS = Number(o.tick) > 0 ? Number(o.tick) : L.TICK_S
    const asked = o['usb-mode'] === 'cut' || o['usb-mode'] === 'warn' ? o['usb-mode'] : venue.usb.mode
    const held = [] // alerts that hold for the whole run
    const root = o['sys-root'] || '/'
    // The record must be writable before the show: the unit lets the watch write only /var/log/di-stage-watch (ProtectSystem=strict).
    const writable = (dir) => { try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return null } catch (e) { return e.code || e.message } }
    const fallback = o['record-fallback'] || DEF.record
    let recordBase = o.record || venue.record || DEF.record
    const recordErr = writable(recordBase)
    if (recordErr) {
        const fbErr = recordBase === fallback ? recordErr : writable(fallback)
        held.push(fbErr
            ? { key: 'record', level: 'alert', text: `the show is not recorded: ${recordBase} ${recordErr}${recordBase === fallback ? '' : `, ${fallback} ${fbErr}`}` }
            : { key: 'record', level: 'warn', text: `record ${recordBase} not writable (${recordErr}): recording to ${fallback}` })
        if (!fbErr) recordBase = fallback
    }
    const stateDir = o.state || DEF.state
    const latestFile = o.latest || DEF.latest
    const kmsgMode = (o.source || DEF.source) === '/dev/kmsg'
    const dayDir = () => path.join(recordBase, new Date().toISOString().slice(0, 10))
    const append = (file, cols, row) => {
        if (!fs.existsSync(file)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, L.csvLine(cols)) }
        fs.appendFileSync(file, L.csvLine(row))
    }
    const event = (text) => {
        const line = `${new Date().toISOString()} ${text}\n`
        try { fs.mkdirSync(dayDir(), { recursive: true }); fs.appendFileSync(path.join(dayDir(), 'events.log'), line) } catch (e) { process.stderr.write(`events.log: ${e.message}\n`) }
        if (!o.quiet) process.stdout.write(line)
    }
    const open = new Map() // alert key -> level, for ALERT/CLEAR transitions
    // Cut mode fails closed (verify C, C2): the policy starts it only when every protected entry names a device on the bus,
    // and turns it to warn when a protected device leaves the bus. The reason is said at once, then held as an alert on every
    // tick (events.log, latest.json, /show-status) until a restart with every protected device present.
    const sayMode = (text) => { event(`WARN ${text}`); open.set('usb-mode', 'warn') }
    const policy = new UsbPolicy({ root, mode: asked, protectedList: venue.usb.protected, ledgerFile: path.join(stateDir, 'cuts.json'), dryRun: Boolean(o['dry-run']), say: sayMode })
    const usbHeld = () => (policy.refused ? [{ key: 'usb-mode', level: 'warn', text: policy.refused }] : [])
    event(`START watch: tick ${tickS} s, usb ${policy.mode}${policy.mode !== asked ? ` (${asked} asked, refused)` : ''}${o['dry-run'] ? ' (dry run)' : ''}, thresholds ${venue.source}, source ${o.source || DEF.source}, record ${recordBase}, laser stops ${o['show-status'] || 'not wired (no --show-status)'}`)
    if (policy.refused) sayMode(policy.refused)

    let lastDoc = null; let lastLink = null; let tick = 0; let dropped = 0; let lastSeq = -1; let recordFail = null
    let tickStart = Date.now()
    const recent = new Map() // port -> the last RECENT_TICKS counts
    const writeLatest = (doc) => { lastDoc = doc; try { L.writeAtomic(latestFile, JSON.stringify(doc)) } catch (e) { process.stderr.write(`latest.json: ${e.message}\n`) } }
    const report = (a) => { if (a) event(`USB ${a.action} ${a.port}: ${a.text}`) }
    // The policy never stops the recorder: a locked or unreadable ledger is a WARN line in events.log, and nothing is cut.
    let policyErr = null
    const safely = (fn, fallbackValue) => { try { const v = fn(); policyErr = null; return v } catch (e) { if (policyErr !== e.message) event(`WARN usb policy: ${e.message}`); policyErr = e.message; return fallbackValue } }

    const counter = new L.FloodCounter({
        thresholds: th, tickS,
        onEarly: ({ port, count, atMs }) => {
            const key = `usb:${port}`
            if (!open.has(key)) {
                open.set(key, 'alert')
                event(`ALERT usb flood ${port}: ${count} error lines in ${atMs - tickStart} ms`)
                const alert = { key, level: 'alert', text: `usb flood ${port}: ${count} error lines in ${Math.max(1, atMs - tickStart)} ms` }
                if (lastDoc) writeLatest({ ...lastDoc, at: new Date(atMs).toISOString(), state: 'alert', alerts: [...(lastDoc.alerts || []).filter((x) => x.key !== key), alert] })
            }
            report(safely(() => policy.onFlood(port), null))
        }
    })
    const startUs = kmsgMode ? Math.floor(Number(fs.readFileSync(path.join(root, 'proc/uptime'), 'utf8').split(' ')[0]) * 1e6) : null
    const onRecord = (r) => {
        if (kmsgMode) {
            if (r.usec < startUs - 2e6 || r.seq <= lastSeq) return // the ring's history, or a record seen before a reopen
            if (lastSeq >= 0 && r.seq > lastSeq + 1) dropped += r.seq - lastSeq - 1
            lastSeq = r.seq
        }
        counter.add(r, Date.now())
    }
    const splitter = L.makeSplitter(onRecord)
    const openSource = () => {
        const src = o.source || DEF.source
        const s = src === '-' ? process.stdin : fs.createReadStream(src, { highWaterMark: 16384 })
        s.on('data', splitter)
        s.on('error', (e) => {
            if (e.code === 'EPIPE') { dropped += 1; setTimeout(openSource, 50); return } // the reader fell behind the ring (dev-kmsg ABI)
            event(`WARN kernel log ${src}: ${e.code || e.message}; the watch keeps sampling, retry in 5 s`)
            setTimeout(openSource, 5000)
        })
        if (kmsgMode) s.on('end', () => setTimeout(openSource, 1000))
    }
    openSource()

    let prevProc = L.readProcTicks(root); let prevAt = Date.now(); let prevCpu = process.cpuUsage()
    let prevThrottle = L.readThrottle(root); let prevMidi = L.readMidiRx(root)
    // Laser stops: serverXR's GET /show-status (install.sh wires the local URL) or a file serverXR writes (DI_SHOW_STATUS_FILE).
    // Read beside the tick; a source that does not answer is said once in events.log, and again when it answers.
    let laserStops = null; let stopsErr = null
    const stopsOf = (d) => (Number.isFinite(d?.laser?.stops_total) ? d.laser.stops_total : null)
    const pollLaserStops = async () => {
        const src = o['show-status']
        if (!src) return
        try {
            if (/^https?:\/\//.test(src)) {
                const r = await fetch(src, { signal: AbortSignal.timeout(2000) })
                if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { code: `HTTP ${r.status}` })
                laserStops = stopsOf(await r.json())
            } else laserStops = stopsOf(JSON.parse(fs.readFileSync(src, 'utf8')))
            if (stopsErr) event(`laser stops: ${src} answers again`)
            stopsErr = null
        } catch (e) {
            laserStops = null
            const why = e.code || e.cause?.code || e.name || 'error'
            if (stopsErr !== why) event(`WARN laser stops: ${src} ${why}; the laser_stops column stays empty until it answers`)
            stopsErr = why
        }
    }
    pollLaserStops()
    const doTick = () => {
        const now = Date.now(); const el = (now - prevAt) / 1000
        const c = counter.take()
        const procNow = L.readProcTicks(root); const shares = L.cpuShares(prevProc, procNow, el); prevProc = procNow
        const m = sampleMachine(root, venue)
        const throttleDelta = Math.max(0, ((m.throttle.coreTotal ?? 0) - (prevThrottle.coreTotal ?? 0)) + ((m.throttle.pkgTotal ?? 0) - (prevThrottle.pkgTotal ?? 0)))
        prevThrottle = m.throttle
        const midiDelta = m.midiRx !== null && prevMidi !== null ? m.midiRx - prevMidi : null; prevMidi = m.midiRx
        const cpu = process.cpuUsage(prevCpu); prevCpu = process.cpuUsage(); prevAt = now
        const selfCpuPct = el > 0 ? Math.round(((cpu.user + cpu.system) / 1000 / (el * 1000)) * 1000) / 10 : null
        const s = { at: new Date(now).toISOString(), tick: ++tick, usb: c.usb, kmsgLines: c.lines, kmsgDropped: dropped, journaldPct: shares.journaldPct, top3: shares.top3, ...m, throttleDelta, midiRxDelta: midiDelta, laserStops, usbMode: policy.mode, selfCpuPct }
        dropped = 0
        const ev = L.evaluate(s, th, tickS)
        const flooding = new Set([...c.flagged, ...ev.alerts.filter((a) => a.key.startsWith('usb:')).map((a) => a.key.slice(4))])
        for (const port of flooding) if (!c.flagged.includes(port)) report(safely(() => policy.onFlood(port), null))
        const actions = safely(() => policy.onTick(flooding, tickStart, c.usb), [])
        actions.forEach(report)
        // Loudest first, the held reasons first of their level: /show-status carries the first five, the desk line the first one.
        const alerts = [...usbHeld(), ...held, ...ev.alerts, ...(recordFail ? [{ key: 'record-write', level: 'alert', text: `the record stopped: ${recordFail}` }] : [])]
            .sort((a, b) => (b.level === 'alert') - (a.level === 'alert'))
        const state = alerts.some((a) => a.level === 'alert') ? 'alert' : alerts.length ? 'warn' : ev.state
        const keys = new Set(alerts.map((a) => a.key))
        for (const a of alerts) if (open.get(a.key) !== a.level) event(`${a.level.toUpperCase()} ${a.text}`)
        for (const k of open.keys()) if (!keys.has(k)) event(`CLEAR ${k}`)
        open.clear(); for (const a of alerts) open.set(a.key, a.level)
        for (const port of new Set([...recent.keys(), ...Object.keys(c.usb)])) {
            const arr = [...(recent.get(port) || []), c.usb[port] || 0].slice(-L.RECENT_TICKS)
            if (arr.some((n) => n > 0)) recent.set(port, arr); else recent.delete(port)
        }
        Object.assign(s, { state, alerts, usbActions: actions.map((a) => a.text) })
        try { append(path.join(dayDir(), 'watch.csv'), L.WATCH_COLUMNS, L.watchRow(s)); recordFail = null } catch (e) { if (!recordFail) process.stderr.write(`watch.csv: ${e.message}\n`); recordFail = `${path.join(dayDir(), 'watch.csv')} ${e.code || e.message}` }
        writeLatest({
            schema: 'di.stage-watch.latest/1', machine: os.hostname(), at: s.at, tick: s.tick, tickS, state: s.state, alerts: s.alerts,
            heat: { maxC: s.heat.maxC, sensor: s.heat.sensor, critC: s.heat.critC, throttleDelta },
            usb: { mode: policy.mode, asked, dryRun: Boolean(o['dry-run']), flooding: [...flooding], recent: Object.fromEntries(recent), cuts: policy.summary() },
            midi: { rxBytes: s.midiRx, rxDelta: midiDelta }, link: lastLink, journaldPct: s.journaldPct, top3: s.top3, selfCpuPct,
            thresholds: { validated: th.validated, source: venue.source }
        })
        pollLaserStops()
        tickStart = now
    }
    const tickTimer = setInterval(doTick, tickS * 1000)
    let linkTimer = null
    if (!o['no-link']) {
        const linkTick = async () => {
            try {
                lastLink = await linkOnce(venue.link, root, th)
                append(path.join(dayDir(), 'link.csv'), L.LINK_COLUMNS, L.linkRow(lastLink))
                if (lastLink.state !== 'ok') event(`LINK ${lastLink.state}: gateway ${lastLink.gatewayMs ?? 'no answer'} ms, dns ${lastLink.dnsOk ? 'ok' : 'failed'}, tailscale ${lastLink.tailscale?.state ?? 'not installed'}${lastLink.tailscale?.peer ? ' peer ' + lastLink.tailscale.peer.mode : ''}`)
            } catch (e) { event(`WARN link line: ${e.message}`) }
        }
        linkTick(); linkTimer = setInterval(linkTick, L.LINK_EVERY_S * 1000)
    }
    const stop = (why) => { clearInterval(tickTimer); clearInterval(linkTimer); event(`STOP watch: ${why}`); process.exit(0) }
    process.on('SIGTERM', () => stop('SIGTERM'))
    process.on('SIGINT', () => stop('SIGINT'))
    if (Number(o.for) > 0) setTimeout(() => { doTick(); stop(`--for ${o.for} s`) }, Number(o.for) * 1000)
}

async function main() {
    const o = parseArgs(process.argv.slice(2))
    const cmd = o._[0]
    const root = o['sys-root'] || '/'
    if (!cmd || o.help) { console.log(HELP); return cmd ? 0 : 2 }
    if (cmd === 'run') { await run(o); return null }
    const venue = L.loadVenueWatch(o.venue)
    if (cmd === 'once') {
        const a = L.readProcTicks(root); const t0 = Date.now()
        await new Promise((r) => setTimeout(r, 1000))
        console.log(JSON.stringify({ ...sampleMachine(root, venue), ...L.cpuShares(a, L.readProcTicks(root), (Date.now() - t0) / 1000) }, null, 2))
        return 0
    }
    if (cmd === 'link') { console.log(JSON.stringify(await linkOnce(venue.link, root, venue.thresholds), null, 2)); return 0 }
    if (cmd === 'status') {
        let d
        try { d = JSON.parse(fs.readFileSync(o.latest || DEF.latest, 'utf8')) } catch { console.log('watch: off (no latest.json)'); return 1 }
        const age = Math.round((Date.now() - Date.parse(d.at)) / 1000)
        console.log(`watch: ${age > venue.thresholds.staleAfterS ? 'STALE ' + age + ' s' : d.state}${d.alerts?.length ? ' — ' + d.alerts.map((a) => a.text).join('; ') : ''}`)
        return d.state === 'alert' ? 1 : 0
    }
    if (cmd === 'check') {
        // The cut-mode start check, the same one `run` makes (install.sh runs it before it installs cut mode; verify C2).
        const c = checkProtected(root, venue.usb.protected)
        const why = cutRefusal(c)
        if (why) { console.log(why.replace(/; warn only$/, '')); return 2 }
        for (const r of c.resolved) console.log(`protected: ${r.offUsb ? `${r.ifaces[0]} (a network interface not on USB: nothing to cut)` : `${r.port} ${r.vidpid ?? ''} ${r.ifaces.join(' ')}`.trim()}${r.name ? ` (${r.name})` : ''}`)
        console.log(`cut mode may start: all ${c.entries.length} protected entries name a device on the bus now`)
        return 0
    }
    const policy = new UsbPolicy({ root, mode: 'cut', protectedList: venue.usb.protected, ledgerFile: path.join(o.state || DEF.state, 'cuts.json'), dryRun: Boolean(o['dry-run']) })
    if (cmd === 'cut') {
        const port = o._[1]
        if (!port) { console.error('cut: which port? (e.g. 1-2.1, from the ALERT line)'); return 2 }
        // A person's cut fails closed too: a protected list it cannot read guards nothing, so no cut is made at all.
        const unread = policy.problems.filter((p) => p.kind === 'malformed')
        if (unread.length) { console.log(`cut refused: watch.usb.protected cannot be read, so it guards nothing: ${unread.map((p) => p.text).join('; ')}`); return 1 }
        for (const p of policy.problems) console.error(`note: ${p.text}`)
        const a = policy.cutNow(port, o.level === 'device' ? 'device' : 'interface')
        if (a.action === 'refused') { console.log(a.text); return 1 }
        console.log(`${a.text}${o['dry-run'] ? ' — dry run, nothing written' : ''}:`)
        for (const w of a.plan.writes) console.log(`  ${opText(w)}`)
        console.log('undo (one command: node scripts/stage/watch/watch.mjs undo):')
        for (const u of a.plan.undo) console.log(`  ${opText(u)}`)
        if (a.failed?.length) { console.log(`FAILED: ${a.failed.join('; ')}`); return 1 }
        return 0
    }
    if (cmd === 'undo') {
        const done = policy.undoAll()
        if (!done.length) { console.log('undo: nothing is cut'); return 0 }
        for (const d of done) for (const u of d.undo) console.log(`${o['dry-run'] ? 'would ' : ''}${opText(u)}`)
        return done.some((d) => d.failed.length) ? 1 : 0
    }
    if (cmd === 'recheck') {
        let recentCounts = {}
        try { recentCounts = JSON.parse(fs.readFileSync(o.latest || DEF.latest, 'utf8')).usb?.recent || {} } catch { /* the watch is off: counts unknown */ }
        const r = recheck(o._[1], { root, recent: recentCounts, portPlan: venue.usb.portPlan, th: venue.thresholds })
        console.log(r.text)
        try {
            const dir = path.join(o.record || venue.record || DEF.record, new Date().toISOString().slice(0, 10))
            fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'events.log'), `${new Date().toISOString()} ${r.code ? 'WARN ' : ''}${r.text}\n`)
        } catch { /* printed above; the journal keeps it */ }
        return r.code
    }
    console.error(`unknown command ${cmd}\n\n${HELP}`)
    return 2
}

main().then((code) => { if (code !== null && code !== undefined) process.exitCode = code }, (e) => { console.error(`watch: ${e.message}`); process.exitCode = 2 })
