import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import face from './xone-k2-face.json'
import { boxesOverlap, faceLines, faderCapBox, jobBox, shapeBox, shortLayer } from './k2Face.js'
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
    it('every label of every console fits its pad: at most wrapChars glyphs of the drawn size across the pad, its own line count, never cut, inside it', () => {
        expect(pads).toHaveLength(16)
        for (const current of K2_CONSOLES) {
            const labels = jobsFor(current.map, current, 0)
            for (const [name, control] of pads) {
                const lines = faceLines(control, labels[name], face.text)
                expect(lines.length, `${current.id} ${name}`).toBeLessThanOrEqual(control.maxLines ?? face.text.maxLines)
                expect(lines.join(' '), `${current.id} ${name} is cut`).toBe(shortLayer(labels[name]))
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

    // ---- round 3b: nothing covers a label, an encoder's two jobs read apart
    const CLEAR = 0.9 // face units: 2.1 px at the 2.33 px per unit the window draws at 440 x 860 (12 px text)
    const EPS = 1e-6
    const gapOf = (a, b) => {
        const gx = Math.max(a.left - b.right, b.left - a.right)
        const gy = Math.max(a.top - b.bottom, b.top - a.bottom)
        return gx > 0 && gy > 0 ? Math.hypot(gx, gy) : Math.max(gx, gy)
    }
    const names = Object.keys(face.controls)
    const faders = names.filter((name) => face.controls[name].kind === 'fader')
    // every shape a label may not touch: each control's shape, and each fader cap at value 0 and at value 127 (named apart)
    const shapesOf = (name) => {
        const control = face.controls[name]
        const out = [[`${name} shape`, shapeBox(control)]]
        if (control.kind === 'fader') out.push([`${name} cap at 0`, faderCapBox(control, 0)], [`${name} cap at 127`, faderCapBox(control, 127)])
        return out
    }

    it('for every console no shape, no fader cap at either end of its travel, and no other label comes within 0.9 unit of a label', () => {
        for (const current of K2_CONSOLES) {
            const labels = jobsFor(current.map, current, 0)
            for (const name of names) {
                const control = face.controls[name]
                if (!faceLines(control, labels[name], face.text).length) continue
                const box = jobBox(control, face.text)
                for (const other of names) {
                    // the only exclusion: a pad's label sits inside its own pad (it stays 1.5 units from the pad's edges, below)
                    if (other === name && control.kind === 'pad') continue
                    for (const [what, shape] of shapesOf(other)) expect(gapOf(box, shape), `${current.id}: label of ${name} vs ${what}`).toBeGreaterThanOrEqual(CLEAR - EPS)
                    if (other === name) continue
                    const partner = face.controls[other].within === name || control.within === other
                    const need = partner ? face.text.lineHeight / 2 : CLEAR
                    expect(gapOf(box, jobBox(face.controls[other], face.text)), `${current.id}: label of ${name} vs label of ${other}`).toBeGreaterThanOrEqual(need - EPS)
                }
                if (control.kind === 'pad') {
                    const pad = shapeBox(control)
                    expect(box.top - pad.top).toBeGreaterThanOrEqual(5.2 + 1.5)
                    expect(pad.bottom - box.bottom).toBeGreaterThanOrEqual(1.4 - EPS)
                }
            }
        }
    })

    it('the cap of every fader at value 0 and at value 127 stays inside the fader shape and clear of every label', () => {
        expect(faders).toHaveLength(4)
        for (const name of faders) {
            const control = face.controls[name]
            const shape = shapeBox(control)
            for (const value of [0, 127]) {
                const cap = faderCapBox(control, value)
                expect(cap.top, `${name} ${value}`).toBeGreaterThanOrEqual(shape.top - EPS)
                expect(cap.bottom, `${name} ${value}`).toBeLessThanOrEqual(shape.bottom + EPS)
                for (const other of names) expect(gapOf(cap, jobBox(face.controls[other], face.text)), `${name} cap ${value} vs label of ${other}`).toBeGreaterThanOrEqual(CLEAR - EPS)
            }
        }
    })

    it('for every console the turn job and the press job of an encoder are apart by half a text line and the press job is the quiet one', () => {
        const css = read('src/perform/midi/k2Window.css')
        expect(css).toMatch(/\.k2w-control\.is-press \.k2w-job \{ fill: var\(--di-dim\); \}/)
        const encoders = names.filter((name) => /^encoder \d$/.test(name))
        expect(encoders).toHaveLength(6)
        for (const current of K2_CONSOLES) {
            const labels = jobsFor(current.map, current, 0)
            for (const name of encoders) {
                const turn = face.controls[name]
                const press = face.controls[`${name} push`]
                expect(press.within).toBe(name)
                const usedBottom = turn.jobTop + faceLines(turn, labels[name], face.text).length * face.text.lineHeight
                expect(press.jobTop - usedBottom, `${current.id} ${name}`).toBeGreaterThanOrEqual(face.text.lineHeight / 2 - EPS)
                expect(faceLines(turn, labels[name], face.text).length, `${current.id} ${name}`).toBeLessThanOrEqual(2)
            }
        }
    })
})
