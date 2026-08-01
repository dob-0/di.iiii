import * as THREE from 'three'

// The piece's colour, in one place.
//
// Reference: James Turrell's Ganzfeld rooms and Tundra's "Row" — you are meant
// to feel you are standing INSIDE light, not looking at a lit thing. Four rules
// come out of that, and every value below follows from them.
//
// 1. COLOUR IS LIGHT, NOT SURFACE. In a Turrell room the walls are plain; all
//    colour is lamps washing them. So the dark structural values here stay
//    neutral and every hue is carried by light — haze, emissives, gradients.
//    Tint the surfaces instead and the darks turn into a coloured wash.
// 2. LUMINOUS PASTELS, NOT NEON. These are high-value, mid-chroma colours: the
//    colour of light through frosted acrylic, not of an LED seen directly.
//    Saturation is what makes a palette read as RGB/cyberpunk, which is out.
// 3. NO PURPLE. There is deliberately no hue between blue and red. This is not
//    only a matter of omitting swatches — additive cool over additive warm IS
//    magenta, so the two families are also kept apart in space (see the
//    hemisphere split in LightHaze.jsx).
// 4. WHITE IS A HIGHLIGHT, NOT A BRIGHTENER. `offWhite` is the only near-white
//    and it is warm, not blue. Things that need to look brighter get brighter
//    in their own hue — reaching for white is what greys a palette out.

export const PALETTE = {
    // The near-white. Warm, so it reads as light rather than as paper.
    offWhite: '#F2EFEA',

    // --- cool family ---
    iceBlue: '#CFE3EC',
    skyBlue: '#9CC2DE',
    deepSky: '#5F92B8',

    // --- warm family. Stops well short of magenta. ---
    peach: '#F8CCA4',
    salmon: '#F0A08B',
    blush: '#F2C6C6',

    // Structure, not palette. You cannot have depth in a light room without
    // somewhere for the light to fall off to, but neither is pure black —
    // pure black reads as "screen off" rather than as unlit air.
    void: '#0D1114',
    shadow: '#161C21'
}

export const COOL_FAMILY = [PALETTE.iceBlue, PALETTE.skyBlue, PALETTE.deepSky]
export const WARM_FAMILY = [PALETTE.peach, PALETTE.salmon, PALETTE.blush]

/**
 * The six named colours, exactly as specified. `deepSky` is NOT one of them —
 * it is a shade of sky blue that the gradients need somewhere to fall off to,
 * the same way `void` and `shadow` are structure rather than palette. Counting
 * it as a seventh colour would quietly widen the brief.
 */
export const NAMED_PALETTE = [
    PALETTE.offWhite,
    PALETTE.iceBlue,
    PALETTE.skyBlue,
    PALETTE.salmon,
    PALETTE.blush,
    PALETTE.peach
]

// Cool block then warm block, with nothing between them — the gap where violet
// would be is the point.
//
// `offWhite` is deliberately absent. The point clouds draw 24,000 additive
// dots, so a near-white entry is not one white thing but a seventh of the whole
// field at maximum value, summing wherever dots overlap. It was the quietest
// large source of white in the piece and the easiest to miss.
export const LUMINOUS_RAMP = [
    PALETTE.iceBlue,
    PALETTE.skyBlue,
    PALETTE.deepSky,
    PALETTE.salmon,
    PALETTE.peach,
    PALETTE.blush
]

/**
 * The order the room's gradients walk through, which is NOT the same as the
 * ramp above.
 *
 * LUMINOUS_RAMP is sampled discretely — one colour per point — so a cool entry
 * sitting next to a warm one costs nothing. A gradient INTERPOLATES between
 * neighbours, and blue mixed with salmon passes through exactly the muddy
 * mauve this palette exists to avoid.
 *
 * So the walk turns around inside each family and crosses between them only
 * via a BRIDGE. It goes out to deepSky and back, through the bridge, out to
 * blush and back — the two families never touch.
 *
 * The bridge is `shadow`, not `offWhite`. Crossing through the near-white put
 * the room at its palest twice per cycle, which was a steady source of white in
 * the one sequence built to be contemplative. Draining toward dark instead
 * reads as the room going quiet before it changes colour, which is both less
 * white and closer to Tundra than a white flash was.
 */
export const WALK_BRIDGE = PALETTE.shadow

export const WALK_RAMP = [
    PALETTE.iceBlue,
    PALETTE.skyBlue,
    PALETTE.deepSky,
    PALETTE.skyBlue,
    PALETTE.iceBlue,
    WALK_BRIDGE,
    PALETTE.peach,
    PALETTE.salmon,
    PALETTE.blush,
    PALETTE.salmon,
    PALETTE.peach,
    WALK_BRIDGE
]

// What the atmosphere glows in. LightHaze keeps cool and warm on opposite
// sides of the room so they never sum into magenta.
export const ATMOSPHERE_COLORS = [
    PALETTE.skyBlue,
    PALETTE.deepSky,
    PALETTE.salmon,
    PALETTE.peach
]

/** True for colours LightHaze must keep on the cool side of the room. */
export const isCoolPole = (color) => COOL_FAMILY.includes(color)

/** Blend two hex colours. `amount` 0 = a, 1 = b. */
export const mixHex = (a, b, amount) => {
    const colorA = new THREE.Color(a)
    const colorB = new THREE.Color(b)
    return `#${colorA.lerp(colorB, Math.min(1, Math.max(0, amount))).getHexString()}`
}

/** Pull a colour toward the surround — a dimmer version, not a fainter one. */
export const quieten = (color, amount = 0.35) => mixHex(color, PALETTE.void, amount)

/**
 * Drive a colour toward the near-white. Deliberately weak by default: this is
 * the function that adds white, so its default is a palette-wide decision.
 * Prefer a paler entry from the same family — `iceBlue` over bloom(skyBlue).
 */
export const bloom = (color, amount = 0.14) => mixHex(color, PALETTE.offWhite, amount)

/**
 * What the point fields are coloured from. Declared here, below `quieten`,
 * because it calls it — a const arrow function is not hoisted, so referencing
 * it from higher in the file is a temporal-dead-zone crash at import.
 *
 * Two things make an additive point cloud go white, and neither is visible in
 * a swatch:
 *
 * 1. PALE ENTRIES SUM FASTEST. Additive blending adds, so wherever dots overlap
 *    their values stack. Start near white and two overlapping dots ARE white.
 *    `iceBlue` is left out for that reason alone — fine everywhere else, a
 *    white-maker in a 24,000-point field.
 * 2. DENSITY IS A MULTIPLIER. The field has depth, so any line of sight crosses
 *    several dots rather than one. Each colour is pre-dimmed so that the SUM
 *    lands at the intended value instead of each dot doing so on its own.
 */
// Each amount is chosen to land its colour at roughly the same VALUE, not to
// dim each by the same proportion — the palest entries need far more taking
// off. Note these mixes happen in linear space, so the numbers look higher
// than they "should": halving a colour linearly only drops it about a fifth in
// perceived lightness, which is why blush needs 0.63 to reach the same place
// deepSky already sits at with none.
export const FIELD_COLORS = [
    quieten(PALETTE.skyBlue, 0.47),
    quieten(PALETTE.deepSky, 0),
    quieten(PALETTE.salmon, 0.48),
    quieten(PALETTE.peach, 0.57),
    quieten(PALETTE.blush, 0.63)
]

/**
 * The iridescence ramp — WALK_RAMP, pre-dimmed for additive points.
 *
 * Sequence 02's sphere is a thin film, and a film's colour comes from
 * interference: hue is a function of THICKNESS. So the shader computes a
 * thickness field and reads its colour from here.
 *
 * Two things make this the right ramp rather than a new one:
 *
 * 1. It already interpolates safely. WALK_RAMP is ordered so neighbours are
 *    always in the same family, which is the property a gradient needs — see
 *    its note. A rainbow ramp would be physically closer to a soap bubble and
 *    would put mauve straight through the middle of the piece.
 * 2. Its dark bridge is not a compromise, it is the physics. A film too thin
 *    to interfere shows NO colour — that is why a draining soap bubble goes
 *    black just before it pops. Draining toward dark between the cool and warm
 *    families is what a real film does.
 *
 * The bridge is `void` rather than WALK_RAMP's `shadow`: against additive
 * blending on a near-black backdrop, `shadow` still contributes light, and the
 * point of the bridge is that the film disappears there.
 *
 * Dimming follows FIELD_COLORS' reasoning exactly — pale entries sum fastest,
 * and a line of sight through a shell crosses several points. `iceBlue` is the
 * palest thing in the palette and needs the most taken off; `deepSky` already
 * sits low enough to pass through untouched.
 */
export const IRIS_RAMP = [
    quieten(PALETTE.iceBlue, 0.7),
    quieten(PALETTE.skyBlue, 0.47),
    quieten(PALETTE.deepSky, 0),
    quieten(PALETTE.skyBlue, 0.47),
    quieten(PALETTE.iceBlue, 0.7),
    PALETTE.void,
    quieten(PALETTE.peach, 0.57),
    quieten(PALETTE.salmon, 0.48),
    quieten(PALETTE.blush, 0.63),
    quieten(PALETTE.salmon, 0.48),
    quieten(PALETTE.peach, 0.57),
    PALETTE.void
]

// Backdrops: the ROOM.
//
// The tunnel is the lit panel itself seen from inside, so it carries its lamp's
// colour. The other two are unlit air and stay neutral, so all their colour
// arrives as light.
/**
 * The opening is WHITE.
 *
 * Artist's direction, and the premise of the work rather than a lighting
 * preference — the piece starts on a white world and becomes reality. A
 * deliberate, scoped exception to rule 4 above: sequence 01 only. Do not fold
 * it back into the cool family; the rest of the palette is untouched.
 *
 * Three values, not one, because a single flat white is a blowout rather than
 * a white room. If everything sits at 255 there is no value ladder and the
 * strobe has nothing to be brighter THAN — that is what makes white read as
 * glare. The air is bright, the wall a step under it, and the rings are the
 * only true white, so they read as the light source.
 */
export const TUNNEL_WHITE = {
    // The corridor's surface — the value that fills most of the frame, so it
    // decides how white the piece reads more than anything else does.
    //
    // Pulled well down off white and tinted into the cool family, on direction
    // ("less white", asked three times). It is still the lightest surface in
    // the work and still reads as a white corridor in context, because the
    // distance behind it is dark and value is relative. A genuinely white wall
    // here is what made the opening read as glare.
    wall: '#C4D3DC',
    // The strobe. The brightest thing in the piece, but no longer PURE white —
    // at #FFFFFF it clipped, and a clipped highlight has a hard edge where it
    // hits the ceiling, which is the opposite of smooth.
    ring: '#E9F1F5',
    // Where the light stops. NOT white.
    //
    // A white room lit evenly to a white background is a void — the earlier
    // attempt at this was technically all-white and read as blank glare,
    // because a space with no dark has no depth and nothing to be enclosed BY.
    // You feel inside something when the light falls off and you cannot see
    // where it ends. So the far end of the corridor goes dark and the strobe
    // throws white onto the walls near you: white surfaces, dark distance.
    //
    // NO LONGER THE CORRIDOR'S WORLD COLOUR — BACKDROPS.tunnel went to true
    // black. This is kept for two live reasons: it is the `tunnel depth` world
    // swatch, and it is the fixture behind `ambientTint`'s only real piece of
    // evidence (it derives the hand-tuned #C4D3DC to within three values of
    // 255, which is what makes that rule a finding rather than a claim). The
    // wall above is still the value it was tuned against.
    depth: '#1B242B'
}

/**
 * Sequence 02's white — maximum, and deliberately past MAX_VALUE.
 *
 * The second scoped exception in this file, and it needs its reason stated as
 * plainly as the tunnel's does. `paletteWarning` calls anything lighter than
 * the strobe "too-white", because in the rest of the piece white arrives as a
 * BRIGHTENER: laid over a hue it desaturates it, and applied to a room it flattens
 * every value at once. That rule is about white mixed into colour.
 *
 * The data field has no colour to desaturate. It is two values — lit cell and
 * unlit cell — on a black world, which is the Ikeda idiom's entire premise: the
 * white is not lighting a surface, it IS the signal, and a signal at 0.94 is a
 * signal that has been turned down. Every grey in that scene wants to be dither
 * or motion, never paint.
 *
 * Kept out of PALETTE, TUNNEL_WHITE and BACKDROPS on purpose. Those three are
 * what `paletteWarning` is checked against, and the honest way to hold an
 * exception is to name it rather than to smuggle it into a set that claims
 * every member passes.
 */
export const DATA_WHITE = '#FFFFFF'

// ---- authorable worlds and lights -------------------------------------
//
// Everything below exists so the director panel can offer colour without
// offering ANY colour. The four rules at the top of this file are the piece;
// a free colour picker wired straight to the scene quietly repeals them over
// an afternoon of tuning. So the panel surfaces swatches first and the picker
// second, and the picker reports what a choice breaks instead of blocking it —
// the artist overrules the rule, but never by accident.

/**
 * The two hue bands the whole piece lives in, in degrees.
 *
 * These are MEASURED, not chosen: every colour in PALETTE, TUNNEL_WHITE and
 * BACKDROPS lands at hue 199–208 or 0–38 and nothing sits between. So the
 * palette's real shape is narrower than "no purple" — there is no green, no
 * yellow and no true cyan either. Stating it as two bands catches all of them
 * with one test, and catches them on the way IN rather than after a sequence
 * has been built around an illegal colour.
 *
 * Warm wraps past 0, so containment is a two-part check — see inHueBand.
 */
export const HUE_BANDS = {
    cool: { min: 195, max: 215 },
    warm: { min: 350, max: 40 }
}

// Ceilings, also measured. `peach` is the most saturated thing in the piece at
// 0.857 and `TUNNEL_WHITE.ring` the lightest at 0.937 — so anything past these
// is outside the range the work was built in, which is the only honest
// definition of "neon" or "too white" available here.
export const MAX_CHROMA = 0.88
export const MAX_VALUE = 0.94

// Read back in sRGB — the space these hex values were chosen in, and the space
// the author is picking in. three.js converts hex to Linear-sRGB on the way in
// and getHSL reports THAT by default, which puts `shadow` at a lightness of
// about 0.01 instead of 0.11. Every ceiling below was measured in sRGB, so
// omitting the argument here silently moves the thresholds rather than
// erroring: near-blacks stop reading as neutral and start tripping the hue
// check. Same trap the tests at the top of palette.test.js call out.
const toHsl = (hex) => {
    const out = { h: 0, s: 0, l: 0 }
    new THREE.Color(hex).getHSL(out, THREE.SRGBColorSpace)
    return { h: out.h * 360, s: out.s, l: out.l }
}

const inHueBand = (hue, band) => (
    band.min > band.max
        // Wrapped band (warm): 350..360 plus 0..40.
        ? hue >= band.min || hue <= band.max
        : hue >= band.min && hue <= band.max
)

/**
 * What a colour breaks, or null if it breaks nothing.
 *
 * Returns one finding rather than a list: the panel shows this next to the
 * picker while the author is dragging, and three simultaneous complaints read
 * as an error state rather than as a note. Ordered by which is most likely to
 * be an accident — a grey has drifted out of both families and is the easiest
 * to produce without noticing, so it is checked first.
 */
export const paletteWarning = (hex) => {
    const { h, s, l } = toHsl(hex)

    // Near-neutrals are exempt from the hue check: void and shadow are hue 206
    // by construction, but a colour this desaturated has no perceptible hue to
    // be off-band with. Testing it anyway would flag every legitimate dark.
    const neutral = s < 0.12

    if (!neutral && !inHueBand(h, HUE_BANDS.cool) && !inHueBand(h, HUE_BANDS.warm)) {
        const side = h > 215 && h < 350 ? 'purple' : 'green/yellow'
        return {
            code: 'hue-gap',
            message: `Hue ${Math.round(h)}° sits in the ${side} gap. The piece only uses 195–215° and 350–40°.`
        }
    }
    if (s > MAX_CHROMA) {
        return {
            code: 'neon',
            message: `Saturation ${s.toFixed(2)} is past peach (${MAX_CHROMA}) — this will read as an LED, not as light through frosted acrylic.`
        }
    }
    if (l > MAX_VALUE && s < 0.4) {
        return {
            code: 'too-white',
            message: 'Lighter than the strobe. White is a highlight here — brighten within the hue instead.'
        }
    }
    return null
}

export const BACKDROPS = {
    // Fog pushed well back. White fog against a white corridor erases it —
    // at fogNear 2 everything past a couple of metres was already pure
    // background and the tunnel had no depth to be pulled into.
    // Fog is the falloff, so it is the DARK, not the white — the corridor walls
    // are white and the distance dissolves into unlit air. fogNear sits well
    // out so the near walls stay clean white and only the depth goes.
    //
    // TRUE black, on direction, and it is now the same world the data field
    // uses — the two opening sequences share one background and differ only in
    // what is lit inside it.
    //
    // This is the OPPOSITE end of the argument the corridor started from. The
    // white was originally tuned against `TUNNEL_WHITE.depth`, a near-black with
    // a 206° cast, on the reasoning that a room needs a dark to be enclosed by.
    // Black is that reasoning taken all the way: with the throats now filling
    // both apertures with light, the distance no longer has to carry any of the
    // depth cue, so it can go to nothing without leaving a hole. White surfaces,
    // no distance at all.
    //
    // fogFar 38 stays — it clears the throats at 34 so they sit in air that is
    // already fully black, which is what makes them read as light arriving from
    // somewhere else rather than as a bright patch on a grey wall.
    //
    // Consequence worth knowing: `ambientTint` derives the fill light from this
    // colour, and black has no hue to carry, so the corridor's fill goes from
    // the hand-tuned cool #C4D3DC to a neutral grey. The walls and the strobes
    // are both still cool by their own colour, so the corridor stays cool — but
    // this is the knob if the white starts reading flat.
    tunnel: { color: '#000000', fogNear: 7, fogFar: 38 },
    // TRUE black, and fog pushed past the surround it contains.
    //
    // Both on direction ("all be black background"). `void` is a near-black
    // with a 206° cast, which is right for a room lit by coloured lamps and
    // wrong here: the data field has no lamps, so that cast has nothing to sit
    // under and reads as a blue-grey wash behind white data. Ikeda's black is
    // the absence of signal, not a dark colour.
    //
    // fogFar clears the data sphere (radius 12) because fog would mix the white
    // toward the world colour by distance — and a field of greys is the exact
    // thing this idiom refuses. The sphere also sits at a CONSTANT distance, so
    // fog could not even give it depth: it would just dim the whole surround
    // evenly, which is a brightness change dressed up as atmosphere.
    field: { color: '#000000', fogNear: 20, fogFar: 60 },
    assembly: { color: PALETTE.shadow, fogNear: 2, fogFar: 24 },
    // The chamber is a Ganzfeld — filled, hazy, no visible far wall. Its fog
    // sits closest of all: you are inside the light, so there is nothing to
    // see through it.
    chamber: { color: '#2A3742', fogNear: 1.5, fogFar: 22 }
}

/**
 * What the panel offers for a WORLD colour. Deliberately all dark.
 *
 * This is rule 1 ("colour is light, not surface") turned into something the UI
 * enforces instead of something a comment asks for. The background is the
 * furthest surface in the room and fills the frame, so tinting it salmon does
 * not make a salmon-lit room — it makes a salmon PHOTOGRAPH, with every dark
 * value dragged along with it and nothing left for the light to be brighter
 * than. The room you want comes from a dark world plus a salmon lamp.
 *
 * `tunnelWall` is the one light entry and is here only because sequence 01's
 * scoped white exception exists; it is named for what it is so nobody reaches
 * for it as a general pale background.
 */
export const WORLD_SWATCHES = [
    // The world both opening sequences now use. Distinct from `void`, which is
    // a near-black carrying a 206° cast: that cast is right under coloured
    // lamps and wrong in a room whose only content is emissive white.
    { name: 'black', color: '#000000' },
    { name: 'void', color: PALETTE.void },
    { name: 'shadow', color: PALETTE.shadow },
    { name: 'tunnel depth', color: TUNNEL_WHITE.depth },
    { name: 'chamber', color: BACKDROPS.chamber.color },
    { name: 'tunnel wall (s01 only)', color: TUNNEL_WHITE.wall }
]

/**
 * What the panel offers for a LIGHT colour: the six named colours, plus the
 * strobe white. The inverse set to WORLD_SWATCHES on purpose — every hue in
 * the piece is available here and none of it is available as a surface.
 */
export const LIGHT_SWATCHES = [
    { name: 'ice blue', color: PALETTE.iceBlue },
    { name: 'sky blue', color: PALETTE.skyBlue },
    { name: 'deep sky', color: PALETTE.deepSky },
    { name: 'blush', color: PALETTE.blush },
    { name: 'salmon', color: PALETTE.salmon },
    { name: 'peach', color: PALETTE.peach },
    { name: 'off white', color: PALETTE.offWhite },
    { name: 'strobe', color: TUNNEL_WHITE.ring }
]

/**
 * A world is a backdrop plus a fill level — three knobs, and no more.
 *
 * `ambient` is the new one. Every sequence currently hardcodes its own
 * ambientLight (0.22 in the tunnel, 0.55 in the chamber), which means "how much
 * unlit air can you see" is a decision buried in four different components.
 * Pulling it onto the row makes it the thing it actually is: a property of the
 * ROOM, blended across a handover like colour and fog already are.
 *
 * Kept low across the board. Ambient light has no direction, so it cannot
 * shade anything — raising it does not brighten the room so much as flatten it,
 * and a flat room is the void this piece keeps having to be talked out of.
 * Lamps do the lighting; ambient only stops the darks going to pure black.
 */
export const WORLD_PRESETS = {
    tunnel: { ...BACKDROPS.tunnel, ambient: 0.22 },
    // Ambient 0, alone in the piece. Every other sequence has surfaces that need
    // to be lit; this one has no surfaces at all — the grid and the ribbons are
    // emissive and unlit by construction. Any fill here would land on nothing
    // and simply raise the black off zero, which is the one value in the scene
    // that has to be exact.
    field: { ...BACKDROPS.field, ambient: 0 },
    assembly: { ...BACKDROPS.assembly, ambient: 0.16 },
    chamber: { ...BACKDROPS.chamber, ambient: 0.55 }
}

/**
 * What the room's fill light is COLOURED as, derived from the world itself.
 *
 * An untinted ambient is white light applied to every surface at once, which is
 * rule 4 running backwards: white used as a brightener, greying the palette out
 * everywhere simultaneously and in the one way no single sequence can be blamed
 * for. But the fill does not need a field of its own either — the air in a room
 * is the colour of that room.
 *
 * So: keep the world's hue and chroma, lift only its VALUE. The world colours
 * are all dark by design (see WORLD_SWATCHES), and an ambientLight multiplies
 * its colour by its intensity — hand it `void` directly and the fill is black.
 *
 * Evidence this is the right rule rather than a convenient one: the tunnel's
 * ambient was hand-tuned to #C4D3DC over several passes, and lifting its world
 * colour returns #C7D2DC. Three values out of 255 — the derivation recovers the
 * number somebody arrived at by eye.
 *
 * A near-neutral world lifts to a near-neutral fill, which is correct: an
 * uncoloured room has uncoloured air.
 */
export const AMBIENT_VALUE = 0.82

export const ambientTint = (worldColor, value = AMBIENT_VALUE) => {
    const source = new THREE.Color()
    // sRGB on both ends. Reading linear HSL and writing it back through the
    // default (also linear) would round-trip, but every constant here was
    // measured in sRGB, so `value` would mean something else entirely.
    const { h, s } = source.set(worldColor).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace)
    return `#${source.setHSL(h, s, value, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`
}

/**
 * Two kinds of light, not eight.
 *
 * three.js offers point, spot, directional, hemisphere, area. Most of them are
 * meaningless in a fogged room with no objects in it — a directional light has
 * no position to place and nothing to cast onto, and a spot needs geometry to
 * land on before its cone is visible at all. What this piece actually does with
 * light is two things, so those are the two on offer:
 *
 * - `lamp`  — lights the surfaces near it. You see what it hits, not the light.
 * - `glow`  — the same lamp with a visible haze volume around the source, so
 *             the light itself is a thing in the room. This is the Turrell
 *             move, and it is the one that needs fog to work.
 *
 * Anything more specific (the tunnel's travelling strobe) stays a sequence's
 * own code. The panel is for placing light in a room, not for animating it.
 */
export const LIGHT_KINDS = ['lamp', 'glow']

/**
 * Named intensity stops, in three.js candela.
 *
 * Since r155 lighting is physically based, so intensity and `decay` are coupled
 * and the numbers are not intuitive by eye — 1 is not "half of 2" at three
 * metres. These stops are lifted from what the piece already uses (the tunnel
 * strobe runs 3 → 14) so they land in a range known to work at this scale,
 * rather than from the docs.
 *
 * `decay` is 1.4 rather than the physical 2 for the same reason it is in
 * WhiteTunnel: true inverse-square falls off so fast in a room this size that a
 * lamp lights a two-metre bubble and nothing else, which reads as a bug.
 */
export const LIGHT_INTENSITIES = { glow: 2, soft: 5, lit: 9, strobe: 14 }

export const LIGHT_DEFAULTS = {
    kind: 'lamp',
    color: PALETTE.skyBlue,
    intensity: LIGHT_INTENSITIES.soft,
    // Metres. Beyond this the lamp contributes nothing, which keeps one light
    // in one sequence from washing the whole installation in the outside view.
    distance: 40,
    decay: 1.4,
    // Head height, slightly forward. A light at the origin sits inside the
    // viewer and lights nothing they can see.
    position: [0, 1.6, -3],
    // Only read for `glow`: the radius of the visible volume. Independent of
    // `distance` — how far the light REACHES and how big it LOOKS are different
    // questions, and tying them makes a big soft light impossible.
    radius: 1.2
}
