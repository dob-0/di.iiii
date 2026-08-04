import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
    ATMOSPHERE_COLORS,
    BACKDROPS,
    COOL_FAMILY,
    FIELD_COLORS,
    IRIS_RAMP,
    AMBIENT_VALUE,
    LIGHT_DEFAULTS,
    LIGHT_INTENSITIES,
    LIGHT_KINDS,
    LIGHT_SWATCHES,
    LUMINOUS_RAMP,
    NAMED_PALETTE,
    PALETTE,
    TUNNEL_WHITE,
    WALK_BRIDGE,
    WALK_RAMP,
    WARM_FAMILY,
    WORLD_PRESETS,
    WORLD_SWATCHES,
    ambientTint,
    bloom,
    isCoolPole,
    mixHex,
    paletteWarning,
    quieten
} from './palette.js'

// Read back in sRGB, the space these hex values were chosen in. three.js
// converts hex to Linear-sRGB on the way in, and the default getHSL reports
// that — a lightness of 0.01 for a colour that is plainly a dark grey.
const hsl = (hex) => {
    const out = { h: 0, s: 0, l: 0 }
    new THREE.Color(hex).getHSL(out, THREE.SRGBColorSpace)
    return out
}

const hue = (hex) => hsl(hex).h * 360

/**
 * Absolute chroma, 0..1. HSL saturation is a RATIO and blows up as lightness
 * approaches either extreme — a near-black 14/255 off neutral reports S = 0.41.
 * Only mid-lightness colours can be judged by saturation.
 */
const chroma = (hex) => {
    const out = { r: 0, g: 0, b: 0 }
    new THREE.Color(hex).getRGB(out, THREE.SRGBColorSpace)
    return Math.max(out.r, out.g, out.b) - Math.min(out.r, out.g, out.b)
}

const isWarmHue = (h) => h < 45 || h > 330
const isCoolHue = (h) => h > 175 && h < 250

describe('luminous pastels, not neon', () => {
    it('keeps every named colour high in value', () => {
        // Turrell light is pale. A mid-value saturated colour is a lamp seen
        // directly; a high-value one is the same lamp through acrylic.
        NAMED_PALETTE.forEach((color) => {
            expect(hsl(color).l).toBeGreaterThan(0.6)
        })
    })

    it('keeps every named colour off full saturation', () => {
        // Measured as CHROMA, not HSL saturation. At the high lightness these
        // pastels live at, S is inflated — blush #F2C6C6 reports S = 0.86 while
        // its channels span only 0.17. Judging pastels by saturation is the
        // third time that ratio has produced a wrong answer in this file.
        NAMED_PALETTE.forEach((color) => {
            expect(chroma(color)).toBeLessThan(0.45)
        })
    })

    it('excludes the structural shades from the named six', () => {
        // deepSky, void and shadow exist so gradients have somewhere to fall
        // off to. They are not part of the specified palette.
        expect(NAMED_PALETTE).toHaveLength(6)
        expect(NAMED_PALETTE).not.toContain(PALETTE.deepSky)
    })

    it('has no purple anywhere', () => {
        Object.values(PALETTE).forEach((color) => {
            // Near-neutrals have a meaningless hue — the surround reads as a
            // blue-violet at a few 255ths of chroma. Only judge real colour.
            if (chroma(color) < 0.1) return
            const h = hue(color)
            expect(h > 250 && h < 330).toBe(false)
        })
    })
})

describe('families', () => {
    it('puts the cool family in blue', () => {
        COOL_FAMILY.forEach((color) => expect(isCoolHue(hue(color))).toBe(true))
    })

    it('puts the warm family in peach through blush, never reaching magenta', () => {
        WARM_FAMILY.forEach((color) => expect(isWarmHue(hue(color))).toBe(true))
    })

    it('sorts colours into exactly one family', () => {
        COOL_FAMILY.forEach((color) => expect(isCoolPole(color)).toBe(true))
        WARM_FAMILY.forEach((color) => expect(isCoolPole(color)).toBe(false))
    })
})

describe('white is a highlight, not a brightener', () => {
    it('makes off-white the only near-neutral light value', () => {
        const nearNeutralLights = NAMED_PALETTE.filter(
            (color) => hsl(color).l > 0.8 && chroma(color) < 0.08
        )
        expect(nearNeutralLights).toEqual([PALETTE.offWhite])
    })

    it('keeps the off-white warm and short of actual white', () => {
        // A blue-white reads as a screen; a warm one reads as light.
        expect(hsl(PALETTE.offWhite).l).toBeLessThan(0.96)
        expect(isWarmHue(hue(PALETTE.offWhite))).toBe(true)
    })

    it('adds white sparingly by default', () => {
        expect(hsl(bloom(PALETTE.skyBlue)).l - hsl(PALETTE.skyBlue).l).toBeLessThan(0.12)
    })
})

describe('the gradient walk never passes through mauve', () => {
    it('crosses between families only via the bridge', () => {
        // A gradient INTERPOLATES between neighbours, so a cool entry beside a
        // warm one puts a blue-to-salmon crossfade — a muddy mauve — in the
        // middle of the room. Discrete sampling (LUMINOUS_RAMP) does not have
        // this problem, which is exactly why the two lists differ.
        for (let index = 0; index < WALK_RAMP.length; index++) {
            const current = WALK_RAMP[index]
            const next = WALK_RAMP[(index + 1) % WALK_RAMP.length]
            if (current === WALK_BRIDGE || next === WALK_BRIDGE) continue
            expect(isCoolPole(current)).toBe(isCoolPole(next))
        }
    })

    it('bridges through dark rather than through white', () => {
        // The crossing happens twice a cycle, so whatever sits at the bridge is
        // a colour the room keeps returning to. White there made the piece's
        // quietest sequence its palest one.
        expect(hsl(WALK_BRIDGE).l).toBeLessThan(0.2)
        expect(WALK_RAMP).not.toContain(PALETTE.offWhite)
    })

    it('visits both families', () => {
        expect(WALK_RAMP.some(isCoolPole)).toBe(true)
        expect(WALK_RAMP.some((color) => WARM_FAMILY.includes(color))).toBe(true)
    })
})

describe('ramp and atmosphere', () => {
    it('keeps the cool block whole and the warm block whole in the ramp', () => {
        const cool = LUMINOUS_RAMP.filter((c) => c !== PALETTE.offWhite).map(isCoolPole)
        const firstWarm = cool.indexOf(false)
        expect(firstWarm).toBeGreaterThan(0)
        expect(cool.slice(firstWarm).some(Boolean)).toBe(false)
    })

    it('carries both families in the atmosphere', () => {
        expect(ATMOSPHERE_COLORS.some(isCoolPole)).toBe(true)
        expect(ATMOSPHERE_COLORS.some((c) => WARM_FAMILY.includes(c))).toBe(true)
    })
})

describe('FIELD_COLORS — what 24,000 additive dots are allowed to be', () => {
    it('contains nothing pale enough to stack into white', () => {
        // Additive blending ADDS. Two overlapping dots of a near-white colour
        // are white, and the field is deep enough that overlaps are the normal
        // case rather than the exception. This is the property that cannot be
        // judged by looking at the swatches.
        FIELD_COLORS.forEach((color) => {
            expect(hsl(color).l).toBeLessThan(0.58)
        })
    })

    it('excludes the palest cool entry entirely', () => {
        expect(FIELD_COLORS).not.toContain(PALETTE.iceBlue)
        expect(FIELD_COLORS).not.toContain(PALETTE.offWhite)
    })

    it('is dimmer than the palette it comes from', () => {
        // Pre-dimmed so the SUM lands at the intended value, rather than each
        // dot doing so individually and the overlaps going past it.
        expect(hsl(FIELD_COLORS[0]).l).toBeLessThan(hsl(PALETTE.skyBlue).l)
    })

    it('still carries both families', () => {
        // Dimming must not quietly collapse the field to one temperature.
        const hues = FIELD_COLORS.map(hue)
        expect(hues.some(isCoolHue)).toBe(true)
        expect(hues.some(isWarmHue)).toBe(true)
    })
})

describe('mixHex / quieten / bloom', () => {
    it('returns the endpoints untouched and clamps beyond them', () => {
        expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
        expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
        expect(mixHex('#000000', '#ffffff', -3)).toBe('#000000')
        expect(mixHex('#000000', '#ffffff', 9)).toBe('#ffffff')
    })

    it('quieten dims toward the surround', () => {
        expect(hsl(quieten(PALETTE.skyBlue, 0.5)).l).toBeLessThan(hsl(PALETTE.skyBlue).l)
    })

    it('bloom brightens by PALING, never by saturating', () => {
        const before = hsl(PALETTE.deepSky)
        const after = hsl(bloom(PALETTE.deepSky, 0.6))
        expect(after.l).toBeGreaterThan(before.l)
        expect(after.s).toBeLessThan(before.s)
    })
})

describe('backdrops', () => {
    it('keeps the unlit rooms neutral', () => {
        // Colour is light, not surface. Tint the dark rooms and their blacks
        // become a coloured wash.
        [BACKDROPS.field, BACKDROPS.assembly].forEach((backdrop) => {
            expect(chroma(backdrop.color)).toBeLessThan(0.09)
        })
    })

    it('keeps no backdrop near white', () => {
        Object.values(BACKDROPS).forEach((backdrop) => {
            expect(hsl(backdrop.color).l).toBeLessThan(0.62)
        })
    })

    it('opens on a light room with dark depth', () => {
        // Artist's direction: the piece opens on a white world. That lives in
        // the corridor's SURFACES, not in the backdrop — an evenly white room
        // lit to a white background is a void with no depth, which is exactly
        // how the all-white version read.
        //
        // Deliberately not asserting an exact whiteness. How white the wall
        // should be is a live judgement being tuned by eye, and pinning it to a
        // number here just means this test loses an argument with the artist
        // every time. What must not regress is the STRUCTURE: light surfaces,
        // dark distance, and enough of a gap between them to feel enclosed.
        //
        // Measured against the corridor's LIVE world colour, not against
        // TUNNEL_WHITE.depth. The tunnel used to fog to `depth` and now fogs to
        // black, and a test still checking the old constant would keep passing
        // while saying nothing about the room the audience is standing in.
        const wall = hsl(TUNNEL_WHITE.wall).l
        const depth = hsl(BACKDROPS.tunnel.color).l

        expect(wall).toBeGreaterThan(0.7)
        expect(depth).toBeLessThan(0.2)
        expect(wall - depth).toBeGreaterThan(0.5)
    })

    it('leaves the strobe rings room to be brighter than the walls', () => {
        // A white ring only reads as light if there is a value ladder under it.
        // Flatten these and the strobe disappears into the wall.
        expect(hsl(TUNNEL_WHITE.ring).l).toBeGreaterThan(hsl(TUNNEL_WHITE.wall).l)
        expect(hsl(TUNNEL_WHITE.wall).l).toBeGreaterThan(hsl(BACKDROPS.tunnel.color).l)
    })

    it('gives every backdrop usable fog, closest of all in the chamber', () => {
        Object.values(BACKDROPS).forEach((backdrop) => {
            expect(backdrop.fogFar).toBeGreaterThan(backdrop.fogNear)
        })
        // A Ganzfeld has no visible far wall — you are inside the light, so
        // there is nothing to see through it.
        const others = [BACKDROPS.tunnel, BACKDROPS.field, BACKDROPS.assembly]
        others.forEach((backdrop) => {
            expect(BACKDROPS.chamber.fogFar).toBeLessThan(backdrop.fogFar)
        })
    })
})

// ---- authorable worlds and lights -------------------------------------

describe('the two hue bands', () => {
    // The guard on the guard. HUE_BANDS and the chroma/value ceilings are
    // claimed to be MEASURED off the palette rather than picked, so the whole
    // idea collapses the moment a real colour in the piece fails its own test.
    // This is the check that keeps the panel's warnings honest.
    it('contains every colour the piece actually uses', () => {
        const everything = [
            ...Object.values(PALETTE),
            ...Object.values(TUNNEL_WHITE),
            ...Object.values(BACKDROPS).map((backdrop) => backdrop.color)
        ]
        everything.forEach((color) => {
            expect(paletteWarning(color), color).toBeNull()
        })
    })

    it('rejects the purple gap between the families', () => {
        expect(paletteWarning('#8B5FB8')?.code).toBe('hue-gap')
        expect(paletteWarning('#B85FA8')?.code).toBe('hue-gap')
    })

    // The band rule is stricter than "no purple" and this is the half that a
    // no-purple check would have missed entirely.
    it('rejects green and yellow, which the piece also never uses', () => {
        expect(paletteWarning('#7FB85F')?.code).toBe('hue-gap')
        expect(paletteWarning('#D8C85F')?.code).toBe('hue-gap')
    })

    it('flags neon before it reaches the scene', () => {
        expect(paletteWarning('#FF4400')?.code).toBe('neon')
    })

    it('flags anything lighter than the strobe', () => {
        expect(paletteWarning('#FFFFFF')?.code).toBe('too-white')
    })

    // Otherwise every legitimate structural dark trips the hue check: void and
    // shadow carry a nominal hue of 206 but no visible colour at all.
    it('exempts near-neutrals from the hue check', () => {
        expect(paletteWarning('#111111')).toBeNull()
        expect(paletteWarning('#2A2A2E')).toBeNull()
    })

    it('reports one finding, not a list', () => {
        const warning = paletteWarning('#FF00FF')
        expect(warning).not.toBeNull()
        expect(typeof warning.message).toBe('string')
        expect(Object.keys(warning).sort()).toEqual(['code', 'message'])
    })
})

describe('swatches keep colour in the light, not on the surface', () => {
    // Rule 1 of this file, enforced by which swatches the panel can even show.
    // A salmon background is not a salmon-lit room, it is a salmon photograph.
    it('offers only dark worlds, apart from the scoped tunnel exception', () => {
        WORLD_SWATCHES
            .filter((swatch) => !swatch.name.includes('s01'))
            .forEach((swatch) => {
                expect(hsl(swatch.color).l, swatch.name).toBeLessThan(0.25)
            })
    })

    it('keeps the hues available as light and unavailable as surface', () => {
        const worlds = WORLD_SWATCHES.map((swatch) => swatch.color)
        NAMED_PALETTE.forEach((color) => {
            expect(LIGHT_SWATCHES.map((swatch) => swatch.color)).toContain(color)
            expect(worlds).not.toContain(color)
        })
    })

    it('passes its own warning check on every offered swatch', () => {
        [...WORLD_SWATCHES, ...LIGHT_SWATCHES].forEach((swatch) => {
            expect(paletteWarning(swatch.color), swatch.name).toBeNull()
        })
    })
})

describe('worlds and lights', () => {
    it('carries every backdrop forward with a fill level', () => {
        Object.entries(BACKDROPS).forEach(([name, backdrop]) => {
            expect(WORLD_PRESETS[name]).toMatchObject(backdrop)
            // Declared, not merely truthy. The failure this guards against is a
            // world reaching the renderer with `ambient: undefined` — which is
            // not "no fill", it is a NaN multiply that takes the whole room's
            // lighting with it.
            expect(typeof WORLD_PRESETS[name].ambient).toBe('number')
            expect(WORLD_PRESETS[name].ambient).toBeGreaterThanOrEqual(0)
        })
    })

    it('gives every room with surfaces in it something to see them by', () => {
        // A zero fill used to be impossible here, and for every room built out
        // of lit geometry it still should be: no lamp reaches everywhere, and a
        // room with no ambient has corners that are pure background.
        //
        // The data field is the single exception, and it is exempt because it
        // has no surfaces at all — grid and ribbons are emissive and unlit by
        // construction, so a fill would land on nothing and only lift the black
        // off zero. Named explicitly rather than allowed by a `>= 0` blanket,
        // so the next world that reaches zero by accident still fails here.
        Object.entries(WORLD_PRESETS).forEach(([name, world]) => {
            if (name === 'field') {
                expect(world.ambient).toBe(0)
                return
            }
            expect(world.ambient, name).toBeGreaterThan(0)
        })
    })

    // Ambient cannot shade anything, so raising it flattens the room rather
    // than lighting it. Lamps do the lighting; this only lifts the darks.
    it('keeps ambient low enough that lamps still do the work', () => {
        Object.values(WORLD_PRESETS).forEach((world) => {
            expect(world.ambient).toBeLessThanOrEqual(0.55)
        })
    })

    it('defaults a new light to something already on the palette', () => {
        expect(paletteWarning(LIGHT_DEFAULTS.color)).toBeNull()
        expect(LIGHT_KINDS).toContain(LIGHT_DEFAULTS.kind)
        expect(Object.values(LIGHT_INTENSITIES)).toContain(LIGHT_DEFAULTS.intensity)
    })

    // A light at the origin sits inside the viewer's head and lights nothing.
    it('places a new light away from the standpoint', () => {
        const [, y, z] = LIGHT_DEFAULTS.position
        expect(y).toBeGreaterThan(0)
        expect(Math.abs(z)).toBeGreaterThan(1)
    })
})

describe('ambientTint — the fill light carries the room, not white', () => {
    // The number this rule has to earn. The tunnel's ambient was hand-tuned to
    // #C4D3DC over several passes; deriving it from the world colour has to
    // land on that, or the derivation is a rationalisation rather than a rule.
    // Compared channel by channel rather than in HSL. The claim being made is
    // "within a few 255ths of the colour a person arrived at by eye", which is
    // a statement about the pixel — and the worlds this runs on are near-black,
    // exactly where HSL saturation stops meaning anything (see `chroma` above).
    // Historical pair, deliberately kept. The tunnel's world has since gone to
    // black and its fill is now a neutral grey, so this no longer describes a
    // live sequence — but it is the ONLY evidence that the derivation is a rule
    // rather than a rationalisation, because #C4D3DC is the one fill value in
    // the piece that a person arrived at by eye before any rule existed. Delete
    // it and `ambientTint` becomes an assertion with nothing behind it.
    it('recovers a hand-tuned fill from its world colour (the tunnel, as it was)', () => {
        const derived = new THREE.Color(ambientTint(TUNNEL_WHITE.depth))
        const tuned = new THREE.Color('#C4D3DC')
        const a = derived.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
        const b = tuned.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
        expect(Math.abs(a.r - b.r) * 255).toBeLessThan(8)
        expect(Math.abs(a.g - b.g) * 255).toBeLessThan(8)
        expect(Math.abs(a.b - b.b) * 255).toBeLessThan(8)
    })

    it('keeps the world hue and only lifts the value', () => {
        WORLD_SWATCHES.forEach(({ color, name }) => {
            const fill = hsl(ambientTint(color))
            // 3° of tolerance: a world colour this dark spans only a few 255ths
            // per channel, so its hue is quantised long before this function
            // sees it. Tighter than this tests the 8-bit grid, not the rule.
            expect(Math.abs(hue(ambientTint(color)) - hue(color)), name).toBeLessThan(3)
            expect(fill.l, name).toBeCloseTo(AMBIENT_VALUE, 2)
        })
    })

    // The lift must not invent chroma either — a fill that arrives more
    // colourful than its room is a wash, which is what tinting a background
    // does and what WORLD_SWATCHES exists to prevent.
    it('stays a pastel rather than becoming a colour cast', () => {
        WORLD_SWATCHES.forEach(({ color, name }) => {
            expect(chroma(ambientTint(color)), name).toBeLessThan(0.25)
        })
    })

    // The whole point: an ambientLight multiplies colour by intensity, so
    // handing it `void` directly gives a black fill and no fill at all.
    it('lifts even the darkest world into something that can light a room', () => {
        expect(hsl(ambientTint(PALETTE.void)).l).toBeGreaterThan(0.75)
    })

    it('never produces an off-palette fill from an on-palette world', () => {
        WORLD_SWATCHES.forEach(({ color, name }) => {
            expect(paletteWarning(ambientTint(color)), name).toBeNull()
        })
    })

    // An uncoloured room has uncoloured air — this must not invent a hue.
    it('leaves a neutral world neutral', () => {
        expect(chroma(ambientTint('#141414'))).toBeLessThan(0.03)
    })
})

describe('IRIS_RAMP — thin-film colour for an additive shell', () => {
    // The property the whole ramp exists for. Sequence 02 INTERPOLATES between
    // neighbours, so a cool entry next to a warm one puts mauve on screen — the
    // one thing this palette is built to exclude. Same guarantee WALK_RAMP
    // makes, restated here because the dimming rebuilt the array and a
    // reordering would not fail any other test.
    it('never interpolates between the families except through the bridge', () => {
        for (let index = 0; index < IRIS_RAMP.length; index++) {
            const current = IRIS_RAMP[index]
            const next = IRIS_RAMP[(index + 1) % IRIS_RAMP.length]
            if (current === PALETTE.void || next === PALETTE.void) continue
            expect(isWarmHue(hue(current))).toBe(isWarmHue(hue(next)))
        }
    })

    // A film too thin to interfere shows no colour — the reason a draining
    // soap bubble goes black before it pops. Against additive blending the
    // bridge has to be genuinely dark or the film never disappears.
    it('drains to black between the families', () => {
        expect(IRIS_RAMP).toContain(PALETTE.void)
        expect(hsl(PALETTE.void).l).toBeLessThan(0.1)
    })

    // Additive dots stack wherever they overlap, and a shell is deepest at the
    // limb. Nothing in here may start pale enough to sum to white — the same
    // constraint FIELD_COLORS is built around.
    it('contains nothing pale enough to stack into white', () => {
        IRIS_RAMP.forEach((color) => {
            expect(hsl(color).l).toBeLessThan(0.58)
        })
    })

    it('is dimmer than the palette it is drawn from', () => {
        expect(hsl(IRIS_RAMP[0]).l).toBeLessThan(hsl(PALETTE.iceBlue).l)
        expect(IRIS_RAMP).not.toContain(PALETTE.iceBlue)
        expect(IRIS_RAMP).not.toContain(PALETTE.offWhite)
    })

    it('carries both families, so the film actually shifts hue', () => {
        const hues = IRIS_RAMP.filter((c) => c !== PALETTE.void).map(hue)
        expect(hues.some(isCoolHue)).toBe(true)
        expect(hues.some(isWarmHue)).toBe(true)
    })

    // Wraps: the shader reads it with fract(), so the last entry blends back
    // into the first. An odd number of family blocks would seam there.
    it('closes the loop without a seam', () => {
        expect(IRIS_RAMP[IRIS_RAMP.length - 1]).toBe(PALETTE.void)
    })
})
