// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { fixtureColour } from './fixtureColour.js'

// THE CONTRACT: src/rigMirror/fixtureColour.js answers exactly what the lighting interface's
// own `liveColor(f)` answers. The interface file is a plain browser script with no
// exports, so the original is lifted out of its TEXT and evaluated here — the real
// function, not a transcription of it. If someone reshapes that file so the pieces can
// no longer be found, this fails loudly rather than passing on nothing.
const here = path.dirname(fileURLToPath(import.meta.url))
const lightingDir = path.resolve(here, '../../serverXR/src/lighting')
const uiSource = readFileSync(path.join(lightingDir, 'ui/app.js'), 'utf8')
const require = createRequire(import.meta.url)
const { PROFILES, roleKinds } = require(path.join(lightingDir, 'engine.js'))

const lift = (pattern, what) => {
    const match = uiSource.match(pattern)
    if (!match) throw new Error(`could not find ${what} in serverXR/src/lighting/ui/app.js — the contract test needs updating`)
    return match[0]
}

const pieces = [
    lift(/^const clamp = .*;$/m, 'clamp'),
    lift(/^const parseHex = .*;$/m, 'parseHex'),
    lift(/^const ROLE_COLOR = \{[\s\S]*?^\};$/m, 'ROLE_COLOR'),
    lift(/^const BASE_ROLES = .*;$/m, 'BASE_ROLES'),
    lift(/^const EMITTER_MIX = \{[\s\S]*?^\};$/m, 'EMITTER_MIX'),
    lift(/^function emitterMix\(role\) \{[\s\S]*?^\}$/m, 'emitterMix'),
    lift(/^function liveColor\(f\) \{[\s\S]*?^\}$/m, 'liveColor')
]

// `S` (the state) and `DMX` (the buffers) are the two globals liveColor reads.
const deskLiveColor = new Function(
    `let S = null, DMX = {};\n${pieces.join('\n')}\nreturn (f, state, dmx) => { S = state; DMX = dmx; return liveColor(f); };`
)()

const publishedProfiles = Object.fromEntries(
    Object.entries(PROFILES).map(([key, p]) => [key, { channels: p.channels, cat: p.cat }])
)
const KINDS = roleKinds()

// A small deterministic generator, so a failure names a case that can be re-run.
const lcg = (seed) => {
    let s = seed >>> 0
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}

const bufferOf = (fill) => Array.from({ length: 512 }, (_, i) => fill(i))

const expectSame = (fixture, state, dmx) => {
    const theirs = deskLiveColor(fixture, state, dmx)
    const ours = fixtureColour({
        fixture,
        profile: state.profiles[fixture.profile],
        dmx,
        emitters: state.roleKinds?.emitter
    })
    expect(ours).toEqual(theirs)
    return ours
}

describe('fixtureColour ↔ the lighting interface liveColor', () => {
    it('lifted the real function out of the interface file', () => {
        expect(typeof deskLiveColor).toBe('function')
        expect(Object.keys(publishedProfiles).length).toBeGreaterThan(30)
    })

    it('agrees on every built-in profile, across random buffers, addresses and universes', () => {
        const state = { profiles: publishedProfiles, roleKinds: KINDS }
        const rand = lcg(20260920)
        let cases = 0
        for (const profile of Object.keys(publishedProfiles)) {
            for (let n = 0; n < 12; n++) {
                const universe = Math.floor(rand() * 3)
                const address = 1 + Math.floor(rand() * 500)
                const dmx = {
                    0: bufferOf(() => Math.floor(rand() * 256)),
                    1: bufferOf(() => Math.floor(rand() * 256)),
                    2: bufferOf(() => Math.floor(rand() * 256))
                }
                expectSame({ id: `${profile}-${n}`, profile, universe, address }, state, dmx)
                cases++
            }
        }
        expect(cases).toBe(Object.keys(publishedProfiles).length * 12)
    })

    it('agrees at the edges: all dark, all full, off the end of the universe, a missing universe', () => {
        const state = { profiles: publishedProfiles, roleKinds: KINDS }
        for (const profile of Object.keys(publishedProfiles)) {
            expectSame({ profile, universe: 0, address: 1 }, state, { 0: bufferOf(() => 0) })
            expectSame({ profile, universe: 0, address: 1 }, state, { 0: bufferOf(() => 255) })
            expectSame({ profile, universe: 0, address: 510 }, state, { 0: bufferOf(() => 200) })
            expectSame({ profile, universe: 7, address: 1 }, state, { 0: bufferOf(() => 200) })
        }
    })

    it('agrees when the state carries no roleKinds, on an unknown profile, and on custom emitters', () => {
        const custom = {
            ...publishedProfiles,
            mine: { channels: ['dimmer', 'warm', 'cool', 'a', 'uv', 'lime', 'y', 'w', 'aux1'] }
        }
        const dmx = { 0: bufferOf((i) => (i * 37 + 11) % 256) }
        expectSame({ profile: 'mine', universe: 0, address: 3 }, { profiles: custom, roleKinds: KINDS }, dmx)
        expectSame({ profile: 'mine', universe: 0, address: 3 }, { profiles: custom }, dmx)
        expectSame({ profile: 'drgbwa', universe: 0, address: 9 }, { profiles: custom }, dmx)
        expectSame({ profile: 'gone', universe: 0, address: 3 }, { profiles: custom, roleKinds: KINDS }, dmx)
        // An emitter the interface has no mix for falls back to its swatch, then to dim white.
        const odd = { profiles: custom, roleKinds: { emitter: [...KINDS.emitter, 'aux1'] } }
        expectSame({ profile: 'mine', universe: 0, address: 3 }, odd, dmx)
    })
})

describe('fixtureColour by hand', () => {
    const at = (values) => ({ 0: [...values, ...new Array(32).fill(0)] })

    it('drgb: the dimmer scales the colour and the level', () => {
        const out = fixtureColour({
            fixture: { universe: 0, address: 1 },
            roles: ['dimmer', 'r', 'g', 'b'],
            dmx: at([128, 255, 100, 0])
        })
        expect(out.r).toBeCloseTo(255 * 128 / 255)
        expect(out.g).toBeCloseTo(100 * 128 / 255)
        expect(out.b).toBe(0)
        expect(out.level).toBeCloseTo(128 / 255)
    })

    it('rgbw with no dimmer: as bright as its emitters, white adds on top and clamps', () => {
        const out = fixtureColour({
            fixture: { universe: 0, address: 1 },
            roles: ['r', 'g', 'b', 'w'],
            dmx: at([255, 60, 0, 100])
        })
        expect(out.r).toBe(255)
        expect(out.g).toBeCloseTo(60 + 92)
        expect(out.b).toBeCloseTo(92)
        expect(out.level).toBe(1)
    })

    it('a plain dimmer is white at its level', () => {
        const out = fixtureColour({ fixture: { universe: 0, address: 1 }, roles: ['dimmer'], dmx: at([51]) })
        expect(out).toEqual({ r: 51, g: 51, b: 51, level: 0.2 })
    })

    it('warm/cool mixes to a warm white', () => {
        const out = fixtureColour({ fixture: { universe: 0, address: 1 }, roles: ['warm', 'cool'], dmx: at([255, 0]) })
        expect(out.r).toBe(255)
        expect(out.g).toBeCloseTo(204)
        expect(out.b).toBeCloseTo(132.6)
    })

    it('a moving head reads its colour past pan and tilt', () => {
        const out = fixtureColour({
            fixture: { universe: 0, address: 5 },
            roles: ['pan', 'tilt', 'dimmer', 'r', 'g', 'b'],
            dmx: { 0: [9, 9, 9, 9, 128, 128, 255, 255, 40, 0] }
        })
        expect(out).toEqual({ r: 255, g: 40, b: 0, level: 1 })
    })

    it('never throws on missing input (no channels reads as open white, exactly as the interface does)', () => {
        expect(fixtureColour()).toEqual({ r: 255, g: 255, b: 255, level: 1 })
        expect(fixtureColour({ fixture: { universe: 0, address: 1 }, roles: ['dimmer', 'r', 'g', 'b'], dmx: null }))
            .toEqual({ r: 0, g: 0, b: 0, level: 0 })
    })
})
