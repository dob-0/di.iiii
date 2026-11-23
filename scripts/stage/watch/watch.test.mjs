// @vitest-environment node
// The stage watch (scripts/stage/watch; plan S11, gaps G04/G11/G12). The USB tree here is made up on purpose (any ids,
// any names): the watch names no production and no device of one show. The flood rate is the night's own measured
// number: 79 649 "urb status -32" lines in 30 s (2026-11-01 00:30, ledger N1712.1).
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import * as L from './lib.mjs'
import { createRequire } from 'node:module'
import { UsbPolicy, planCut, protectionOf, readDevice, recheck, checkProtected } from './usb.mjs'

const { createShowStatus } = createRequire(import.meta.url)('../../../serverXR/src/stage/showStatus.js')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WATCH = path.join(HERE, 'watch.mjs')
const NIGHT_LINES = 79649
const NIGHT_S = 30
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'di-stage-watch-test-'))
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

const TREE = {
    usb1: { idVendor: '1d6b', idProduct: '0002', bDeviceClass: '09', authorized: '1' },
    '1-2': { idVendor: '2222', idProduct: '0009', bDeviceClass: '09', product: 'Test hub', authorized: '1' },
    '1-2.1': { idVendor: 'aaaa', idProduct: '0001', bDeviceClass: '00', product: 'Test controller', authorized: '1', speed: '12' },
    '1-2.1:1.0': { bInterfaceClass: '01', bInterfaceSubClass: '01', authorized: '1' },
    '1-2.1:1.1': { bInterfaceClass: '01', bInterfaceSubClass: '02', authorized: '1' },
    '1-2.1:1.2': { bInterfaceClass: '01', bInterfaceSubClass: '03', authorized: '1' },
    '1-2.3': { idVendor: 'cccc', idProduct: '0003', bDeviceClass: '00', product: 'Test serial', authorized: '1' },
    '1-2.3:1.0': { bInterfaceClass: 'ff', bInterfaceSubClass: '01', authorized: '1' },
    '1-2.2': { idVendor: 'eeee', idProduct: '0005', bDeviceClass: '00', product: 'Test second controller', authorized: '1' },
    '1-2.2:1.0': { bInterfaceClass: 'ff', bInterfaceSubClass: '00', authorized: '1' },
    '1-4': { idVendor: 'ffff', idProduct: '0006', bDeviceClass: 'e0', product: 'Test bluetooth', authorized: '1' },
    '1-4:1.0': { bInterfaceClass: 'e0', bInterfaceSubClass: '01', authorized: '1' },
    '1-2.4': { idVendor: 'bbbb', idProduct: '0002', bDeviceClass: '00', product: 'Test ethernet', authorized: '1' },
    '1-2.4:1.0': { bInterfaceClass: 'ff', bInterfaceSubClass: 'ff', authorized: '1', net: true },
    '1-1': { idVendor: 'dddd', idProduct: '0004', bDeviceClass: '00', product: 'Test plain', authorized: '1' },
    '1-1:1.0': { bInterfaceClass: '03', bInterfaceSubClass: '00', authorized: '1' }
}
const PROTECTED = [{ name: 'serial adapter', vidpid: 'CCCC:0003' }, { name: 'planned port', port: '1-1' }]
function fakeSys() {
    const root = fs.mkdtempSync(path.join(tmpRoot, 'sys-'))
    const base = path.join(root, 'sys/bus/usb/devices')
    for (const [name, files] of Object.entries(TREE)) {
        fs.mkdirSync(path.join(base, name), { recursive: true })
        for (const [f, v] of Object.entries(files)) {
            if (f === 'net') fs.mkdirSync(path.join(base, name, 'net'))
            else fs.writeFileSync(path.join(base, name, f), `${v}\n`)
        }
    }
    fs.writeFileSync(path.join(root, 'sys/bus/usb/drivers_probe'), '')
    return root
}
const auth = (root, name) => fs.readFileSync(path.join(root, 'sys/bus/usb/devices', name, 'authorized'), 'utf8').trim()
const rec = (seq, msg, prio = 3) => `${prio},${seq},${seq * 377},-;${msg}`

// One `watch.mjs run` on a made-up tree (never the real /sys): ticks of 1 s, fed through stdin, stopped by --for.
function runWatch({ name, venue = null, feed = () => [], usbMode = 'warn', seconds = 3, args = [], readFrom = null }) {
    const root = fakeSys()
    const dir = fs.mkdtempSync(path.join(tmpRoot, `run-${name}-`))
    const latest = path.join(dir, 'latest.json'); const record = path.join(dir, 'record')
    const all = [WATCH, 'run', '--source', '-', '--sys-root', root, '--state', path.join(dir, 'state'), '--latest', latest, '--no-link', '--usb-mode', usbMode,
        '--tick', '1', '--for', String(seconds), '--quiet', ...(venue ? ['--venue', venue] : []), ...(args.includes('--record') ? [] : ['--record', record]), ...args]
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, all, { stdio: ['pipe', 'ignore', 'pipe'] })
        let err = ''
        child.stderr.on('data', (d) => { err += d })
        child.stdin.on('error', () => {})
        const timers = feed(child.stdin, root)
        child.on('exit', (code) => {
            timers.forEach(clearInterval)
            if (code !== 0) return reject(new Error(`watch ${name} exited ${code}: ${err}`))
            const base = readFrom || record
            const day = fs.existsSync(base) ? fs.readdirSync(base).find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : null
            const read = (f) => { try { return fs.readFileSync(path.join(base, day, f), 'utf8') } catch { return '' } }
            resolve({ root, latest: JSON.parse(fs.readFileSync(latest, 'utf8')), events: read('events.log'), csv: read('watch.csv'), err })
        })
    })
}

// A CSV reader good enough for RFC 4180 rows (quotes, doubled quotes, commas inside quotes).
function parseCsv(text) {
    const rows = []; let row = []; let f = ''; let q = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (ch === '"') q = false; else f += ch }
        else if (ch === '"') q = true
        else if (ch === ',') { row.push(f); f = '' }
        else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = '' }
        else f += ch
    }
    return rows
}

describe('kernel lines', () => {
    it('names the USB device of each line shape dev_err() prints', () => {
        expect(L.usbDeviceOf('usb 1-2.1: urb status -32')).toEqual({ port: '1-2.1', iface: null })
        expect(L.usbDeviceOf('snd-usb-audio 1-2.1:1.0: cannot submit urb (err -19)')).toEqual({ port: '1-2.1', iface: '1.0' })
        expect(L.usbDeviceOf('r8152 1-2.4:1.0 enp0s20u2u4: Tx status -71')).toEqual({ port: '1-2.4', iface: '1.0' })
        expect(L.usbDeviceOf('usb 1-2-port1: over-current condition')).toEqual({ port: '1-2.1', iface: null })
        expect(L.usbDeviceOf('usb usb1-port2: cannot enable')).toEqual({ port: '1-2', iface: null })
        expect(L.usbDeviceOf('EXT4-fs (sda1): mounted filesystem')).toBeNull()
        const r = L.parseKmsgRecord('3,1234,5678901,-;usb 1-2.1: urb status -32')
        expect(r).toMatchObject({ prio: 3, seq: 1234, usec: 5678901, msg: 'usb 1-2.1: urb status -32' })
        expect(L.isUsbError(r)).toBe(true)
        expect(L.isUsbError(L.parseKmsgRecord('6,1,1,-;usb 1-2.1: new full-speed USB device number 5 using xhci_hcd'))).toBe(false)
    })

    it('a flood at the night rate (79 649 lines / 30 s) raises ALERT within 10 s; a calm log never does', () => {
        let alertAt = null
        const c = new L.FloodCounter({ onEarly: ({ atMs }) => { if (alertAt === null) alertAt = atMs } })
        const split = L.makeSplitter((r) => c.add(r, r.t))
        const stepMs = (NIGHT_S * 1000) / NIGHT_LINES
        let first = null
        for (let i = 0; i < NIGHT_LINES; i++) {
            const t = i * stepMs
            if (first === null) first = t
            const r = L.parseKmsgRecord(rec(i + 1, 'usb 1-2.1: urb status -32'))
            r.t = t
            c.add(r, t)
            if (t >= 5000 && !c.tickDone) { c.tickDone = true; const s = c.take(); expect(L.evaluate({ usb: s.usb }).state).toBe('alert') }
        }
        expect(split).toBeTypeOf('function')
        expect(alertAt - first).toBeLessThanOrEqual(10000)
        expect(alertAt - first).toBeLessThan(100) // measured here: called at the 100th line, about 38 ms in
        const calm = new L.FloodCounter({ onEarly: () => { throw new Error('a calm log was called a flood') } })
        for (let i = 0; i < 30; i++) calm.add(L.parseKmsgRecord(rec(i + 1, 'usb 1-2.1: urb status -32')), i * 1000)
        expect(L.evaluate({ usb: calm.take().usb }).state).toBe('ok')
    })
})

describe('judging a sample', () => {
    it('heat by the sensor own crit, journald, throttle, kernel log gaps; defaults say unvalidated', () => {
        expect(L.DEFAULT_THRESHOLDS.validated).toBe(false)
        expect(L.evaluate({ heat: { maxC: 104, critC: 105 } }).alerts[0]).toMatchObject({ key: 'heat', level: 'alert' })
        expect(L.evaluate({ heat: { maxC: 88, critC: 105 } }).alerts[0]).toMatchObject({ key: 'heat', level: 'warn' })
        expect(L.evaluate({ heat: { maxC: 70, critC: 105 } }).state).toBe('ok')
        expect(L.evaluate({ heat: { maxC: 92, critC: null } }).alerts[0].level).toBe('alert') // fallback crit 100
        expect(L.evaluate({ journaldPct: 82 }).alerts[0]).toMatchObject({ key: 'journald', level: 'warn' })
        expect(L.evaluate({ throttleDelta: 3 }).alerts[0].key).toBe('throttle')
        expect(L.evaluate({ kmsgDropped: 2 }).alerts[0].key).toBe('kmsg')
    })

    it('the venue profile overrides thresholds and the USB mode; only it can say validated', () => {
        const f = path.join(tmpRoot, 'venue.json')
        fs.writeFileSync(f, JSON.stringify({ name: 'any', watch: { thresholds: { usbErrPerSec: 50, nonsense: 1 }, usb: { mode: 'cut', protected: PROTECTED }, link: { tailscalePeer: 'door' } } }))
        const v = L.loadVenueWatch(f)
        expect(v.thresholds.usbErrPerSec).toBe(50)
        expect(v.thresholds.validated).toBe(false)
        expect(v.thresholds.nonsense).toBeUndefined()
        expect(v.usb.mode).toBe('cut')
        expect(L.loadVenueWatch(null).usb.mode).toBe('warn')
        fs.writeFileSync(f, JSON.stringify({ watch: { usb: { mode: 'CUT!' } } }))
        expect(L.loadVenueWatch(f).usb.mode).toBe('warn')
    })

    it('link lines: tailscale direct or DERP and handshake age (field names as aylmo tailscale prints them)', () => {
        const now = Date.parse('2026-11-01T02:00:00Z')
        const doc = { BackendState: 'Running', Self: { Online: true }, Peer: { a: { HostName: 'door', Online: true, Active: true, CurAddr: '', Relay: 'fra', LastHandshake: '2026-11-01T01:59:50Z' }, b: { HostName: 'other', Active: true, CurAddr: '10.0.0.2:41641', Relay: 'fra', LastHandshake: '0001-01-01T00:00:00Z' } } }
        const t = L.parseTailscale(doc, 'door', now)
        expect(t.peer).toMatchObject({ name: 'door', mode: 'derp', relay: 'fra', handshakeAgeS: 10 })
        expect(t).toMatchObject({ activePeers: 2, directPeers: 1 })
        expect(L.linkState({ gatewayIp: '192.0.2.1', gatewayMs: 3, dnsOk: true, tailscale: t })).toBe('degraded')
        expect(L.linkState({ gatewayIp: '192.0.2.1', gatewayMs: 3, dnsOk: true, tailscale: L.parseTailscale(doc, 'other', now) })).toBe('ok')
        expect(L.linkState({ gatewayIp: '192.0.2.1', gatewayMs: null, dnsOk: false, tailscale: { state: 'Stopped', selfOnline: false } })).toBe('lost')
        expect(L.parsePingMs('64 bytes from 192.0.2.1: icmp_seq=1 ttl=64 time=0.412 ms')).toBe(0.412)
    })

    it('CSV rows: RFC 4180 quoting and every row as wide as the header', () => {
        expect(L.csvField('a,b')).toBe('"a,b"')
        expect(L.csvField('say "x"')).toBe('"say ""x"""')
        expect(L.csvField(null)).toBe('')
        const row = L.watchRow({ at: 't', tick: 1, state: 'alert', alerts: [{ level: 'alert', text: 'usb flood 1-2.1, "x"' }], usb: { '1-2.1': 13000 }, top3: [{ comm: 'a b', pct: 1 }] })
        expect(row).toHaveLength(L.WATCH_COLUMNS.length)
        expect(parseCsv(L.csvLine(row))[0]).toHaveLength(L.WATCH_COLUMNS.length)
        expect(L.linkRow({ at: 't', state: 'ok' })).toHaveLength(L.LINK_COLUMNS.length)
    })
})

describe('the USB policy', () => {
    let root
    beforeEach(() => { root = fakeSys() })

    it('protected devices are never cut, in cut mode, by the policy or by a person', () => {
        const writes = []
        const p = new UsbPolicy({ root, mode: 'cut', protectedList: PROTECTED, writer: (f, v) => writes.push([f, v]) })
        for (const port of ['usb1', '1-2', '1-2.4', '1-2.3', '1-1']) {
            expect(p.onFlood(port).action).toBe('protected')
            expect(p.cutNow(port).action).toBe('refused')
        }
        expect(protectionOf(readDevice(root, '1-2'), [{ port: '1-2.4' }])).toMatch(/hub/)
        expect(protectionOf(readDevice(root, '1-2.4'), [])).toMatch(/network adapter/)
        expect(protectionOf(readDevice(root, '1-2.3'), PROTECTED)).toMatch(/protected device cccc:0003/)
        expect(protectionOf(readDevice(root, '1-1'), PROTECTED)).toMatch(/protected port 1-1/)
        expect(writes).toEqual([])
        for (const name of ['1-2', '1-2.4', '1-2.3', '1-1']) expect(auth(root, name)).toBe('1')
    })

    it('warn mode (the default) writes nothing and says the cut it would make', () => {
        const p = new UsbPolicy({ root, protectedList: PROTECTED })
        const a = p.onFlood('1-2.1')
        expect(a.action).toBe('warn')
        expect(a.text).toContain('1-2.1:1.1/authorized')
        expect(p.written).toEqual([])
        expect(auth(root, '1-2.1:1.1')).toBe('1')
    })

    it('cut: interface first; the device only when a tick that began after the cut still floods (verify A); re-authorized once after 30 s; stays cut after the third flood; one undo', () => {
        const tick0 = 1000000
        let t = tick0 + 300 // the flood crosses its limit 300 ms into a tick
        const p = new UsbPolicy({ root, mode: 'cut', protectedList: PROTECTED, ledgerFile: path.join(root, 'state/cuts.json'), now: () => t })
        expect(p.onFlood('1-2.1').action).toBe('cut-interface')
        expect([auth(root, '1-2.1:1.0'), auth(root, '1-2.1:1.1'), auth(root, '1-2.1:1.2'), auth(root, '1-2.1')]).toEqual(['1', '0', '1', '1'])
        t = tick0 + 5000 // the end of that tick: its lines were counted before the cut, so they never escalate it
        expect(p.onTick(new Set(['1-2.1']), tick0, { '1-2.1': 100 })).toEqual([])
        expect(auth(root, '1-2.1')).toBe('1')
        t = tick0 + 10000 // the next tick began after the cut and still floods: now the device goes
        const [dev] = p.onTick(new Set(['1-2.1']), tick0 + 5000, { '1-2.1': 400 })
        expect(dev.action).toBe('cut-device')
        expect(dev.text).toMatch(/400 error lines in a tick that began after the cut/)
        expect(auth(root, '1-2.1')).toBe('0')
        t += 29000
        expect(p.onTick(new Set())).toEqual([])
        t += 1000
        expect(p.onTick(new Set())[0].action).toBe('reauthorized')
        expect([auth(root, '1-2.1'), auth(root, '1-2.1:1.1')]).toEqual(['1', '1'])
        expect(fs.readFileSync(path.join(root, 'sys/bus/usb/drivers_probe'), 'utf8')).toBe('1-2.1:1.1')
        expect(p.onFlood('1-2.1').text).toContain('flood 2 of 3')
        t += 30000; p.onTick(new Set())
        const third = p.onFlood('1-2.1')
        expect(third.text).toContain('flood 3 of 3: stays cut')
        t += 600000
        expect(p.onTick(new Set())).toEqual([])
        expect(auth(root, '1-2.1:1.1')).toBe('0')
        const again = new UsbPolicy({ root, mode: 'cut', ledgerFile: path.join(root, 'state/cuts.json') }) // the ledger survives a restart
        expect(again.summary()[0]).toMatchObject({ port: '1-2.1', floods: 3, stopped: true })
        again.undoAll()
        expect(auth(root, '1-2.1:1.1')).toBe('1')
        expect(JSON.parse(fs.readFileSync(path.join(root, 'state/cuts.json'), 'utf8')).ports).toEqual({})
    })

    it('the cut plan keeps MIDI and audio control: only audio-streaming interfaces at interface level', () => {
        const plan = planCut(readDevice(root, '1-2.1'), 'interface', root)
        expect(plan.writes.map((w) => path.basename(path.dirname(w.path)))).toEqual(['1-2.1:1.1'])
        expect(planCut(readDevice(root, '1-1'), 'interface', root)).toBeNull()
    })

    it('one ledger for the service and a person: a cut or an undo made by one is never lost by the other (verify B)', () => {
        let t = 2000000
        const ledgerFile = path.join(root, 'state/cuts.json')
        const guarded = [PROTECTED[1]] // cut mode needs a protected list that names a device on the bus (verify C2); 1-1 is never cut here
        const service = new UsbPolicy({ root, mode: 'cut', protectedList: guarded, ledgerFile, now: () => t })
        const person = () => new UsbPolicy({ root, mode: 'cut', protectedList: guarded, ledgerFile, now: () => t }) // each CLI run is a process of its own
        expect(service.onFlood('1-2.1').action).toBe('cut-interface')
        expect(person().cutNow('1-2.2').action).toBe('cut-device')
        t += 1000
        expect(service.onFlood('1-2.3').action).toBe('cut-device') // the service's next save keeps the person's cut
        expect(Object.keys(JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).ports).sort()).toEqual(['1-2.1', '1-2.2', '1-2.3'])
        expect(service.summary().map((x) => x.port).sort()).toEqual(['1-2.1', '1-2.2', '1-2.3'])
        expect(person().undoAll().map((u) => u.port).sort()).toEqual(['1-2.1', '1-2.2', '1-2.3'])
        for (const n of ['1-2.1:1.1', '1-2.2', '1-2.3']) expect(auth(root, n)).toBe('1')
        service.onTick(new Set(), t) // the reverse: the service sees the person's undo at its next tick
        expect(service.summary()).toEqual([])
        fs.writeFileSync(`${ledgerFile}.lock`, '999999999\n') // a holder that died: its lock is broken
        expect(person().cutNow('1-2.3').action).toBe('cut-device')
        fs.writeFileSync(`${ledgerFile}.lock`, `${process.pid}\n`) // a live holder: waited for, then refused with its pid
        expect(() => new UsbPolicy({ root, mode: 'cut', ledgerFile, lockWaitMs: 60 }).undoAll()).toThrow(/locked by pid \d+/)
        fs.unlinkSync(`${ledgerFile}.lock`)
        expect(new UsbPolicy({ root, mode: 'cut', ledgerFile }).undoAll().map((u) => u.port)).toEqual(['1-2.3'])
    })

    it('the machine\'s own keyboard, trackpad and Bluetooth are never cut, with no venue list at all (verify H)', () => {
        expect(protectionOf(readDevice(root, '1-1'), [])).toMatch(/input device \(HID\)/)
        expect(protectionOf(readDevice(root, '1-4'), [])).toMatch(/Bluetooth/)
        const p = new UsbPolicy({ root, mode: 'cut', writer: () => { throw new Error('nothing may be written') } })
        expect(p.onFlood('1-4').action).toBe('protected')
        expect(p.cutNow('1-1').action).toBe('refused')
    })

    it('cut mode fails closed on a list that names nothing: every entry is read and must name a device on the bus (verify C2)', () => {
        const start = (protectedList) => new UsbPolicy({ root, mode: 'cut', protectedList, writer: () => { throw new Error('nothing may be written') } })
        // The shapes that passed the round-2 check (it counted the list): a string that is no identifier, a mistyped key, an
        // empty object, a value of the wrong shape, no list; then well-formed entries that name no device on the bus.
        for (const [list, why] of [
            [[], /names no protected device/],
            [['dmx dongle'], /entry 1 "dmx dongle": not a port/],
            [[{ name: 'dmx dongle', vidPid: 'cccc:0003' }], /entry 1 .*unknown key vidPid/],
            [[{}], /entry 1 \{\}: .*it names no device/],
            [[{ vidpid: 'cccc-0003' }], /vidpid "cccc-0003" is not like 1a86:7523/],
            [{ vidpid: 'cccc:0003' }, /watch\.usb\.protected is not a list/],
            [[{ name: 'dmx dongle', vidpid: '1a86:7523' }], /entry 1 \(dmx dongle\): 1a86:7523: no such device on the bus/],
            [['1-9'], /entry 1: port 1-9: no device on it/],
            [[{ iface: 'enxgone0001' }], /interface enxgone0001: not on this machine/],
            [[{ port: '1-2.1', vidpid: 'cccc:0003' }], /its keys name different devices \(port 1-2\.1 is 1-2\.1; cccc:0003 is 1-2\.3\)/],
            [[PROTECTED[0], { vidPid: 'aaaa:0001' }], /entry 2 /]
        ]) {
            const p = start(list)
            expect([p.mode, p.refused]).toEqual(['warn', expect.stringMatching(why)])
            expect(p.onFlood('1-2.2').action).toBe('warn') // refused: the flood is said, nothing is cut
        }
        // The string form PLAN S11 writes ("1a86:7523") is read as that key, never skipped; every identifier protects.
        fs.mkdirSync(path.join(root, 'sys/bus/usb/devices/1-2.4:1.0/net/enxtest0001'), { recursive: true })
        const s = start(['CCCC:0003', '1-1', { name: 'second controller', iface: '1-2.2:1.0' }, { name: 'laser NIC', iface: 'enxtest0001' }])
        expect([s.mode, s.refused]).toEqual(['cut', null])
        expect(checkProtected(root, ['CCCC:0003']).resolved).toEqual([expect.objectContaining({ port: '1-2.3', vidpid: 'cccc:0003', ifaces: ['1-2.3:1.0'] })])
        expect(s.onFlood('1-2.3').text).toMatch(/a protected device cccc:0003/)
        expect(s.onFlood('1-1').text).toMatch(/protected port 1-1/)
        expect(s.onFlood('1-2.2').text).toMatch(/the protected interface 1-2\.2:1\.0 \(second controller\)/)
        expect(s.cutNow('1-2.2').action).toBe('refused')
        // Pinned at start: the laser NIC stays protected when its netdev goes with its driver (the network-adapter rule is blind then).
        fs.rmSync(path.join(root, 'sys/bus/usb/devices/1-2.4:1.0/net'), { recursive: true })
        expect(protectionOf(readDevice(root, '1-2.4'), [])).toBe(null)
        expect(protectionOf(readDevice(root, '1-2.4'), s.protectedList)).toMatch(/the protected interface 1-2\.4:1\.0 \(laser NIC\)/)
    })

    it('a protected device that leaves the bus turns cut mode to warn and says so once; warn mode never escalates a cut (verify C2)', () => {
        const said = []; let t = 1000
        const svc = new UsbPolicy({ root, mode: 'cut', protectedList: PROTECTED, ledgerFile: path.join(root, 'state/cuts.json'), now: () => t, say: (x) => said.push(x) })
        expect(svc.onFlood('1-2.1').action).toBe('cut-interface') // armed: every protected device is on the bus
        for (const n of ['1-2.3', '1-2.3:1.0']) fs.rmSync(path.join(root, 'sys/bus/usb/devices', n), { recursive: true }) // the serial adapter is pulled
        t = 7000
        expect(svc.onTick(new Set(['1-2.1']), 6000, { '1-2.1': 500 })).toEqual([]) // the flood goes on: no device cut in warn
        expect(svc.mode).toBe('warn')
        expect(said).toEqual([expect.stringMatching(/^USB cut mode turned to warn: entry 1 \(serial adapter\): cccc:0003: no such device on the bus; cut mode comes back only when the watch restarts/)])
        expect([auth(root, '1-2.1'), auth(root, '1-2.1:1.1')]).toEqual(['1', '0'])
        expect(svc.onFlood('1-2.2').action).toBe('warn') // a new flood is said, not cut
        expect(auth(root, '1-2.2')).toBe('1')
        expect(said).toHaveLength(1)
        t = 40000 // the interface cut made before the downgrade is still re-authorized on time
        expect(svc.onTick(new Set(), 39000, {}).map((a) => a.action)).toEqual(['reauthorized'])
        expect(auth(root, '1-2.1:1.1')).toBe('1')
    })

    it('the cut dry run prints its sysfs writes and the undo, and writes nothing', () => {
        const out = execFileSync(process.execPath, [WATCH, 'cut', '1-2.1', '--dry-run', '--sys-root', root, '--state', path.join(root, 'state')], { encoding: 'utf8' })
        const dev = path.join(root, 'sys/bus/usb/devices')
        expect(out).toContain(`write 0 > ${dev}/1-2.1:1.1/authorized`)
        expect(out).toContain('undo (one command: node scripts/stage/watch/watch.mjs undo):')
        expect(out).toContain(`write 1 > ${dev}/1-2.1:1.1/authorized`)
        expect(out).toContain(`write 1-2.1:1.1 > ${root}/sys/bus/usb/drivers_probe`)
        expect(auth(root, '1-2.1:1.1')).toBe('1')
        expect(fs.existsSync(path.join(root, 'state/cuts.json'))).toBe(false)
        const refused = (() => { try { execFileSync(process.execPath, [WATCH, 'cut', '1-2.4', '--dry-run', '--sys-root', root], { encoding: 'utf8' }); return '' } catch (e) { return e.stdout } })()
        expect(refused).toMatch(/network adapter.*: never cut/)
    })

    it('the 30 s re-check after a hot-plug: errors since the plug, and the planned port', () => {
        expect(recheck('1-2.1', { root, recent: { '1-2.1': [0, 0, 13000, 13000, 13000, 13000] } }).code).toBe(1)
        expect(recheck('1-2.1', { root, recent: {} }).text).toMatch(/0 error lines.*behind 1 hub.*ok$/)
        const off = recheck('1-2.1', { root, portPlan: [{ name: 'controller', vidpid: 'aaaa:0001', port: '1-1' }] })
        expect(off.code).toBe(2)
        expect(off.text).toContain('NOT on its planned port 1-1')
        expect(recheck('1-2.9', { root }).code).toBe(3) // not on the bus just after its own plug: a WARN, never a pass
        expect(recheck('1/2.1', { root }).code).toBe(4) // what systemd's %I made of 1-2.1
    })

    it('the re-check unit, rendered and run for the instance udev gives it, checks the real device (verify D)', () => {
        const unit = fs.readFileSync(path.join(HERE, 'systemd/di-stage-watch-recheck@.service'), 'utf8')
        expect(fs.readFileSync(path.join(HERE, 'systemd/90-di-stage-watch.rules'), 'utf8')).toContain('di-stage-watch-recheck@%k.timer') // udev(7): %k = 1-2.1
        expect(fs.readFileSync(path.join(HERE, 'systemd/di-stage-watch-recheck@.timer'), 'utf8')).toContain('Unit=di-stage-watch-recheck@%i.service')
        // systemd.unit(5): %i is the instance as given; %I is the same with the escaping undone (systemd-escape --unescape).
        const unescape = (s) => { try { return execFileSync('systemd-escape', ['--unescape', '--', s], { encoding: 'utf8' }).trim() } catch { return s.replace(/-/g, '/').replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))) } }
        const exec = unit.split('\n').find((l) => l.startsWith('ExecStart=')).slice('ExecStart='.length)
        const [bin, ...args] = exec.replace(/%i/g, '1-2.1').replace(/%I/g, unescape('1-2.1')).replace('@NODE@', process.execPath).replace('@WATCH_DIR@', HERE).replace('$DI_STAGE_WATCH_ARGS', '').trim().split(/\s+/)
        const out = execFileSync(bin, [...args, '--sys-root', root, '--latest', path.join(root, 'none.json'), '--record', path.join(root, 'rec')], { encoding: 'utf8' })
        expect(out).toMatch(/^recheck 1-2\.1 aaaa:0001 Test controller: 0 error lines/)
        expect(unescape('1-2.1')).toBe('1/2.1') // why %I was wrong
    })
})

describe('the watch as it runs', () => {
    it('replays the night rate in real time: ALERT within 10 s; the record and latest.json have their shapes; its own CPU is measured', async () => {
        const dir = fs.mkdtempSync(path.join(tmpRoot, 'run-'))
        const runOne = (feed) => new Promise((resolve, reject) => {
            const latest = path.join(dir, `${feed ? 'flood' : 'idle'}-latest.json`)
            const record = path.join(dir, feed ? 'flood' : 'idle')
            const child = spawn(process.execPath, [WATCH, 'run', '--source', '-', '--record', record, '--state', path.join(record, 'state'), '--latest', latest, '--no-link', '--usb-mode', 'warn', '--dry-run', '--for', '16', '--quiet'], { stdio: ['pipe', 'ignore', 'pipe'] })
            let err = ''
            child.stderr.on('data', (d) => { err += d })
            child.stdin.on('error', () => {}) // the watch exits at --for while the feed may still write
            let seq = 0; let firstAt = null; let timer = null
            if (feed) {
                const perBatch = Math.round(NIGHT_LINES / NIGHT_S / 10)
                setTimeout(() => {
                    timer = setInterval(() => {
                        if (firstAt === null) firstAt = Date.now()
                        let chunk = ''
                        for (let i = 0; i < perBatch; i++) chunk += rec(++seq, 'usb 1-2.1: urb status -32') + '\n'
                        if (!child.stdin.destroyed) child.stdin.write(chunk)
                    }, 100)
                }, 1500)
            }
            child.on('exit', (code) => { clearInterval(timer); code === 0 ? resolve({ record, latest, firstAt, seq }) : reject(new Error(`watch exited ${code}: ${err}`)) })
        })
        const [flood, idle] = await Promise.all([runOne(true), runOne(false)])
        const day = (r) => path.join(r, fs.readdirSync(r).find((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)))
        const events = fs.readFileSync(path.join(day(flood.record), 'events.log'), 'utf8').split('\n')
        const alert = events.find((l) => / ALERT usb flood 1-2\.1/.test(l))
        expect(alert).toBeTruthy()
        const latencyMs = Date.parse(alert.slice(0, 24)) - flood.firstAt
        expect(latencyMs).toBeLessThanOrEqual(10000)
        expect(events.some((l) => / USB warn 1-2\.1/.test(l) || / USB protected 1-2\.1/.test(l) || /gone from the bus/.test(l))).toBe(true)
        const csv = parseCsv(fs.readFileSync(path.join(day(flood.record), 'watch.csv'), 'utf8'))
        expect(csv[0]).toEqual([...L.WATCH_COLUMNS])
        expect(csv.length).toBeGreaterThanOrEqual(3)
        for (const r of csv) expect(r).toHaveLength(L.WATCH_COLUMNS.length)
        const col = (rows, name) => rows.slice(1).map((r) => Number(r[L.WATCH_COLUMNS.indexOf(name)])).filter(Number.isFinite)
        expect(Math.max(...col(csv, 'usb_top_lines'))).toBeGreaterThan(10000)
        const latest = JSON.parse(fs.readFileSync(flood.latest, 'utf8'))
        expect(latest).toMatchObject({ schema: 'di.stage-watch.latest/1', usb: { mode: 'warn', dryRun: true }, thresholds: { validated: false } })
        expect(Array.isArray(latest.usb.recent['1-2.1'])).toBe(true)
        // Steady ticks only: the first tick carries the start, the last one is the short tick at --for.
        const steady = (rows) => [rows[0], ...rows.slice(2, -1)]
        const idleCpu = col(steady(parseCsv(fs.readFileSync(path.join(day(idle.record), 'watch.csv'), 'utf8'))), 'self_cpu_pct')
        const floodCpu = col(steady(csv), 'self_cpu_pct')
        const mean = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100
        console.log(`stage watch, measured on ${os.hostname()}: ALERT ${latencyMs} ms after the first flood line; own CPU (steady ticks) idle mean ${mean(idleCpu)} % (max ${Math.max(...idleCpu)}), at the night rate mean ${mean(floodCpu)} % (max ${Math.max(...floodCpu)}); ${flood.seq} lines replayed`)
        expect(mean(idleCpu)).toBeLessThan(2)
        // At the night's rate (verify F): a REGRESSION bound, not the plan's 2 % bar. Measured on aylmo 2026-11-01, the mean
        // was 1.57-2.35 % over 13 runs (old and new code alike), so 2 % is not met reliably there: an open row (README).
        expect(mean(floodCpu)).toBeLessThan(3)
    }, 40000)

    it('install.sh --dry-run renders the unit, the timer, the udev rule and needs no root', () => {
        const out = execFileSync('bash', [path.join(HERE, 'install.sh'), '--dry-run'], { encoding: 'utf8' })
        expect(out).toContain('would write /etc/systemd/system/di-stage-watch.service')
        expect(out).toContain('would write /etc/udev/rules.d/90-di-stage-watch.rules')
        expect(out).toContain('ENV{SYSTEMD_WANTS}+="di-stage-watch-recheck@%k.timer"')
        expect(out).toContain('OnActiveSec=30s')
        expect(out).toContain('DI_STAGE_WATCH_ARGS="--usb-mode warn --show-status http://127.0.0.1:4000/show-status"') // verify I
        expect(out).toContain('recheck %i $DI_STAGE_WATCH_ARGS')
        const refused = spawnSync('bash', [path.join(HERE, 'install.sh'), '--dry-run', '--usb-mode', 'cut'], { encoding: 'utf8' }) // verify C
        expect(refused.status).toBe(2)
        expect(refused.stderr).toContain('cut mode needs --venue FILE whose watch.usb.protected')
        const venue = path.join(tmpRoot, 'venue-install.json')
        fs.writeFileSync(venue, JSON.stringify({ watch: { usb: { protected: [{ name: 'dmx dongle', vidpid: 'cccc:0003' }] } } }))
        const bus = fakeSys() // the presence check reads this made-up bus, never the test machine's own
        expect(execFileSync('bash', [path.join(HERE, 'install.sh'), '--dry-run', '--usb-mode', 'cut', '--venue', venue, '--sys-root', bus], { encoding: 'utf8' })).toContain(`--usb-mode cut --venue ${venue}`)
        expect(out).toContain('would run: systemctl enable --now di-stage-watch.service')
        // verify C2: a list that names nothing on the bus is refused by entry, and nothing is written
        const bad = path.join(tmpRoot, 'venue-install-c2.json')
        for (const [list, why] of [[['1a86:7523'], /entry 1: 1a86:7523: no such device on the bus/], [[{ vidPid: 'cccc:0003' }], /unknown key vidPid/], [[{}], /it names no device/], [[], /names no protected device/]]) {
            fs.writeFileSync(bad, JSON.stringify({ watch: { usb: { protected: list } } }))
            const r = spawnSync('bash', [path.join(HERE, 'install.sh'), '--dry-run', '--usb-mode', 'cut', '--venue', bad, '--sys-root', bus], { encoding: 'utf8' })
            expect([r.status, r.stdout]).toEqual([2, ''])
            expect(r.stderr).toMatch(why)
        }
        // a person's cut is refused too while the list has an entry it cannot read
        fs.writeFileSync(bad, JSON.stringify({ watch: { usb: { protected: [{ name: 'dmx dongle', vidPid: 'cccc:0003' }] } } }))
        const cli = spawnSync(process.execPath, [WATCH, 'cut', '1-2.3', '--dry-run', '--sys-root', bus, '--venue', bad], { encoding: 'utf8' })
        expect([cli.status, cli.stdout]).toEqual([1, expect.stringMatching(/^cut refused: watch\.usb\.protected cannot be read, so it guards nothing: entry 1 /)])
        if (process.getuid?.() !== 0) { // a made-up bus never stands in for the real one outside a dry run
            const real = spawnSync('bash', [path.join(HERE, 'install.sh'), '--usb-mode', 'warn', '--sys-root', bus], { encoding: 'utf8' })
            expect([real.status, real.stderr]).toEqual([2, expect.stringContaining('--sys-root (a made-up tree, for tests) needs --dry-run')])
        }
    })

    it('cut mode fails closed as it runs: a list that names nothing refuses the cut, a pulled protected device turns it to warn, /show-status says why (verify C2)', async () => {
        const venueOf = (name, list) => { const f = path.join(tmpRoot, `venue-c2-${name}.json`); fs.writeFileSync(f, JSON.stringify({ watch: { usb: { protected: list } } })); return f }
        let seq = 100000
        const lines = (port, n) => Array.from({ length: n }, () => rec(++seq, `usb ${port}: urb status -32`)).join('\n') + '\n'
        const at = (ms, port) => (w) => setTimeout(() => w.write(lines(port, 100)), ms)
        const pull = (root) => setTimeout(() => { for (const n of ['1-2.3', '1-2.3:1.0']) fs.rmSync(path.join(root, 'sys/bus/usb/devices', n), { recursive: true }) }, 1300)
        const [typo, absent, str, pulled] = await Promise.all([
            // the verifier's C2 shapes: the dongle (cccc:0003 here) under a mistyped key, and a dongle that is not plugged in
            runWatch({ name: 'c2-typo', venue: venueOf('typo', [{ name: 'dmx dongle', vidPid: 'cccc:0003' }]), feed: (w) => [at(400, '1-2.3')(w)], usbMode: 'cut', seconds: 3 }),
            runWatch({ name: 'c2-absent', venue: venueOf('absent', [{ name: 'dmx dongle', vidpid: '1a86:7523' }]), feed: (w) => [at(400, '1-2.1')(w)], usbMode: 'cut', seconds: 3 }),
            // the plain string PLAN S11 writes is read: cut mode runs, and the dongle is still never cut
            runWatch({ name: 'c2-string', venue: venueOf('string', ['cccc:0003']), feed: (w) => [at(400, '1-2.3')(w), at(600, '1-2.1')(w)], usbMode: 'cut', seconds: 3 }),
            // armed at start, then the protected device is pulled: the next flood is said, not cut
            runWatch({ name: 'c2-pulled', venue: venueOf('pulled', [{ name: 'dmx dongle', port: '1-2.3' }]), feed: (w, root) => [pull(root), at(2300, '1-2.1')(w)], usbMode: 'cut', seconds: 4 })
        ])
        expect(typo.events).toMatch(/ START watch: tick 1 s, usb warn \(cut asked, refused\)/)
        expect(typo.events).toMatch(/WARN USB cut refused: watch\.usb\.protected must name every device it protects, on the bus now: entry 1 .*unknown key vidPid/)
        expect(typo.events).not.toMatch(/ USB cut-/)
        expect([auth(typo.root, '1-2.3'), auth(typo.root, '1-2.3:1.0')]).toEqual(['1', '1'])
        expect(absent.events).toMatch(/WARN USB cut refused: .*entry 1 \(dmx dongle\): 1a86:7523: no such device on the bus/)
        expect(absent.events).toMatch(/ USB warn 1-2\.1: /)
        expect(auth(absent.root, '1-2.1:1.1')).toBe('1')
        expect(absent.latest.usb).toMatchObject({ mode: 'warn', asked: 'cut' })
        expect(str.events).toMatch(/ USB protected 1-2\.3: .*a protected device cccc:0003: never cut/)
        expect(str.events).toMatch(/ USB cut-interface 1-2\.1: /)
        expect([auth(str.root, '1-2.3'), str.latest.usb.mode]).toEqual(['1', 'cut'])
        expect(pulled.events).toMatch(/ START watch: tick 1 s, usb cut,/)
        expect(pulled.events).toMatch(/WARN USB cut mode turned to warn: entry 1 \(dmx dongle\): port 1-2\.3: no device on it/)
        expect(pulled.events).not.toMatch(/ USB cut-/)
        expect([auth(pulled.root, '1-2.1:1.1'), pulled.latest.usb.mode]).toEqual(['1', 'warn'])
        // the status route says why, from the same latest.json the desk line reads
        const latestFile = path.join(tmpRoot, 'c2-pulled-latest.json'); fs.writeFileSync(latestFile, JSON.stringify(pulled.latest))
        const route = createShowStatus({ watchFile: latestFile }).build()
        expect(route.watch.usb_mode).toBe('warn')
        expect(route.watch.alerts).toContainEqual({ key: 'usb-mode', level: 'warn', text: expect.stringContaining('USB cut mode turned to warn: entry 1 (dmx dongle): port 1-2.3: no device on it') })
    }, 20000)

    it('cut mode as it runs: a burst cuts the interface only, a flood that goes on cuts the device, no protected list refuses the cut (verify A, C)', async () => {
        const venue = path.join(tmpRoot, 'venue-protected.json')
        fs.writeFileSync(venue, JSON.stringify({ watch: { usb: { protected: [{ name: 'dmx dongle', vidpid: 'cccc:0003' }] } } }))
        let seq = 0
        const lines = (n) => Array.from({ length: n }, () => rec(++seq, 'usb 1-2.1: urb status -32')).join('\n') + '\n'
        const burst = (w) => [setTimeout(() => w.write(lines(100)), 400)] // 100 lines, then silence: the verifier's repro
        const steady = (w) => { let n = 0; return [setInterval(() => { if (n++ < 28) w.write(lines(100)) }, 100)] } // 1000 lines/s for 2.8 s
        const [b, s, n] = await Promise.all([
            runWatch({ name: 'burst', venue, feed: burst, usbMode: 'cut', seconds: 4 }),
            runWatch({ name: 'steady', venue, feed: steady, usbMode: 'cut', seconds: 4 }),
            runWatch({ name: 'no-list', feed: burst, usbMode: 'cut', seconds: 4, args: ['--show-status', path.join(tmpRoot, 'no-such-status.json')] })
        ])
        expect(b.events).toMatch(/ USB cut-interface 1-2\.1: /)
        expect(b.events).not.toMatch(/cut-device/)
        expect([auth(b.root, '1-2.1:1.1'), auth(b.root, '1-2.1')]).toEqual(['0', '1'])
        expect(s.events).toMatch(/ USB cut-interface 1-2\.1: /)
        expect(s.events).toMatch(/ USB cut-device 1-2\.1: .*still floods after the interface cut \(\d+ error lines in a tick that began after the cut/)
        expect(auth(s.root, '1-2.1')).toBe('0')
        expect(n.events).toMatch(/ USB warn 1-2\.1: /)
        expect(n.events).toMatch(/WARN USB cut refused: the venue profile names no protected device/)
        expect(n.events).toMatch(/WARN laser stops: .*no-such-status\.json ENOENT/) // verify I: a source that does not answer is said
        expect(n.latest.usb.mode).toBe('warn')
        expect(n.latest.alerts.map((a) => a.key)).toContain('usb-mode')
        expect([auth(n.root, '1-2.1:1.1'), auth(n.root, '1-2.1')]).toEqual(['1', '1'])
    }, 20000)

    it('a record it cannot write falls back and says so; laser stops come from the show-status route (verify G, I)', async () => {
        const ro = fs.mkdtempSync(path.join(tmpRoot, 'ro-')); fs.chmodSync(ro, 0o555)
        const fb = path.join(tmpRoot, 'fallback')
        const asRoot = process.getuid?.() === 0 // root writes anywhere: the read-only case cannot be made for it
        const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ laser: { stops_total: 7 } })) })
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        try {
            const url = `http://127.0.0.1:${server.address().port}/show-status`
            const r = await runWatch({ name: 'fallback', seconds: 3, args: ['--record', path.join(ro, 'record'), '--record-fallback', fb, '--show-status', url], readFrom: asRoot ? path.join(ro, 'record') : fb })
            if (!asRoot) expect(r.latest.alerts).toContainEqual(expect.objectContaining({ key: 'record', level: 'warn', text: expect.stringContaining(`recording to ${fb}`) }))
            const rows = parseCsv(r.csv)
            expect(rows.slice(1).map((row) => row[L.WATCH_COLUMNS.indexOf('laser_stops_total')])).toContain('7')
            expect(r.events).toContain(`laser stops ${url}`)
        } finally { server.close(); fs.chmodSync(ro, 0o755) }
    }, 15000)
})
