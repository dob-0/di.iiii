// Tests for light_page_check.mjs (host refusal, fit math) and desk_missing_looks.py (synthetic fixtures only).
// No browser is started here: the browser part only gathers boxes; the maths is in pure functions.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { hostCheck, installedPort, fitFromBoxes, judge, parseArgs, parseSizes, countFixtures, parseLine, formatLine } from './light_page_check.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmps = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'di-check-tools-')); tmps.push(d); return d }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

// Every CLI run sets LIGHT_PAGE_CHECK_NO_BROWSER=1: the tool exits 2 before it imports playwright, so no test can start a browser.
// HOME is a temp folder (with a fake server.env holding PORT='4999' when asked), so the real install is never read.
const fakeHome = (port) => {
  const h = tmp()
  if (port) { fs.mkdirSync(path.join(h, '.di', 'run'), { recursive: true }); fs.writeFileSync(path.join(h, '.di', 'run', 'server.env'), `HOST='127.0.0.1'\nPORT='${port}'\n`) }
  return h
}
const cli = (args, { tool = path.join(here, 'light_page_check.mjs'), home = fakeHome('4999') } = {}) =>
  spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, LIGHT_PAGE_CHECK_NO_BROWSER: '1' } })
const NOBROWSER = /no browser/

describe('light_page_check: host refusal and usage', () => {
  it('rule (a): diiii.localhost and any *.diiii.localhost that is not a -test copy are refused', () => {
    const h = fakeHome('4999')
    for (const u of ['http://diiii.localhost/light/#touch', 'https://DIIII.localhost/light/', 'http://diiii.localhost:9/light/', 'http://dev.diiii.localhost/light/', 'http://reika.diiii.localhost:4123/light/', 'http://a.b-test.diiii.localhost/light/']) {
      const r = hostCheck(u, h)
      expect(r.ok, u).toBe(false)
      expect(r.reason, u).toMatch(/live desk or not a <name>-test\.diiii\.localhost/)
    }
    expect(hostCheck('http://reika-test.diiii.localhost/light/', h).ok).toBe(true)
    expect(hostCheck('http://reika-test.diiii.localhost:4123/light/', h).ok).toBe(true)
  })
  it('rule (b): a loopback host with no explicit port, or port 80 or 443, is refused', () => {
    const h = fakeHome('4999')
    for (const u of ['http://127.0.0.1/light/', 'https://127.0.0.1/light/#touch', 'http://localhost/light/', 'http://127.0.0.1:80/light/', 'https://localhost:443/light/', 'http://[::1]/light/']) {
      const r = hostCheck(u, h)
      expect(r.ok, u).toBe(false)
      expect(r.reason, u).toMatch(/no explicit scratch port/)
    }
  })
  it('rule (c): a loopback host on the installed di port (PORT in server.env) is refused; other ports pass', () => {
    const h = fakeHome('4999')
    expect(installedPort(h)).toBe('4999')
    for (const u of ['http://127.0.0.1:4999/light/', 'http://localhost:4999/light/#touch', 'http://[::1]:4999/light/']) {
      const r = hostCheck(u, h)
      expect(r.ok, u).toBe(false)
      expect(r.reason, u).toMatch(/port the installed di serves/)
    }
    for (const u of ['http://127.0.0.1:4123/light/#touch', 'http://localhost:4123/light/', 'http://[::1]:4123/light/']) expect(hostCheck(u, h).ok, u).toBe(true)
    // a missing server.env is fine (no port is refused by rule c, the others still hold)
    const none = fakeHome(null)
    expect(installedPort(none)).toBe(null)
    expect(hostCheck('http://127.0.0.1:4999/light/', none).ok).toBe(true)
    expect(hostCheck('http://127.0.0.1/light/', none).ok).toBe(false)
  })
  it('rule (d): a host that is not local is refused', () => {
    const h = fakeHome('4999')
    for (const u of ['http://dev.diiii.xyz/light/', 'http://evil-test.diiii.localhost.example.com/', 'http://192.168.1.5:4123/light/', 'http://example.com:4123/']) {
      const r = hostCheck(u, h)
      expect(r.ok, u).toBe(false)
      expect(r.reason, u).toMatch(/is not local/)
    }
    expect(hostCheck('nonsense', h).ok).toBe(false)
  })
  it('the CLI refuses before any browser: each rule gives its own line and exit 2, never the no-browser line', () => {
    const d = tmp()
    const cases = [
      ['http://diiii.localhost:9/light/', /live desk or not a/],
      ['http://127.0.0.1/light/', /no explicit scratch port/],
      ['http://127.0.0.1:4999/light/', /port the installed di serves/],
      ['http://dev.diiii.xyz/light/', /is not local/],
    ]
    for (const [u, re] of cases) {
      const r = cli(['--url', u, '--out', d, '--expect', '33'])
      expect(r.status, u).toBe(2)
      expect(r.stderr, u).toMatch(re)
      expect(r.stderr, u).not.toMatch(NOBROWSER)
    }
    expect(fs.readdirSync(d)).toEqual([])
  })
  it('an allowed scratch URL reaches the no-browser stop: exit 2, one line, nothing written', () => {
    const d = tmp()
    const r = cli(['--url', 'http://127.0.0.1:4123/light/', '--out', d, '--expect', '33'])
    expect(r.status).toBe(2)
    expect(r.stderr.trim().split('\n')).toHaveLength(1)
    expect(r.stderr).toMatch(NOBROWSER)
    expect(fs.readdirSync(d)).toEqual([])
  })
  it('usage: no --url, no --expect or --show, and a symlinked path still runs main (exit 2, not a silent 0)', () => {
    const d = tmp()
    expect(cli(['--out', d, '--expect', '33']).status).toBe(2)
    expect(cli(['--url', 'http://127.0.0.1:4123/', '--out', d]).status).toBe(2)
    const link = path.join(tmp(), 'lpc.mjs')
    fs.symlinkSync(path.join(here, 'light_page_check.mjs'), link)
    const r = cli(['--out', d, '--expect', '33'], { tool: link })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/--url is required/)
  })
  it('parses sizes and the expected count (fixtures list or object, "show" key unwrapped)', () => {
    expect(parseSizes('1536x864,844x390')).toEqual([{ width: 1536, height: 864 }, { width: 844, height: 390 }])
    expect(() => parseSizes('big')).toThrow()
    expect(countFixtures({ show: { fixtures: [{}, {}, {}] } })).toBe(3)
    expect(countFixtures({ fixtures: { a: {}, b: {} } })).toBe(2)
    expect(() => countFixtures({})).toThrow()
    expect(parseArgs(['--url', 'u', '--out', 'o', '--expect', '33']).sizes).toBe('1536x864,844x390,1536x864,766x830')
    expect(() => parseArgs(['--url', 'u', '--out', 'o', '--expect', '0'])).toThrow()
  })
})

const stage = { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }
const box = (id, l, t, w = 8, h = 8) => ({ id, left: l, top: t, right: l + w, bottom: t + h })
// n lights spread over x 10..(10+span), y 10..110
const lights = (n, span) => Array.from({ length: n }, (_, i) => box('L' + i, 10 + (span * i) / (n - 1), 10 + (i % 2) * 100))

describe('light_page_check: fit maths', () => {
  it('counts lights, drops zero-size boxes and ids seen twice', () => {
    const m = fitFromBoxes(stage, [...lights(33, 300), box('Z', 5, 5, 0, 0), box('L1', 50, 50)])
    expect(m.lights).toBe(33)
    expect(m.cut).toBe(0)
  })
  // one case per edge: a single light 5 px past that edge counts 1 cut and fails the verdict
  for (const [edge, b] of [['right', box('X', 396, 10)], ['left', box('X', -5, 10)], ['top', box('X', 10, -5)], ['bottom', box('X', 10, 196)]]) {
    it(`a light past the ${edge} edge counts 1 cut and fails`, () => {
      const m = fitFromBoxes(stage, [...lights(32, 300), b])
      expect(m.cut).toBe(1)
      const v = judge([{ label: '1-a', size: 'a', m }], 33)
      expect(v.ok).toBe(false)
      expect(v.fails.join()).toMatch(/1 light\(s\) cut/)
    })
  }
  it('a light inside every edge counts 0 cut', () => {
    expect(fitFromBoxes(stage, [...lights(32, 300), box('X', 0, 0), box('Y', 392, 192)]).cut).toBe(0)
  })
  it('a fill under 50 % fails, 50 % and over passes', () => {
    const small = fitFromBoxes({ ...stage, bottom: 400, height: 400 }, lights(33, 150))
    expect(small.fill).toBeLessThan(50)
    expect(judge([{ label: 's', size: 's', m: small }], 33).fails.join()).toMatch(/fills \d+%/)
    const big = fitFromBoxes(stage, lights(33, 300))
    expect(judge([{ label: 'b', size: 'b', m: big }], 33).ok).toBe(true)
  })
  it('the light count is exact: 33 of 34 and 34 of 33 both fail', () => {
    const m = fitFromBoxes(stage, lights(33, 300))
    expect(judge([{ label: 'a', size: 'a', m }], 33).ok).toBe(true)
    const few = judge([{ label: 'a', size: 'a', m }], 34)
    expect(few.ok).toBe(false)
    expect(few.fails.join()).toMatch(/33 lights, expected exactly 34/)
    const many = judge([{ label: 'a', size: 'a', m: fitFromBoxes(stage, lights(34, 300)) }], 33)
    expect(many.ok).toBe(false)
    expect(many.fails.join()).toMatch(/34 lights, expected exactly 33/)
  })
  it('a repeated size must return within 2 px; 3 px fails', () => {
    const a = fitFromBoxes(stage, lights(33, 300))
    const near = { ...a, rig: [a.rig[0] + 2, a.rig[1]] }
    const far = { ...a, rig: [a.rig[0] + 3, a.rig[1]] }
    const run = (c) => judge([{ label: '1', size: '1536x864', m: a }, { label: '2', size: '844x390', m: a }, { label: '3', size: '1536x864', m: c }], 33)
    expect(run(near).ok).toBe(true)
    const bad = run(far)
    expect(bad.ok).toBe(false)
    expect(bad.fails.join()).toMatch(/3: back at 1536x864/)
  })
  it('the 2026-11-27 run passes: its measured lines, copied literally from minimap-check-0638/run.txt, parsed by the tool\'s own parser', () => {
    const run = [
      '1-1536x864: box 338x283, 33 lights, 0 cut, rig 236x267 px, fills 94% of the box',
      '2-844x390: box 826x73, 33 lights, 0 cut, rig 42x47 px, fills 64% of the box',
      '3-back-to-1536x864: box 338x283, 33 lights, 0 cut, rig 236x267 px, fills 94% of the box',
      '4-766x830-your-window: box 748x112, 33 lights, 0 cut, rig 76x86 px, fills 76% of the box',
    ]
    const r = run.map(parseLine)
    expect(r.every(Boolean)).toBe(true)
    expect(r.map((x) => x.size)).toEqual(['1536x864', '844x390', '1536x864', '766x830'])
    expect(r[1].m).toEqual({ box: [826, 73], lights: 33, cut: 0, rig: [42, 47], fill: 64 })
    expect(r.map((x) => formatLine(x.label, x.m))).toEqual(run)
    expect(judge(r, 33)).toEqual({ ok: true, fails: [] })
    expect(judge(r, 34).ok).toBe(false)
  })
  it('the thin box at 844x390 passes on height only (64 %), and fails under 50 %', () => {
    const thin = parseLine('2-844x390: box 826x73, 33 lights, 0 cut, rig 42x47 px, fills 64% of the box')
    expect(judge([thin], 33).ok).toBe(true)
    expect(judge([{ ...thin, m: { ...thin.m, fill: 49 } }], 33).fails.join()).toMatch(/larger of width share and height share/)
  })
})

const hasPython = spawnSync('python3', ['--version']).status === 0
const run = (args) => spawnSync('python3', ['-I', path.join(here, 'desk_missing_looks.py'), ...args], { encoding: 'utf8' })
const wr = (d, name, obj) => { const p = path.join(d, name); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p }

describe.skipIf(!hasPython)('desk_missing_looks.py', () => {
  const OLD = { show: { looks: [{ id: 'l-keep', name: '01 Keep' }, { id: 'l-aaaa1', name: '02 Sunrise' }, { id: 'l-bbbb2', name: '03 Storm' }, { id: 'l-cc', name: '04 Ab' }] } }
  const NOW = { looks: [{ id: 'l-keep', name: '01 Keep' }] }
  it('archive record: rc 0', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: OLD.show.looks.slice(0, 2) } })
    const arch = wr(d, 'removed-1.json', { looks: [{ id: 'l-aaaa1', name: '02 Sunrise' }] })
    const r = run([o, wr(d, 'now.json', NOW), arch])
    expect(r.status, r.stdout).toBe(0)
    expect(r.stdout).toMatch(/l-aaaa1 \(02 Sunrise\): removed on purpose, in archive removed-1.json/)
  })
  it('a text line that says removed / deleted / archived is only a candidate: rc 3, with file, line number and the line', () => {
    for (const word of ['removed', 'deleted', 'ARCHIVED']) {
      const d = tmp()
      const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[2]] } })
      const rec = wr(d, 'ledger.md', `intro\nthe owner said Storm was ${word} tonight\n`)
      const r = run([o, wr(d, 'now.json', NOW), rec])
      expect(r.status, r.stdout).toBe(3)
      expect(r.stdout).toMatch(/l-bbbb2 \(03 Storm\): named on a text line, read it:/)
      expect(r.stdout).toMatch(new RegExp(`ledger.md:2: the owner said Storm was ${word} tonight`))
      expect(r.stdout).toMatch(/1 are only named on a text line/)
    }
  })
  it('the reviewer\'s three false-positive lines do not count (whole words only): rc 1, NO RECORD', () => {
    for (const line of ['owner: do not delete Storm, it stays', 'removed the brainstorm notes from the board', 'Storm look copied to ~/archive/looks for later']) {
      const d = tmp()
      const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[2]] } })
      const r = run([o, wr(d, 'now.json', NOW), wr(d, 'ledger.md', `x\n${line}\n`)])
      expect(r.status, line + r.stdout).toBe(1)
      expect(r.stdout, line).toMatch(/l-bbbb2 \(03 Storm\): NO RECORD found/)
      expect(r.stdout, line).not.toMatch(/named on a text line, read it:/)
    }
  })
  it('a long candidate line is cut to 160 characters', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[2]] } })
    const r = run([o, wr(d, 'now.json', NOW), wr(d, 'ledger.md', `Storm removed ${'z'.repeat(400)}\n`)])
    expect(r.status).toBe(3)
    const hit = r.stdout.split('\n').find((l) => l.includes('ledger.md:1:'))
    expect(hit.split('ledger.md:1: ')[1]).toHaveLength(160)
  })
  it('exit 1 wins over 3: one look only a candidate, another with no record', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[1], OLD.show.looks[2]] } })
    const r = run([o, wr(d, 'now.json', NOW), wr(d, 'ledger.md', 'Storm removed\n')])
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/named on a text line/)
    expect(r.stdout).toMatch(/l-aaaa1 \(02 Sunrise\): NO RECORD found/)
  })
  it('an archive record wins over a text candidate: rc 0', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[2]] } })
    const arch = wr(d, 'removed-2.json', { looks: [{ id: 'l-bbbb2', name: '03 Storm' }] })
    const r = run([o, wr(d, 'now.json', NOW), wr(d, 'ledger.md', 'Storm removed\n'), arch])
    expect(r.status, r.stdout).toBe(0)
  })
  it('bad or unreadable input: rc 2, one line, no traceback', () => {
    const d = tmp()
    const good = wr(d, 'old.json', { show: { looks: OLD.show.looks.slice(0, 2) } })
    for (const args of [[wr(d, 'empty.json', {}), good], [good, wr(d, 'junk.json', 'not json')], [good, path.join(d, 'missing.json')], [good, good, path.join(d, 'missing.md')], [good, good, wr(d, 'bad-rec.json', '[1,2]')]]) {
      const r = run(args)
      expect(r.status, args.join()).toBe(2)
      expect(r.stderr.trim().split('\n'), args.join()).toHaveLength(1)
      expect(r.stderr).not.toMatch(/Traceback/)
    }
  })
  it('no record: rc 1 and the look is named; a line without a removal word does not count', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[1]] } })
    const rec = wr(d, 'ledger.md', 'Sunrise looks great, keep it\n')
    const r = run([o, wr(d, 'now.json', NOW), rec])
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/l-aaaa1 \(02 Sunrise\): NO RECORD found/)
    expect(r.stdout).toMatch(/ask the lead/)
  })
  it('a name shorter than 5 letters never matches by accident', () => {
    const d = tmp()
    const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[3]] } })
    const rec = wr(d, 'ledger.md', 'ab was removed, and so was l-cc by id? no: only "Ab" here removed\n')
    const r = run([o, wr(d, 'now.json', NOW), rec])
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/l-cc \(04 Ab\): NO RECORD/)
  })
  it('bad usage: rc 2', () => {
    expect(run([]).status).toBe(2)
    expect(run(['only-one.json']).status).toBe(2)
  })
})
