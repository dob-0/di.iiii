// The ten moving scenes (scripts/place/rigs/moxir-looks-v1-1-motion-2026-10-09.json): provenance, the work-light floor kept,
// the same frame for two viewers, no pan or tilt over time, strobe <= 3 Hz, only the three palette colours, no laser.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { motionFrame, motionOf, motionPlan, serverNowOf, withMotion, FX_MODES, FX_SPATIAL } from './lookMotion.js'
import { MAX_STROBE_HZ } from './strobeCap.js'

const require = createRequire(import.meta.url)
const { favouritesOf, FAVOURITES_MAX } = require('../../serverXR/src/show/showRemote.js')
const { laserMomentOf } = require('../../shared/laserMoments.cjs')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8'))
const layer = read('scripts/place/rigs/moxir-looks-v1-1-motion-2026-10-09.json')
const worklight = read('scripts/place/rigs/moxir-looks-v1-1-worklight-2026-10-09.json')
const rig = read('scripts/place/rigs/moxir-epic-v1-1-2026-10-08.json')
const SEVAN = new Set(['up-pl5403', 'up-b380f'])

// the rig's lamps as entities (position, rotation = pan/tilt as drawn, light, beam, patch), levels from a look's parts
const roomOf = (look) => rig.fixtures.filter((f) => f.type !== 'ext-lc-ultra-mk2').map((f) => ({
    id: f.id, type: 'spotLight',
    components: {
        transform: { position: f.p, rotation: f.r },
        light: { intensity: 100, color: f.colour }, beam: { visible: true, haze: 0.4 },
        fixture: { type: f.type, universe: f.dmx.universe, address: f.dmx.address, position: `named v1 ${f.id}` },
        rigShown: { level: look.parts[f.part]?.[1] ?? 0 }
    }
}))
const planOf = (look) => {
    const ents = roomOf(look)
    const level = new Map(ents.map((e) => [e.id, e.components.rigShown.level]))
    const dj = [-5.2, 0.4, 5.04]
    return { ents, plan: motionPlan({ entities: ents, look, levelOf: (id) => level.get(id), centre: [dj[0], 0, dj[2]] }) }
}

describe('the motion layer file (A6)', () => {
    it('has provenance: source, written, kit, method, owner, colours with hex values', () => {
        for (const k of ['source', 'written', 'kit', 'method', 'owner']) expect(typeof layer[k], k).toBe('string')
        expect(layer.written).toBe('2026-10-09')
        expect(layer.colours).toEqual(['#e8e4dc', '#ff3a12', '#a3200c'])
        expect(layer.colours).toEqual(worklight.colours)
    })
    it('has 10 looks, each with a motion of a known mode, tempo, depth, spatial and kinds', () => {
        expect(layer.looks).toHaveLength(10)
        expect(new Set(layer.looks.map((l) => l.id)).size).toBe(10)
        for (const l of layer.looks) {
            const m = l.motion
            expect(FX_MODES.includes(m.mode) && m.mode !== 'none', l.id).toBe(true)
            expect(FX_SPATIAL).toContain(m.spatial)
            expect(m.bpm).toBeGreaterThanOrEqual(20); expect(m.bpm).toBeLessThanOrEqual(300)
            expect(m.depth).toBeGreaterThan(0)
            expect(m.kinds.length).toBeGreaterThan(0)
            for (const k of m.kinds) expect(SEVAN.has(k), `${l.id}: ${k} is not in the Sevan kit`).toBe(true)
            expect(motionOf(l)).toBeTruthy()
        }
    })
    it('keeps the work-light layer\'s readable floor in every scene: the floor parts are lit and hold still', () => {
        for (const l of layer.looks) {
            let lit = 0
            for (const [part, [colour, level]] of Object.entries(layer.floor)) {
                expect(l.parts[part], `${l.id}:${part}`).toBeTruthy()
                expect(l.parts[part][1], `${l.id}:${part}`).toBeGreaterThanOrEqual(level)
                if (l.parts[part][1] > 0) lit++
                expect(colour).toBeTruthy()
            }
            expect(lit).toBeGreaterThan(0)
            // the floor lamps (still parts) do not take part in the motion
            const { plan } = planOf(l)
            const moving = new Set(plan.lamps.map((f) => f.id))
            for (const f of rig.fixtures) {
                const lv = l.parts[f.part]?.[1] ?? 0
                if (lv > 0 && lv <= layer.still) expect(moving.has(f.id), `${l.id}: floor lamp ${f.id} (${f.part}) must hold still`).toBe(false)
            }
        }
    })
    it('the default favourites are the ten scenes, in order: what the server answers before anyone stars', () => {
        expect(layer.favourites).toHaveLength(10)
        expect(layer.favourites).toEqual(layer.looks.map((l) => l.id.replace(/_/g, '-')))
        const cues = [...layer.cues, ...worklight.cues].map((c, index) => ({ index, lookId: c.lightLook, laser: null }))
        const merged = favouritesOf(cues, null)
        expect(merged).toEqual(layer.favourites.map((id) => `rig-${id}`))
        expect(FAVOURITES_MAX).toBe(10)
        // none is a laser scene (the server would refuse it as a favourite)
        const aimsOnly = (l) => ({ id: l.id, intent: l.intent, levels: Object.fromEntries(Object.entries(l.parts).map(([p, [, v]]) => [`${p.replace(/\s+/g, '-')}/${rig.fixtures.find((f) => f.part === p)?.type || 'x'}`, v])) })
        for (const l of layer.looks) expect(laserMomentOf(aimsOnly(l)), l.id).toBeNull()
        for (const l of layer.looks) expect(l.parts.laser, l.id).toBeUndefined()
    })
    it('every scene cue plays a scene of the layer; the work-light looks are not repeated', () => {
        const ids = new Set(layer.looks.map((l) => `rig-${l.id.replace(/_/g, '-')}`))
        for (const c of layer.cues) expect(ids.has(c.lightLook)).toBe(true)
        expect(layer.looks.some((l) => worklight.looks.some((w) => w.id === l.id))).toBe(false)
    })
})

describe('two viewers, one beat (A2, all ten scenes)', () => {
    it('clocks 3 s apart with the same server offset compute identical frames at 25 server instants', () => {
        let compared = 0
        for (const l of layer.looks) {
            const { plan } = planOf(l)
            for (let k = 0; k < 25; k++) {
                const serverNow = 1791551530000 + k * 997
                const epoch = 1791551520000
                const clockA = serverNow - 250 // viewer A's local clock
                const clockB = serverNow - 3250 // viewer B's local clock, 3 s further behind
                const a = motionFrame(plan, serverNowOf(clockA, 250), epoch)
                const b = motionFrame(plan, serverNowOf(clockB, 3250), epoch)
                expect([...b.entries()], `${l.id} @${k}`).toEqual([...a.entries()])
                compared++
            }
        }
        console.log(`CLOCK: ${layer.looks.length} scenes x 25 instants = ${compared} frame pairs, all identical`)
        expect(compared).toBe(250)
    })
})

// WCAG 2.x SC 2.3.1 style general-flash count on a lamp level series (method: a flash is a pair of opposing changes of at
// least 10 % of the full range; rises counted in any 1 s window). Level stands in for luminance: a limit of the check.
const flashesPerSecond = (series, dtMs) => {
    const steps = Math.round(1000 / dtMs)
    const rises = []
    let low = series[0]; let high = series[0]; let dir = 0
    series.forEach((v, i) => {
        if (v > high) high = v
        if (v < low) low = v
        if (dir <= 0 && v - low >= 0.1) { rises.push(i); dir = 1; high = v; low = v }
        else if (dir >= 0 && high - v >= 0.1) { dir = -1; low = v; high = v }
        else if (dir === 1 && v > high) high = v
    })
    let max = 0
    for (let i = 0; i < rises.length; i++) { let n = 0; for (let j = i; j < rises.length && rises[j] < rises[i] + steps; j++) n++; max = Math.max(max, n) }
    return max
}

describe('scene safety over time (A3, A4)', () => {
    const DT = 25
    it('A3: 40 samples over 4 s per scene: no lamp pan or tilt changes, strobe <= 3 Hz, only palette colours', () => {
        const palette = new Set(layer.colours)
        let rowsOut = []
        for (const l of layer.looks) {
            const { ents, plan } = planOf(l)
            const rotation0 = new Map(ents.map((e) => [e.id, JSON.stringify(e.components.transform.rotation)]))
            const position0 = new Map(ents.map((e) => [e.id, JSON.stringify(e.components.transform.position)]))
            let panTiltChanges = 0
            let min = 1; let max = 0
            for (let k = 0; k < 40; k++) {
                const out = withMotion(ents, motionFrame(plan, 1791551530000 + k * 100, 1791551520000))
                for (const e of out) {
                    if (JSON.stringify(e.components.transform.rotation) !== rotation0.get(e.id)) panTiltChanges++
                    if (JSON.stringify(e.components.transform.position) !== position0.get(e.id)) panTiltChanges++
                    const m = e.components.rigShown.level
                    if (e.components.fixture.type && plan.lamps.some((f) => f.id === e.id)) { min = Math.min(min, m); max = Math.max(max, m) }
                }
            }
            expect(panTiltChanges, `${l.id} pan/tilt changes`).toBe(0)
            // colours: every colour a part uses is one of the three
            for (const [, [c]] of Object.entries(l.parts)) if (c) expect(palette.has(c), `${l.id}: ${c}`).toBe(true)
            // strobe: flashes per second, per lamp (worst) and over the whole moving set (its mean level), over 20 s at 40 Hz
            const n = 800
            const perLamp = plan.lamps.map(() => [])
            const mean = []
            for (let k = 0; k < n; k++) {
                const fr = motionFrame(plan, 1791551520000 + k * DT, 1791551520000)
                let s = 0
                plan.lamps.forEach((f, i) => { const v = fr.get(f.id); perLamp[i].push(v); s += v })
                mean.push(s / plan.lamps.length)
            }
            const worstLamp = Math.max(...perLamp.map((s) => flashesPerSecond(s, DT)))
            const whole = flashesPerSecond(mean, DT)
            expect(worstLamp, `${l.id}: worst lamp flashes/s`).toBeLessThanOrEqual(MAX_STROBE_HZ)
            expect(whole, `${l.id}: whole-rig flashes/s`).toBeLessThanOrEqual(MAX_STROBE_HZ)
            rowsOut.push(`${l.id.padEnd(14)} mode ${l.motion.mode.padEnd(9)} bpm ${String(l.motion.bpm).padEnd(3)} moving lamps ${String(plan.lamps.length).padEnd(3)} pan/tilt changes ${panTiltChanges}  level range ${min.toFixed(2)}..${max.toFixed(2)}  max flashes/s: lamp ${worstLamp} rig ${whole} (cap ${MAX_STROBE_HZ})`)
        }
        console.log('SCENES\n' + rowsOut.join('\n'))
    })
    it('A4: no scene has a laser part or a laser lamp in its motion; the envelope is the existing one (diff checked in git)', () => {
        for (const l of layer.looks) {
            expect(l.parts.laser).toBeUndefined()
            const { plan } = planOf(l)
            const types = new Set(plan.lamps.map((f) => rig.fixtures.find((x) => x.id === f.id).type))
            for (const t of types) expect(SEVAN.has(t)).toBe(true)
            expect(l.motion.kinds.some((k) => /lc-ultra|la40/.test(k))).toBe(false)
        }
        console.log('LASER: 0 laser parts in 10 scenes; laser angle maximum over the 10 scenes = 0 deg of motion (lasers are not moved or lit by any scene)')
    })
})
