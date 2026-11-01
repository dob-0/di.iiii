// @vitest-environment node
// di show: the venue profile, the GO lines, the soak, the router and the defaults lint (gaps G07, G10, G12).
// Fixtures use neutral names and RFC 5737 addresses; no production name appears here (the lint reads this file too).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Refusal, SEED_DIR, checkMarker, listVenues, loadProfile } from './lib/profile.mjs'
import { evaluate } from './lib/goLines.mjs'
import { parseProbe, probeScript } from './lib/probe.mjs'
import { forbiddenTerms, lintText, lintTree } from './lib/lintDefaults.mjs'
import { runGo } from './go.mjs'
import { main, parseShowArgs } from './cli.mjs'
import { COMMANDS } from '../di/cli.mjs'

const tmps = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'di-show-')); tmps.push(d); return d }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

const VENUE = {
    venue: 'venue-a',
    production: 'run-a-2099',
    confirmed: { by: 'owner', at: '2099-01-01T10:00' },
    host: '192.0.2.10',
    user: 'tester',
    api: 'http://127.0.0.1:4999/serverXR',
    thresholds: { soakS: 30 },
    ports: [
        { role: 'dmx', path: '1-2.1', vidpid: '1a86:7523', driver: 'ch341', speedMbps: 12 },
        { role: 'laser-lan', path: '1-1', vidpid: '0bda:8153', driver: 'r8152', speedMbps: 480 }
    ],
    links: [{ role: 'laser-lan', iface: 'eth9' }],
    posture: { governor: 'performance', noTurbo: 1, acOnline: 1 },
    laser: { lso: 'Person A', operator: 'Person B', zone: { x: [0, 1] }, stopRateMaxPerHour: 10, stopPathMaxMs: 50 },
    light: {},
    midi: { device: 'test controller', statePath: 'show/api/state', field: 'midi.heardAt' },
    watch: { unit: 'di-test-watch.service', csv: '~/watch.csv' }
}
const venuesDir = (extra = {}) => {
    const d = tmp()
    for (const [name, body] of Object.entries({ 'venue-a': VENUE, ...extra })) fs.writeFileSync(path.join(d, `${name}.json`), JSON.stringify(body))
    return d
}
const profileA = (flags = {}, env = {}) => loadProfile({ flags: { venue: 'venue-a', 'venues-dir': venuesDir(), ...flags }, env, home: tmp() })

const T0 = 4_000_000_000_000
const laserState = () => ({
    cubes: [{ id: 'c1', connected: true, armed: true, stop: null, path: { pointsOut: 900, budget: 1200 } }],
    stopResume: 'manual',
    safety: { ok: true, guards: { scan: 'on' }, zone: { x: [0, 1] }, stopPathMs: 20, stopsPerHour: 1, worstHeadroom: 0.3 }
})
const probeText = ({ now = T0, marker = 'venue-a', heardAt = T0 + 15000, governor = 'performance', changes = 2 } = {}) => [
    '', '@@now', String(now), '@@marker', marker, '@@current', '/home/x/.di/releases/9.9.9',
    '@@release', JSON.stringify({ subject: [{ digest: { sha256: 'ab'.repeat(32) } }], predicate: { tests: { line: 'Tests 5 passed' }, review: { verdict: 'PASS' } } }),
    '@@patches', '', '@@page laser/', '200', '@@page light/', '200', '@@page show/', '200',
    '@@api laser 200', JSON.stringify(laserState()),
    '@@api desk 200', JSON.stringify({ looks: [1, 2, 3], unsaved: false, liveId: 'L1', blackout: false }),
    '@@api light 200', JSON.stringify({ output: { enabled: true, enttec: { connected: true } }, scenes: [1, 2], blackout: false, master: 1 }),
    '@@api midi 200', JSON.stringify({ midi: { heardAt } }),
    '@@temp', '55000', '61000', '@@throttle', 'core=0', 'package=0',
    '@@posture', `governors=${governor}`, 'driver=intel_cpufreq', 'no_turbo=1', 'epb=0', 'min_khz=500000', 'max_khz=2900000', 'cur_khz=2700000', 'ac=1',
    '@@usb', '1-2.1\t1a86:7523\t12\tch341\tUSB Serial', '1-1\t0bda:8153\t480\tr8152\tUSB LAN',
    '@@kernel', 'readable=1', '@@link eth9', 'carrier=1', `changes=${changes}`, 'rx_errors=0', 'operstate=up',
    '@@journal', 'persistent=1', '@@watch', 'active=active', 'csv_age_s=3', '@@midinodes', '2', '@@load', '0.5 0.4 0.3'
].join('\n')
const goSamples = (n = 4) => Array.from({ length: n }, (_, i) => ({ ok: true, code: 0, stderr: '', reading: parseProbe(probeText({ now: T0 + i * 10000 })) }))
const judge = (profile, samples, extra = {}) => evaluate({ profile, samples, checkpoint: { code: 0, folder: '/tmp/ck' }, soak: { plannedS: 30, actualS: 30 }, mode: 'go', ...extra })
const blockers = (r) => r.lines.filter((l) => l.mark === '!!')

describe('venue profile', () => {
    it('resolves each value by precedence: flag > DI_* env > venue file > default, and says where it came from', () => {
        const file = profileA()
        expect([file.host, file.provenance.host]).toEqual(['192.0.2.10', 'file'])
        expect([file.thresholds.soakS, file.provenance['thresholds.soakS']]).toEqual([30, 'file'])
        expect([file.thresholds.soakIntervalS, file.provenance['thresholds.soakIntervalS']]).toEqual([10, 'default'])
        const env = profileA({}, { DI_SHOW_HOST: '192.0.2.20', DI_SHOW_SOAK_S: '40' })
        expect([env.host, env.provenance.host, env.thresholds.soakS, env.provenance['thresholds.soakS']]).toEqual(['192.0.2.20', 'env', 40, 'env'])
        const flag = profileA({ host: '192.0.2.30', soak: '50' }, { DI_SHOW_HOST: '192.0.2.20', DI_SHOW_SOAK_S: '40' })
        expect([flag.host, flag.provenance.host, flag.thresholds.soakS, flag.provenance['thresholds.soakS']]).toEqual(['192.0.2.30', 'flag', 50, 'flag'])
        expect(profileA({ local: true }).host).toBe('local')
    })

    it('takes the venue from --venue before DI_VENUE, and refuses without one', () => {
        const dir = venuesDir({ 'venue-b': { ...VENUE, venue: 'venue-b' } })
        expect(loadProfile({ flags: { 'venues-dir': dir }, env: { DI_VENUE: 'venue-b' }, home: tmp() }).venue).toBe('venue-b')
        expect(loadProfile({ flags: { 'venues-dir': dir, venue: 'venue-a' }, env: { DI_VENUE: 'venue-b' }, home: tmp() }).venue).toBe('venue-a')
        expect(() => loadProfile({ flags: { 'venues-dir': dir }, env: {}, home: tmp() })).toThrow(/no venue/)
        expect(() => loadProfile({ flags: { 'venues-dir': dir, venue: 'venue-zz' }, env: {}, home: tmp() })).toThrow(/no profile for venue/)
    })

    it('refuses a venue file that leaves a device block unstated, or confirms an unknown', () => {
        const { laser, ...noLaser } = VENUE
        expect(laser).toBeTruthy()
        const dir = venuesDir({ 'venue-c': { ...noLaser, venue: 'venue-c' }, 'venue-d': { ...VENUE, venue: 'venue-d', midi: null }, 'venue-e': { ...VENUE, venue: 'venue-x' } })
        const load = (venue) => () => loadProfile({ flags: { 'venues-dir': dir, venue }, env: {}, home: tmp() })
        expect(load('venue-c')).toThrow(Refusal)
        expect(load('venue-c')).toThrow(/"laser" must be stated/)
        expect(load('venue-d')).toThrow(/"midi" is null \(unknown\) in a confirmed profile/)
        expect(load('venue-e')).toThrow(/the file name says/)
        expect(() => profileA({ soak: 'soon' })).toThrow(/not a number/)
    })

    it('refuses a machine marked for another venue; a missing marker is named, not passed', () => {
        const p = profileA()
        expect(checkMarker(p, 'venue-a\n').ok).toBe(true)
        expect(checkMarker(p, 'venue-b')).toMatchObject({ ok: false, mismatch: true })
        expect(checkMarker(p, 'venue-b').reason).toMatch(/refused/)
        expect(checkMarker(p, '')).toMatchObject({ ok: false, missing: true })
    })

    it('ships two seed profiles, both waiting for the owner to confirm them', () => {
        const seeds = listVenues({ flags: {}, env: {}, home: tmp() }).filter((v) => v.file.startsWith(SEED_DIR))
        expect(seeds.length).toBe(2)
        for (const { venue } of seeds) {
            const p = loadProfile({ flags: { venue }, env: {}, home: tmp() })
            expect(p.confirmed).toBe(false)
            expect(p.toConfirm.length).toBeGreaterThan(0)
        }
    })
})

describe('di show go: the lines', () => {
    it('gives GO on the GO fixture, every line passed or informational', () => {
        const r = judge(profileA(), goSamples())
        expect(blockers(r)).toEqual([])
        expect(r.verdict).toBe('GO')
        expect(new Set(r.lines.map((l) => l.phase))).toEqual(new Set(['setup', 'alignment', 'testing', 'performance']))
    })

    const cases = [
        ['an unconfirmed profile', (p) => { p.confirmed = false }, 'profile', /not confirmed/],
        ['no venue marker', (p, s) => { s[0].reading.marker = null }, 'marker', /no venue marker/],
        ['no release record (S10)', (p, s) => { s.at(-1).reading.release = null }, 'release', /owed: S10/],
        ['a journal that is not persistent', (p, s) => { s.at(-1).reading.journal.persistent = false }, 'journal', /not persistent/],
        ['an unreadable kernel log', (p, s) => { s.at(-1).reading.kernel.readable = false }, 'kernel-log', /not readable/],
        ['posture drift during the soak', (p, s) => { s[2].reading.posture.governors = ['schedutil'] }, 'posture', /governor schedutil, wants performance/],
        ['a device on another port', (p, s) => { s.at(-1).reading.usb[0].path = '1-2.4' }, 'port:dmx', /is at 1-2.4, the plan says 1-2.1/],
        ['a device unplugged', (p, s) => { s.at(-1).reading.usb.shift() }, 'port:dmx', /not plugged in/],
        ['a link without carrier', (p, s) => { s.at(-1).reading.links.eth9.carrier = 0 }, 'link:laser-lan', /no carrier/],
        ['no laser safety officer', (p) => { p.laser.lso = null }, 'lso', /no laser safety officer/],
        ['no safety block (S12)', (p, s) => { delete s.at(-1).reading.api.laser.json.safety }, 'safety', /owed: S12/],
        ['a safety block that says no', (p, s) => { s.at(-1).reading.api.laser.json.safety = { ...laserState().safety, ok: false, reason: 'laser.json invalid' } }, 'safety', /laser.json invalid/],
        ['a zone that differs from the profile', (p) => { p.laser.zone = { x: [0, 2] } }, 'zone', /differs/],
        ['a stop path not timed', (p, s) => { delete s.at(-1).reading.api.laser.json.safety.stopPathMs }, 'stop-path', /not timed/],
        ['a page that does not answer', (p, s) => { s.at(-1).reading.pages['show/'] = 502 }, 'page:show/', /502/],
        ['connected False in one read', (p, s) => { s[1].reading.api.laser.json.cubes[0].connected = false }, 'cube:c1', /False/],
        ['a cube not armed', (p, s) => { s.at(-1).reading.api.laser.json.cubes[0].armed = false }, 'cube:c1', /not armed/],
        ['a stopped cube', (p, s) => { s.at(-1).reading.api.laser.json.cubes[0].stop = { reason: 'link lost' } }, 'cube:c1', /link lost/],
        ['light output not connected', (p, s) => { s.at(-1).reading.api.light.json.output.enttec.connected = false }, 'light', /connected false/],
        ['MIDI heard only before the run', (p, s) => { s.at(-1).reading.api.midi.json.midi.heardAt = T0 - 5000 }, 'midi', /not heard during this run/],
        ['a watch that is not running (S11)', (p, s) => { s[1].reading.watch.active = 'failed' }, 'watch', /failed/],
        ['stale watch samples', (p, s) => { s.at(-1).reading.watch.csvAgeS = 120 }, 'watch', /120 s old/],
        ['kernel USB errors on a planned port', (p, s) => { s.at(-1).reading.kernel.errors['1-2.1'] = 7 }, 'usb-errors:dmx', /7 kernel USB errors/],
        ['a link that flapped during the soak', (p, s) => { s.at(-1).reading.links.eth9.changes = 5 }, 'link-held:laser-lan', /3 carrier changes/],
        ['throttling during the soak', (p, s) => { s.at(-1).reading.throttle.core = 4 }, 'throttle', /throttled/],
        ['unsaved bank', (p, s) => { s.at(-1).reading.api.desk.json.unsaved = true }, 'bank', /store it before the show/],
        ['a hot machine', (p, s) => { s.at(-1).reading.tempMaxC = 93 }, 'temp', /NO-GO from 90 C/],
        ['a failed read during the soak', (p, s) => { s[2] = { ok: false, code: 255, stderr: 'ssh: connect to host 192.0.2.10 port 22: No route to host' } }, 'answer', /No route to host/]
    ]
    it.each(cases)('gives NO-GO with its reason for %s', (_name, mutate, id, reason) => {
        const p = profileA()
        const s = goSamples()
        mutate(p, s)
        const r = judge(p, s)
        expect(r.verdict).toBe('NO-GO')
        const line = r.lines.find((l) => l.id === id && l.mark === '!!')
        expect(line, JSON.stringify(blockers(r))).toBeTruthy()
        expect(line.text).toMatch(reason)
    })

    it('never passes MIDI on a node count: nodes present, no heard field = NO-GO', () => {
        const s = goSamples()
        for (const x of s) { x.reading.midiNodes = 3; x.reading.api.midi.json = { midi: {} } }
        const r = judge(profileA(), s)
        expect(r.verdict).toBe('NO-GO')
        expect(r.lines.find((l) => l.id === 'midi').text).toMatch(/has no midi.heardAt \(owed: S14\)/)
        expect(r.lines.find((l) => l.id === 'midi-nodes')).toMatchObject({ mark: '..', text: expect.stringMatching(/not a pass/) })
    })

    it('gives NO-GO for a checkpoint that failed, a soak cut short, or no soak', () => {
        expect(judge(profileA(), goSamples(), { checkpoint: { code: 1, folder: '/tmp/ck', stderrTail: 'data copy failed' } }).lines.find((l) => l.id === 'checkpoint').text).toMatch(/failed \(exit 1\): data copy failed/)
        expect(judge(profileA(), goSamples(), { soak: { plannedS: 30, actualS: 12 } }).lines.find((l) => l.id === 'soak').text).toMatch(/cut short: 12 of 30/)
        const p = profileA({ soak: '0' })
        expect(judge(p, goSamples(), { soak: { plannedS: 0, actualS: 0 } }).lines.find((l) => l.id === 'soak').mark).toBe('!!')
    })

    it('states "none here" for a device the profile says is absent, and never says GO in look mode', () => {
        const p = profileA()
        p.laser = false; p.midi = false; p.watch = false
        const r = evaluate({ profile: p, samples: goSamples(1), mode: 'look' })
        expect(r.verdict).toBe('LOOK')
        expect(r.lines.find((l) => l.id === 'laser')).toMatchObject({ mark: '..', text: 'laser: none at this place (profile)' })
    })

    it('builds a probe script that carries the profile as quoted values only', () => {
        const s = probeScript(profileA())
        expect(s).toMatch(/^MARKER='~\/\.config\/di\/venue'$/m)
        expect(s).toMatch(/^APIS='laser=laser\/api\/state desk=laser\/desk\/api\/state light=light\/api\/state midi=show\/api\/state'$/m)
        expect(s).toMatch(/^IFACES='eth9'$/m)
    })
})

describe('di show go: the run', () => {
    const fakeMachine = ({ marker = 'venue-a' } = {}) => {
        const clock = { t: T0 }
        const sleeps = []
        let reads = 0
        const transport = { where: 'tester@192.0.2.10', run: async () => { reads += 1; return { code: 0, stderr: '', stdout: Buffer.from(probeText({ now: clock.t, marker })) } } }
        return { clock, sleeps, transport, reads: () => reads, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); clock.t += ms } }
    }

    it('honours the soak time: reads every interval until the soak is over, then judges', async () => {
        const m = fakeMachine()
        let checkpoints = 0
        const out = []
        const { code, result } = await runGo({ profile: profileA({ soak: '25' }), transport: m.transport, now: m.now, sleep: m.sleep, print: (s) => out.push(s), checkpointFn: async () => { checkpoints += 1; return { code: 0, folder: null } } })
        expect(m.sleeps).toEqual([10000, 10000, 5000])
        expect(m.reads()).toBe(4)
        expect(checkpoints).toBe(1)
        expect(code).toBe(0)
        expect(result.lines.find((l) => l.id === 'soak').text).toMatch(/soak 25 s, 4 reads \(25 s: ours, unvalidated\)/)
        expect(out.at(-1)).toMatch(/^== GO venue-a/m)
    })

    it('refuses before any checkpoint when the machine is marked for another venue', async () => {
        const m = fakeMachine({ marker: 'venue-b' })
        let checkpoints = 0
        const out = []
        const { code } = await runGo({ profile: profileA(), transport: m.transport, now: m.now, sleep: m.sleep, print: (s) => out.push(s), checkpointFn: async () => { checkpoints += 1; return { code: 0 } } })
        expect([code, checkpoints, m.reads()]).toEqual([2, 0, 1])
        expect(out.join('\n')).toMatch(/REFUSED: tester@192.0.2.10 is marked "venue-b"/)
    })

    it('keeps ssh stderr and the exit code when the machine does not answer', async () => {
        const out = []
        const transport = { where: 'tester@192.0.2.10', run: async () => ({ code: 255, stdout: Buffer.alloc(0), stderr: 'ssh: connect to host 192.0.2.10 port 22: Connection timed out' }) }
        const { code, result } = await runGo({ profile: profileA(), transport, print: (s) => out.push(s), checkpointFn: async () => { throw new Error('must not run') } })
        expect(code).toBe(1)
        expect(result.lines.find((l) => l.id === 'answer').text).toMatch(/Connection timed out \(exit 255\)/)
    })
})

describe('di show: the router', () => {
    it('is a di command with its own help', async () => {
        expect(Object.keys(COMMANDS)).toContain('show')
        const out = []
        expect(await main(['help'], { print: (s) => out.push(s), env: {}, home: tmp() })).toBe(0)
        expect(out.join('\n')).toMatch(/di show go --venue <id>/)
    })

    it('parses value flags in both forms and refuses a value flag without a value', () => {
        expect(parseShowArgs(['go', '--venue', 'venue-a', '--soak=20', '--look'])).toEqual({ _: ['go'], flags: { venue: 'venue-a', soak: '20', look: true } })
        expect(() => parseShowArgs(['go', '--venue'])).toThrow(/needs a value/)
    })

    it('marks this machine only for a venue it has a profile for, and refuses a profile with no machine', async () => {
        const home = tmp()
        const dir = venuesDir({ 'venue-n': { ...VENUE, venue: 'venue-n', host: null, confirmed: false } })
        const out = []
        const deps = { print: (s) => out.push(s), env: { DI_VENUES_DIR: dir }, home }
        expect(await main(['mark', 'venue-zz'], deps)).toBe(2)
        expect(await main(['mark', 'venue-a'], deps)).toBe(0)
        expect(fs.readFileSync(path.join(home, '.config/di/venue'), 'utf8')).toBe('venue-a\n')
        expect(await main(['go', '--venue', 'venue-n'], deps)).toBe(2)
        expect(out.join('\n')).toMatch(/names no machine/)
    })
})

describe('defaults lint: no production name or id in the show tools', () => {
    it('passes on the repo', () => {
        expect(forbiddenTerms().length).toBeGreaterThan(3)
        expect(lintTree()).toEqual([])
    })

    it('fails on a planted default, naming the file, the line and why', () => {
        const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, fs.readdirSync(SEED_DIR).find((n) => n.endsWith('.json'))), 'utf8'))
        const planted = [
            'const HOST = process.env.HOST || ' + JSON.stringify(seed.host || '100.' + '100.1.2'),
            'const VENUE = ' + JSON.stringify(seed.venue),
            'const GROUP = "-100' + '1234567890"',
            'const OTHER = "100.' + '64.0.9"'
        ].join('\n')
        const found = lintText('tool.mjs', planted, forbiddenTerms())
        expect(found.map((f) => f.line)).toEqual(expect.arrayContaining([1, 2, 3, 4]))
        expect(found.find((f) => f.line === 3).why).toBe('a Telegram group id')
    })

    it('learns a new venue from its file, with no code change', () => {
        const dir = venuesDir({ 'venue-q': { ...VENUE, venue: 'venue-q', production: 'run-q-2099' } })
        const root = tmp()
        fs.writeFileSync(path.join(root, 'tool.sh'), 'TARGET=${TARGET:-run-q-2099}\n')
        expect(lintTree(root, { venuesDir: dir })).toMatchObject([{ file: 'tool.sh', line: 1, term: 'run-q-2099' }])
    })
})
