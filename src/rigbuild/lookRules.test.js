import { describe, expect, it } from 'vitest'
import { AIM_RULES, aimDirection, panTiltOfDirection } from './lookRules.js'
import { AIM_RULES as SCRIPT_RULES } from '../../scripts/place/rig-lib.mjs'
import { rotationFromPanTilt, spotAimDirection } from '../project/viewport/spotLightAim.js'

// The rules are the rig script's (scripts/place/rig-lib.mjs). Held equal on every rule
// both copies have, on the nave axis.
const ctx = {
    axis: 0,
    stage: { axis: 0, into: 1, front: 6.2, back: 4.2, deck: 1.2, wall: 3.2, backdrop: null },
    hall: { geometry: { runway_bottom_m: 6.56, truss_top_centre_m: 13.5 } }
}
const slots = [
    { pos: [-10.9, 0, 24], orient: 'floor', column: { faceX: -11.6 } },
    { pos: [2.5, 6.8, 5.1], orient: 'hung' },
    { pos: [0, 0, 3.95], orient: 'floor' }
]
const params = { spread_deg: 40, lean_deg: 6, in_deg: 8, x: 3, y: 9, a: 12, side_deg: 5, r: 1.3, h: 3.1, elev_deg: -24, to_audience: 0.55, rise_deg: 40, inner_rise_deg: 12, x_rise_deg: -10 }
// `backdrop` needs something standing behind the stage. The script only ever calls it with
// one (its stage builder sets `stage.backdrop` from hall.json's massing ids, and its
// `backdrop-floor` mount throws without it), so the two copies are compared against MOXIR's
// shape: the press behind the booth. With no backdrop at all only the port answers (below).
const press = { id: 'press', x_m: [-2, 3.5], y_m: [0, 3.2], z_m: [0, 3.2] }
const ctxWithBackdrop = { ...ctx, stage: { ...ctx.stage, backdrop: { ids: ['press'], x: [-2, 3.5], face: 3.2, boxes: [press] } } }
// 'bridge-underside' grazes the crane bridge over the stage: both copies read it from ctx.stage.crane.
const ctxWithCrane = { ...ctx, stage: { ...ctx.stage, crane: { z_m: 4.8, girder_bottom_m: 8.15 } } }
// the halo's 'radial' and the X's 'along-arm' read the bridge too; 'ring' and 'dj-point' the stage alone
const ctxFor = (name) => (name === 'backdrop' ? ctxWithBackdrop : ['bridge-underside', 'radial', 'along-arm'].includes(name) ? ctxWithCrane : ctx)

describe('look rules — the rig script\'s, ported', () => {
    const shared = Object.keys(SCRIPT_RULES).filter((k) => AIM_RULES[k])
    it('covers every rule the script has, and the two the looks added since', () => {
        expect(shared.length).toBe(Object.keys(SCRIPT_RULES).length)
        expect(Object.keys(AIM_RULES)).toEqual(expect.arrayContaining(['booth-key', 'backdrop']))
    })
    for (const name of shared) {
        it(`${name} answers as the script does`, () => {
            for (const [i, slot] of slots.entries()) {
                if (name === 'up-the-column' && !slot.column) continue // the script needs a column there
                const meta = { rank: i, n: 3 }
                const ours = AIM_RULES[name]({ ...slot, girder: 1 }, meta, ctxFor(name), params)
                const theirs = SCRIPT_RULES[name]({ ...slot, girder: 1 }, meta, ctxFor(name), params)
                const [k] = Object.keys(theirs)
                expect(Object.keys(ours)).toEqual([k])
                ours[k].forEach((v, j) => expect(v).toBeCloseTo(theirs[k][j], 9))
            }
        })
    }
    it('along-arm: the X lying down — each end out along its own arm, the crossing straight up', () => {
        const at = (pos) => AIM_RULES['along-arm']({ pos, orient: 'floor' }, { rank: 0, n: 1 }, ctxWithCrane, { rise_deg: 30, inner_rise_deg: 60, x_rise_deg: -10 })
        const crowd = at([0, 6.6, 4.8 + 2.25]).dir
        expect(crowd[0]).toBeCloseTo(0, 9)
        expect(crowd[1]).toBeCloseTo(Math.sin(30 * Math.PI / 180), 9) // an end rises rise_deg
        expect(crowd[2]).toBeGreaterThan(0) // out over the crowd
        const back = at([0, 6.6, 4.8 - 2.25]).dir
        expect(back[2]).toBeLessThan(0)
        expect(at([0, 6.6, 4.8 + 1.25]).dir[1]).toBeCloseTo(Math.sin(60 * Math.PI / 180), 9) // inner
        const left = at([-2.25, 6.6, 4.8]).dir
        expect(left[0]).toBeLessThan(0)
        expect(left[1]).toBeCloseTo(Math.sin(-10 * Math.PI / 180), 9) // the bridge arm's own
        expect(at([0, 6.6, 4.8]).dir).toEqual([0, 1, 0]) // on the crossing: straight up
    })
    it('backdrop with nothing behind the stage aims at the stage wall (the port only; the script never asks)', () => {
        const { target } = AIM_RULES.backdrop({ pos: [0, 0, 5], orient: 'floor' }, { rank: 0, n: 1 }, ctx, {})
        expect(target).toEqual([0, 3 * 0.6, ctx.stage.wall])
    })
    it('turns a direction into pan/tilt the spot understands, round the circle', () => {
        for (const d of [[0, 1, 0], [0, -1, 0], [0.3, 0.8, -0.5], [-0.6, -0.2, 0.7]]) {
            const l = Math.hypot(...d)
            const u = d.map((v) => v / l)
            const back = spotAimDirection(rotationFromPanTilt(panTiltOfDirection(u)))
            back.forEach((v, k) => expect(v).toBeCloseTo(u[k], 6))
        }
        expect(aimDirection({ target: [0, 10, 0] }, [0, 0, 0])).toEqual([0, 1, 0])
    })
})

describe('the halo\'s bridge PARs (RIG_BUILD.md §15.8)', () => {
    it('bridge-underside with a negative girder grazes the girder BEHIND (the halo\'s base edge lies under it), in both copies', () => {
        const back = { pos: [1.4, 6.29, 3.645], orient: 'floor' }
        const ours = AIM_RULES['bridge-underside'](back, { rank: 0, n: 1 }, ctxWithCrane, { out: 6, girder: -1.1 })
        const theirs = SCRIPT_RULES['bridge-underside'](back, { rank: 0, n: 1 }, ctxWithCrane, { out: 6, girder: -1.1 })
        expect(ours.target).toEqual(theirs.target)
        expect(ours.target[2]).toBeCloseTo(3.7, 9)
    })
})
