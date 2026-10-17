import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceEntity } from './plotEdits.js'
import { layRun } from './plotGeometry.js'
import { positionsOf } from './positions.js'
import { dealOps } from './deal.js'
import { flashEntities, lookPoses, posedEntities } from './looks.js'
import { rigBodyLamps } from './rigBodyLamps.js'
import { beamOfPanTilt, deskProfileName, dmxEntities, laserAimShift, panTiltOfBeam, runningMode } from './dmxPose.js'
import { createLaserShowStore, groupOfLine, laserShowOf, NOT_PLAYING, OFF_POLL_MS, POLL_MS, TIMEOUT_MS } from './laserShowState.js'
import { deskLooksWithValues } from './deskLookValues.js'
import { spotAimDirection } from '../project/viewport/spotLightAim.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { rigLooksFrom } from '../../scripts/rigbuild/looks.mjs'

// The same small rig looks.test.js deals: 4 UP-B380F standing on column bases, 2 UP-250BSW
// hung on a truss header. Here every lamp is joined to a desk fixture by index, in its
// ASSUMED test mode, and the desk's values are handed in as the mirror would.
const plan = {
    outline: [[-40, -60], [40, -60], [40, 60], [-40, 60]],
    columns: [-12, 12].flatMap((x) => [6, 12, 18, 24].map((z) => [x, z, 0.8, 0.5])),
    zones: [{ id: 'stage', rects: [[-3.8, 3.6, 3.8, 7.5]] }, { id: 'dance', rects: [[-10, 7.5, 10, 30]] }],
    overhead: [{ id: 'runway-l', line: [[-11, -50], [-11, 50]], bottom: 6.5 }]
}
const base = [
    { id: 'hall', type: 'model', components: { venuePlan: plan } },
    ...[-1, 0, 1].map((dx, i) => pieceEntity({ id: `d${i}`, kind: 'deck-2x1', position: [dx, 0, 5.2], yaw: Math.PI / 2, height: 1.2 })),
    ...layRun({ from: [-3.5, 5.1], to: [3.5, 5.1], y: 7 }).map((s, i) => pieceEntity({ id: `h${i}`, kind: s.kind, position: s.position, yaw: s.yaw, name: 'truss header' }))
]
const rig = {
    rig: 'test', writtenAt: '2026-09-28',
    classes: { beam: { code: 'UP-B380F' }, spot: { code: 'UP-250BSW' } },
    groups: [{ id: 'beams-cols', class: 'beam', mount: 'column-bases' }, { id: 'spots', class: 'spot', mount: 'truss-header' }],
    looks: {
        up: { title: 'Up', aims: { 'beams-cols': { rule: 'vertical' }, spots: { rule: 'vertical' } }, colours: { 'beams-cols': '#ff0000' } },
        cross: { title: 'Cross', aims: { 'beams-cols': { rule: 'cross', x: 8, y: 9 }, spots: { rule: 'vertical' } }, colours: { 'beams-cols': '#00a6eb' } }
    }
}
const MODES = { 'up-b380f': '16ch-assumed', 'up-250bsw': '17ch-assumed' }
const CODES = { 'up-b380f': 'UP-B380F', 'up-250bsw': 'UP-250BSW' }

const dealt = () => {
    let n = 0
    let doc = normalizeProjectDocument({ entities: base })
    for (const [pos, type, k] of [['column-bases', 'up-b380f', 4], ['truss:h0', 'up-250bsw', 2]]) {
        const position = positionsOf(doc.entities).find((p) => p.id === pos)
        doc = applyProjectOps(doc, dealOps({ entities: doc.entities, position, filled: new Set(), type: typeById(TYPE_LIBRARY, type), n: k, newId: () => `L${++n}` }).ops)
    }
    doc = applyProjectOps(doc, [{ type: 'createEntity', payload: { entity: { id: 'rig-show', type: 'group', components: { rigLooks: rigLooksFrom(rig, 'rig.json') } } } }])
    let index = 0
    const entities = doc.entities.map((e) => {
        const f = e.components?.fixture
        if (!f?.type) return e
        index += 1
        return { ...e, components: { ...e.components, fixture: { ...f, index, mode: MODES[f.type] } } }
    })
    return entities
}

// The mirror's fixtures for these lamps, every channel at its resting value, `set` on top.
const deskOf = (entities, set = {}) => entities.filter((e) => e.components?.fixture?.index).map((e) => {
    const f = e.components.fixture
    const mode = typeById(TYPE_LIBRARY, f.type).modes.find((m) => m.name === MODES[f.type])
    const own = set[e.id] || {}
    return {
        index: f.index, id: `fx${f.index}`, key: `p:${e.id}`,
        profile: deskProfileName(CODES[f.type], mode.name),
        values: mode.channels.map((c) => own[c.role] ?? c.default ?? (c.role === 'dimmer' ? 255 : 0))
    }
})

const near = (a, b, d = 3) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], d))

describe('the fixture frame — pan/tilt to a beam in the room', () => {
    it('standing: home is straight up; tilt 90 at pan 0 faces +Z; pan 90 turns it to +X', () => {
        near(beamOfPanTilt(0, 0), [0, 1, 0])
        near(beamOfPanTilt(0, 90), [0, 0, 1])
        near(beamOfPanTilt(90, 90), [1, 0, 0])
    })
    it('hung: home is straight DOWN, and the round trip holds', () => {
        near(beamOfPanTilt(0, 0, true), [0, -1, 0])
        for (const [p, t] of [[30, 40], [-120, 100], [170, 10]]) {
            const back = panTiltOfBeam(beamOfPanTilt(p, t, true), true)
            near(beamOfPanTilt(back.pan, back.tilt, true), beamOfPanTilt(p, t, true), 4)
        }
    })
})

describe('the room drawn from DMX', () => {
    it('finds the mode the DESK runs by its profile name', () => {
        const type = typeById(TYPE_LIBRARY, 'up-b380f')
        expect(runningMode(type, '16ch', 'UP-B380F 16ch-assumed').name).toBe('16ch-assumed')
        expect(runningMode(type, '16ch', 'UP-B380F 16ch').name).toBe('16ch') // the tested unit's list
        expect(runningMode(typeById(TYPE_LIBRARY, 'up-250bsw'), '24ch', 'UP-250BSW 24ch')).toBe(null) // the real list is owed: nothing to decode
    })

    it('turns a head: DMX pan/tilt → the entity\'s aim, its lens on the arc, and the BODY follows', () => {
        const entities = dealt()
        const lamp = entities.find((e) => e.components.fixture?.type === 'up-b380f')
        // Pan full one way (−270°), tilt to 3/4 (+67.5° from home).
        const fixtures = deskOf(entities, { [lamp.id]: { pan: 0, panFine: 0, tilt: 191, tiltFine: 255 } })
        const { entities: shown, driven } = dmxEntities({ shown: entities, document: entities, fixtures, library: TYPE_LIBRARY })
        const drawn = shown.find((e) => e.id === lamp.id)
        const d = driven.get(lamp.id)
        expect(d.pan).toBe(-270)
        expect(d.tilt).toBeCloseTo(67.5, 0)
        const want = beamOfPanTilt(-270, d.tilt, false)
        near(spotAimDirection(drawn.components.transform.rotation), want, 3)
        const body = rigBodyLamps(shown, TYPE_LIBRARY).find((l) => l.id === lamp.id)
        near(body.beam, want, 3)
        const before = rigBodyLamps(entities, TYPE_LIBRARY).find((l) => l.id === lamp.id)
        near(body.mount, before.mount, 3) // the clamp does not move; the head turns about it
        expect(drawn.components.rigDmx.assumed).toBe(true)
    })

    it('colour from the wheel, level from the dimmer, closed shutter = dark, strobe → beam.strobeHz', () => {
        const entities = dealt()
        const [a, b, c] = entities.filter((e) => e.components.fixture?.type === 'up-b380f')
        const fixtures = deskOf(entities, {
            [a.id]: { color: 12, dimmer: 128 }, // Red slot at half
            [b.id]: { strobe: 0 },
            [c.id]: { strobe: 240 }
        })
        const { entities: shown } = dmxEntities({ shown: entities, document: entities, fixtures, library: TYPE_LIBRARY })
        const get = (id) => shown.find((e) => e.id === id).components
        const reach = Number(a.components.light.intensity)
        expect(get(a.id).light.color).toBe('#c41c1a') // the Red slot as it is: a filter's darkness is light (2026-10-17), not stretched to full
        expect(get(a.id).light.intensity).toBeCloseTo(reach * 128 / 255, 1)
        expect(get(b.id).light.intensity).toBe(0)
        expect(get(c.id).beam.strobeHz).toBe(3) // 25 Hz on the console, capped at 3
    })

    it('PRECEDENCE: DMX wins over a playing look for what the list controls; the rest keeps the look', () => {
        const entities = dealt()
        const poses = lookPoses({ entities, library: TYPE_LIBRARY, lookId: 'up' })
        const looked = posedEntities(entities, poses)
        const lamp = entities.find((e) => e.components.fixture?.type === 'up-b380f')
        expect(looked.find((e) => e.id === lamp.id).components.light.color).toBe('#ff0000')
        const fixtures = deskOf(entities, { [lamp.id]: { color: 102, pan: 128, tilt: 255, tiltFine: 255 } }) // Cyan
        const { entities: shown } = dmxEntities({ shown: looked, document: entities, fixtures, library: TYPE_LIBRARY })
        const drawn = shown.find((e) => e.id === lamp.id)
        expect(drawn.components.light.color).toBe('#00a6eb') // the Cyan slot, drawn as it is (2026-10-17: never stretched to full)
        expect(drawn.components.light.color).not.toBe('#ff0000')
        expect(driveOf(shown, lamp.id).tilt).toBeCloseTo(135, 0)
    })

    it('a lamp the desk drives but whose list cannot be decoded is drawn exactly as before', () => {
        const entities = dealt().map((e) => (e.components.fixture?.type === 'up-250bsw' ? { ...e, components: { ...e.components, fixture: { ...e.components.fixture, mode: '24ch' } } } : e))
        // the desk holds a fixture for it, but under a profile no mode of the type matches (24 ch) — nothing to decode
        const fixtures = deskOf(entities).map((f) => (entities.find((e) => e.components.fixture?.index === f.index)?.components.fixture.type === 'up-250bsw' ? { ...f, profile: 'UP-250BSW 24ch' } : f))
        const { entities: shown } = dmxEntities({ shown: entities, document: entities, fixtures, library: TYPE_LIBRARY })
        for (const e of entities.filter((x) => x.components.fixture?.type === 'up-250bsw')) expect(shown.find((s) => s.id === e.id)).toBe(e)
    })

    it('with a desk connected, a lamp the desk does not drive is drawn dark, as it is on the rig (MOXIR 2026-10-17)', () => {
        const entities = dealt()
        const gone = entities.find((e) => e.components.fixture?.type === 'up-b380f')
        const fixtures = deskOf(entities).filter((f) => f.index !== gone.components.fixture.index)
        const { entities: shown } = dmxEntities({ shown: entities, document: entities, fixtures, library: TYPE_LIBRARY })
        const drawn = shown.find((s) => s.id === gone.id)
        expect(drawn.components.rigShown).toMatchObject({ level: 0, undriven: true })
        expect(drawn.components.light.intensity).toBe(0)
        if (gone.components.beam) expect(drawn.components.beam.visible).toBe(false)
    })

    it('a strobe TYPE is drawn as a flash at the desk\'s rate, never a cone', () => {
        const strobe = { id: 'S1', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#ffffff', intensity: 5, angle: 0.5 }, beam: { visible: true }, fixture: { type: 'ext-strobe', mode: '4ch-assumed', index: 9 } } }
        const flashed = flashEntities([strobe], TYPE_LIBRARY)
        const fixtures = [{ index: 9, profile: 'EXT-STROBE 4ch-assumed', values: [255, 0, 255, 0] }]
        const { entities: shown } = dmxEntities({ shown: flashed, document: [strobe], fixtures, library: TYPE_LIBRARY })
        expect(shown[0].components.rigFlash).toMatchObject({ kind: 'strobe', level: 1, hz: 3 })
        expect(shown[0].components.beam.haze).toBe(0) // no cone
    })
})

const driveOf = (shown, id) => shown.find((e) => e.id === id).components.rigDmx

describe('a look written as DMX draws the look (deskLookValues ↔ dmxPose)', () => {
    it('every lamp of the look comes back aimed and coloured as the look designed it', () => {
        const entities = dealt()
        const deskFixtures = deskOf(entities)
        for (const lookId of ['up', 'cross']) {
            const desk = deskLooksWithValues(null, deskFixtures, { entities, library: TYPE_LIBRARY })
            const look = desk.find((l) => l.id === `rig-${lookId}`)
            const poses = lookPoses({ entities, library: TYPE_LIBRARY, lookId })
            // The desk plays the look: each fixture's values set from the look's cell.
            const playing = deskFixtures.map((f) => {
                const cell = look.steps[0].values[f.id] || {}
                const e = entities.find((x) => x.id === f.key.slice(2))
                const mode = typeById(TYPE_LIBRARY, e.components.fixture.type).modes.find((m) => m.name === MODES[e.components.fixture.type])
                return { ...f, values: mode.channels.map((c, i) => cell[c.role] ?? f.values[i]) }
            })
            const { entities: shown } = dmxEntities({ shown: entities, document: entities, fixtures: playing, library: TYPE_LIBRARY })
            for (const [id, pose] of poses) {
                const drawn = shown.find((e) => e.id === id)
                near(spotAimDirection(drawn.components.transform.rotation), spotAimDirection(pose.rotation), 3)
                near(drawn.components.transform.position, pose.position, 2)
            }
        }
    })
})

describe('zoom keeps the flux, not the candela (render audit C)', () => {
    it('a UP-250BSW zoomed 10° → 30° is dimmer on axis by the ratio of the cone solid angles', () => {
        const entities = dealt()
        const spot = entities.find((e) => e.components?.fixture?.type === 'up-250bsw')
        const at = (zoom) => dmxEntities({ shown: entities, document: entities, fixtures: deskOf(entities, { [spot.id]: { zoom } }), library: TYPE_LIBRARY })
            .entities.find((e) => e.id === spot.id).components.light
        const narrow = at(0)
        const wide = at(255)
        // the desk really zoomed it: otherwise the ratio is 1 and proves nothing
        expect(wide.angle).toBeGreaterThan(narrow.angle * 2.5)
        const ratio = (1 - Math.cos(narrow.angle)) / (1 - Math.cos(wide.angle))
        expect(wide.intensity / narrow.intensity).toBeCloseTo(ratio, 2)
        expect(wide.intensity).toBeLessThan(narrow.intensity / 5)
    })
})

import { fixturePanOf, roomPanOf } from './dmxPose.js'
describe('a lamp hung turned or with its pan reversed (MOXIR 2026-10-17)', () => {
    it('offsets and reverses the pan, and the two conversions undo each other', () => {
        expect(fixturePanOf(-90, null)).toBe(-90)
        expect(fixturePanOf(-90, { panOffsetDeg: 45 })).toBe(-45)
        expect(fixturePanOf(-90, { panOffsetDeg: 45, panInvert: true })).toBe(135)
        expect(fixturePanOf(250, { panOffsetDeg: 45 })).toBe(-65)
        for (const fx of [null, { panOffsetDeg: 45 }, { panOffsetDeg: 45, panInvert: true }, { panOffsetDeg: -120, panInvert: true }])
            for (const p of [-170, -90, 0, 33, 90, 170]) expect((((roomPanOf(fixturePanOf(p, fx), fx) - p) % 360) + 360) % 360).toBeCloseTo(0)
    })
})

describe('a DMX laser\'s picture moves with its X/Y (owner 2026-10-17: "add movement in 3d that i can sync that")', () => {
    it('shifts by the read-back over the field, turned by the unit\'s swap / invert', () => {
        expect(laserAimShift({ x: 18.5, y: 0 }, null, 18.5)).toEqual([1, 0])
        expect(laserAimShift({ x: 9.25, y: -4.625 }, null, 18.5)).toEqual([0.5, -0.25])
        expect(laserAimShift({ x: 9.25, y: 0 }, { aimSwap: true }, 18.5)).toEqual([0, 0.5])
        expect(laserAimShift({ x: 9.25, y: 0 }, { aimInvertX: true }, 18.5)).toEqual([-0.5, 0])
        expect(laserAimShift({ x: 9.25, y: 0 }, { aimSwap: true, aimInvertY: true }, 18.5)).toEqual([0, -0.5])
        expect(laserAimShift(null)).toEqual([0, 0])
    })
    it('dmxEntities moves the 40 W picture where the desk sends it, in the desk\'s colour, blank points kept blank', () => {
        const type = typeById(TYPE_LIBRARY, 'up-la40wf')
        const mode = runningMode(type, '32ch', null) || type.modes.find((m) => /32/.test(m.name))
        const laser = { id: 'L40', type: 'spotLight', components: { fixture: { index: 7, type: 'up-la40wf', mode: mode.name }, transform: { position: [0, 6, 0], rotation: [1.69, 0, 0] }, light: { intensity: 1, color: '#ffffff' }, beam: { visible: true, length: 50, laser: { fieldHalfDeg: 18.5, frame: [[0, 0, 1, 1, 1], [0.1, 0, 0, 0, 0]] } } } }
        const half = mode.channels.find((c) => c.cap?.aim?.axis === 'x').cap.aim.halfDeg
        const values = mode.channels.map((c) => (c.role === 'dimmer' ? 255 : c.cap?.laserColour ? 25 : c.cap?.aim?.axis === 'x' ? 125 : c.cap?.aim?.axis === 'y' ? 64 : c.default ?? 0))
        const fixtures = [{ index: 7, id: 'fx7', key: 'p:L40', profile: deskProfileName('UP-LA40WF', mode.name), values }]
        const run = (fx) => {
            const e = { ...laser, components: { ...laser.components, fixture: { ...laser.components.fixture, ...fx } } }
            return dmxEntities({ shown: [e], document: [e], fixtures, library: TYPE_LIBRARY }).entities[0].components.beam.laser.frame
        }
        const [lit, blank] = run({})
        near(lit, [half / 18.5, 0, 1, 0, 0], 3) // X at the by-hand end: the picture moves a whole half-field, drawn red
        near(blank, [0.1 + half / 18.5, 0, 0, 0, 0], 3) // a blank move moves too and stays blank
        near(run({ aimSwap: true, aimInvertY: true })[0].slice(0, 2), [0, -half / 18.5], 3)
    })
})

describe('the LaserCubes follow the laser server, not the desk (MOXIR 2026-10-17)', () => {
    // A LaserCube line as the rig builder writes it: off DMX, no desk index, its picture in beam.laser.
    const cubeLine = (id) => ({ id, type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#00ff00', intensity: 3, angle: 0.1 }, beam: { visible: true, haze: 1, laser: { mW: 3000, frames: { period: 8, list: [[[0, 0, 0, 1, 0]], [[0.5, 0, 0, 1, 0]]] } } }, fixture: { type: 'ext-lc-ultra-mk2', dmx: false } } })
    // GET /laser/api/state as the engine (laserEngine.js state()) and di's player (laserShow.js state()) answer it.
    const serverState = ({ playing = true, armed = ['cube-1', 'cube-2'] } = {}) => ({
        armed: armed.length > 0,
        cubes: ['cube-1', 'cube-2'].map((id) => ({ id, armed: armed.includes(id) })),
        show: playing ? { playing: true, project: 'moxir', cubes: [{ cube: 'cube-1', group: 'rig-laser-1' }, { cube: 'cube-2', group: 'rig-laser-2' }] } : { playing: false }
    })
    const room = () => {
        const lamps = dealt()
        return { all: [...lamps, cubeLine('rig-laser-1a'), cubeLine('rig-laser-1f'), cubeLine('rig-laser-2a')], fixtures: deskOf(lamps) }
    }
    const drawnAs = ({ all, fixtures }, laserShow, id) => dmxEntities({ shown: all, document: all, fixtures, library: TYPE_LIBRARY, laserShow }).entities.find((e) => e.id === id)
    const designOf = ({ all }, id) => all.find((e) => e.id === id)
    const expectDark = (e) => {
        expect(e.components.rigShown).toMatchObject({ level: 0, undriven: true })
        expect(e.components.light.intensity).toBe(0)
        if (e.components.beam) expect(e.components.beam.visible).toBe(false)
    }

    it('a line\'s cube is the player\'s own map: rig-laser-1a … 1f → group rig-laser-1 → the cube that plays it', () => {
        expect(['rig-laser-1a', 'rig-laser-1f', 'rig-laser-6c', 'solo'].map(groupOfLine)).toEqual(['rig-laser-1', 'rig-laser-1', 'rig-laser-6', 'solo'])
        expect(laserShowOf(serverState()).groups).toEqual(['rig-laser-1', 'rig-laser-2'])
        expect(laserShowOf(serverState({ armed: ['cube-2'] })).groups).toEqual(['rig-laser-2'])
        for (const s of [serverState({ playing: false }), null, {}, { show: { playing: true } }]) expect(laserShowOf(s)).toBe(NOT_PLAYING)
    })

    it('a network laser draws its frames, as the design holds them, while the show plays on its armed cube', () => {
        const r = room()
        const show = laserShowOf(serverState())
        for (const id of ['rig-laser-1a', 'rig-laser-1f', 'rig-laser-2a']) expect(drawnAs(r, show, id)).toBe(designOf(r, id))
    })

    it('it rests dark when the show is not playing, its cube is disarmed or not mapped, or no word came', () => {
        const r = room()
        expectDark(drawnAs(r, laserShowOf(serverState({ playing: false })), 'rig-laser-1a'))
        const cube2Only = laserShowOf(serverState({ armed: ['cube-2'] }))
        expectDark(drawnAs(r, cube2Only, 'rig-laser-1a'))
        expect(drawnAs(r, cube2Only, 'rig-laser-2a')).toBe(designOf(r, 'rig-laser-2a'))
        expectDark(drawnAs(r, laserShowOf(serverState({ armed: [] })), 'rig-laser-2a')) // the engine disarmed
        for (const none of [null, undefined, NOT_PLAYING]) expectDark(drawnAs(r, none, 'rig-laser-1a'))
        const seventh = { ...r, all: [...r.all, cubeLine('rig-laser-7a')] } // a line no cube plays
        expectDark(drawnAs(seventh, laserShowOf(serverState()), 'rig-laser-7a'))
    })

    it('a DMX laser with no desk row stays dark while the cubes play: the show lights the network lasers only', () => {
        const r = room()
        const show = laserShowOf(serverState())
        // a 40 W DMX laser whose id even falls in a playing group: it is the desk's, and the desk does not drive it
        const dmxLaser = { id: 'rig-laser-1z', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#ff0000', intensity: 3, angle: 0.1 }, beam: { visible: true, laser: { frame: [[0, 0, 1, 0, 0]] } }, fixture: { type: 'up-la40wf', index: 999 } } }
        expectDark(drawnAs({ ...r, all: [...r.all, dmxLaser] }, show, dmxLaser.id))
        const gone = r.all.find((e) => e.components.fixture?.type === 'up-b380f')
        expectDark(drawnAs({ ...r, fixtures: r.fixtures.filter((f) => f.index !== gone.components.fixture.index) }, show, gone.id))
    })

    it('one poll for the page: a read at once and every POLL_MS while the room listens, none after; a failed, refused or slow read is dark', async () => {
        const timers = []
        const setTimer = (fn, ms) => { const t = { fn, ms }; timers.push(t); return t }
        const clearTimer = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1) }
        const fire = (ms) => { const t = timers.find((x) => x.ms === ms); clearTimer(t); return t.fn() }
        const polls = () => timers.filter((t) => t.ms !== TIMEOUT_MS).map((t) => t.ms)
        let answer = () => ({ ok: true, status: 200, json: async () => serverState() })
        const reads = []
        const store = createLaserShowStore({ url: () => '/laser/api/state', fetchImpl: async (u, opts) => { reads.push(u); return answer(opts.signal) }, setTimer, clearTimer })
        expect(timers).toHaveLength(0) // nobody listens: no read
        let heard = 0
        const leave = store.subscribe(() => { heard += 1 })
        await fire(0)
        expect(reads).toEqual(['/laser/api/state'])
        expect(store.getSnapshot().groups).toEqual(['rig-laser-1', 'rig-laser-2'])
        expect(drawnAs(room(), store.getSnapshot(), 'rig-laser-1a').components.rigShown).toBeUndefined()
        await fire(POLL_MS) // the same answer: nothing re-renders
        expect([reads.length, heard]).toEqual([2, 1])
        answer = () => { throw new TypeError('Failed to fetch') } // the server is gone: dark
        await fire(POLL_MS)
        expect(store.getSnapshot()).toBe(NOT_PLAYING)
        expectDark(drawnAs(room(), store.getSnapshot(), 'rig-laser-1a'))
        answer = () => ({ ok: false, status: 500 }) // refused: dark
        await fire(POLL_MS)
        expect(store.getSnapshot()).toBe(NOT_PLAYING)
        answer = () => ({ ok: true, status: 200, json: async () => serverState() })
        await fire(POLL_MS)
        expect(store.getSnapshot().playing).toBe(true)
        // a read that hangs is cut at TIMEOUT_MS: dark, never the old show
        answer = (signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
        const hung = fire(POLL_MS)
        fire(TIMEOUT_MS)
        await hung
        expect(store.getSnapshot()).toBe(NOT_PLAYING)
        answer = () => ({ ok: false, status: 404 }) // a tier with no lasers: asked again only every OFF_POLL_MS
        await fire(POLL_MS)
        expect(timers.map((t) => t.ms)).toEqual([OFF_POLL_MS])
        leave() // the last listener leaves: no poll is left
        expect(timers).toHaveLength(0)
        // a room that leaves and comes back while a read is in flight does not start a second poll
        answer = () => ({ ok: true, status: 200, json: async () => serverState() })
        const first = store.subscribe(() => {})
        const inFlight = fire(0)
        first()
        expect(store.getSnapshot()).toBe(NOT_PLAYING) // forgotten while nobody listens
        const again = store.subscribe(() => {})
        expect(polls()).toEqual([])
        await inFlight
        expect(polls()).toEqual([POLL_MS])
        expect(store.getSnapshot().playing).toBe(true)
        again()
        expect(timers).toHaveLength(0)
    })
})
