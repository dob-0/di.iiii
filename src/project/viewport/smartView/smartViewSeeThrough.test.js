import { describe, expect, it } from 'vitest'
import {
    allLayersOn,
    computeRoomFrame,
    cutawayPlan,
    isOutsideEntityId,
    keptByPlan,
    layersParam,
    meshLayer,
    nearFadeMeters,
    nearFadeOpacity,
    occlusionFadeMode,
    parseLayersParam,
    planWithLayers
} from './smartViewGeometry.js'

// See-through, 2026-10-12 (owner: "we need all 3"): the near-lens fade and the layers, as plain functions.

const frame = computeRoomFrame({ archBox: { min: [-20, 0, -40], max: [20, 12, 40] }, roofMinY: 11 })

describe('occlusionFadeMode', () => {
    it("is 'near' unless the scene says otherwise", () => {
        expect(occlusionFadeMode(undefined)).toBe('near')
        expect(occlusionFadeMode({ smartView: {} })).toBe('near')
        expect(occlusionFadeMode({ smartView: { occlusionFade: true } })).toBe('near')
        expect(occlusionFadeMode({ smartView: { occlusionFade: 'near' } })).toBe('near')
        expect(occlusionFadeMode({ smartView: { occlusionFade: 'nonsense' } })).toBe('near')
    })
    it("keeps today's circle on request and false as off", () => {
        expect(occlusionFadeMode({ smartView: { occlusionFade: 'circle' } })).toBe('circle')
        expect(occlusionFadeMode({ smartView: { occlusionFade: false } })).toBe(false)
    })
})

describe('nearFadeMeters / nearFadeOpacity', () => {
    it('defaults to 2.5 m and holds an authored value to 0.25-20', () => {
        expect(nearFadeMeters({})).toBe(2.5)
        expect(nearFadeMeters({ smartView: { nearFadeM: 4 } })).toBe(4)
        expect(nearFadeMeters({ smartView: { nearFadeM: 0.01 } })).toBe(0.25)
        expect(nearFadeMeters({ smartView: { nearFadeM: 99 } })).toBe(20)
        expect(nearFadeMeters({ smartView: { nearFadeM: 'x' } })).toBe(2.5)
    })
    it('is 15 % nearer than the last metre, 1 from nearFadeM on, smooth and rising between', () => {
        expect(nearFadeOpacity(0.2)).toBeCloseTo(0.15, 6)
        expect(nearFadeOpacity(1.5)).toBeCloseTo(0.15, 6)
        expect(nearFadeOpacity(2.0)).toBeCloseTo(0.575, 6)
        expect(nearFadeOpacity(2.5)).toBe(1)
        expect(nearFadeOpacity(30)).toBe(1)
        let last = 0
        for (let d = 1.5; d <= 2.5; d += 0.05) {
            const v = nearFadeOpacity(d)
            expect(v).toBeGreaterThanOrEqual(last - 1e-9)
            last = v
        }
    })
})

describe('layers', () => {
    it('sorts the v13 hall meshes into Roof, Walls, Machines; the shell, frame, floor into none', () => {
        expect(meshLayer('hall-deck deck')).toBe('roof')
        expect(meshLayer('hall-skylight skylight')).toBe('roof')
        for (const m of ['block', 'brick', 'glass', 'steel']) expect(meshLayer(`hall-${m} ${m}`)).toBe('walls')
        for (const m of ['machine', 'press', 'rust']) expect(meshLayer(`hall-${m} ${m}`)).toBe('machines')
        for (const m of ['shell', 'frame', 'floor', 'concrete', 'girder', 'crane']) expect(meshLayer(`hall-${m} ${m}`)).toBe(null)
    })
    it('knows the outside by its id', () => {
        expect(isOutsideEntityId('rig-out-ground')).toBe(true)
        expect(isOutsideEntityId('rig-outlet')).toBe(false)
        expect(isOutsideEntityId('place-hall')).toBe(false)
    })
    it('reads and writes ?layers= (absent = all shown)', () => {
        expect(parseLayersParam('')).toEqual(allLayersOn())
        expect(parseLayersParam('?layers=walls,machines,outside,cut')).toEqual({ roof: false, walls: true, machines: true, outside: true, cut: true })
        expect(parseLayersParam('?layers=none')).toEqual({ roof: false, walls: false, machines: false, outside: false, cut: false })
        expect(layersParam(allLayersOn())).toBe(null)
        expect(layersParam({ roof: false, walls: true, machines: true, outside: true, cut: true })).toBe('walls,machines,outside,cut')
        expect(layersParam({ roof: false, walls: false, machines: false, outside: false, cut: false })).toBe('none')
        // the whole building from outside (owner 2026-10-15): every group shown, only the cutaway off
        expect(layersParam({ ...allLayersOn(), cut: false })).toBe('roof,walls,machines,outside')
        const round = { roof: true, walls: false, machines: true, outside: false, cut: true }
        expect(parseLayersParam(`?layers=${layersParam(round)}`)).toEqual(round)
    })
    it('Roof off holds the roof cut and Walls off all four wall cuts, even with the camera inside', () => {
        const inside = cutawayPlan([0, 1.7, 10], frame)
        expect(inside.roof).toBe(null)
        const roofOff = planWithLayers(inside, frame, { ...allLayersOn(), roof: false })
        expect(roofOff.roof).toBe(frame.roofCut)
        expect(frame.roofCut).toBeGreaterThan(9)
        expect(roofOff.xMax).toBe(null)
        const wallsOff = planWithLayers(inside, frame, { ...allLayersOn(), walls: false })
        expect([wallsOff.xMax, wallsOff.xMin, wallsOff.zMax, wallsOff.zMin]).toEqual([frame.bounds.max[0] - 1.2, frame.bounds.min[0] + 1.2, frame.bounds.max[2] - 1.2, frame.bounds.min[2] + 1.2])
        expect(keptByPlan([frame.bounds.max[0] - 0.5, 3, 0], wallsOff)).toBe(false)
        expect(keptByPlan([0, 3, 0], wallsOff)).toBe(true)
        expect(planWithLayers(inside, frame, allLayersOn())).toEqual(inside)
    })
    it('Cut off draws the whole building from outside; Roof/Walls off still cut on top of it', () => {
        const outside = cutawayPlan([frame.bounds.max[0] + 30, 20, 0], frame)
        expect(outside.roof).toBe(frame.roofCut)
        expect(outside.xMax).not.toBe(null)
        const whole = planWithLayers(outside, frame, { ...allLayersOn(), cut: false })
        expect(whole).toEqual({ roof: null, xMax: null, xMin: null, zMax: null, zMin: null })
        expect(keptByPlan([frame.bounds.max[0] - 0.5, frame.roofCut + 1, 0], whole)).toBe(true)
        const wholeRoofOff = planWithLayers(outside, frame, { ...allLayersOn(), cut: false, roof: false })
        expect(wholeRoofOff.roof).toBe(frame.roofCut)
        expect(wholeRoofOff.xMax).toBe(null)
    })
})
