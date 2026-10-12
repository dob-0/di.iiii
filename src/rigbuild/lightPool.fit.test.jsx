import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { context as fiberContext } from '@react-three/fiber'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import EntityContent from '../project/viewport/EntityContent.jsx'
import SpotLightObject from '../objectComponents/SpotLightObject.jsx'
import { spotLightCone } from '../objectComponents/spotBeam.js'
import { POOL_ID_PREFIX, applyLightPool, stepLightPool } from './lightPool.js'
import { rigBodyLamps } from './rigBodyLamps.js'
import { TYPE_LIBRARY } from './types/index.js'

// LITE'S LIGHT IS THE POOL'S LIGHT, AND IT MUST BE THE LAMP'S LIGHT. (MOXIR lead, 2026-10-09; many-lights
// plan §6.1.) In Lite, everyone's default since 2026-10-08, the room is lit by four light-pool slots
// (outputMode.js, lightPool.js). A slot is built from the lamp it takes: place, aim, colour, intensity, angle.
// A rig lamp's `angle` is half its BEAM angle, the datasheet's 50 % point; the renderer turns it into three's
// cone with spotLightCone (spotBeam.js) only for an entity that says it is a rig lamp (`fitted`). The slot did
// not say so, so three got the raw half-beam angle as its CUTOFF: a PL5403 slot carried 50.1 % of the lumens the
// same lamp carries in Full. This file holds the guard: what three is given for a slot is what it is given for
// the lamp. Everything is the real code: the pool, the renderer's entity switch (EntityContent), the lamp
// component (SpotLightObject) rendered to markup, the lamps' bodies (rigBodyLamps).

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEG = Math.PI / 180

// The UPlight UP-PL5403 as the rig hangs it: a 25 deg beam (half 12.5 deg), a wash (penumbra 0.5), no cutoff
// distance (rig lamps carry distance 0 since 2026-10-09). Candela and place are the T1 lamp's.
const pl5403 = (id, over = {}) => ({
    id,
    type: 'spotLight',
    name: `UP-PL5403 ${id}`,
    components: {
        transform: { position: [2, 7, -3], rotation: [-0.6, 0.2, 0], scale: [1, 1, 1] },
        light: { color: '#ff3b3b', intensity: 609, distance: 0, angle: 12.5 * DEG, penumbra: 0.5, decay: 2 },
        beam: { visible: true, haze: 0.4, length: 18 },
        fixture: { type: 'up-pl5403', index: 7 },
        animation: { mode: 'static', speed: 1, amplitude: 1 },
        ...over
    }
})
// an authored spot: no fixture, its angle IS its cutoff
const authored = (id) => {
    const e = pl5403(id)
    delete e.components.fixture
    return e
}

// what the room hands three for an entity: the real entity switch, then the real lamp component
const lampProps = (entity) => EntityContent({ entity, assetMap: new Map() }).props.children[0].props
const draw = (props) => renderToStaticMarkup(createElement(fiberContext.Provider, { value: { getState: () => ({ gl: {} }) } }, createElement(SpotLightObject, props)))
const attr = (html, name) => Number((html.match(new RegExp(`<spotlight[^>]*\\b${name}="([^"]+)"`, 'i')) || [])[1])
const coneOf = (entity) => {
    const html = draw(lampProps(entity))
    return { angle: attr(html, 'angle'), penumbra: attr(html, 'penumbra'), intensity: attr(html, 'intensity') }
}
// three's spot falloff: smoothstep(cos(cutoff), cos(cutoff·(1−penumbra)), cos θ) — lights_pars_begin getSpotAttenuation
const falloff = (theta, { angle, penumbra }) => {
    const lo = Math.cos(angle)
    const hi = Math.cos(angle * (1 - penumbra))
    const t = Math.min(1, Math.max(0, (Math.cos(theta) - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)
}
// the lumens of three's cone at its intensity, numerically: I · 2π ∫₀^cutoff falloff(θ) sin θ dθ
const lumens = ({ angle, penumbra, intensity }) => {
    const n = 20000
    let s = 0
    for (let i = 0; i < n; i += 1) {
        const t = ((i + 0.5) / n) * angle
        s += falloff(t, { angle, penumbra }) * Math.sin(t)
    }
    return intensity * 2 * Math.PI * s * (angle / n)
}

const opts = { slots: 4, minHoldMs: 1500, handoverMs: 400, margin: 0.15 }
// the pool as Lite runs it, a moment after the slot took its lamp (the dip is over: envelope 1)
const pooled = (entities) => {
    const state = stepLightPool(null, entities, 0, opts)
    return applyLightPool(entities, state, 1000, opts)
}
const slotsOf = (out) => out.filter((e) => e.id.startsWith(POOL_ID_PREFIX))

describe('a light-pool slot gives three the cone of the lamp it took (Lite = Full, per lamp)', () => {
    it('a PL5403 slot has the same cone, so the same lumens, as the PL5403 in Full', () => {
        const lamp = pl5403('rig-par-01')
        const full = coneOf(lamp) // Full: the lamp itself, drawn as a real light
        const [slot] = slotsOf(pooled([lamp]))
        expect(slot.components.lightPool.lamp).toBe('rig-par-01')
        const lite = coneOf(slot)
        // the cone the rig's fit gives (spotBeam.js): penumbra 1 and the cutoff that keeps the flux
        const fit = spotLightCone({ angle: 12.5 * DEG, penumbra: 0.5 })
        expect(full.angle).toBeCloseTo(fit.angle, 9)
        expect(full.penumbra).toBe(1)
        // the slot: the same angle and penumbra
        expect(lite.angle).toBeCloseTo(full.angle, 9)
        expect(lite.penumbra).toBe(full.penumbra)
        expect(lite.intensity).toBe(full.intensity)
        // ...and the same lumens (before the fix: 0.0931 sr·I against 0.1857, 50.1 %)
        expect(lumens(lite) / lumens(full)).toBeCloseTo(1, 9)
    })

    it('holds for a beam lamp too (the B380F class: penumbra under the wash line)', () => {
        const beam = pl5403('rig-beam-01', { light: { color: '#ffffff', intensity: 4000, distance: 0, angle: 0.9 * DEG, penumbra: 0.1, decay: 2 }, fixture: { type: 'up-b380f', index: 12 } })
        const full = coneOf(beam)
        const lite = coneOf(slotsOf(pooled([beam]))[0])
        expect(lite.angle).toBeCloseTo(full.angle, 9)
        expect(lite.penumbra).toBe(full.penumbra)
        expect(lumens(lite) / lumens(full)).toBeCloseTo(1, 9)
    })

    it('follows the lamp through a hand-over: the slot re-let to a second lamp gives that lamp\'s cone', () => {
        const a = pl5403('rig-par-01')
        const b = pl5403('rig-par-02', { light: { color: '#3b3bff', intensity: 2000, distance: 0, angle: 20 * DEG, penumbra: 0.5, decay: 2 } })
        const one = { ...opts, slots: 1 }
        let state = stepLightPool(null, [a], 0, one)
        state = stepLightPool(state, [a, b], 5000, one) // b outshines a and the hold is over
        const slot = slotsOf(applyLightPool([a, b], state, 9000, one))[0]
        expect(slot.components.lightPool.lamp).toBe('rig-par-02')
        const lite = coneOf(slot)
        const full = coneOf(b)
        expect(lite.angle).toBeCloseTo(full.angle, 9)
        expect(lumens(lite) / lumens(full)).toBeCloseTo(1, 9)
    })

    it('an authored spot taken by the pool keeps its angle as its cutoff, as it does on its own', () => {
        const lamp = authored('spot-1')
        const full = coneOf(lamp)
        const lite = coneOf(slotsOf(pooled([lamp]))[0])
        expect(full.angle).toBeCloseTo(12.5 * DEG, 9) // not fitted: three reads the angle as the cutoff
        expect(full.penumbra).toBe(0.5)
        expect(lite.angle).toBeCloseTo(full.angle, 9)
        expect(lite.penumbra).toBe(full.penumbra)
    })
})

describe('the fit is carried without making the slot a second lamp', () => {
    it('the slot carries no fixture: the lamps\' bodies, the patch and the haze machines see only the lamps', () => {
        const lamps = [pl5403('rig-par-01'), pl5403('rig-par-02')]
        const out = pooled(lamps)
        const slots = slotsOf(out)
        expect(slots).toHaveLength(opts.slots)
        expect(slots.every((s) => s.components.fixture === undefined)).toBe(true)
        // the bodies a room draws (RigBodies reads the pooled entities): one per lamp, none for a slot
        expect(rigBodyLamps(out, TYPE_LIBRARY).map((l) => l.id).sort()).toEqual(['rig-par-01', 'rig-par-02'])
    })

    it('a slot with no lamp, parked at intensity 0, is not fitted', () => {
        const slots = slotsOf(pooled([pl5403('rig-par-01')]))
        const empty = slots.find((s) => s.components.lightPool.lamp === null)
        expect(empty.components.light.intensity).toBe(0)
        expect(empty.components.lightPool.fitted).toBe(false)
    })
})

describe('both renderers read the fit the same way', () => {
    // LiveProjectScene (the space view and walk mode, where Lite runs) cannot be mounted in a test: it is a full
    // R3F tree. Its entity switch is a copy of EntityContent's (SpotLightObject.jsx header: "that duplication has
    // shipped drift twice already"), so the line that decides `fitted` is guarded as text, as
    // liveProjectSceneSeams.test.js guards the rest of that file.
    const read = (rel) => readFileSync(path.join(HERE, rel), 'utf8')
    for (const rel of ['../components/LiveProjectScene.jsx', '../project/viewport/EntityContent.jsx']) {
        it(`${path.basename(rel)} asks lampIsFitted, not "has a fixture"`, () => {
            const source = read(rel)
            expect(source).toMatch(/<SpotLightObject [^>]*fitted=\{lampIsFitted\(entity\.components\)\}/)
            expect(source).not.toMatch(/fitted=\{Boolean\(entity\.components\?\.fixture\)\}/)
        })
    }
})
