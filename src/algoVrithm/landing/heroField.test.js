import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHeroField, stepSeparation } from './heroField.js'

// jsdom has no WebGL, so the context is a stub. That is enough for the two
// things worth guarding here, because both are about the LIFECYCLE rather than
// about pixels: what dispose() destroys, and whether a second create on the
// same canvas still works. The pictures themselves are checked by looking at
// them — see the note in AlgoVrithmLanding.jsx.
const fakeGl = () => {
    const calls = []
    const gl = new Proxy(
        {
            COMPILE_STATUS: 1,
            LINK_STATUS: 2,
            MAX_FRAGMENT_UNIFORM_VECTORS: 3,
            VERTEX_SHADER: 4,
            FRAGMENT_SHADER: 5,
            ARRAY_BUFFER: 6,
            STATIC_DRAW: 7,
            FLOAT: 8,
            BLEND: 9,
            SRC_ALPHA: 10,
            ONE_MINUS_SRC_ALPHA: 11,
            COLOR_BUFFER_BIT: 12,
            TRIANGLES: 13,
            calls,
            createShader: () => ({}),
            createProgram: () => ({}),
            createBuffer: () => ({}),
            getShaderParameter: () => true,
            getProgramParameter: () => true,
            getParameter: () => 256,
            getUniformLocation: () => ({}),
            getExtension: (name) => {
                calls.push(`getExtension:${name}`)
                return name === 'WEBGL_lose_context' ? { loseContext: () => calls.push('loseContext') } : null
            }
        },
        {
            get(target, prop) {
                if (prop in target) return target[prop]
                return (...args) => {
                    calls.push(String(prop))
                    return args.length ? undefined : undefined
                }
            }
        }
    )
    return gl
}

const fakeCanvas = () => {
    const gl = fakeGl()
    return { width: 300, height: 150, clientWidth: 800, clientHeight: 600, gl, getContext: () => gl }
}

describe('heroField lifecycle', () => {
    // THE BUG THIS EXISTS FOR. dispose() used to call WEBGL_lose_context, and
    // StrictMode mounts every effect twice — create, dispose, create. The second
    // create got a dead context, so it returned null; and the 2D poster could
    // not take over either, because getContext('2d') on a canvas that already
    // holds a WebGL context returns null. The page drew a blank rectangle with
    // no error of any kind. Silent, and invisible to every check but looking.
    it('does not destroy the context it was handed', () => {
        const canvas = fakeCanvas()
        const hero = createHeroField(canvas)
        expect(hero).not.toBeNull()
        hero.dispose()
        expect(canvas.gl.calls).not.toContain('loseContext')
    })

    it('can be created again on the same canvas after a dispose', () => {
        const canvas = fakeCanvas()
        createHeroField(canvas).dispose()
        expect(createHeroField(canvas)).not.toBeNull()
    })

    it('sizes its drawing buffer to the frame it was given', () => {
        const canvas = fakeCanvas()
        const hero = createHeroField(canvas)
        hero.draw({ width: 800, height: 600, ratio: 1.5, elapsed: 0, live: [] })
        expect([canvas.width, canvas.height]).toEqual([1200, 900])
    })
})

describe('heroField stays honest about the piece', () => {
    const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
    const hero = read('./heroField.js')

    // The same contract beatSketches.test.js holds the pulse to: a number copied
    // out of a sequence is a number that can drift, so the copy is checked.
    it.each([
        ['STROBE_HZ', '../sequences/WhiteTunnel.jsx'],
        ['SMOOTH_K', '../sequences/MetaballField.jsx'],
        ['SWIPE_HOLD', '../sequences/ReelGlobe.jsx'],
        ['ACCEL_HALVING', '../sequences/ReelGlobe.jsx']
    ])('copies %s from the sequence that owns it', (name, source) => {
        const from = read(source).match(new RegExp(`^(?:export )?const ${name} = ([^\\n]+)$`, 'm'))
        const here = hero.match(new RegExp(`^const ${name} = ([^\\n]+)$`, 'm'))
        expect(from, `${name} not found in ${source}`).not.toBeNull()
        expect(here, `${name} not found in heroField.js`).not.toBeNull()
        expect(here[1]).toBe(from[1])
    })

    // The halo drew BLACK for its whole four-second window, because a ring of
    // world radius R on a sheet h below the eye lands at screen tan R/h: from
    // the visitor's own 1.54m even a newborn 1.2m ring is at 0.78, outside this
    // frame's tan 36° = 0.727. Every ring was born already off-screen.
    it('stands far enough off the halo sheet for its rings to be in frame', () => {
        const height = Number(hero.match(/^const HALO_EYE_HEIGHT = ([\d.]+)$/m)[1])
        const halfFrame = Math.tan((72 * Math.PI) / 360)
        const born = 1.2
        const dead = 20
        expect(born / height).toBeLessThan(halfFrame * 0.25)
        expect(dead / height).toBeGreaterThan(halfFrame)
    })
})

// jsdom does no layout, so the overlap itself cannot be asserted here — it was
// found and is re-checked by looking at the page at three viewport widths. What
// a unit test CAN hold is the thing whose absence caused it: the fixed control
// had no backing of any kind, so the statement scrolled straight under it.
describe('the pause control is not transparent to the text under it', () => {
    // NOT new URL('./x.css', import.meta.url): Vite rewrites that form into a
    // resolved asset URL, and readFileSync is then handed an http one.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'algoVrithmLanding.css'), 'utf8')
    const backing = css.match(/\.avl-hold::before \{[^}]+\}/)

    it('has a backing layer', () => {
        expect(backing, '.avl-hold::before is gone — PAUSE will land on the statement again').not.toBeNull()
    })

    it('is fully opaque behind the control, not merely dimmed', () => {
        // A partial fade let a line read THROUGH the word PAUSE, which is the
        // same collision in a politer register. The first stop must be the
        // solid token, held to a percentage above the control's cap height.
        expect(backing[0]).toMatch(/var\(--avl-void\) 0 (\d+)%/)
        expect(Number(backing[0].match(/var\(--avl-void\) 0 (\d+)%/)[1])).toBeGreaterThanOrEqual(40)
    })

    it('leaves room for the statement to be scrolled clear of it', () => {
        expect(css).toMatch(/\.avl-statement \{[^}]*padding-bottom:/)
    })
})

// The atlas is built by scripts/build-reel-atlas.mjs and its grid is baked into
// the shader as literals. If someone drops a reel into src/algoVrithm/assets/
// and rebuilds, the atlas grows a row and the shader keeps reading four — which
// samples the wrong reel for half the frames and looks merely odd, not broken.
describe('the reel atlas and the shader agree', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const meta = JSON.parse(readFileSync(join(here, 'reelAtlas.json'), 'utf8'))
    const hero = readFileSync(join(here, 'heroField.js'), 'utf8')
    const constant = (name) => Number(hero.match(new RegExp(`^const ${name} = (\\d+)$`, 'm'))[1])

    it.each([['ATLAS_COLS', 'cols'], ['ATLAS_ROWS', 'rows'], ['ATLAS_COUNT', 'count']])(
        '%s matches the built atlas',
        (name, key) => expect(constant(name)).toBe(meta[key])
    )

    it('has room for every reel in the grid', () => {
        expect(meta.count).toBeLessThanOrEqual(meta.cols * meta.rows)
    })
})

describe('the metaball oscillator', () => {
    it('never lets a pair pass through itself', () => {
        let state = { separation: 1.15, velocity: 0 }
        for (let step = 0; step < 4000; step++) {
            state = stepSeparation(state.separation, state.velocity, 1 / 240)
            expect(state.separation).toBeGreaterThan(0)
        }
    })
})
