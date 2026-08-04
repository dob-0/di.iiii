import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { resolveBackdrop } from './Backdrop.jsx'
import { applyAmbientTint } from './SceneLights.jsx'
import {
    AMBIENT_VALUE,
    LIGHT_DEFAULTS,
    TUNNEL_WHITE,
    WORLD_PRESETS,
    WORLD_SWATCHES,
    ambientTint
} from './palette.js'
import {
    DEFAULT_AMBIENT,
    addLight,
    isLightName,
    lightObjectName,
    parseLightName,
    removeLight,
    resolveAmbient,
    resolveLight,
    rowLights,
    setLightValue,
    setWorldValue,
    worldWeights
} from './worldLights.js'

const list = () => ([
    { id: 'a', title: 'A', startSec: 0, endSec: 8, backdrop: { color: '#ffffff', fogNear: 3, fogFar: 34, ambient: 1 } },
    { id: 'b', title: 'B', startSec: 6, endSec: 20, backdrop: { color: '#000000', fogNear: 4, fogFar: 40, ambient: 0 } }
])

describe('rowLights / resolveLight', () => {
    it('treats an absent lights array as no lights', () => {
        // The default for every shipped row — a piece with no authored lamps
        // must not have to declare that.
        expect(rowLights({ id: 'a' })).toEqual([])
        expect(rowLights(undefined)).toEqual([])
    })

    it('fills a half-written light in from the defaults', () => {
        // Rows are hand-typed source as often as panel output. A missing decay
        // has to become the house decay, not a NaN that unlights the scene
        // with no error anywhere.
        const light = resolveLight({ id: 'light-1', color: '#F0A08B' })
        expect(light.color).toBe('#F0A08B')
        expect(light.kind).toBe(LIGHT_DEFAULTS.kind)
        expect(light.decay).toBe(LIGHT_DEFAULTS.decay)
        expect(light.position).toEqual(LIGHT_DEFAULTS.position)
    })

    it('refuses a kind that is not one of the two on offer', () => {
        expect(resolveLight({ id: 'x', kind: 'spot' }).kind).toBe('lamp')
    })
})

describe('addLight', () => {
    it('seeds a new light from LIGHT_DEFAULTS so it is visible immediately', () => {
        const [row] = addLight(list(), 'a')
        expect(row.lights).toHaveLength(1)
        expect(row.lights[0]).toMatchObject({
            id: 'light-1',
            kind: LIGHT_DEFAULTS.kind,
            color: LIGHT_DEFAULTS.color,
            intensity: LIGHT_DEFAULTS.intensity
        })
    })

    it('gives every light in a row its own id', () => {
        const twice = addLight(addLight(list(), 'a'), 'a')
        expect(twice[0].lights.map((light) => light.id)).toEqual(['light-1', 'light-2'])
    })

    it('numbers per row, so ids stay readable in the emitted source', () => {
        const both = addLight(addLight(list(), 'a'), 'b')
        expect(both[0].lights[0].id).toBe('light-1')
        expect(both[1].lights[0].id).toBe('light-1')
    })

    it('never shares a position array between two lights', () => {
        // Invisible until a drag writes through one of them and moves both.
        const twice = addLight(addLight(list(), 'a'), 'a')
        const [first, second] = twice[0].lights
        expect(first.position).not.toBe(second.position)
        expect(first.position).not.toBe(LIGHT_DEFAULTS.position)
    })

    it('leaves every other row alone', () => {
        const next = addLight(list(), 'a')
        expect(next[1].lights).toBeUndefined()
        expect(next[1]).toEqual(list()[1])
    })
})

describe('removeLight / setLightValue', () => {
    it('removes only the named light', () => {
        const twice = addLight(addLight(list(), 'a'), 'a')
        const left = removeLight(twice, 'a', 'light-1')[0].lights
        expect(left.map((light) => light.id)).toEqual(['light-2'])
    })

    it('patches one field and leaves the rest of the light intact', () => {
        const patched = setLightValue(addLight(list(), 'a'), 'a', 'light-1', 'intensity', 9)
        expect(patched[0].lights[0].intensity).toBe(9)
        expect(patched[0].lights[0].color).toBe(LIGHT_DEFAULTS.color)
    })

    it('writes a dragged position back onto the row', () => {
        const patched = setLightValue(addLight(list(), 'a'), 'a', 'light-1', 'position', [1, 2, 3])
        expect(patched[0].lights[0].position).toEqual([1, 2, 3])
    })

    it('is a no-op for a light that is not there', () => {
        const rows = addLight(list(), 'a')
        expect(setLightValue(rows, 'a', 'light-9', 'intensity', 9)).toEqual(rows)
        expect(removeLight(rows, 'a', 'light-9')).toEqual(rows)
    })
})

describe('setWorldValue', () => {
    it('patches one world field', () => {
        const next = setWorldValue(list(), 'b', 'ambient', 0.4)
        expect(next[1].backdrop.ambient).toBe(0.4)
        expect(next[1].backdrop.color).toBe('#000000')
    })

    it('copies rather than writing through to a shared preset', () => {
        // Rows point at WORLD_PRESETS entries, which are module-level objects
        // shared by every row that names them — mutating one in place would
        // edit a different sequence's room as a side effect.
        const rows = list()
        const shared = rows[0].backdrop
        setWorldValue(rows, 'a', 'ambient', 0.9)
        expect(shared.ambient).toBe(1)
    })

    it('refuses to invent a world for a row that has none', () => {
        // An asset clip sits in whatever room is already there. Giving it one
        // would hand it a vote in the blend and dim the piece while it is up.
        const rows = [...list(), { id: 'c', startSec: 2, endSec: 4 }]
        expect(setWorldValue(rows, 'c', 'ambient', 0.5)[2].backdrop).toBeUndefined()
    })
})

describe('worldWeights', () => {
    it('gives only rows that declare a world a vote', () => {
        const rows = [...list(), { id: 'c', startSec: 0, endSec: 8 }]
        expect(worldWeights(4, rows).map((entry) => entry.sequence.id)).toEqual(['a'])
    })

    it('shares always add up to one', () => {
        for (let step = 0; step <= 40; step++) {
            const total = worldWeights((step / 40) * 20, list())
                .reduce((sum, entry) => sum + entry.share, 0)
            expect(total).toBeCloseTo(1, 6)
        }
    })

    it('holds the nearest row when nothing is active', () => {
        expect(worldWeights(-1, list())[0].sequence.id).toBe('a')
        expect(worldWeights(99, list())[0].sequence.id).toBe('b')
    })

    it('returns nothing when no row declares a world at all', () => {
        expect(worldWeights(1, [{ id: 'c', startSec: 0, endSec: 8 }])).toEqual([])
    })
})

describe('resolveAmbient', () => {
    it('blends on EXACTLY the weighting the backdrop colour uses', () => {
        // The room's colour, fog and fill are three properties of one thing and
        // have to hand over on one curve — a room whose colour has finished
        // crossing while its fill is still on the previous scene is two rooms
        // at once. Asserted rather than reviewed: these rows are white/black
        // with ambient 1/0, so the blended red channel and the blended ambient
        // are the same number whenever the weighting agrees.
        for (let step = 0; step <= 60; step++) {
            const playheadSec = (step / 60) * 20
            expect(resolveAmbient(playheadSec, list()))
                .toBeCloseTo(resolveBackdrop(playheadSec, list()).r, 10)
        }
    })

    it('falls back the same way at both ends of the piece', () => {
        expect(resolveAmbient(-1, list())).toBe(1)
        expect(resolveAmbient(0, list())).toBe(1)
        expect(resolveAmbient(99, list())).toBe(0)
    })

    it('defaults a row that never declared a fill level', () => {
        const rows = [{ id: 'a', startSec: 0, endSec: 8, backdrop: { color: '#000000', fogNear: 3, fogFar: 34 } }]
        expect(resolveAmbient(4, rows)).toBe(DEFAULT_AMBIENT)
    })

    it('is never zero, whatever the edit list looks like', () => {
        // Zero fill is a pure black frame, which reads as a broken scene rather
        // than as a dark one.
        expect(resolveAmbient(0, [])).toBe(DEFAULT_AMBIENT)
        expect(resolveAmbient(4, [{ id: 'c', startSec: 0, endSec: 8 }])).toBe(DEFAULT_AMBIENT)
    })
})

describe('the fill light is coloured by the room', () => {
    // Both sides in sRGB 0..255, which is the space the palette was authored
    // and hand-tuned in — linear channel numbers would make "three values out
    // of 255" meaningless.
    const bytes = (color) => {
        const out = { r: 0, g: 0, b: 0 }
        color.getRGB(out, THREE.SRGBColorSpace)
        return [Math.round(out.r * 255), Math.round(out.g * 255), Math.round(out.b * 255)]
    }

    const lift = (worldColor) => {
        const room = new THREE.Color(worldColor)
        return applyAmbientTint(new THREE.Color(), room)
    }

    it('recovers a fill somebody arrived at by eye', () => {
        // #C4D3DC was hand-tuned over several passes as the tunnel's ambient,
        // back when the number lived in WhiteTunnel.jsx. Lifting the world it
        // was tuned against lands on it. THIS IS THE GUARD: the fill has to
        // stay derived from the room.
        //
        // Lifted from TUNNEL_WHITE.depth rather than from the tunnel row, which
        // has since gone to true black. Black has no hue to carry forward, so
        // the row would now derive a neutral grey and this comparison would be
        // measuring the wrong claim — the evidence for the RULE lives in the
        // pair a person actually tuned, and that pair is still this one.
        const [r, g, b] = bytes(lift(TUNNEL_WHITE.depth))
        const [tr, tg, tb] = bytes(new THREE.Color(TUNNEL_WHITE.wall))
        expect(Math.abs(r - tr)).toBeLessThanOrEqual(4)
        expect(Math.abs(g - tg)).toBeLessThanOrEqual(4)
        expect(Math.abs(b - tb)).toBeLessThanOrEqual(4)
    })

    it('keeps a coloured room\'s own cast in its fill instead of going white', () => {
        // The failure this exists to catch is the fill quietly reverting to
        // white-as-a-brightener, which sails through every other test here.
        // It used to be caught by the tunnel comparison above; now that the
        // tunnel's world is black — where neutral is the CORRECT answer — the
        // guard has to stand on a room that still has a hue to lose.
        const [r, g, b] = bytes(lift(WORLD_PRESETS.chamber.color))

        // The chamber is blue-dominant, and its fill must be too. A white or
        // grey fill flattens all three channels together.
        expect(b).toBeGreaterThan(g)
        expect(g).toBeGreaterThan(r)
        expect(b - r).toBeGreaterThan(6)
    })

    it('derives a neutral fill for a world with no hue to carry', () => {
        // The stated consequence of the black opening, asserted rather than
        // discovered. "The air in a room is the colour of that room" means a
        // colourless room has colourless air — so the corridor's fill is now a
        // neutral grey, not the cool #C4D3DC it used to be. If that ever needs
        // to stop being true, it needs a mechanism, not a surprise.
        const [r, g, b] = bytes(lift(WORLD_PRESETS.tunnel.color))
        expect(r).toBe(g)
        expect(g).toBe(b)
    })

    it('agrees exactly with palette.js for every world on offer', () => {
        // The per-frame path is allocation-free and therefore a second copy of
        // the derivation. Asserted against the authoring function so the two
        // cannot become different rules.
        for (const swatch of WORLD_SWATCHES) {
            expect(bytes(lift(swatch.color))).toEqual(bytes(new THREE.Color(ambientTint(swatch.color))))
        }
    })

    it('keeps a custom warm world warm', () => {
        // The four built-in worlds all lift to within a value of each other, so
        // presets alone never exercise the hue at all. A warm room must produce
        // warm air — this is the whole reason the fill is not white.
        const warm = new THREE.Color('#2A1512')
        const [r, , b] = bytes(applyAmbientTint(new THREE.Color(), warm))
        expect(r).toBeGreaterThan(b + 8)
    })

    it('lifts value without touching hue or chroma', () => {
        const world = new THREE.Color(WORLD_PRESETS.chamber.color)
        const before = world.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace)
        const after = applyAmbientTint(new THREE.Color(), world)
            .getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace)
        expect(after.h).toBeCloseTo(before.h, 4)
        expect(after.s).toBeCloseTo(before.s, 4)
        expect(after.l).toBeCloseTo(AMBIENT_VALUE, 4)
    })

    it('does not mutate the room it read', () => {
        // It is handed scene.background, which Backdrop owns and eases in
        // place. Writing through it would drive the whole room to a light value
        // one frame at a time.
        const room = new THREE.Color(WORLD_PRESETS.field.color)
        const before = bytes(room)
        applyAmbientTint(new THREE.Color(), room)
        expect(bytes(room)).toEqual(before)
    })
})

describe('light names', () => {
    it('round-trips a row and light id through the scene-graph name', () => {
        const name = lightObjectName('s01-white-tunnel', 'light-2')
        expect(parseLightName(name)).toEqual({ rowId: 's01-white-tunnel', lightId: 'light-2' })
        expect(isLightName(name)).toBe(true)
    })

    it('does not mistake a sequence id for a light', () => {
        // The gizmo and the transform handler both branch on this: a false
        // positive would write a dragged sequence into a row's lights array.
        expect(parseLightName('s01-white-tunnel')).toBeNull()
        expect(isLightName('asset-ritual-01-2')).toBe(false)
        expect(isLightName(null)).toBe(false)
    })
})
