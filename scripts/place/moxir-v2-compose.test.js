// MOXIR v2.1 COMPOSE GUARD (part 2). The composed rig (moxir_v2_compose.py) must follow the lead's rule "owned by mount":
// cranes rig (#878) owns cut-01..11, the 6 cubes and the groups stage key / dj back / dj kicker (position, aim, levels in every look);
// the ground rig (#875) owns every other unit; planes-25 is dropped; 50 PL5403 + 18 B380F + 6 cubes + 1 smoke.
// Controls (seen failing first): a cut unit taken from the ground side, a ground unit taken from the cranes side, a 51st PAR.
//   MOXIR_COMPOSED_RIG=/abs/path.json npx vitest run scripts/place/moxir-v2-compose.test.js
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(here, 'rigs', f), 'utf8'))
const G = read('moxir-v2-ground-2026-10-09.json')
const C = read('moxir-v2-cranes-2026-10-09.json')
const COMPOSED = read(process.env.MOXIR_COMPOSED_RIG || 'moxir-v2-1-2026-10-10.json')
const CRANES_GROUPS = ['stage key', 'dj back', 'dj kicker']
const isCranes = (f) => f.id.startsWith('rig-par-cut-') || f.id.startsWith('rig-lasercube-cut-') || CRANES_GROUPS.includes(f.part)
const byId = (r) => Object.fromEntries(r.fixtures.map((f) => [f.id, f]))
const levels = (r, f) => r.looks.map((l) => [l.id, l.parts[f.part] ?? null])

// returns the list of broken rules (empty = the composition holds)
export function problems(R) {
  const out = []
  const g = byId(G)
  const c = byId(C)
  const ids = R.fixtures.map((f) => f.id)
  if (new Set(ids).size !== ids.length) out.push('duplicate ids')
  if (ids.includes('rig-par-planes-25')) out.push('planes-25 is back')
  if (!ids.includes('rig-par-cut-11')) out.push('cut-11 is missing')
  const n = (t) => R.fixtures.filter((f) => f.type === t).length
  if (n('up-pl5403') !== 50) out.push(`PL5403 count ${n('up-pl5403')} != 50`)
  if (n('up-b380f') !== 18) out.push(`B380F count ${n('up-b380f')} != 18`)
  if (n('ext-lc-ultra-mk2') !== 6) out.push(`cube count ${n('ext-lc-ultra-mk2')} != 6`)
  if (n('up-yz31p') !== 1) out.push('smoke count != 1')
  for (const f of R.fixtures) {
    const cranesSide = c[f.id] && isCranes(c[f.id])
    const src = cranesSide ? c[f.id] : g[f.id]
    const srcRig = cranesSide ? C : G
    if (!src) { out.push(`${f.id}: not in its owner's rig`); continue }
    for (const k of ['p', 'r', 'part']) if (JSON.stringify(f[k]) !== JSON.stringify(src[k])) out.push(`${f.id}: ${k} is not the ${cranesSide ? 'cranes' : 'ground'} rig's`)
    if (JSON.stringify(levels(R, f)) !== JSON.stringify(levels(srcRig, src))) out.push(`${f.id}: levels are not the ${cranesSide ? 'cranes' : 'ground'} rig's`)
  }
  return out
}
const clone = (o) => JSON.parse(JSON.stringify(o))

describe('the composed v2.1 rig follows "owned by mount"', () => {
  it('holds on the real output', () => {
    expect(problems(COMPOSED)).toEqual([])
  })
  it('every look of the composed rig is in both builds, same cues timing', () => {
    expect(COMPOSED.looks.map((l) => l.id).sort()).toEqual(G.looks.map((l) => l.id).sort())
    expect(C.looks.map((l) => l.id).sort()).toEqual(G.looks.map((l) => l.id).sort())
  })
})

describe('controls (a broken composition must FAIL)', () => {
  it('a cut unit taken from the ground side fails', () => {
    const R = clone(COMPOSED)
    const i = R.fixtures.findIndex((f) => f.id === 'rig-par-cut-03')
    R.fixtures[i] = clone(G.fixtures.find((f) => f.id === 'rig-par-cut-03'))
    expect(problems(R).join('\n')).toMatch(/rig-par-cut-03: (p|r|part) is not the cranes/)
  })
  it('a cube taken from the ground side fails', () => {
    const R = clone(COMPOSED)
    const i = R.fixtures.findIndex((f) => f.id === 'rig-lasercube-cut-02')
    R.fixtures[i] = clone(G.fixtures.find((f) => f.id === 'rig-lasercube-cut-02'))
    expect(problems(R).join('\n')).toMatch(/rig-lasercube-cut-02/)
  })
  it('the stage key taken from the ground side fails', () => {
    const R = clone(COMPOSED)
    const i = R.fixtures.findIndex((f) => f.id === 'rig-par-planes-23')
    R.fixtures[i] = clone(G.fixtures.find((f) => f.id === 'rig-par-planes-23'))
    expect(problems(R).join('\n')).toMatch(/rig-par-planes-23/)
  })
  it('a cranes level on a ground unit fails', () => {
    const R = clone(COMPOSED)
    R.looks[1].parts['hall steel'] = [R.looks[1].parts['hall steel'][0], 0.5]
    expect(problems(R).join('\n')).toMatch(/levels are not the ground/)
  })
  it('a 51st PAR fails', () => {
    const R = clone(COMPOSED)
    const extra = clone(R.fixtures.find((f) => f.id === 'rig-par-planes-24'))
    extra.id = 'rig-par-planes-51'
    R.fixtures.push(extra)
    expect(problems(R).join('\n')).toMatch(/PL5403 count 51 != 50/)
  })
  it('planes-25 back fails', () => {
    const R = clone(COMPOSED)
    R.fixtures.push(clone(G.fixtures.find((f) => f.id === 'rig-par-planes-25')))
    expect(problems(R).join('\n')).toMatch(/planes-25 is back/)
  })
})
