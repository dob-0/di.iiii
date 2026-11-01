// scripts/stage/watch/usb.mjs — the USB policy of the stage watch, warn | cut (gap G04; plan S11).
//
// The primitives are the kernel's own (Documentation/usb/authorization.rst; ABI sysfs-bus-usb): a device's `authorized`
// (1 authorizes, 0 deauthorizes), an interface's `authorized`, and /sys/bus/usb/drivers_probe to bind a re-authorized
// interface again. USBGuard has no rate trigger, so the rate trigger is ours (RESEARCH-show-safety, show-safety-4).
//
//   warn (the default, until the owner's word): a flood is an ALERT line with the cut it WOULD make and its undo.
//   cut:  the interface first (the device's audio-streaming interfaces, class 01 subclass 02: the MIDI interface,
//         subclass 03, and the audio control interface are kept), then the whole device if the flood goes on;
//         re-authorized once after 30 s; after the third flood it stays cut and says so (a person decides, `undo`).
//   never: a root hub, a hub (it would drop every device behind it), a network adapter, storage, anything on the venue
//         profile's protected list (port path, VID:PID or interface name, and what each resolved to at start), a device
//         with a protected device behind it, an input device (HID) or a Bluetooth controller (the machine's own keyboard
//         and trackpad may be on them).
//   fails closed: cut mode starts only when every protected entry names a device on the bus (verify C2); else it runs
//         warn and says why. A protected device that leaves the bus later turns cut mode to warn for the rest of the run.
//   undo:  one command re-authorizes everything this watch cut (the ledger survives a restart of the watch).
//   one ledger: the service and a person's `cut` / `undo` share cuts.json; every change re-reads it and writes it back
//         under a lock file, so a cut made by one process is never lost by the other.
//
// UNVALIDATED until the bench (G12): what an interface cut does to a stalling MIDI endpoint, and whether the sound card
// keeps its MIDI when only its streaming interfaces go. The bench is owed with the real hub and controller at aylmo.
import fs from 'node:fs'
import path from 'node:path'

export const DEV_DIR = 'sys/bus/usb/devices'
export const PROBE = 'sys/bus/usb/drivers_probe'
export const REAUTH_AFTER_MS = 30000
export const MAX_FLOODS = 3
export const LOCK_WAIT_MS = 3000
const STALE_LOCK_MS = 10000
const SLEEP = new Int32Array(new SharedArrayBuffer(4))
// A USB device's kernel name (usb1, 1-2, 1-2.1.4). Anything else is a wrong argument, never "gone from the bus".
export const PORT_RE = /^(usb\d+|\d+-\d+(\.\d+)*)$/

const list = (d) => { try { return fs.readdirSync(d) } catch { return [] } }
const readIn = (dir) => (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').trim() } catch { return null } }

export function readDevice(root, port) {
    const base = path.join(root, DEV_DIR)
    const dir = path.join(base, port)
    if (!fs.existsSync(dir)) return { port, exists: false, interfaces: [] }
    const r = readIn(dir)
    const interfaces = list(base).filter((n) => n.startsWith(port + ':')).map((name) => {
        const idir = path.join(base, name)
        const ri = readIn(idir)
        let driver = null
        try { driver = path.basename(fs.readlinkSync(path.join(idir, 'driver'))) } catch { /* unbound */ }
        return { name, cls: ri('bInterfaceClass'), sub: ri('bInterfaceSubClass'), authorized: ri('authorized'), driver, net: fs.existsSync(path.join(idir, 'net')), netNames: list(path.join(idir, 'net')) }
    })
    const vid = r('idVendor'); const pid = r('idProduct')
    return {
        port, exists: true, isRoot: /^usb\d+$/.test(port),
        vidpid: vid && pid ? `${vid}:${pid}`.toLowerCase() : null,
        product: r('product'), manufacturer: r('manufacturer'), deviceClass: r('bDeviceClass'), speed: r('speed'), authorized: r('authorized'),
        interfaces
    }
}

export const describe = (d) => `${d.port}${d.vidpid ? ' ' + d.vidpid : ''}${d.product ? ' ' + d.product : ''}`

// ---- the venue profile's protected list (verify C2: a fail-closed check reads every entry, never the list's length) ----
// An entry names a device by any of: `port` (its kernel name, 1-2.1), `vidpid` (idVendor:idProduct, 1a86:7523) and `iface`
// (one of its USB interfaces, 1-2.1:1.0, or a network interface it carries, enx00e04c680001), with an optional `name`.
// A plain string of one of these shapes reads as that key ("1a86:7523", the way PLAN S11 writes it). Anything else (a
// mistyped key, an empty object, a value of the wrong shape) is a problem named by its entry, never skipped.
export const VIDPID_RE = /^[0-9a-f]{4}:[0-9a-f]{4}$/i
export const USB_IFACE_RE = /^(\d+-\d+(?:\.\d+)*):\d+\.\d+$/
// A network interface name as the kernel takes one (net/core/dev.c, dev_valid_name()): 1 to 15 bytes (IFNAMSIZ 16 with its
// NUL), not "." or "..", no "/", ":" or white space.
export const isNetdevName = (s) => typeof s === 'string' && s.length > 0 && Buffer.byteLength(s) < 16 && s !== '.' && s !== '..' && !/[/:\s]/.test(s)
const ENTRY_KEYS = ['name', 'port', 'vidpid', 'iface']
const shown = (v) => { const s = JSON.stringify(v) ?? String(v); return s.length > 60 ? `${s.slice(0, 57)}...` : s }

export function normaliseProtected(protectedList) {
    const entries = []; const problems = []
    if (protectedList === undefined || protectedList === null) return { entries, problems }
    if (!Array.isArray(protectedList)) return { entries, problems: [{ kind: 'malformed', entry: null, text: `watch.usb.protected is not a list: ${shown(protectedList)}` }] }
    protectedList.forEach((raw, i) => {
        const at = `entry ${i + 1} ${shown(raw)}`
        let e = raw
        if (typeof raw === 'string') {
            const s = raw.trim()
            e = VIDPID_RE.test(s) ? { vidpid: s } : PORT_RE.test(s) ? { port: s } : (USB_IFACE_RE.test(s) || isNetdevName(s)) ? { iface: s } : null
            if (!e) { problems.push({ kind: 'malformed', entry: i, text: `${at}: not a port (1-2.1), a VID:PID (1a86:7523) or an interface name (1-2.1:1.0, enx...)` }); return }
        }
        if (!e || typeof e !== 'object' || Array.isArray(e)) { problems.push({ kind: 'malformed', entry: i, text: `${at}: an entry is an object with port, vidpid or iface (and a name), or one of their strings` }); return }
        const bad = Object.keys(e).filter((k) => !ENTRY_KEYS.includes(k)).map((k) => `unknown key ${k} (the keys: ${ENTRY_KEYS.join(', ')})`)
        if (e.port !== undefined && !PORT_RE.test(String(e.port))) bad.push(`port ${shown(e.port)} is not a USB device name like 1-2.1`)
        if (e.vidpid !== undefined && !VIDPID_RE.test(String(e.vidpid))) bad.push(`vidpid ${shown(e.vidpid)} is not like 1a86:7523`)
        if (e.iface !== undefined && !USB_IFACE_RE.test(String(e.iface)) && !isNetdevName(e.iface)) bad.push(`iface ${shown(e.iface)} is not an interface name like 1-2.1:1.0 or enx00e04c680001`)
        if (e.port === undefined && e.vidpid === undefined && e.iface === undefined) bad.push('it names no device (port, vidpid or iface)')
        if (bad.length) { problems.push({ kind: 'malformed', entry: i, text: `${at}: ${bad.join('; ')}` }); return }
        entries.push({ entry: i, name: e.name === undefined ? null : String(e.name), port: e.port === undefined ? null : String(e.port), vidpid: e.vidpid === undefined ? null : String(e.vidpid).toLowerCase(), iface: e.iface === undefined ? null : String(e.iface) })
    })
    return { entries, problems }
}

// Each entry resolved on the bus as it is now. Cut mode needs every entry to name a present device, and one device when it
// gives several keys. `resolved` pins what was found (port, VID:PID, interface names), so a protected device stays protected
// by all of them, also when one of them changes (a netdev that goes with its driver, a re-plug on another port).
export function checkProtected(root, protectedList) {
    const { entries, problems } = normaliseProtected(protectedList)
    const base = path.join(root, DEV_DIR)
    const names = list(base)
    const devices = names.filter((n) => PORT_RE.test(n)).map((port) => { const r = readIn(path.join(base, port)); const v = r('idVendor'); const p = r('idProduct'); return { port, vidpid: v && p ? `${v}:${p}`.toLowerCase() : null } })
    const ifaces = names.filter((n) => USB_IFACE_RE.test(n)).map((name) => ({ name, port: name.split(':')[0], net: list(path.join(base, name, 'net')) }))
    const resolved = []
    for (const e of entries) {
        const label = `entry ${e.entry + 1}${e.name ? ` (${e.name})` : ''}`
        const found = []; const missing = []; let offUsb = null
        if (e.port) { if (devices.some((d) => d.port === e.port)) found.push([`port ${e.port}`, [e.port]]); else missing.push(`port ${e.port}: no device on it`) }
        if (e.vidpid) { const ps = devices.filter((d) => d.vidpid === e.vidpid).map((d) => d.port); if (ps.length) found.push([e.vidpid, ps]); else missing.push(`${e.vidpid}: no such device on the bus`) }
        if (e.iface) {
            const ps = [...new Set(ifaces.filter((i) => i.name === e.iface || i.net.includes(e.iface)).map((i) => i.port))].filter((p) => devices.some((d) => d.port === p))
            if (ps.length) found.push([`interface ${e.iface}`, ps])
            else if (!USB_IFACE_RE.test(e.iface) && fs.existsSync(path.join(root, 'sys/class/net', e.iface))) offUsb = e.iface // on this machine, not on USB: nothing to cut
            else missing.push(`interface ${e.iface}: not on this machine`)
        }
        if (missing.length) { problems.push({ kind: 'absent', entry: e.entry, text: `${label}: ${missing.join('; ')}` }); continue }
        const ports = found.length ? found.reduce((acc, [, ps]) => acc.filter((p) => ps.includes(p)), found[0][1]) : []
        if ((offUsb && found.length) || (found.length && !ports.length)) {
            problems.push({ kind: 'mismatch', entry: e.entry, text: `${label}: its keys name different devices (${[...found.map(([k, ps]) => `${k} is ${ps.join(', ')}`), ...(offUsb ? [`interface ${offUsb} is not on USB`] : [])].join('; ')})` })
            continue
        }
        for (const port of ports) {
            const own = ifaces.filter((i) => i.port === port)
            resolved.push({ entry: e.entry, name: e.name, port, vidpid: devices.find((d) => d.port === port).vidpid, ifaces: [...own.map((i) => i.name), ...own.flatMap((i) => i.net)] })
        }
        if (offUsb) resolved.push({ entry: e.entry, name: e.name, port: null, vidpid: null, ifaces: [offUsb], offUsb: true })
    }
    return { entries, resolved, problems }
}

// Why cut mode may not start on this list, or null when it may (the policy at start, `watch.mjs check`, install.sh).
export function cutRefusal(check) {
    if (check.problems.length) return `USB cut refused: watch.usb.protected must name every device it protects, on the bus now: ${check.problems.map((p) => p.text).join('; ')}; warn only`
    if (!check.entries.length) return 'USB cut refused: the venue profile names no protected device (watch.usb.protected); warn only'
    return null
}

// Why a device must never be cut, or null when it may be. `protectedList`: entries as written and as resolved at start.
export function protectionOf(dev, protectedList = []) {
    if (!dev.exists) return 'gone from the bus'
    if (dev.isRoot) return 'a root hub'
    if (dev.deviceClass === '09') return 'a hub: cutting it drops every device behind it'
    if (dev.interfaces.some((i) => i.net)) return 'a network adapter: a laser LAN or the show link may run on it'
    if (dev.interfaces.some((i) => i.cls === '08')) return 'storage'
    for (const p of protectedList) {
        const name = p.name ? ` (${p.name})` : ''
        const ifaceNames = [p.iface, ...(p.ifaces || [])].filter(Boolean).map(String)
        const ports = [p.port, ...ifaceNames.map((n) => USB_IFACE_RE.exec(n)?.[1])].filter(Boolean).map(String)
        const hit = ifaceNames.find((n) => dev.interfaces.some((i) => i.name === n || (i.netNames || []).includes(n)))
        if (hit) return `the protected interface ${hit}${name}`
        if (ports.includes(dev.port)) return `on a protected port ${dev.port}${name}`
        if (p.vidpid && String(p.vidpid).toLowerCase() === dev.vidpid) return `a protected device ${dev.vidpid}${name}`
        const behind = ports.find((pp) => pp.startsWith(dev.port + '.'))
        if (behind) return `the protected port ${behind}${name} is behind it`
    }
    // The machine's own input and radio (the uhubctl caution, RESEARCH-show-safety 4): a keyboard or a trackpad (HID, class
    // 03) and the Bluetooth controller they may run on (class e0) are never cut, whatever floods; they are warned about only.
    if (dev.deviceClass === 'e0' || dev.interfaces.some((i) => i.cls === 'e0')) return 'a Bluetooth controller: the machine\'s own keyboard and trackpad may run on it'
    if (dev.interfaces.some((i) => i.cls === '03')) return 'an input device (HID): it may be the machine\'s own keyboard or trackpad'
    return null
}

// The sysfs writes for one cut and the writes that undo it. Interface level: only audio-streaming interfaces.
export function planCut(dev, level, root = '/') {
    const base = path.join(root, DEV_DIR)
    if (level === 'interface') {
        const targets = dev.interfaces.filter((i) => i.cls === '01' && i.sub === '02' && i.authorized !== '0')
        if (!targets.length) return null
        return {
            level,
            writes: targets.map((i) => ({ path: path.join(base, i.name, 'authorized'), value: '0' })),
            undo: [
                ...targets.map((i) => ({ path: path.join(base, i.name, 'authorized'), value: '1' })),
                ...targets.map((i) => ({ path: path.join(root, PROBE), value: i.name }))
            ]
        }
    }
    return { level: 'device', writes: [{ path: path.join(base, dev.port, 'authorized'), value: '0' }], undo: [{ path: path.join(base, dev.port, 'authorized'), value: '1' }] }
}

export const opText = (o) => `write ${o.value} > ${o.path}`
const defaultWriter = (p, v) => fs.writeFileSync(p, v)

export class UsbPolicy {
    constructor({ root = '/', mode = 'warn', protectedList = [], ledgerFile = null, dryRun = false, reauthAfterMs = REAUTH_AFTER_MS, maxFloods = MAX_FLOODS, now = () => Date.now(), writer = defaultWriter, warnEveryMs = 60000, lockWaitMs = LOCK_WAIT_MS, say = () => {} } = {}) {
        Object.assign(this, { root, asked: mode === 'cut' ? 'cut' : 'warn', protectedRaw: protectedList, ledgerFile, dryRun, reauthAfterMs, maxFloods, now, writer, warnEveryMs, lockWaitMs, say })
        // Cut mode fails closed (verify C, C2): it starts only when every protected entry names a device on the bus; else the
        // policy runs warn and `refused` says why (the watch holds it as an alert: events.log, latest.json, /show-status).
        const check = checkProtected(root, protectedList)
        this.protectedList = [...check.entries, ...check.resolved]
        this.problems = check.problems
        this.refused = this.asked === 'cut' ? cutRefusal(check) : null
        this.mode = this.refused ? 'warn' : this.asked
        this.ports = {}
        this.lastWarn = new Map()
        this.written = [] // every write made (or, in a dry run, printed), for the record and the tests
        this.ledgerError = null
        try { this.load() } catch (e) { this.ledgerError = e.message }
    }

    // The ledger is the one truth for every process that cuts: the service and a person's `cut` and `undo` (each a process
    // of its own). Every change re-reads it and writes it back under an exclusive lock file (open(2): O_CREAT|O_EXCL), by
    // rename(2): a person's cut is never dropped by the service's next save, and the service sees a person's undo.
    load() {
        if (!this.ledgerFile) return
        let text
        try { text = fs.readFileSync(this.ledgerFile, 'utf8') } catch (e) { if (e.code === 'ENOENT') { this.ports = {}; return } throw e }
        try { this.ports = JSON.parse(text).ports || {} } catch (e) { throw new Error(`the cut ledger ${this.ledgerFile} is unreadable (${e.message}); nothing was changed: read it, then mend or move it`) }
    }

    lock() {
        if (!this.ledgerFile || this.dryRun) return () => {}
        const file = `${this.ledgerFile}.lock`
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const until = Date.now() + this.lockWaitMs
        for (;;) {
            try {
                const fd = fs.openSync(file, 'wx')
                try { fs.writeSync(fd, `${process.pid}\n`) } finally { fs.closeSync(fd) }
                return () => { try { fs.unlinkSync(file) } catch { /* already gone */ } }
            } catch (e) { if (e.code !== 'EEXIST') throw e }
            // A holder that died leaves its lock: its pid is gone (kill(2) with signal 0 says ESRCH), or the lock is 10 s old.
            let pid; let ageMs
            try { pid = Number.parseInt(fs.readFileSync(file, 'utf8'), 10); ageMs = Date.now() - fs.statSync(file).mtimeMs } catch { continue }
            let dead = ageMs > STALE_LOCK_MS
            if (!dead && Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0) } catch (k) { dead = k.code === 'ESRCH' } }
            if (dead) { try { fs.unlinkSync(file) } catch { /* another process broke it first */ } continue }
            if (Date.now() > until) throw new Error(`the cut ledger is locked by pid ${pid} (${file}); nothing was changed`)
            Atomics.wait(SLEEP, 0, 0, 20)
        }
    }

    transact(fn) {
        const release = this.lock()
        try { this.load(); this.ledgerError = null; return fn() } finally { release() }
    }

    save() {
        if (!this.ledgerFile || this.dryRun) return
        fs.mkdirSync(path.dirname(this.ledgerFile), { recursive: true })
        const tmp = `${this.ledgerFile}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify({ schema: 'di.stage-watch.cuts/1', ports: this.ports }, null, 2))
        fs.renameSync(tmp, this.ledgerFile)
    }

    apply(ops) {
        const failed = []
        for (const o of ops) {
            this.written.push({ ...o, dryRun: this.dryRun })
            if (this.dryRun) continue
            try { this.writer(o.path, o.value) } catch (e) { failed.push(`${opText(o)}: ${e.code || e.message}`) }
        }
        return failed
    }

    entry(port) { return (this.ports[port] ||= { floods: 0, cut: null, stopped: false }) }

    // Before every cut and once a tick, in cut mode: an entry that no longer names a present device (pulled, or back as
    // another device) turns cut mode to warn for the rest of the run, said once through `say`. Only a restart, which runs the
    // start check again, brings cut mode back.
    guard() {
        if (this.mode !== 'cut') return
        const c = checkProtected(this.root, this.protectedRaw)
        if (!c.problems.length) return
        this.mode = 'warn'
        this.refused = `USB cut mode turned to warn: ${c.problems.map((p) => p.text).join('; ')}; cut mode comes back only when the watch restarts with every protected device present`
        this.say(this.refused)
    }

    // A device crossed its flood limit. Returns what was done, or null when it is already handled.
    onFlood(port) {
        this.guard()
        const dev = readDevice(this.root, port)
        const why = protectionOf(dev, this.protectedList)
        const plan = dev.exists ? (planCut(dev, 'interface', this.root) || planCut(dev, 'device', this.root)) : null
        const t = this.now()
        if (why || this.mode === 'warn') {
            if (t - (this.lastWarn.get(port) ?? -Infinity) < this.warnEveryMs) return null
            this.lastWarn.set(port, t)
            if (why) return { action: 'protected', port, text: `${describe(dev)} is ${why}: never cut, warn only` }
            return { action: 'warn', port, plan, text: `${describe(dev)}: mode warn, not cut. A cut would ${plan.writes.map(opText).join('; ')}` }
        }
        return this.transact(() => {
            const e = this.entry(port)
            if (e.cut || e.stopped) return null
            e.floods += 1
            const failed = this.apply(plan.writes)
            e.cut = { ...plan, at: t, reauthAt: e.floods < this.maxFloods ? t + this.reauthAfterMs : null, device: describe(dev) }
            if (e.floods >= this.maxFloods) e.stopped = true
            this.save()
            const tail = e.stopped ? `flood ${e.floods} of ${this.maxFloods}: stays cut until a person runs undo` : `flood ${e.floods} of ${this.maxFloods}: re-authorized once in ${this.reauthAfterMs / 1000} s`
            return { action: `${this.dryRun ? 'dry-run ' : ''}cut-${plan.level}`, port, plan, failed, text: `${describe(dev)} cut at ${plan.level} level (${plan.writes.map(opText).join('; ')}); ${tail}${failed.length ? '; FAILED: ' + failed.join('; ') : ''}` }
        })
    }

    // Once a tick: escalate an interface cut whose device still floods; re-authorize a cut whose 30 s are over.
    // `tickStartMs` is when this tick's lines began: only a tick that began after the interface cut can say the device
    // still floods, so the lines that crossed the limit before the cut never escalate it. `counts`: this tick's lines per port.
    // Warn mode never escalates (a person's interface cut sits in the same ledger); it still re-authorizes on time.
    onTick(floodingPorts = new Set(), tickStartMs = -Infinity, counts = {}) {
        this.guard()
        return this.transact(() => {
            const out = []
            const t = this.now()
            for (const [port, e] of Object.entries(this.ports)) {
                if (!e.cut) continue
                if (this.mode === 'cut' && e.cut.level === 'interface' && floodingPorts.has(port) && tickStartMs >= e.cut.at) {
                    const dev = readDevice(this.root, port)
                    if (protectionOf(dev, this.protectedList)) continue
                    const plan = planCut(dev, 'device', this.root)
                    const failed = this.apply(plan.writes)
                    const lines = Number.isFinite(counts[port]) ? `${counts[port]} error lines` : 'a flood'
                    const since = new Date(e.cut.at).toISOString()
                    e.cut = { ...e.cut, level: 'device', writes: [...e.cut.writes, ...plan.writes], undo: [...plan.undo, ...e.cut.undo], at: t, reauthAt: e.stopped ? null : t + this.reauthAfterMs }
                    this.save()
                    out.push({ action: `${this.dryRun ? 'dry-run ' : ''}cut-device`, port, text: `${describe(dev)} still floods after the interface cut (${lines} in a tick that began after the cut at ${since}): device cut (${plan.writes.map(opText).join('; ')})${failed.length ? '; FAILED: ' + failed.join('; ') : ''}` })
                } else if (e.cut.reauthAt !== null && t >= e.cut.reauthAt && !e.stopped) {
                    const failed = this.apply(e.cut.undo)
                    out.push({ action: 'reauthorized', port, text: `${e.cut.device} re-authorized once after ${this.reauthAfterMs / 1000} s (flood ${e.floods} of ${this.maxFloods})${failed.length ? '; FAILED: ' + failed.join('; ') : ''}` })
                    e.cut = null
                    this.save()
                }
            }
            return out
        })
    }

    // A person's cut (the CLI): the same rules, no timer; only `undo` brings it back.
    cutNow(port, level = 'interface') {
        const dev = readDevice(this.root, port)
        const why = protectionOf(dev, this.protectedList)
        if (why) return { action: 'refused', port, text: `${describe(dev)} is ${why}: never cut` }
        const plan = (level === 'interface' && planCut(dev, 'interface', this.root)) || planCut(dev, 'device', this.root)
        return this.transact(() => {
            const failed = this.apply(plan.writes)
            const e = this.entry(port)
            e.cut = { ...plan, at: this.now(), reauthAt: null, device: describe(dev), byPerson: true }
            this.save()
            return { action: `${this.dryRun ? 'dry-run ' : ''}cut-${plan.level}`, port, plan, failed, text: `${describe(dev)} cut at ${plan.level} level` }
        })
    }

    // One command undoes every cut this watch made, and forgets the flood counts.
    undoAll() {
        return this.transact(() => {
            const out = []
            for (const [port, e] of Object.entries(this.ports)) {
                if (e.cut) {
                    const failed = this.apply(e.cut.undo)
                    out.push({ port, undo: e.cut.undo, failed })
                }
            }
            if (!this.dryRun) { this.ports = {}; this.save() }
            return out
        })
    }

    summary() {
        return Object.entries(this.ports).filter(([, e]) => e.cut || e.floods).map(([port, e]) => ({ port, floods: e.floods, cut: e.cut ? e.cut.level : null, stopped: e.stopped, reauthAt: e.cut?.reauthAt ? new Date(e.cut.reauthAt).toISOString() : null }))
    }
}

// The re-check 30 s after a hot-plug (the udev rule asks systemd for it): errors since the plug, and the port plan.
// Exit codes: 0 ok, 1 a flood, 2 not on its planned port, 3 not on the bus 30 s after its own plug (a WARN, never a pass),
// 4 not a USB device name (the unit passed it wrong: systemd's %I would unescape 1-2.1 to 1/2.1, so the unit uses %i).
export function recheck(port, { root = '/', recent = {}, tickS = 5, portPlan = [], th = { usbErrPerSec: 20, usbErrMinLines: 20 } } = {}) {
    if (!PORT_RE.test(String(port ?? ''))) return { code: 4, text: `recheck ${port}: not a USB device name (like 1-2.1); nothing was checked` }
    const dev = readDevice(root, port)
    if (!dev.exists) return { code: 3, text: `recheck ${port}: not on the bus 30 s after its plug (pulled again, or back on another port); nothing was checked` }
    const last = (recent[port] || []).slice(-Math.round(30 / tickS))
    const n = last.reduce((a, b) => a + b, 0)
    const flood = n >= th.usbErrMinLines && n / (last.length * tickS || 1) >= th.usbErrPerSec
    const planned = portPlan.find((p) => p.vidpid && String(p.vidpid).toLowerCase() === dev.vidpid)
    const off = planned && planned.port && String(planned.port) !== port
    const depth = (port.split('-')[1] || '').split('.').length - 1
    const parts = [`recheck ${describe(dev)}: ${n} error lines in the ${last.length * tickS} s since the plug`, dev.speed ? `${dev.speed} Mbit/s` : null, depth ? `behind ${depth} hub${depth > 1 ? 's' : ''}` : 'on a root port']
    if (off) parts.push(`NOT on its planned port ${planned.port}${planned.name ? ' (' + planned.name + ')' : ''}`)
    return { code: flood ? 1 : off ? 2 : 0, text: parts.filter(Boolean).join(', ') + (flood ? ' — FLOOD' : off ? ' — off plan' : ' — ok') }
}
