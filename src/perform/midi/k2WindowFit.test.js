import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import face from './xone-k2-face.json'
import { boxesOverlap, jobBox, shapeBox, wrapJob } from './k2Face.js'
import { windowFeatures } from './K2LayoutPanel.jsx'
import { jobsFor } from './k2Jobs.js'
import { K2_CONSOLES } from './xoneK2.js'

// Round 3 fixes of the controller window: pad labels wider than their pad, a face taller than the screen,
// and the dev strip over the last readout lines. Sizes below are the ones measured on the window.
const GLYPH = 0.6 // advance of the mono face in em, the widest a glyph is drawn
const pads = Object.entries(face.controls).filter(([, control]) => control.kind === 'pad')

// vitest runs from the repository root
const read = (path) => readFileSync(resolve(globalThis.process.cwd(), path), 'utf8')

describe('K2 window fit', () => {
    it('every label of every console fits its pad: at most wrapChars glyphs of the drawn size across the pad, 2 lines, inside it', () => {
        expect(pads).toHaveLength(16)
        for (const current of K2_CONSOLES) {
            const labels = jobsFor(current.map, current, 0)
            for (const [name, control] of pads) {
                const lines = wrapJob(labels[name], face.text)
                expect(lines.length, `${current.id} ${name}`).toBeLessThanOrEqual(face.text.maxLines)
                for (const line of lines) {
                    expect(line.length * GLYPH * face.text.size, `${current.id} ${name} "${line}"`).toBeLessThanOrEqual((control.width ?? control.size) - 2)
                }
                const shape = shapeBox(control)
                const box = jobBox(control, face.text)
                expect(box.top).toBeGreaterThanOrEqual(shape.top)
                expect(box.bottom).toBeLessThanOrEqual(shape.bottom)
            }
        }
    })

    it('the label boxes of the controls never overlap each other (all 58, any console)', () => {
        const names = Object.keys(face.controls).filter((name) => !face.controls[name].within)
        const boxes = names.map((name) => [name, jobBox(face.controls[name], face.text)])
        for (let i = 0; i < boxes.length; i += 1) {
            for (let j = i + 1; j < boxes.length; j += 1) expect(boxesOverlap(boxes[i][1], boxes[j][1]), `${boxes[i][0]} / ${boxes[j][0]}`).toBe(false)
        }
    })

    it('is squat enough for text of 12 px in a window 860 px high (header 31, readout 79, strip gap 37, padding 6)', () => {
        const viewHeight = face.body.height + 2 * 2
        const scale = 12 / face.text.size
        expect(viewHeight * scale).toBeLessThanOrEqual(860 - 31 - 79 - 37 - 6)
        const viewWidth = face.body.width + 2 * 2
        expect(viewWidth * scale).toBeLessThanOrEqual(440 - 14)
    })

    it('keeps the order of the real device: encoders, three knob rows each with a switch row, faders, pads A to P, bottom row', () => {
        const y = (name) => face.controls[name].y
        expect(y('encoder 4')).toBeLessThan(y('pot 1'))
        expect(y('pot 1')).toBeLessThan(y('pot switch 1'))
        expect(y('pot switch 1')).toBeLessThan(y('pot 5'))
        expect(y('pot switch 5')).toBeLessThan(y('pot 9'))
        expect(y('pot switch 9')).toBeLessThan(y('fader 1'))
        expect(y('fader 4')).toBeLessThan(y('matrix A'))
        expect(y('matrix M')).toBeLessThan(y('layer button'))
        const letters = 'ABCDEFGHIJKLMNOP'.split('')
        letters.forEach((letter, index) => {
            const control = face.controls[`matrix ${letter}`]
            expect([control.y, control.x]).toEqual([face.controls[`matrix ${letters[index - (index % 4)]}`].y, face.controls[`matrix ${letters[index % 4]}`].x])
        })
    })

    it('asks for a window height from the screen, never a fixed 999 or 1000', () => {
        expect(windowFeatures({ availHeight: 922 })).toBe('popup=yes,width=440,height=862')
        expect(windowFeatures({ availHeight: 700 })).toBe('popup=yes,width=440,height=640')
        expect(windowFeatures({ availHeight: 400 })).toBe('popup=yes,width=440,height=600')
        expect(windowFeatures({ availHeight: 2000 })).toBe('popup=yes,width=440,height=1000')
        expect(windowFeatures(null)).toBe('popup=yes,width=440,height=860')
    })

    it('keeps the readout above the dev strip in this window only', () => {
        const css = read('src/perform/midi/k2Window.css')
        const chip = read('src/components/treeChip.css')
        expect(css).toMatch(/body:has\(\.tree-chip\) \.k2w \{ padding-bottom: calc\(var\(--di-space-6\) \+ var\(--di-space-2\)\); \}/)
        expect(chip).not.toMatch(/k2w/)
    })
})
