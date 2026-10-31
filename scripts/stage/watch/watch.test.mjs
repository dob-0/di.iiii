// @vitest-environment node
// The stage watch (scripts/stage/watch; plan S11, gaps G04/G11/G12). The USB tree here is made up on purpose (any ids,
// any names): the watch names no production and no device of one show. The flood rate is the night's own measured
// number: 79 649 "urb status -32" lines in 30 s (2026-11-01 00:30, ledger N1712.1).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import * as L from './lib.mjs'
import { UsbPolicy, planCut, protectionOf, readDevice, recheck } from './usb.mjs'

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

    it('cut: interface first, then the device, re-authorized once after 30 s, stays cut after the third flood; one undo', () => {
        let t = 1000000
        const p = new UsbPolicy({ root, mode: 'cut', protectedList: PROTECTED, ledgerFile: path.join(root, 'state/cuts.json'), now: () => t })
        expect(p.onFlood('1-2.1').action).toBe('cut-interface')
        expect([auth(root, '1-2.1:1.0'), auth(root, '1-2.1:1.1'), auth(root, '1-2.1:1.2'), auth(root, '1-2.1')]).toEqual(['1', '0', '1', '1'])
        t += 5000
        expect(p.onTick(new Set(['1-2.1']))[0].action).toBe('cut-device')
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
    }, 40000)

    it('install.sh --dry-run renders the unit, the timer, the udev rule and needs no root', () => {
        const out = execFileSync('bash', [path.join(HERE, 'install.sh'), '--dry-run'], { encoding: 'utf8' })
        expect(out).toContain('would write /etc/systemd/system/di-stage-watch.service')
        expect(out).toContain('would write /etc/udev/rules.d/90-di-stage-watch.rules')
        expect(out).toContain('ENV{SYSTEMD_WANTS}+="di-stage-watch-recheck@%k.timer"')
        expect(out).toContain('OnActiveSec=30s')
        expect(out).toContain('DI_STAGE_WATCH_ARGS="--usb-mode warn"')
        expect(out).toContain('would run: systemctl enable --now di-stage-watch.service')
    })
})
