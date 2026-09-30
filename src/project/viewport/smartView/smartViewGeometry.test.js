import { describe, expect, it } from 'vitest'
import {
    VIEW_PRESET_IDS,
    audienceDirection,
    classifyArchitecture,
    computeRoomFrame,
    computeViewPresets,
    cutawayPlan,
    enclosingModelIds,
    firstDrawnHit,
    floorMaxPolar,
    fogOffset,
    isArchitectureEntity,
    isCameraInside,
    isOccluding,
    keptByPlan,
    meshRole,
    orbitMaxDistance,
    outsideDistance,
    parseViewHash,
    presetForKey,
    rigCore,
    sanitizeViewPresets,
    targetBoundary,
    viewHash
} from './smartViewGeometry.js'

// MOXIR's numbers (scripts/place/rigs/moxir-hall-2026-09-28.hall.json, the minimal rig).
const OUTLINE = [[-36.4, -54.5], [60.4, -54.5], [60.4, 54.5], [-36.4, 54.5]]
const ARCH_BOX = { min: [-37, 0, -56], max: [61, 17.2, 58] } // the model reaches past the door (entry platform)
const RIG_BOX = { min: [-3.2, 0, 3.6], max: [3.2, 8.1, 7.6] }
const LAMP_BOX = { min: [-3, 6.2, 4.5], max: [3, 7.0, 5.1] }
const STAGE_BOX = { min: [-1.5, 0, 4.3], max: [1.5, 1.2, 6.0] }
const OPENING = [0, 1.6, 20.2]
const frame = computeRoomFrame({ archBox: ARCH_BOX, roofMinY: 11, outline: OUTLINE, rigBox: RIG_BOX })

describe('which entities are the building', () => {
    it('takes the place pipeline hall, by id or by its venue plan', () => {
        expect(isArchitectureEntity({ id: 'place-hall', type: 'model', name: 'MOXIR — the hall', components: {} })).toBe(true)
        expect(isArchitectureEntity({ id: 'x', type: 'model', name: 'anything', components: { venuePlan: { outline: OUTLINE } } })).toBe(true)
    })
    it('never takes a lamp, a beam or a rig piece, whatever it is called', () => {
        expect(isArchitectureEntity({ id: 'rig-line-1', type: 'model', name: 'truss line (hung from the hall)', components: { piece: { kind: 'truss-3m' } } })).toBe(false)
        expect(isArchitectureEntity({ id: 'l', type: 'spotLight', name: 'hall wash', components: { light: {} } })).toBe(false)
        expect(isArchitectureEntity({ id: 'l', type: 'box', name: 'hall', components: { fixture: { type: 'x' } } })).toBe(false)
    })
    it('reads a model named as a building, and an explicit viewRole either way', () => {
        expect(isArchitectureEntity({ id: 'm', type: 'model', name: 'Warehouse scan', components: {} })).toBe(true)
        expect(isArchitectureEntity({ id: 'm', type: 'model', name: 'sculpture', components: {} })).toBe(false)
        expect(isArchitectureEntity({ id: 'm', type: 'model', name: 'sculpture', components: { viewRole: 'architecture' } })).toBe(true)
        expect(isArchitectureEntity({ id: 'place-hall', type: 'model', name: 'hall', components: { viewRole: 'prop' } })).toBe(false)
    })
    it('says where the answer came from', () => {
        const out = classifyArchitecture([
            { id: 'm', type: 'model', name: 'room', components: {} },
            { id: 'place-hall', type: 'model', name: 'x', components: {} },
            { id: 'b', type: 'box', name: 'DJ table', components: {} }
        ])
        expect([...out.ids].sort()).toEqual(['m', 'place-hall'])
        expect(out.source).toBe('place')
        expect(classifyArchitecture([]).source).toBe('none')
    })
    it('falls back to bounds: a big model holding most of the room is the room', () => {
        const models = [
            { id: 'shell', box: { min: [-10, 0, -10], max: [10, 6, 10] } },
            { id: 'plinth', box: { min: [0, 0, 0], max: [1, 1, 1] } }
        ]
        const points = [[0, 1, 0], [2, 3, 1], [-4, 2, 5], [30, 0, 0]]
        expect(enclosingModelIds(models, points)).toEqual(['shell'])
        expect(enclosingModelIds(models, [[30, 0, 0], [40, 0, 0], [0, 1, 0]])).toEqual([])
    })
    it('names the parts of the hall by the mesh names hall.py writes', () => {
        expect(meshRole('hall-frame')).toBe('roof')
        expect(meshRole('hall-deck')).toBe('roof')
        expect(meshRole('hall-skylight')).toBe('roof')
        expect(meshRole('hall-floor')).toBe('floor')
        expect(meshRole('hall-zone-dance')).toBe('floor')
        expect(meshRole('hall-concrete')).toBe('wall')
        expect(meshRole('Mesh_12', { min: [0, 0, 0], max: [10, 0.05, 10] }, 0)).toBe('floor')
    })
})

describe('the room', () => {
    it('takes the walls from the venue outline and cuts just under the roof', () => {
        expect(frame.bounds.min).toEqual([-36.4, 0, -54.5])
        expect(frame.bounds.max).toEqual([60.4, 17.2, 54.5])
        expect(frame.roofCut).toBeCloseTo(10.95)
        expect(frame.floorY).toBe(0)
    })
    it('never cuts below the top of the rig', () => {
        const f = computeRoomFrame({ archBox: ARCH_BOX, roofMinY: 7, rigBox: RIG_BOX })
        expect(f.roofCut).toBeCloseTo(8.4)
    })
    it('without a named roof, cuts in the top fifth', () => {
        const f = computeRoomFrame({ archBox: { min: [0, 0, 0], max: [10, 10, 10] } })
        expect(f.roofCut).toBe(8)
    })
    it('has no room without a building', () => {
        expect(computeRoomFrame({ archBox: null })).toBe(null)
    })
})

describe('inside or outside', () => {
    it('the opening shot on the dance floor is inside', () => {
        expect(isCameraInside(OPENING, frame)).toBe(true)
        expect(outsideDistance(OPENING, frame.bounds)).toBe(0)
    })
    it('beyond a wall, above the roof cut, or under the floor is outside', () => {
        expect(isCameraInside([0, 5, 70], frame)).toBe(false)
        expect(isCameraInside([0, 12, 0], frame)).toBe(false)
        expect(isCameraInside([80, 5, 0], frame)).toBe(false)
        expect(outsideDistance([0, 5, 64.5], frame.bounds)).toBeCloseTo(10)
    })
})

describe('the cutaway', () => {
    it('cuts nothing while you stand in the room', () => {
        expect(cutawayPlan(OPENING, frame)).toEqual({ roof: null, xMax: null, xMin: null, zMax: null, zMin: null })
    })
    it('from beyond the entry wall: the roof and that wall, nothing else', () => {
        const plan = cutawayPlan([0, 8, 80], frame)
        expect(plan.roof).toBeCloseTo(10.95)
        expect(plan.zMax).toBeCloseTo(53.3)
        expect(plan.zMin).toBe(null)
        expect(plan.xMax).toBe(null)
        expect(plan.xMin).toBe(null)
    })
    it('from a corner: both walls that face you', () => {
        const plan = cutawayPlan([-50, 4, -70], frame)
        expect(plan.xMin).toBeCloseTo(-35.2)
        expect(plan.zMin).toBeCloseTo(-53.3)
        expect(plan.xMax).toBe(null)
    })
    it('from straight above: the roof only', () => {
        const plan = cutawayPlan([0, 300, 0], frame)
        expect(plan.roof).toBeCloseTo(10.95)
        expect([plan.xMax, plan.xMin, plan.zMax, plan.zMin]).toEqual([null, null, null, null])
    })
    it('keeps what is inside and drops what is cut', () => {
        const plan = cutawayPlan([0, 8, 80], frame)
        expect(keptByPlan([0, 5, 0], plan)).toBe(true)
        expect(keptByPlan([0, 12, 0], plan)).toBe(false)
        expect(keptByPlan([0, 5, 54.2], plan)).toBe(false)
        expect(keptByPlan([0, 5, -54.2], plan)).toBe(true)
    })
})

describe('what is in the way', () => {
    it('a column halfway to the rig occludes; the rig itself does not', () => {
        expect(isOccluding(7, 15)).toBe(true)
        expect(isOccluding(14.8, 15)).toBe(false)
        expect(isOccluding(Infinity, 15)).toBe(false)
    })
    it('a part the cutaway already removed is not an occluder', () => {
        const plan = cutawayPlan([0, 8, 80], frame)
        const hits = [
            { distance: 26, point: [0, 8, 54.4] }, // the entry wall, cut
            { distance: 40, point: [0, 5, 40] } // a real column inside
        ]
        expect(firstDrawnHit(hits, plan).distance).toBe(40)
        expect(firstDrawnHit([hits[0]], plan)).toBe(null)
        expect(firstDrawnHit(hits, null).distance).toBe(26)
    })
})

describe('the rig core', () => {
    // MOXIR minimal's lamps: the truss over the DJ, and uplights on the columns down the hall.
    const lamps = [[-3, 7, 4.8], [0, 7, 4.8], [3, 7, 4.8], [-2.6, 6.5, 4.8], [2.6, 6.5, 4.8], [-3.5, 5.8, 4.9], [3.5, 5.8, 4.9],
        [-3, 0.2, 7], [3, 0.2, 7], [0.6, 0.3, 3.5], [-10.9, 0.7, 12], [10.9, 0.7, 12], [-10.9, 0.7, 24], [10.9, 0.7, 24],
        [-10.9, 0.7, 36], [10.9, 0.7, 36], [-11.2, 0.3, 42], [11.2, 0.3, 42]]
    it('is the stage cluster, not the uplights down the hall', () => {
        const { lampBox } = rigCore(lamps)
        expect(lampBox.max[2]).toBeLessThan(8)
        expect(lampBox.min[0]).toBeGreaterThan(-5)
        const presets = computeViewPresets(frame, { rigBox: lampBox, lampBox, opening: OPENING })
        const floor = presets.find((p) => p.id === 'floor')
        expect(floor.position[2]).toBeGreaterThan(15) // the crowd is toward the entry (+z)
    })
    it('takes rig pieces near the core, not far ones', () => {
        const { rigBox } = rigCore(lamps, [{ min: [-1.5, 0, 4.3], max: [1.5, 1.2, 6] }, { min: [30, 0, 40], max: [31, 2, 41] }])
        expect(rigBox.min[1]).toBe(0)
        expect(rigBox.max[0]).toBeLessThan(10)
    })
    it('has nothing without lamps or pieces', () => {
        expect(rigCore([], [])).toEqual({ lampBox: null, rigBox: null })
    })
})

describe('the fog', () => {
    it('stands still at the opening shot and inside at that distance', () => {
        expect(fogOffset(0, 17.9, 17.9)).toBe(0)
        expect(fogOffset(0, 10, 17.9)).toBe(0)
    })
    it('stands back as far as you are outside, or farther than the opening shot', () => {
        expect(fogOffset(40, 60, 17.9)).toBeCloseTo(42.1)
        expect(fogOffset(3, 39, 17.9)).toBeCloseTo(21.1)
        expect(fogOffset(60, 20, 17.9)).toBe(60)
    })
})

describe('the camera limits', () => {
    it('never lets the orbit go under the floor', () => {
        const polar = floorMaxPolar(5, 10, 0, 0.3)
        const cameraY = 5 + 10 * Math.cos(polar)
        expect(cameraY).toBeCloseTo(0.3)
        expect(floorMaxPolar(5, 3, 0, 0.3)).toBe(Math.PI) // closer than the floor: any angle
        expect(floorMaxPolar(0, 10, 0, 0.3)).toBeLessThan(Math.PI / 2)
    })
    it('holds the orbit to the building and the target inside it', () => {
        expect(orbitMaxDistance(frame)).toBeCloseTo(frame.radius * 1.6)
        expect(orbitMaxDistance(frame, 900)).toBeCloseTo(990)
        const b = targetBoundary(frame)
        expect(b.min[1]).toBe(0)
        expect(b.max[2]).toBeCloseTo(56.5)
    })
})

describe('the six views', () => {
    const presets = computeViewPresets(frame, { rigBox: RIG_BOX, lampBox: LAMP_BOX, stageBox: STAGE_BOX, opening: OPENING, aspect: 1440 / 900 })
    const byId = Object.fromEntries(presets.map((p) => [p.id, p]))

    it('are the six, on keys 1–6', () => {
        expect(presets.map((p) => p.id)).toEqual(VIEW_PRESET_IDS)
        expect(presets.map((p) => p.key)).toEqual(['1', '2', '3', '4', '5', '6'])
    })
    it('the audience side comes from the opening shot', () => {
        expect(audienceDirection([0, 6, 4.8], OPENING)).toEqual([0, 1])
        expect(audienceDirection([0, 6, 0], [-10, 0, 0])).toEqual([-1, 0])
    })
    it('dance floor: eye height, in the crowd, looking at the rig', () => {
        expect(byId.floor.position[1]).toBeCloseTo(1.7)
        expect(byId.floor.position[2]).toBeGreaterThan(15)
        expect(byId.floor.position[2] - 4.8).toBeLessThanOrEqual(18.5)
        expect(byId.floor.interior).toBe(true)
        expect(isCameraInside(byId.floor.position, frame)).toBe(true)
    })
    it('DJ: on the riser (1.7 m over the 1.2 m deck), up at the lamps', () => {
        expect(byId.dj.position[1]).toBeCloseTo(2.9)
        expect(byId.dj.target[1]).toBeGreaterThan(byId.dj.position[1])
    })
    it('top: straight down over the whole footprint, from outside the roof', () => {
        expect(byId.top.position[0]).toBeCloseTo(frame.center[0])
        expect(byId.top.position[1]).toBeGreaterThan(frame.roofTop)
        expect(byId.top.target[1]).toBe(0)
        expect(isCameraInside(byId.top.position, frame)).toBe(false)
        // the whole 109 m length fits the 18° lens
        const d = byId.top.position[1]
        expect(d * Math.tan((18 * Math.PI) / 360)).toBeGreaterThanOrEqual(54.5)
    })
    it('a portrait phone backs the top plan off until the width fits', () => {
        const phone = computeViewPresets(frame, { rigBox: RIG_BOX, opening: OPENING, aspect: 390 / 844 })
        const top = phone.find((p) => p.id === 'top')
        expect(top.position[1]).toBeGreaterThan(byId.top.position[1])
    })
    it('side: from beyond the nearer long wall, with a section plane past the rig', () => {
        expect(byId.side.position[0]).toBeLessThan(frame.bounds.min[0]) // house left (-x) is the nearer wall
        expect(isCameraInside(byId.side.position, frame)).toBe(false)
        const s = byId.side.section
        // the far side of the rig is kept; the near columns (x = -12) are cut
        expect(keptByPlan([3, 6, 4.8], null, s)).toBe(true)
        expect(keptByPlan([12, 6, 4.8], null, s)).toBe(true)
        expect(keptByPlan([-12, 6, 4.8], null, s)).toBe(false)
    })
    it('rig close-up: near the lamps, above the floor, under the roof cut', () => {
        const p = byId.rig.position
        const d = Math.hypot(p[0] - byId.rig.target[0], p[1] - byId.rig.target[1], p[2] - byId.rig.target[2])
        expect(d).toBeLessThan(15)
        expect(p[1]).toBeGreaterThan(0.5)
        expect(p[1]).toBeLessThan(frame.roofCut)
    })
    it('crane: high, under the roof cut, looking down', () => {
        expect(byId.crane.position[1]).toBeGreaterThan(8)
        expect(byId.crane.position[1]).toBeLessThan(frame.roofCut)
        expect(byId.crane.target[1]).toBeLessThan(byId.crane.position[1])
    })
    it('an authored view wins by id; the others stay computed', () => {
        const authored = sanitizeViewPresets([
            { id: 'floor', position: [0, 1.7, 20.3], target: [0, 5, 4.8], fov: 55, label: 'Floor 15 m' },
            { id: 'nonsense', position: [0, 0, 0], target: [1, 1, 1] },
            { id: 'dj', position: [0, 'x', 0], target: [0, 0, 0] }
        ])
        expect(authored.map((a) => a.id)).toEqual(['floor'])
        const withOwn = computeViewPresets(frame, { rigBox: RIG_BOX, opening: OPENING, authored })
        const floor = withOwn.find((p) => p.id === 'floor')
        expect(floor.position).toEqual([0, 1.7, 20.3])
        expect(floor.label).toBe('Floor 15 m')
        expect(floor.authored).toBe(true)
        expect(withOwn.find((p) => p.id === 'dj').authored).toBe(false)
    })
    it('no building, no views', () => {
        expect(computeViewPresets(null)).toEqual([])
    })
})

describe('keys and links', () => {
    it('#view-top opens on the top plan, and the hash round-trips', () => {
        expect(parseViewHash('#view-top')).toBe('top')
        expect(parseViewHash('#view-nope')).toBe(null)
        expect(parseViewHash('')).toBe(null)
        expect(parseViewHash(viewHash('crane'))).toBe('crane')
    })
    it('keys 1–6 name the views, nothing else does', () => {
        expect(presetForKey('1')).toBe('floor')
        expect(presetForKey('6')).toBe('crane')
        expect(presetForKey('7')).toBe(null)
        expect(presetForKey('01')).toBe(null)
        expect(presetForKey('a')).toBe(null)
    })
})
