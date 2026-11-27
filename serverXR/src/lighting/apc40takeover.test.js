// @vitest-environment node
// Round 3 of #1398: the drawn APC40's soft takeover (drag and shared pickup) and labels from the live map only.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const D = require('./ui/apc40draw.js')
const SRC = fs.readFileSync(path.join(__dirname, 'ui/app.js'), 'utf8')
const grab = (name) => {
  const one = SRC.match(new RegExp('^(?:const|function) ' + name + '\\b.*;?$', 'm'))
  if (one && /=>/.test(one[0]) && !/\{\s*$/.test(one[0]) && /\)\);?$|\};?$/.test(one[0]) && one[0].startsWith('const')) return one[0]
  const m = SRC.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n'))
  if (!m) throw new Error('app.js has no ' + name)
  return m[0]
}
const keyFor = SRC.match(/const midiKeyFor = [\s\S]*?\) \|\| null;/)[0]

// a desk with a master at `master` (0..1); the real unit sends CC 14 ch 1
function desk(master0) {
  const st = { master: master0, applied: [] }
  const body = `
    let midiSceneLearn = null, midiLearnRow = null, midiWizardOn = false, midiArmed = true, midiLiveWait = false, midiKnobBank = null, page = 'light';
    const midiMap = { master: { type: 'cc', ch: 1, num: 14 } }, midiPickup = { master: true }, midiLastVal = {}, midiLastOn = {};
    const midiTargets = [{ key: 'master', kind: 'cc', read: () => st.master, apply: (u) => { st.master = u; st.applied.push(u) } }];
    const midiDraw = () => {}, midiHit = () => {}, window = {};
    ${keyFor}
    ${grab('midiHandle')}
    ${grab('midiApcMsg')}
    const midiRelease = () => {};
    return { midiHandle, midiApcMsg, midiPickup, midiLastVal };`
  const api = new Function('st', body)(st)
  return { st, ...api }
}
const real = (d, v) => d.midiHandle('cc', 1, 14, v / 127, v)
const drawn = (d, v) => d.midiApcMsg({ type: 'cc', ch: 1, num: 14, unit: v / 127, raw: v })

describe('1: a drawn fader uses soft takeover', () => {
  it('takeover(): a press far from the desk value sends nothing, a drag across it catches', () => {
    let s = null, sent = []
    for (const u of [0.1, 0.2, 0.3, 0.45, 0.55, 0.6, 0.5]) { const t = D.takeover(s, u, 0.5); s = t.state; if (t.send) sent.push(u) }
    expect(sent).toEqual([0.55, 0.6, 0.5])    // crossed at 0.55, then follows
  })
  it('takeover(): one press at the far end, then a small move, sends nothing (the master 129 -> 20 jump)', () => {
    let s = null, sent = 0
    for (const u of [20 / 127, 22 / 127, 21 / 127]) { const t = D.takeover(s, u, 129 / 255); s = t.state; if (t.send) sent++ }
    expect(sent).toBe(0)
  })
  it('takeover(): an unknown desk value sends nothing', () => {
    expect(D.takeover(null, 0.5, null).send).toBe(false)
    expect(D.takeover(null, 0.5, undefined).send).toBe(false)
  })
  it('takeover(): a press that lands on the cap catches at once', () => {
    expect(D.takeover(null, 0.5, 0.5).send).toBe(true)
  })
})

describe('2: the drawing leaves the real unit\'s takeover intact', () => {
  it('drawn move, then a real move far from it: no jump; the real unit catches by crossing', () => {
    const d = desk(0.5)
    drawn(d, 64)                       // drawn drag moves master to 64/127
    expect(d.st.applied.length).toBe(1)
    const after = d.st.master
    real(d, 126)                       // real fader still at the top: must not jump (was 253)
    expect(d.st.master).toBe(after)
    expect(d.st.applied.length).toBe(1)
    expect(d.midiPickup.master).toBe(true)
    real(d, 100); real(d, 60)          // crossing the desk value catches
    expect(d.midiPickup.master).toBe(false)
    expect(d.st.applied.length).toBeGreaterThan(1)
  })
  it('a real pickup that was pending does not block the drawn move', () => {
    const d = desk(0.5)
    expect(d.midiPickup.master).toBe(true)
    drawn(d, 70)
    expect(d.st.applied.length).toBe(1)
  })
})

describe('3: labels come only from the live binding map (reika map shape)', () => {
  // The REAL reika map: midi.maps of the show copy of 2026-11-27 07:31 (100 rows), saved in reikaMap.fixture.json.
  const map = {}
  for (const r of JSON.parse(fs.readFileSync(path.join(__dirname, 'reikaMap.fixture.json'), 'utf8')).maps) map[r.key] = { type: r.type, ch: r.ch, num: r.num }
  const looks = Array.from({ length: 60 }, (_, i) => ({ id: 'l' + i, name: 'Look ' + i }))
  const v = D.apc40View({ map, looks, cues: [], state: {}, page: 0, activeId: '' })
  it('names only bound functions, with the scene keys as the show binds them', () => {
    const text = v.callouts.map((c) => c.text).join(' | ')
    expect(text).toContain('Master')
    expect(text).toContain('Look pads')
    expect(text).toContain('Cue back')
    const row = (key) => v.buttons.find((b) => b.key === key)
    expect(row('cueback')).toMatchObject({ note: 82, hw: 'SCENE LAUNCH 1' })
    expect(row('cueauto')).toMatchObject({ note: 83, hw: 'SCENE LAUNCH 2' })
    expect(row('cueloop')).toMatchObject({ note: 84, hw: 'SCENE LAUNCH 3' })
    expect(row('blackout')).toMatchObject({ note: 86, hw: 'SCENE LAUNCH 5' })
    expect(row('lookpage:next')).toMatchObject({ note: 96, hw: 'RIGHT' })
    expect(row('lookpage:prev')).toMatchObject({ note: 97, hw: 'LEFT' })
  })
  it('every label names a key the map binds', () => {
    const bound = (k) => !!map[k]
    expect(bound('panic') && bound('cuego') && bound('strobe:rate')).toBe(true)   // this show binds them, so they may be labelled
    for (const k of ['grp:left:dim']) expect(bound(k)).toBe(true)
    const none = D.apc40View({ map: { master: map.master }, looks, cues: [], state: {}, page: 0 }).callouts.map((c) => c.text).join('|')
    for (const bad of ['Panic', 'Strobe', 'Zoom', 'Tempo']) expect(none).not.toContain(bad)
  })
  it('the buttons and controls tables list only bound keys', () => {
    for (const b of v.buttons) expect(map[b.key]).toBeTruthy()
    expect(v.controls.map((c) => c.key).every((k) => map[k])).toBe(true)
    for (const k of v.knobs) expect(map[k.key]).toBeTruthy()
  })
  it('an empty map still shows the preset layout, with no labels', () => {
    const e = D.apc40View({ map: {}, looks, cues: [], state: {}, page: 0 })
    expect(e.mapped).toBe(false)
    expect(e.buttons.length).toBeGreaterThan(0)
    expect(e.callouts).toEqual([])
  })
})
