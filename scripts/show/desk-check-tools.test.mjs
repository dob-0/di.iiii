// Tests for light_page_check.mjs (host refusal, fit math) and desk_missing_looks.py (synthetic fixtures only).
// No browser is started here: the browser part only gathers boxes; the maths is in pure functions.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { hostCheck, fitFromBoxes, judge, parseArgs, parseSizes, countFixtures } from './light_page_check.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmps = []
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'di-check-tools-')); tmps.push(d); return d }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

const cli = (args) => spawnSync(process.execPath, [path.join(here, 'light_page_check.mjs'), ...args], { encoding: 'utf8' })

describe('light_page_check: host refusal and usage', () => {
  it('refuses the live desk, allows scratch hosts', () => {
    expect(hostCheck('http://diiii.localhost/light/#touch').ok).toBe(false)
    expect(hostCheck('https://DIIII.localhost/light/').ok).toBe(false)
    expect(hostCheck('http://127.0.0.1:4123/light/#touch').ok).toBe(true)
    expect(hostCheck('http://localhost:4123/light/').ok).toBe(true)
    expect(hostCheck('http://reika-test.diiii.localhost/light/').ok).toBe(true)
    expect(hostCheck('http://dev.diiii.xyz/light/').ok).toBe(false)
    expect(hostCheck('http://evil-test.diiii.localhost.example.com/').ok).toBe(false)
    expect(hostCheck('nonsense').ok).toBe(false)
  })
  it('exit 2 for the live host and for no --url (no browser started)', () => {
    const d = tmp()
    const live = cli(['--url', 'http://diiii.localhost/light/#touch', '--out', d, '--expect', '33'])
    expect(live.status).toBe(2)
    expect(live.stderr).toMatch(/live desk/)
    expect(cli(['--out', d, '--expect', '33']).status).toBe(2)
    expect(cli(['--url', 'http://127.0.0.1:1/', '--out', d]).status).toBe(2)
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
  it('a light past the box edge is counted as cut and fails', () => {
    const m = fitFromBoxes(stage, [...lights(32, 300), box('X', 396, 10)])
    expect(m.cut).toBe(1)
    const v = judge([{ label: '1-a', size: 'a', m }], 33)
    expect(v.ok).toBe(false)
    expect(v.fails.join()).toMatch(/1 light\(s\) cut/)
  })
  it('a fill under 50 % fails, 50 % and over passes', () => {
    const small = fitFromBoxes({ ...stage, bottom: 400, height: 400 }, lights(33, 150))
    expect(small.fill).toBeLessThan(50)
    expect(judge([{ label: 's', size: 's', m: small }], 33).fails.join()).toMatch(/fills \d+%/)
    const big = fitFromBoxes(stage, lights(33, 300))
    expect(judge([{ label: 'b', size: 'b', m: big }], 33).ok).toBe(true)
  })
  it('too few lights fail against --expect (34 of 33)', () => {
    const m = fitFromBoxes(stage, lights(33, 300))
    expect(judge([{ label: 'a', size: 'a', m }], 34).ok).toBe(false)
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
  it('the 2026-11-27 numbers pass (33 lights, 0 cut, fill >= 50 %, back within 2 px)', () => {
    const mk = (box_, rig, fill) => ({ box: box_, lights: 33, cut: 0, rig, fill })
    const r = [
      { label: '1-1536x864', size: '1536x864', m: mk([1100, 600], [902, 520], 87) },
      { label: '2-844x390', size: '844x390', m: mk([600, 300], [340, 300], 100) },
      { label: '3-1536x864', size: '1536x864', m: mk([1100, 600], [902, 520], 87) },
      { label: '4-766x830', size: '766x830', m: mk([700, 500], [640, 400], 91) },
    ]
    expect(judge(r, 33)).toEqual({ ok: true, fails: [] })
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
  it('a text line that says removed / deleted / archived: rc 0', () => {
    for (const word of ['removed', 'deleted', 'archived']) {
      const d = tmp()
      const o = wr(d, 'old.json', { show: { looks: [OLD.show.looks[0], OLD.show.looks[2]] } })
      const rec = wr(d, 'ledger.md', `intro\nthe owner said Storm was ${word} tonight\n`)
      const r = run([o, wr(d, 'now.json', NOW), rec])
      expect(r.status, r.stdout).toBe(0)
      expect(r.stdout).toMatch(/record ledger.md:2/)
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
