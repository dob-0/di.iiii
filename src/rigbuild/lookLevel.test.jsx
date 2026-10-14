import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { context as fiberContext } from '@react-three/fiber'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicProjectViewer from '../project/components/PublicProjectViewer.jsx'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceEntity } from './plotEdits.js'
import { layRun } from './plotGeometry.js'
import { positionsOf } from './positions.js'
import { dealOps } from './deal.js'
import { deskLookId, lookPoses, posedEntities } from './looks.js'
import { deskProfileName } from './dmxPose.js'
import { useRigLookEntities } from './useRigLook.js'
import SpotLightObject from '../objectComponents/SpotLightObject.jsx'
import { DEFAULT_HAZE, spotBeamShape } from '../objectComponents/spotBeam.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { rigLooksFrom } from '../../scripts/rigbuild/looks.mjs'

// A LOOK'S LEVEL IS DRAWN ONCE: the light a lamp puts out in a look is level × its nominal
// (RIG_BUILD.md §15: "a look's level for a group key, 0..1"; looks.js atLevel). MOXIR
// 2026-10-09: the room was measured drawing level² (the v2 spread, PR #864: 609.56 × 0.44² =
// 118.01 in the renderer's own lamp list). This file follows ONE lamp from the look's json
// to the number the renderer gets, and shows where a level could be applied a second time.
// The public page's double pass (the cause) is tested where it lives:
// src/project/components/PublicProjectViewer.lookLevel.test.jsx.

// ---- the public page, for the last section: everything but the WebGL viewports is the real code ----
const page = vi.hoisted(() => ({ document: null }))
vi.mock('../project/services/projectSyncService.js', () => ({ createProjectSyncService: () => ({ connect: () => {}, disconnect: () => {} }) }))
vi.mock('../project/services/projectsApi.js', () => ({
    getProjectDocument: async () => ({ version: 1, document: page.document }),
    listProjectOps: async () => ({ ops: [], latestVersion: 1 }),
    buildProjectEventsUrl: (projectId) => `/api/projects/${projectId}/events`,
    listSpaceContents: async () => [{ id: 'moxir-level', slug: null, title: 'level', mode: 'scene', updatedAt: 0 }],
    DEFAULT_PROJECT_SPACE_ID: 'main'
}))
vi.mock('../hooks/useXrAr.js', () => ({
    default: () => ({ xrStore: {}, supportedXrModes: { vr: false, ar: false }, isXrPresenting: false, handleEnterXrSession: () => {}, handleExitXrSession: () => {} })
}))
// A hosted page: no desk answers, so the show's clock drives the room (the case the v2 spread measured).
vi.mock('../rigMirror/useLightingMirror.js', async (importOriginal) => {
    const absent = { present: false, fixtures: [], master: null, blackout: false }
    const store = { getSnapshot: () => absent, subscribe: () => () => {}, probe: () => Promise.resolve(false), watch: () => () => {} }
    return { ...(await importOriginal()), getSharedLightingMirror: () => store }
})
// The orbit viewport (StudioViewport, a WebGL canvas jsdom cannot draw) stands in as a probe that does with the
// document exactly what StudioViewport.jsx does — the source check at the end holds the real file to these lines —
// and reports the light and the haze of the column beams it would hand to the renderer.
vi.mock('../studio/components/StudioViewport.jsx', async () => {
    const { useRigLookEntities: hook } = await import('./useRigLook.js')
    return {
        default: function ProbeOrbitViewport({ document, rigLook, lookDrawn = false }) {
            const look = hook(lookDrawn ? null : document, { explicit: rigLook })
            const entities = lookDrawn ? document.entities : look.entities
            const lamps = entities.filter((e) => e.components?.fixture?.type === 'up-b380f')
            return createElement('div', {
                'data-testid': 'orbit-drawn',
                'data-handed-posed': String((document.entities || []).some((e) => e.components?.rigShown)),
                'data-light': lamps.map((e) => e.components.light.intensity).join(','),
                'data-haze': lamps.map((e) => e.components.beam.haze).join(',')
            })
        }
    }
})
// Walk / Fly (LiveProjectScene) draws the entities it is handed (`entitiesOverride`) and poses nothing itself.
vi.mock('../components/LiveProjectScene.jsx', () => ({
    default: function ProbeWalk({ entitiesOverride }) {
        const lamps = (entitiesOverride || []).filter((e) => e.components?.fixture?.type === 'up-b380f')
        return createElement('div', { 'data-testid': 'walk-drawn', 'data-light': lamps.map((e) => e.components.light.intensity).join(',') })
    }
}))

// The small rig looks.test.js and dmxPose.test.js deal: 4 UP-B380F on column bases, 2 UP-250BSW
// on a truss header, every lamp joined to a desk fixture in its ASSUMED test mode.
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
const MODES = { 'up-b380f': '16ch-assumed', 'up-250bsw': '17ch-assumed' }
const CODES = { 'up-b380f': 'UP-B380F', 'up-250bsw': 'UP-250BSW' }
// The room's PAR figure (scripts/rigbuild/epic-build.mjs candelaOf: 609.56 / SCALE cd × SCALE 0.02):
// the nominal the v2 spread's lamp list was read against.
export const NOMINAL = 609.56
const HAZE = 0.6

/** The dealt room with one look, `up`, holding the column-base beams at `level` (the truss spots are not levelled: full). */
export const roomAt = (level) => {
    const rig = {
        rig: 'level-test', writtenAt: '2026-10-09',
        classes: { beam: { code: 'UP-B380F' }, spot: { code: 'UP-250BSW' } },
        groups: [{ id: 'beams-cols', class: 'beam', mount: 'column-bases' }, { id: 'spots', class: 'spot', mount: 'truss-header' }],
        looks: { up: { title: 'Up', aims: { 'beams-cols': { rule: 'vertical' }, spots: { rule: 'vertical' } }, colours: { 'beams-cols': '#ff3a12' }, levels: { 'beams-cols': level } } }
    }
    let n = 0
    let doc = normalizeProjectDocument({ entities: base })
    for (const [pos, type, k] of [['column-bases', 'up-b380f', 4], ['truss:h0', 'up-250bsw', 2]]) {
        const position = positionsOf(doc.entities).find((p) => p.id === pos)
        doc = applyProjectOps(doc, dealOps({ entities: doc.entities, position, filled: new Set(), type: typeById(TYPE_LIBRARY, type), n: k, newId: () => `L${++n}` }).ops)
    }
    doc = applyProjectOps(doc, [{ type: 'createEntity', payload: { entity: { id: 'rig-show', type: 'group', components: { rigLooks: rigLooksFrom(rig, 'rig.json') } } } }])
    let index = 0
    return doc.entities.map((e) => {
        const f = e.components?.fixture
        if (!f?.type) return e
        index += 1
        return {
            ...e,
            components: {
                ...e.components,
                light: { ...e.components.light, intensity: NOMINAL },
                beam: { ...(e.components.beam || {}), visible: true, haze: HAZE },
                fixture: { ...f, index, mode: MODES[f.type] }
            }
        }
    })
}
const beams = (entities) => entities.filter((e) => e.components?.fixture?.type === 'up-b380f')
const spots = (entities) => entities.filter((e) => e.components?.fixture?.type === 'up-250bsw')
const lightOf = (entities, id) => Number(entities.find((e) => e.id === id).components.light.intensity)
const hazeOf = (entities, id) => Number(entities.find((e) => e.id === id).components.beam.haze)
// atLevel rounds a light to 0.01 and a haze to 0.001 (looks.js)
const once = (level) => Math.round(NOMINAL * level * 100) / 100

const absentDesk = () => ({ getSnapshot: () => ({ present: false, fixtures: [] }), subscribe: () => () => {}, probe: () => Promise.resolve(false), watch: () => () => {} })
const deskPlaying = (lookId, fixtures) => {
    const snapshot = { present: true, fixtures, looks: [deskLookId(lookId)], lookFade: null }
    return { getSnapshot: () => snapshot, subscribe: () => () => {}, probe: () => Promise.resolve(true), watch: () => () => {} }
}
// The mirror's fixtures for these lamps, every channel at rest, `set` on top (dmxPose.test.js deskOf).
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
// A show that holds the look by the wall clock, as the measuring harness held it (moxir-v2-true-frames.cjs docForJob).
const heldBy = (entities, lookId) => ({
    entities,
    mappingState: { cues: [{ id: `held-${lookId}`, name: lookId, lightLook: deskLookId(lookId), hold: 3600, fade: 0, surfaces: {} }], loop: true, showEpoch: Date.now() - 500, showSource: 'clock' }
})

describe('a look\'s level is drawn once: level × nominal (MOXIR 2026-10-09)', () => {
    it('looks.js: the look\'s json at 0.5 poses the lamp at 0.5 × its nominal light and haze; a group the look does not level stays at full', () => {
        const entities = roomAt(0.5)
        const poses = lookPoses({ entities, library: TYPE_LIBRARY, lookId: 'up' })
        const shown = posedEntities(entities, poses)
        for (const e of beams(entities)) {
            expect(poses.get(e.id).level).toBe(0.5)
            expect(lightOf(shown, e.id)).toBe(once(0.5))
            expect(hazeOf(shown, e.id)).toBe(HAZE * 0.5)
            expect(shown.find((x) => x.id === e.id).components.rigShown).toEqual({ level: 0.5 })
        }
        for (const e of spots(entities)) expect(lightOf(shown, e.id)).toBe(NOMINAL)
        expect(lightOf(entities, beams(entities)[0].id)).toBe(NOMINAL) // the document is not touched
    })

    // (b) a deliberate dimmer curve, (c) a gamma or sRGB decode: either would bend ONE pass.
    it('one pass is linear at every level the MOXIR faders use: not level², not a 2.2 gamma, not the sRGB curve', () => {
        const srgb = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        for (const level of [0.14, 0.33, 0.35, 0.44, 0.5, 0.54, 0.59, 0.63, 0.76, 0.8]) {
            const entities = roomAt(level)
            const shown = posedEntities(entities, lookPoses({ entities, library: TYPE_LIBRARY, lookId: 'up' }))
            const ratio = lightOf(shown, beams(entities)[0].id) / NOMINAL
            expect(ratio, `level ${level}`).toBeCloseTo(level, 4)
            for (const bent of [level ** 2, level ** 2.2, srgb(level)]) expect(Math.abs(ratio - bent), `level ${level}`).toBeGreaterThan(0.08)
        }
    })

    it('the room following the show\'s clock (no desk, as the probe ran it) draws 0.5 × nominal', async () => {
        const entities = roomAt(0.5)
        const { result } = renderHook(() => useRigLookEntities(heldBy(entities, 'up'), { mirror: absentDesk() }))
        await waitFor(() => expect(result.current.lookId).toBe('up'))
        expect(result.current.driver).toBe('clock')
        for (const e of beams(entities)) expect(lightOf(result.current.entities, e.id)).toBe(once(0.5))
    })

    // (a) the look's level × the desk's dimmer: where the desk drives a lamp (DMX wins, RIG_BUILD.md §18.4) its
    // level REPLACES the look's, from the document's own nominal (dmxPose.js `reach`), never on top of it.
    it('the desk\'s dimmer is not a second factor: a desk at 50 % over a look at 0.5 draws 50 % of the nominal', async () => {
        const entities = roomAt(0.5)
        const set = Object.fromEntries(beams(entities).map((e) => [e.id, { dimmer: 128 }]))
        const { result } = renderHook(() => useRigLookEntities({ entities }, { mirror: deskPlaying('up', deskOf(entities, set)) }))
        await waitFor(() => expect(result.current.driver).toBe('desk'))
        expect(result.current.lookId).toBe('up')
        for (const e of beams(entities)) {
            const drawn = lightOf(result.current.entities, e.id)
            expect(drawn).toBeCloseTo(NOMINAL * 128 / 255, 1)
            expect(drawn).not.toBeCloseTo(NOMINAL * 0.5 * 128 / 255, 0)
        }
    })

    it('the renderer takes the entity\'s number as it is: the spot light\'s intensity, the flat cone\'s opacity once', () => {
        const entities = roomAt(0.5)
        const shown = posedEntities(entities, lookPoses({ entities, library: TYPE_LIBRARY, lookId: 'up' }))
        const lamp = shown.find((e) => e.id === beams(entities)[0].id)
        const l = lamp.components.light
        const props = { color: l.color, intensity: l.intensity, distance: l.distance, angle: l.angle, penumbra: l.penumbra, decay: l.decay, beam: { ...lamp.components.beam, only: false }, fitted: true }
        const html = renderToStaticMarkup(createElement(fiberContext.Provider, { value: { getState: () => ({ gl: {} }) } }, createElement(SpotLightObject, props)))
        expect(Number((html.match(/<spotlight[^>]*\bintensity="([^"]+)"/i) || [])[1])).toBe(once(0.5))
        // the cone with no air (spotBeam.js): opacity ∝ haze, the lamp's drive capped at full for a rig lamp's candela
        const at = (haze, intensity) => spotBeamShape({ distance: 20, angle: 0.1, intensity, haze }).opacity
        expect(at(HAZE * 0.5, once(0.5)) / at(HAZE, NOMINAL)).toBeCloseTo(0.5, 6)
        expect(at(undefined, NOMINAL)).toBeCloseTo(at(DEFAULT_HAZE, NOMINAL), 9)
    })

    // The mechanism the public page hit (PublicProjectViewer → RoomLookFollower poses the room → its orbit
    // viewport, StudioViewport, ran useRigLookEntities AGAIN on the posed entities): the hook is not
    // idempotent, so a second pass multiplies every level in again. The v2 spread's own numbers, to the cent.
    it('a room posed and handed back to the hook is posed again: level² — why a drawn room must never be re-posed', async () => {
        const entities = roomAt(0.44)
        const first = renderHook(() => useRigLookEntities(heldBy(entities, 'up'), { mirror: absentDesk() }))
        await waitFor(() => expect(first.result.current.lookId).toBe('up'))
        const posed = first.result.current.entities
        expect(lightOf(posed, beams(entities)[0].id)).toBe(268.21)
        const second = renderHook(() => useRigLookEntities(heldBy(posed, 'up'), { mirror: absentDesk() }))
        await waitFor(() => expect(second.result.current.lookId).toBe('up'))
        expect(lightOf(second.result.current.entities, beams(entities)[0].id)).toBe(118.01) // 609.56 × 0.44², the lamp list's number
        expect(hazeOf(second.result.current.entities, beams(entities)[0].id)).toBeCloseTo(HAZE * 0.44 * 0.44, 3)
    })
})

// THE CAUSE (MOXIR 2026-10-09). The public page (/{space}/{slug}, PublicProjectViewer) poses the room in
// RoomLookFollower and hands the drawing on: to Walk / Fly as `entitiesOverride`, to the orbit view (the
// default, StudioViewport) as the scene document. StudioViewport ran useRigLookEntities on its document
// again — the same clock, the same look — so the orbit view drew every level twice: level² on the light
// and on the haze (and a moving look's beat, and a desk's dimmer, twice too). Walk / Fly drew it once.
describe('the public page draws a look\'s level once, in the orbit view and in Walk / Fly', () => {
    let realFetch
    beforeEach(() => {
        realFetch = globalThis.fetch
        // no desk, no server clock, no favourites: a page on its own
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}), text: async () => '' }))
        page.document = {
            projectMeta: { id: 'moxir-level', title: 'level' },
            presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
            ...heldBy(roomAt(0.5), 'up')
        }
    })
    afterEach(() => { globalThis.fetch = realFetch })

    const drawn = (testId, key) => screen.getByTestId(testId).dataset[key].split(',').map(Number)

    it('the orbit view draws the column beams at 0.5 × their nominal light and haze, not 0.25', async () => {
        render(<PublicProjectViewer spaceId="main" projectId="moxir-level" spaceLabel="Main" />)
        // RoomLookFollower has posed the room and handed it to the viewport
        await waitFor(() => expect(screen.getByTestId('orbit-drawn').dataset.handedPosed).toBe('true'), { timeout: 5000 })
        const light = drawn('orbit-drawn', 'light')
        expect(light).toHaveLength(4)
        for (const v of light) expect(v).toBe(once(0.5)) // 304.78; the double pass drew 152.39
        for (const v of drawn('orbit-drawn', 'haze')) expect(v).toBeCloseTo(HAZE * 0.5, 3)
    })

    it('Walk / Fly draws the same look at the same level', async () => {
        render(<PublicProjectViewer spaceId="main" projectId="moxir-level" spaceLabel="Main" />)
        await waitFor(() => expect(screen.getByTestId('orbit-drawn').dataset.handedPosed).toBe('true'), { timeout: 5000 })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Walk / Fly' })) })
        const light = drawn('walk-drawn', 'light')
        expect(light).toHaveLength(4)
        for (const v of light) expect(v).toBe(once(0.5))
    })

    // The probe above stands in for StudioViewport; this holds the real file to the same two lines, so the
    // probe cannot pass while the viewport poses a handed drawing again.
    it('StudioViewport draws a room handed to it already drawn (lookDrawn) as handed, and passes the flag down', () => {
        const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'studio', 'components', 'StudioViewport.jsx'), 'utf8')
        expect(src).toMatch(/useRigLookEntities\(\s*lookDrawn\s*\?\s*null\s*:\s*document\s*,\s*\{\s*explicit:\s*rigLook\s*\}\s*\)/)
        expect(src).toMatch(/sceneEntities\s*=\s*lookDrawn\s*\?\s*\(?document\.entities/)
        expect(src).toMatch(/lookDrawn=\{lookDrawn\}/)
    })
})
