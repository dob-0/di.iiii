import { describe, expect, it } from 'vitest'
import { BEAT_CARDS, RUN_TIME_SEC, beatsAtSec } from './beatCards.js'
import { BEAT_SKETCHES, paintFrame } from './beatSketches.js'

// A recording stand-in for CanvasRenderingContext2D. jsdom has no 2D context,
// and the thing worth guarding here is not what the sketches look like — it is
// that none of them throws or feeds NaN into a canvas call, which paints
// nothing and fails silently in a browser.
const fakeContext = () => {
    const calls = []
    const numbersSeen = []
    const record = (name) => (...args) => {
        calls.push(name)
        args.forEach((arg) => { if (typeof arg === 'number') numbersSeen.push(arg) })
        return undefined
    }
    const ctx = {
        calls,
        numbersSeen,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        save: record('save'),
        restore: record('restore'),
        setTransform: record('setTransform'),
        beginPath: record('beginPath'),
        arc: record('arc'),
        ellipse: record('ellipse'),
        stroke: record('stroke'),
        fill: record('fill'),
        fillRect: record('fillRect'),
        createRadialGradient: (...args) => {
            record('createRadialGradient')(...args)
            return { addColorStop: record('addColorStop') }
        }
    }
    return ctx
}

const VIEW = { width: 640, height: 360, ink: '#FFFFFF', world: '#000000', alpha: 1 }

describe('beat sketches', () => {
    Object.entries(BEAT_SKETCHES).forEach(([name, draw]) => {
        it(`${name} paints across its whole window without a NaN`, () => {
            // Sample the beat rather than one frame: several sketches only
            // reach their end behaviour past a threshold (the tunnel's contact
            // at 86%, the metaball weld at 66%, the globe's runaway at 86%).
            for (let step = 0; step <= 20; step += 1) {
                const ctx = fakeContext()
                draw(ctx, { ...VIEW, progress: step / 20, elapsed: step * 0.4 })
                expect(ctx.calls.length).toBeGreaterThan(0)
                expect(ctx.numbersSeen.some((value) => Number.isNaN(value))).toBe(false)
                expect(Number.isFinite(ctx.globalAlpha)).toBe(true)
            }
        })

        it(`${name} leaves the composite mode as it found it`, () => {
            // metaball punches its portal with destination-out; leaving that
            // set would erase whatever the next beat in the seam draws.
            const ctx = fakeContext()
            draw(ctx, { ...VIEW, progress: 0.95, elapsed: 3 })
            expect(ctx.globalCompositeOperation).toBe('source-over')
        })
    })
})

describe('paintFrame', () => {
    it('paints one beat outside a seam', () => {
        const ctx = fakeContext()
        paintFrame(ctx, { width: 640, height: 360, elapsed: 2, live: beatsAtSec(2) })
        expect(ctx.calls).toContain('save')
        expect(ctx.calls.filter((name) => name === 'save')).toHaveLength(1)
    })

    it('paints both beats inside a seam, so the handover cross-fades', () => {
        const ctx = fakeContext()
        paintFrame(ctx, { width: 640, height: 360, elapsed: 5, live: beatsAtSec(5) })
        expect(ctx.calls.filter((name) => name === 'save')).toHaveLength(2)
    })

    it('survives every second of the piece', () => {
        for (let sec = 0; sec <= RUN_TIME_SEC; sec += 0.25) {
            const ctx = fakeContext()
            expect(() => paintFrame(ctx, { width: 640, height: 360, elapsed: sec, live: beatsAtSec(sec) })).not.toThrow()
            expect(ctx.numbersSeen.some((value) => Number.isNaN(value))).toBe(false)
        }
    })

    it('has a sketch for every card, so no beat paints an empty frame', () => {
        BEAT_CARDS.forEach((beat) => {
            const ctx = fakeContext()
            paintFrame(ctx, { width: 640, height: 360, elapsed: beat.startSec + 0.6, live: [{ beat, weight: 1 }] })
            expect(ctx.calls).toContain('save')
            expect(ctx.calls.length).toBeGreaterThan(3)
        })
    })
    // The sketch copies the piece's pulse rather than importing it (importing
    // WhiteTunnel.jsx would pull three.js into a renderer-free page), so the
    // copy is kept honest here. Retune the piece's heartbeat and this fails
    // until the poster follows — drift is a red test, not a poster beating at
    // the wrong rate.
    it('breathes at the piece\'s own pulse, not one of its own', async () => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const { cwd } = await import('node:process')
        const find = (rel) => [`src/algoVrithm/${rel}`, `algoVrithm/${rel}`]
            .map((p) => path.join(cwd(), p))
            .find((p) => fs.existsSync(p))
        const piece = fs.readFileSync(find('sequences/WhiteTunnel.jsx'), 'utf8')
        const sketch = fs.readFileSync(find('landing/beatSketches.js'), 'utf8')
        const num = (src, name) => Number(src.match(new RegExp(`${name}\\s*=\\s*([0-9.]+)`))?.[1])
        expect(num(sketch, 'STROBE_HZ')).toBe(num(piece, 'STROBE_HZ'))
        expect(num(sketch, 'STROBE_SHARPNESS')).toBe(num(piece, 'STROBE_SHARPNESS'))
    })
})
