import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SpotLightObject from '../objectComponents/SpotLightObject.jsx'
import { beamCastsLight, spotBeamShape } from '../objectComponents/spotBeam.js'
import { lookFadeOf } from '../rigMirror/useLightingMirror.js'
import { TYPE_LIBRARY } from './types/index.js'
import { blendEntities, flashEntities, mixColour, washLevelOf, withWashLevel } from './looks.js'
import { flashLamps, flashRig, strobeEnvelope, STROBE_HZ } from './rigFlash.js'
import { fadeProgress } from './useRigLook.js'

// RIG_BUILD.md §15.6 — the strobe hit rendered as huge flat grey cones and a white floor
// (owner's preview, rigbuilder.6). A strobe in the room is a FLASH: no cone, no light of
// its own, a face and a shared pulsed light (RigFlashes.jsx).

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const lamp = (id, type, extra = {}) => ({
    id,
    type: 'spotLight',
    name: id,
    components: {
        transform: { position: [1, 0.3, 7], rotation: [0.6, 0, 0], scale: [1, 1, 1] },
        light: { color: '#f4f7ff', intensity: 400, distance: 44, angle: 0.52, penumbra: 0.6 },
        beam: { visible: true, haze: 0.4, only: false },
        fixture: { type },
        ...extra
    }
})

// What SpotLightObject mounts for a lamp, as markup: three's intrinsic elements come out
// as tags (<spotlight>, <mesh>), so a cone in the air is a <mesh> in the string.
const mounted = (e) => renderToStaticMarkup(createElement(SpotLightObject, {
    color: e.components.light.color,
    intensity: e.components.light.intensity,
    distance: e.components.light.distance,
    angle: e.components.light.angle,
    penumbra: e.components.light.penumbra,
    beam: e.components.beam
}))

describe('a strobe draws no cone (the guard: "no strobe cone mesh")', () => {
    const inLook = { rigShown: { level: 1 } }
    const doc = [lamp('rig-strobe-pit-01', 'ext-strobe', inLook), lamp('rig-blinder-01', 'ext-blinder', inLook), lamp('rig-beam380-back-01', 'up-b380f')]
    const shown = flashEntities(doc, TYPE_LIBRARY)
    const byId = new Map(shown.map((e) => [e.id, e]))

    it('keeps a strobe and a blinder beam-only at haze 0, marked as a flash; a beam lamp is untouched', () => {
        for (const id of ['rig-strobe-pit-01', 'rig-blinder-01']) {
            const e = byId.get(id)
            expect(e.components.beam).toMatchObject({ visible: true, only: true, haze: 0 })
            expect(beamCastsLight(e.components.beam)).toBe(false)
            expect(spotBeamShape({ ...e.components.light, haze: e.components.beam.haze }).opacity).toBe(0)
        }
        expect(byId.get('rig-strobe-pit-01').components.rigFlash).toEqual({ kind: 'strobe', level: 1 })
        expect(byId.get('rig-blinder-01').components.rigFlash).toEqual({ kind: 'blinder', level: 1 })
        expect(byId.get('rig-beam380-back-01')).toBe(doc[2])
    })

    it('mounts NO cone mesh and NO spot light for a strobe or a blinder in the room', () => {
        for (const id of ['rig-strobe-pit-01', 'rig-blinder-01']) {
            const html = mounted(byId.get(id))
            expect(html).not.toMatch(/<mesh/)
            expect(html).not.toMatch(/<spotlight/i)
        }
        // …while a beam lamp still draws its cone (the test can see one)
        expect(mounted(byId.get('rig-beam380-back-01'))).toMatch(/<mesh/)
    })

    it('a strobe at rest (no look playing) does not fire', () => {
        expect(flashEntities([lamp('s', 'ext-strobe')], TYPE_LIBRARY)[0].components.rigFlash.level).toBe(0)
    })

    it('a strobe at level 0 in the look is out: no flash', () => {
        const out = flashEntities([lamp('s', 'ext-strobe', { rigShown: { level: 0 } })].map((e) => ({ ...e, components: { ...e.components, light: { ...e.components.light, intensity: 0 } } })), TYPE_LIBRARY)
        expect(out[0].components.rigFlash.level).toBe(0)
    })

    it('every room that draws lamps passes them through the flash pass (useRigLook)', () => {
        expect(read('./useRigLook.js')).toMatch(/flashEntities\(blended, library\)/)
        expect(read('./RigBodies.jsx')).toMatch(/<RigFlashes entities=\{entities\} \/>/)
        expect(read('../project/components/PublicProjectViewer.jsx')).toMatch(/<RoomLookFollower\s+document=\{document\}/)
    })
})

describe('the flash itself', () => {
    it('is short and sharp: full at the pulse, under 5 % by 70 ms, 10 a second', () => {
        expect(strobeEnvelope(0)).toBeCloseTo(1, 6)
        expect(strobeEnvelope(1 / STROBE_HZ)).toBeCloseTo(1, 6)
        expect(strobeEnvelope(0.07)).toBeLessThan(0.05)
        expect(strobeEnvelope(0.033)).toBeLessThan(0.25)
    })

    it('one shared light per kind, at the lit lamps\' centre along their mean aim', () => {
        const at = (id, x) => ({ ...lamp(id, 'ext-strobe', { rigShown: { level: 1 } }), components: { ...lamp(id, 'ext-strobe', { rigShown: { level: 1 } }).components, transform: { position: [x, 0.3, 7], rotation: [0.6, 0, 0] } } })
        const lamps = flashLamps(flashEntities([at('a', -1), at('b', 3)], TYPE_LIBRARY))
        const rig = flashRig(lamps)
        expect(rig.lens).toEqual([1, 0.3, 7])
        expect(Math.hypot(...rig.dir)).toBeCloseTo(1, 6)
        expect(flashRig([])).toBeNull()
        expect(read('./RigFlashes.jsx')).toMatch(/intensity=\{0\}/) // mounted at 0, never unmounted mid-show
    })
})

describe('a cue\'s fade in the room', () => {
    const a = lamp('x', 'up-b380f')
    const b = { ...a, components: { ...a.components, transform: { ...a.components.transform, rotation: [0.6, 0, -3.1] }, light: { ...a.components.light, color: '#ff1408', intensity: 0 }, beam: { ...a.components.beam, haze: 0 } } }
    const a2 = { ...a, components: { ...a.components, transform: { ...a.components.transform, rotation: [0.6, 0, 3.1] } } }

    it('draws a lamp part-way: light, colour, haze, and the aim the short way round', () => {
        const [half] = blendEntities([a2], [b], 0.5)
        expect(half.components.light.intensity).toBe(200)
        expect(half.components.light.color).toBe(mixColour('#f4f7ff', '#ff1408', 0.5))
        expect(half.components.beam.haze).toBeCloseTo(0.2, 6)
        expect(Math.abs(half.components.transform.rotation[2])).toBeGreaterThan(3.1) // not through 0
        expect(blendEntities([a2], [b], 1)[0]).toBe(b)
        expect(blendEntities([a2], [b], 0)[0]).toBe(a2)
    })

    it('reads the desk\'s fade on this clock, and keeps one record while the same firing is reported again', () => {
        const looks = [{ lookId: 'rig-red-room', level: 1, priority: 2, since: 400, fadeMs: 3000, from: 'rig-one-beam' }]
        const f = lookFadeOf(looks, null, 10_000)
        expect(f).toEqual({ lookId: 'rig-red-room', from: 'rig-one-beam', fadeMs: 3000, firedAt: 9_600 })
        expect(lookFadeOf([{ ...looks[0], since: 500 }], f, 10_130)).toBe(f)
        expect(fadeProgress(f, 9_600 + 1500)).toBeCloseTo(0.5, 6)
        expect(fadeProgress(null)).toBe(1)
    })
})

describe('the baked wash follows the look', () => {
    const look = (levels) => ({ aims: { 'column-faces/up-pl5403': { rule: 'up-the-column' }, 'backdrop/up-pl5403': { rule: 'backdrop' }, 'column-bases/up-b380f': { rule: 'vertical' } }, levels })
    it('is out where the look has the washing PARs out, and at their level otherwise', () => {
        expect(washLevelOf(look({ 'column-faces/up-pl5403': 0, 'backdrop/up-pl5403': 0 }))).toBe(0)
        expect(washLevelOf(look({ 'column-faces/up-pl5403': 0.3, 'backdrop/up-pl5403': 0 }))).toBe(0.3)
        expect(washLevelOf(look({ 'column-bases/up-b380f': 0 }))).toBe(1)
        const wash = { id: 'rig-wash', type: 'model', components: { appearance: {} } }
        expect(withWashLevel([wash], 0)[0].components.runtime.visible).toBe(false)
        expect(withWashLevel([wash], 0.3)[0].components.appearance.opacity).toBe(0.3)
        expect(withWashLevel([wash], 1)[0]).toBe(wash)
    })
})
