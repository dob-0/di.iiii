import * as THREE from 'three'
import { createRandom } from './random.js'

// The glyph atlas — the piece's actual CODE, as pixels.
//
// The reference the artist gave is a fragment shader that fills the frame with a
// grid of random dot-matrix characters, re-rolled per row on a fast clock: raw
// data as a wall of illegible type. The look is right for this work and the
// implementation is not — that shader is somebody else's, published under terms
// that rule out using it in a piece that gets exhibited, so nothing here is
// ported from it. What is taken is the IDEA (a cell grid of random glyphs that
// re-rolls on a tick), which is the standard construction, and it is built the
// way this repo already builds textures: rasterised once on a canvas at load,
// uploaded to the GPU, never recomputed per frame.
//
// Rasterising once rather than shading per pixel matters here for the same
// reason the haze is a sprite and not a bloom pass — this has to hold 72-90Hz on
// a standalone headset, in stereo, and a full-screen procedural shader is the
// one thing guaranteed to be paid for twice.
//
// The atlas is a GRID of cells. Nothing samples the whole thing: each quad in
// the field points its UVs at ONE cell, so a single texture and a single
// material give the room dozens of different characters in one draw call.

// Cells per side. 8 gives 64 distinct glyphs, which is past the count at which
// anybody can spot a repeat in a field of a hundred-odd plates, and keeps the
// texture at a size a mobile GPU will not think twice about.
export const ATLAS_CELLS = 8

// The dot matrix inside each cell. 5x7 is the classic character cell — small
// enough that a glyph reads as a MARK rather than as a shape someone drew, wide
// enough that it does not collapse into a blob at distance.
export const GLYPH_COLUMNS = 5
export const GLYPH_ROWS = 7

// How many of the matrix's dots are lit, on average. Around half is what makes
// the field read as information: much below and the plates go sparse and dotty,
// much above and every glyph is a filled rectangle and the whole room becomes
// one texture.
const DOT_CHANCE = 0.5

// Blank margin inside each cell, as a fraction. Without it a lit dot on the cell
// edge touches its neighbour in the atlas and the grid reads as one continuous
// field of blocks — the gap between characters is what makes them characters.
const CELL_MARGIN = 0.16

const ATLAS_SEED = 20260730

/**
 * One glyph, as a flat array of 0/1 the length of the matrix.
 *
 * Pure and seeded so the atlas is identical on every load — the same rule the
 * rest of the piece follows: what gets approved is what an audience sees.
 *
 * A glyph with NO lit dots is re-rolled once. Blank cells are not wrong in
 * principle, but a plate that landed on one is an invisible plate, and the field
 * is placed by count — losing one in sixty-four to an empty cell is a hole in
 * the composition that no amount of looking at the code explains.
 */
export const glyphBits = (random) => {
    const bits = new Uint8Array(GLYPH_COLUMNS * GLYPH_ROWS)
    let lit = 0

    for (let pass = 0; pass < 2 && lit === 0; pass++) {
        for (let index = 0; index < bits.length; index++) {
            bits[index] = random() < DOT_CHANCE ? 1 : 0
            lit += bits[index]
        }
    }

    return bits
}

/**
 * UV rect of one cell, as [u0, v0, u1, v1].
 *
 * Cell 0 is TOP-LEFT of the canvas, which is bottom-left in UV space — the flip
 * every canvas-to-texture path in three has to make somewhere. Doing it here
 * means the field's geometry can be written in reading order without a caller
 * ever having to know.
 */
export const cellUv = (cell, cells = ATLAS_CELLS) => {
    const wrapped = ((cell % (cells * cells)) + cells * cells) % (cells * cells)
    const column = wrapped % cells
    const row = Math.floor(wrapped / cells)
    const step = 1 / cells
    return [
        column * step,
        1 - (row + 1) * step,
        (column + 1) * step,
        1 - row * step
    ]
}

const rasterise = (cellPixels) => {
    const random = createRandom(ATLAS_SEED)
    const size = ATLAS_CELLS * cellPixels

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')
    // White on transparent. The material tints it, and the field is additive —
    // an opaque black background would draw a square around every glyph.
    context.clearRect(0, 0, size, size)
    context.fillStyle = '#FFFFFF'

    const inner = cellPixels * (1 - CELL_MARGIN * 2)
    const dotWidth = inner / GLYPH_COLUMNS
    const dotHeight = inner / GLYPH_ROWS

    for (let cell = 0; cell < ATLAS_CELLS * ATLAS_CELLS; cell++) {
        const bits = glyphBits(random)
        const originX = (cell % ATLAS_CELLS) * cellPixels + cellPixels * CELL_MARGIN
        const originY = Math.floor(cell / ATLAS_CELLS) * cellPixels + cellPixels * CELL_MARGIN

        for (let index = 0; index < bits.length; index++) {
            if (!bits[index]) continue
            const column = index % GLYPH_COLUMNS
            const row = Math.floor(index / GLYPH_COLUMNS)
            // Ceil, not round: at small cell sizes a sub-pixel gap between two
            // lit dots renders as a hairline crack through the glyph, and the
            // dot matrix stops reading as one character.
            context.fillRect(
                originX + column * dotWidth,
                originY + row * dotHeight,
                Math.ceil(dotWidth),
                Math.ceil(dotHeight)
            )
        }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // Clamped, or a quad whose UVs land on the last row of a cell samples the
    // first row of the opposite edge and the glyph grows a stray line of dots.
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    // NEAREST on purpose. Bilinear filtering softens the dots into a smear, and
    // the whole subject of this sequence is the pixel — a blurred pixel is a
    // photograph of one.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 4
    return texture
}

let sharedAtlas = null

/**
 * The atlas, built once and shared.
 *
 * Same contract as hazeTexture(): one canvas rasterised on the main thread at
 * load, one upload, and every plate in the piece drawing from it.
 */
export const glyphAtlas = (cellPixels = 64) => {
    if (!sharedAtlas) sharedAtlas = rasterise(cellPixels)
    return sharedAtlas
}
