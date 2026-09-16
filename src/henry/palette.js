// The piece's colour, in one place.
//
// The reference images are two families, and the whole arc of henry is the
// drift from one to the other:
//
//   FAMILY A — painterly storybook. Mint and teal against hot pink; amber and
//     vermilion on near-black; pastel confetti on green. Warm, held, cocooned.
//     This is beats 1-3.
//   FAMILY B — CGI net-art. The same hues pushed to candy plastic, iridescent
//     gradients, acid green. Cloned figures, too many eyes. Overloaded,
//     anonymous, watched. This is beat 4.
//
// So DREAM and STRANGE below are not two palettes — they are the same palette
// at two temperatures, which is why STRANGE reuses DREAM's hues rather than
// introducing new ones. Nothing new arrives when the dream turns; it is the
// same world, felt differently. That is the point.
//
// REAL is the third and it *is* a different palette: desaturated, warm-grey,
// domestic. It has to be, or the reveal has nothing to land against.
//
// Three rules the values follow:
//
// 1. COLOUR IS IN THE MATERIAL, NOT THE LAMP. The references are flat and
//    near-shadowless — light lives in the paint. So these are mid-value,
//    mid-chroma surface colours meant to be read almost unlit, and the scene
//    carries very little directional light (see SceneLights).
// 2. NO BROWN, NO BLACK IN THE DREAM. The darkest dream value is deepTeal.
//    Reaching for brown or black is what turns a storybook palette into a
//    generic 3D forest, which is the exact failure mode to avoid.
// 3. THE PINK IS THE SKY, NOT AN ACCENT. Reference 1 is a mint face against a
//    field of hot pink. Pink is a ground colour here, used at scale.

export const DREAM = {
    // --- the mint/teal family: everything the girl stands on or touches ---
    cream: '#F7F0E4',
    mint: '#BFE6DC',
    seafoam: '#8FCFC2',
    teal: '#4E9A94',
    deepTeal: '#2E6B6B',

    // --- the pink family: sky, petals, the inside of the bear ---
    blush: '#F9C2D4',
    rose: '#F58BA8',
    hotPink: '#F0468C',
    deepRose: '#C42B63',

    // --- the accents. Used sparingly and never together. ---
    acidGreen: '#B8E04A',
    amber: '#F2A03D',
    vermilion: '#E44E2E'
}

// Beat 4. Same hues, colder and more saturated — the plastic version of the
// dream. Applied by lerping the material colour, not by swapping materials,
// so the turn is continuous and the geometry never pops.
export const STRANGE = {
    cream: '#E8F2EE',
    mint: '#9BF0DC',
    seafoam: '#5CE0C8',
    teal: '#22B8A8',
    deepTeal: '#12545C',

    blush: '#FFC0E8',
    rose: '#FF7ACB',
    hotPink: '#FF1E9C',
    deepRose: '#A81269',

    acidGreen: '#CCFF33',
    amber: '#FFB020',
    vermilion: '#FF4A20'
}

// The room she is actually sitting in. Warm grey, dust, afternoon. Every value
// is low-chroma on purpose: after ninety seconds of the dream, ordinary has to
// read as a physical relief, and saturation is what would spoil it.
export const REAL = {
    wall: '#D9D2C7',
    wallShadow: '#BDB4A7',
    floor: '#A8977F',
    rug: '#8C8577',
    sofa: '#7E8A88',
    pot: '#B8735A',
    soil: '#5A4A3C',
    leaf: '#6F8A5C',
    plushBlue: '#9DB4CC',
    plushCream: '#E8E0D2',
    skin: '#E8C4AE',
    dress: '#EDE6DA',
    daylight: '#FFF6E6'
}

// The sky is a vertical gradient, not a colour, in every reference that has
// one. Top and bottom stops for each state.
export const SKY = {
    dream: { top: '#F0468C', bottom: '#F9C2D4' },
    strange: { top: '#FF1E9C', bottom: '#9BF0DC' },
    real: { top: '#D9D2C7', bottom: '#C4BBAE' }
}
