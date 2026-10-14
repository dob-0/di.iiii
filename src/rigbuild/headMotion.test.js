// head motion: the room's port must agree with the desk's function (serverXR/src/lighting/headMotion.js) to 0.01 degree at fixed
// `now` values; the desk's DMX and the room's drawing must be one arithmetic; the schema mirrors must agree.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { headOffsets, headPeakSpeed, withHeads, headUnits, HEAD_PATTERNS, HEAD_SPATIAL } from './headMotion.js'
import { normalizeRigLooks } from '../shared/projectSchema.js'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { decodeDmx } from './dmxDecode.js'
import { beamOfPanTilt } from './dmxPose.js'
import { spotAimDirection, rotationFromPanTilt } from '../project/viewport/spotLightAim.js'
import { serverNowOf } from './lookMotion.js'

const require = createRequire(import.meta.url)
const srv = require('../../serverXR/src/lighting/headMotion.js')
const cjs = require('../../shared/projectSchema.cjs')
const { Engine, makeFixture } = require('../../serverXR/src/lighting/engine.js')
const { sanitizeLook, sanitizeLayer, kindAllows } = require('../../serverXR/src/lighting/looks.js')

const NOWS = [0, 1, 999, 1000, 2000, 2500, 4000, 7777, 12345, 99999, 1791551530919, 1791551531437, 1791551539999]
const EPOCHS = [0, 1791551530500]
const UNITS = [5, -3, 0, -3, 8, 2.5, -7, 1].map((x, i) => ({ id: `u${i}`, x, z: i % 3 }))
const heads = (o) => ({ pattern: 'sweep', period_s: 8, pan_deg: 40, tilt_deg: 25, spatial: 'all', kinds: [], ...o })
const q = (period, k) => (period * 1000 * k) / 4 // k quarter periods in ms

describe('head motion: client port = desk function', () => {
    it('lists the same words as the server and the schema', () => {
        expect(HEAD_PATTERNS).toEqual(srv.HEAD_PATTERNS)
        expect(HEAD_SPATIAL).toEqual(srv.HEAD_SPATIAL)
        for (const pattern of HEAD_PATTERNS) for (const spatial of HEAD_SPATIAL) {
            const raw = { pattern, spatial, period_s: 6, pan_deg: 12, tilt_deg: 7 }
            const look = { id: 'a', aims: {}, colours: {}, heads: raw }
            const a = normalizeRigLooks({ looks: [look] }).looks[0].heads
            expect(a).toEqual({ ...raw, kinds: [] })
            expect(cjs.normalizeRigLooks({ looks: [look] }).looks[0].heads).toEqual(a)
            expect(srv.sanitizeHeadsConfig(raw)).toEqual(a)
        }
    })
    it('7 patterns x 4 spatial x 8 units x 13 instants x 2 epochs: within 0.01 degree', () => {
        let max = 0
        let count = 0
        for (const pattern of HEAD_PATTERNS) for (const spatial of HEAD_SPATIAL) for (const now of NOWS) for (const epoch of EPOCHS) {
            const h = heads({ pattern, spatial })
            const a = headOffsets(now, epoch, h, UNITS)
            const b = srv.headOffsets(now, epoch, h, UNITS)
            for (const [id, v] of a) { const w = b.get(id); max = Math.max(max, Math.abs(v.pan - w.pan), Math.abs(v.tilt - w.tilt)); count++ }
        }
        console.log(`HEADS PARITY: ${count} comparisons; max difference ${max} deg (limit 0.01)`)
        expect(count).toBe(7 * 4 * 8 * 13 * 2)
        expect(max).toBeLessThanOrEqual(0.01)
        expect(headPeakSpeed(heads({ pattern: 'figure8' }))).toBe(srv.headPeakSpeed(heads({ pattern: 'figure8' })))
    })
})

describe('head motion patterns (server function)', () => {
    const one = [{ id: 'a', x: 1 }]
    const at = (h, ms, units = one, epoch = 0) => srv.headOffsets(ms, epoch, heads(h), units).get(units[0].id)
    it('sweep: 0 at the epoch, +amp at a quarter, back after one period, tilt stays 0', () => {
        expect(at({}, 0).pan).toBeCloseTo(0, 9)
        expect(at({}, q(8, 1)).pan).toBeCloseTo(40, 9)
        expect(at({}, q(8, 3)).pan).toBeCloseTo(-40, 9)
        expect(at({}, 8000 + 1234).pan).toBeCloseTo(at({}, 1234).pan, 9)
        expect(at({}, q(8, 1)).tilt).toBe(0)
        expect(at({}, 1000 + 5000, one, 5000).pan).toBeCloseTo(40 * Math.sin(Math.PI / 4), 9)
    })
    it('nod, circle, figure8', () => {
        expect(at({ pattern: 'nod' }, q(8, 1))).toEqual({ pan: 0, tilt: 25 })
        const c = at({ pattern: 'circle' }, q(8, 1))
        expect(c.pan).toBeCloseTo(40, 9); expect(c.tilt).toBeCloseTo(0, 9)
        expect(at({ pattern: 'circle' }, 0).tilt).toBeCloseTo(25, 9)
        const f = at({ pattern: 'figure8' }, q(8, 1) / 2)
        expect(f.pan).toBeCloseTo(40 * Math.sin(Math.PI / 4), 9); expect(f.tilt).toBeCloseTo(25, 9)
    })
    it('fan is static: unit i of n at pan_deg (2i/(n-1)-1); one unit stays 0', () => {
        const us = [0, 1, 2, 3, 4].map((i) => ({ id: `f${i}`, x: i }))
        for (const ms of [0, 1234, 99999]) {
            const o = srv.headOffsets(ms, 0, heads({ pattern: 'fan' }), us)
            us.forEach((u, i) => expect(o.get(u.id).pan).toBeCloseTo(40 * (2 * i / 4 - 1), 9))
        }
        expect(at({ pattern: 'fan' }, 5000).pan).toBe(0)
    })
    it('phases: alternate, ripple, wave, cross, left-right; order follows x not input order', () => {
        const us = [{ id: 'c', x: 3 }, { id: 'a', x: -3 }, { id: 'b', x: 1 }, { id: 'd', x: 7 }]
        const o = (h) => srv.headOffsets(q(8, 1), 0, heads(h), us)
        expect(o({ spatial: 'alternate' }).get('b').pan).toBeCloseTo(-40, 9) // b is index 1
        expect(o({ spatial: 'alternate' }).get('a').pan).toBeCloseTo(40, 9)
        expect(o({ pattern: 'cross' }).get('d').pan).toBeCloseTo(-40, 9)
        expect(o({ pattern: 'cross', spatial: 'alternate' }).get('d').pan).toBeCloseTo(40, 9) // phases add: back in unison
        expect(o({ spatial: 'ripple' }).get('c').pan).toBeCloseTo(40 * Math.sin(Math.PI / 2 + Math.PI), 9) // i = 2 of 4
        expect(o({ pattern: 'wave' }).get('b').tilt).toBeCloseTo(25 * Math.sin(Math.PI / 2 + Math.PI / 2), 9)
        const lr = o({ spatial: 'left-right' })
        expect(lr.get('a').pan).toBeCloseTo(-40, 9); expect(lr.get('b').pan).toBeCloseTo(40, 9)
        expect(srv.headOffsets(5, 0, heads({}), [...us].reverse()).get('a')).toEqual(srv.headOffsets(5, 0, heads({}), us).get('a'))
    })
    it('two viewers with different local clocks and the same server offset get the same frame', () => {
        const now = 1791551539000
        const a = headOffsets(serverNowOf(now - 120, 120), 1791551530500, heads({}), UNITS)
        const b = headOffsets(serverNowOf(now - 3120, 3120), 1791551530500, heads({}), UNITS)
        expect([...b]).toEqual([...a])
        expect([...headOffsets(now - 3120, 1791551530500, heads({}), UNITS)]).not.toEqual([...a])
    })
})

// ---- the room and the DMX the desk writes are one arithmetic ----------------------------------------------------
const type = typeById(TYPE_LIBRARY, 'up-b380f')
const CH = ['pan', 'panFine', 'tilt', 'tiltFine']
const lamp = (id, hung, pan, tilt, x = 0) => ({ id, type: 'spotLight', components: { transform: { position: [x, 7, 5], rotation: rotationFromPanTilt({ pan, tilt }) }, fixture: { type: 'up-b380f', hung }, light: { intensity: 1 } } })
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI

// a desk with one head at rest on the beam of `entity`, a look with `heads`, fired at 1000; the beam it writes at `now`
const deskBeam = (entity, h, now) => {
    const hung = entity.components.fixture.hung
    const d = spotAimDirection(entity.components.transform.rotation)
    const [x, y, z] = hung ? [-d[0], -d[1], d[2]] : d
    const p = Math.atan2(x, z) * 180 / Math.PI
    const t = Math.acos(y) * 180 / Math.PI
    const [pr, tr] = type.pan_tilt_deg.value
    const bytes = (deg, range) => { const v = Math.round((deg / range + 0.5) * 65535); return [v >> 8, v & 255] }
    const [pc, pf] = bytes(p, pr); const [tc, tf] = bytes(t, tr)
    const f = makeFixture({ id: 'h1', profile: 'pptt', address: 1, universe: 0, values: { pan: pc, panFine: pf, tilt: tc, tiltFine: tf } })
    const unit = { id: 'h1', x: 0, z: 0, hung, panRange: pr, tiltRange: tr }
    const look = sanitizeLook({ id: 'L', steps: [{ values: {} }], fixtures: ['h1'], heads: { ...h, units: [unit] } })
    const layer = sanitizeLayer({ id: 'c', lookId: 'L', level: 1 })
    layer.firedAt = 1000
    const e = new Engine({ master: 255, blackout: false, fixtures: [f], raw: {}, scenes: [], activeScene: null, chase: { enabled: false, sceneIds: [], holdMs: 1000, fadeMs: 0 }, looks: [look], layers: [layer] })
    const buf = e.render(e.state, now).get(0)
    const dec = decodeDmx(CH.map((role) => ({ role })), [buf[0], buf[1], buf[2], buf[3]], type)
    return { dec, buf, beam: beamOfPanTilt(dec.pan, dec.tilt, hung) }
}

describe('room = desk', () => {
    for (const hung of [true, false]) for (const [pan, tilt] of (hung ? [[30, 40], [90, 45], [-120, 70], [0, 0]] : [[30, 100], [90, 110], [-120, 95]])) { // a standing head cannot point down: that is past its 135 stop
        it(`${hung ? 'hung' : 'standing'} rest pan ${pan} tilt ${tilt}: the room turns the beam where the DMX turns it`, () => {
            const e = lamp('h1', hung, pan, tilt)
            for (const h of [heads({ pattern: 'sweep' }), heads({ pattern: 'circle' }), heads({ pattern: 'nod', tilt_deg: 30 })]) {
                for (const now of [1000, 1000 + q(8, 1), 1000 + q(8, 3), 1000 + 1234]) {
                    const off = headOffsets(now, 1000, h, [{ id: 'h1', x: 0, z: 0 }])
                    const room = withHeads([e], off, { library: TYPE_LIBRARY })[0]
                    const roomBeam = spotAimDirection(room.components.transform.rotation)
                    const desk = deskBeam(e, h, now)
                    expect(angle(roomBeam, desk.beam)).toBeLessThan(0.05)
                }
            }
        })
    }
    it('a world +pan turns the beam anticlockwise seen from above, hung or standing', () => {
        for (const hung of [true, false]) {
            const e = lamp('h1', hung, 0, 60)
            const m = withHeads([e], new Map([['h1', { pan: 20, tilt: 0 }]]), { library: TYPE_LIBRARY })[0]
            const a = spotAimDirection(e.components.transform.rotation)
            const b = spotAimDirection(m.components.transform.rotation)
            expect((a[2] * b[0] - a[0] * b[2])).toBeGreaterThan(0) // y component of a x b ... sign of the rotation about +y
            expect(Math.abs(b[1] - a[1])).toBeLessThan(1e-6) // pan does not change the height of the beam
        }
    })
    it('zero offset leaves the entity (same object); the desk keeps the rest bytes exactly', () => {
        const e = lamp('h1', true, 30, 40)
        expect(withHeads([e], new Map([['h1', { pan: 0, tilt: 0 }]]), { library: TYPE_LIBRARY })[0]).toBe(e)
        const r = deskBeam(e, heads({ pattern: 'sweep' }), 1000)
        const rest = deskBeam(e, heads({ pattern: 'fan' }), 1000) // single unit fan = 0 offset
        expect([...r.buf.slice(0, 4)]).toEqual([...rest.buf.slice(0, 4)])
        expect(srv.moveAxis([77, 201], 0, 540, true)).toEqual([77, 201])
        expect(srv.moveAxis([77, null], 0, 540, false)).toEqual([77, null])
    })
    it('clamps to the fixture range on the desk and in the room; a head the desk moves is skipped', () => {
        expect(srv.moveAxis([255, 255], 90, 540, true)).toEqual([255, 255])
        expect(srv.moveAxis([0, 0], -90, 540, true)).toEqual([0, 0])
        const e = lamp('h1', false, 0, 0)
        const off = new Map([['h1', { pan: 10, tilt: 10 }]])
        expect(withHeads([e], off, { library: TYPE_LIBRARY, skip: new Set(['h1']) })[0]).toBe(e)
        expect(withHeads([{ ...e, components: { ...e.components, fixture: { type: 'up-hk1915' } } }], off, { library: TYPE_LIBRARY })[0].components.fixture.type).toBe('up-hk1915')
    })
    it('units: only lit heads of the kinds; a lamp without pan/tilt never moves', () => {
        const par = { ...lamp('p', true, 0, 0), components: { ...lamp('p', true, 0, 0).components, fixture: { type: 'plain-par' } } }
        const es = [lamp('a', true, 0, 0, 2), lamp('b', true, 0, 0, -2), par]
        const u = headUnits({ entities: es, library: [...TYPE_LIBRARY.types || TYPE_LIBRARY, { id: 'plain-par' }], heads: heads({}), levelOf: (id) => (id === 'b' ? 0 : 1) })
        expect(u.map((x) => x.id)).toEqual(['a'])
        expect(headUnits({ entities: es, library: [...TYPE_LIBRARY.types || TYPE_LIBRARY, { id: 'plain-par' }], heads: heads({ kinds: ['up-b380f'] }) })).toHaveLength(2)
    })
})

describe('the desk engine', () => {
    it('no heads in the look: the render is byte for byte what it was; a layer at 0 or masked off does not move', () => {
        const e = lamp('h1', true, 30, 40)
        const still = deskBeam(e, heads({ pattern: 'fan' }), 1000 + 3333)
        const base = deskBeam(e, heads({ pattern: 'fan' }), 1000)
        expect([...still.buf.slice(0, 4)]).toEqual([...base.buf.slice(0, 4)])
        const st = { layers: [{ id: 'c', lookId: 'L', on: true, level: 0, priority: 0, mask: 'all' }], looks: [{ id: 'L', kind: 'all', heads: { units: [{ id: 'x' }] } }] }
        expect(srv.headsFrame(st, 5, kindAllows)).toBeNull()
        st.layers[0].level = 1; st.layers[0].mask = 'colour'
        expect(srv.headsFrame(st, 5, kindAllows)).toBeNull()
    })
    it('16-bit: a quarter period of a 40 degree sweep moves the pan by 40 degrees +-0.01, tilt untouched', () => {
        const e = lamp('h1', false, 30, 40)
        const r0 = deskBeam(e, heads({ pattern: 'sweep' }), 1000).dec
        const r1 = deskBeam(e, heads({ pattern: 'sweep' }), 1000 + q(8, 1)).dec
        expect(Math.abs(Math.abs(r1.pan - r0.pan) - 40)).toBeLessThan(0.02)
        expect(Math.abs(r1.tilt - r0.tilt)).toBeLessThan(0.02)
        console.log(`DESK SWEEP: rest pan ${r0.pan} -> ${r1.pan} (a quarter period, 40 deg amplitude)`)
    })
})
