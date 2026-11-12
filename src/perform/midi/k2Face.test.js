import { describe, expect, it } from 'vitest'
import face from './xone-k2-face.json'
import sheet from './xone-k2-default.json'
import { boxesOverlap, faceOfConsole, faceOfController, faceLines, jobBox, shapeBox, shortLayer, unionBox, wrapJob } from './k2Face.js'
import { K2_CONSOLES } from './xoneK2.js'

const names = Object.keys(face.controls)
const roomOf = (name) => {
    const control = face.controls[name]
    return unionBox(shapeBox(control), jobBox(control, face.text))
}

describe('the K2 face', () => {
    it('lists every control of the controller definition exactly once', () => {
        const wanted = sheet.map((item) => item.control)
        expect(wanted).toHaveLength(58)
        expect([...names].sort()).toEqual([...wanted].sort())
        expect(new Set(names).size).toBe(names.length)
    })

    it('says its body size is assumed and gives every control a kind, a place and a size', () => {
        expect(face.body.assumed).toBe(true)
        for (const name of names) {
            const control = face.controls[name]
            expect(['knob', 'push', 'switch', 'fader', 'pad', 'button']).toContain(control.kind)
            for (const key of ['x', 'y', 'size', 'jobTop']) expect(Number.isFinite(control[key]), `${name}.${key}`).toBe(true)
            expect(typeof control.printed).toBe('string')
        }
    })

    it('keeps every control and its job text inside the body', () => {
        for (const name of names) {
            const box = roomOf(name)
            expect(box.left, name).toBeGreaterThanOrEqual(0)
            expect(box.top, name).toBeGreaterThanOrEqual(0)
            expect(box.right, name).toBeLessThanOrEqual(face.body.width)
            expect(box.bottom, name).toBeLessThanOrEqual(face.body.height)
        }
    })

    it('lets nothing overlap (a push sits inside its own encoder and only there)', () => {
        const clashes = []
        for (let i = 0; i < names.length; i += 1) {
            for (let j = i + 1; j < names.length; j += 1) {
                const a = face.controls[names[i]]
                const b = face.controls[names[j]]
                if (a.within === names[j] || b.within === names[i]) {
                    const [inner, outer] = a.within ? [a, b] : [b, a]
                    const inside = shapeBox(inner)
                    const around = shapeBox(outer)
                    expect(inside.left >= around.left && inside.right <= around.right && inside.top >= around.top && inside.bottom <= around.bottom).toBe(true)
                    // the push's own job text must stay clear of the encoder it sits in
                    expect(boxesOverlap(jobBox(inner, face.text), roomOf(names[j] === a.within ? names[j] : names[i]))).toBe(false)
                    continue
                }
                const ra = a.within ? jobBox(a, face.text) : roomOf(names[i])
                const rb = b.within ? jobBox(b, face.text) : roomOf(names[j])
                if (boxesOverlap(ra, rb)) clashes.push(`${names[i]} / ${names[j]}`)
            }
        }
        expect(clashes).toEqual([])
    })

    it('finds a face for a K2 console and none for another controller', () => {
        for (const item of K2_CONSOLES) expect(faceOfConsole(item)).toBe(face)
        expect(faceOfConsole({ id: 'x', controller: 'SOME OTHER' })).toBeNull()
        expect(faceOfController('XONE:K2')).toBe(face)
    })

    it('wraps a job into short lines', () => {
        expect(wrapJob('Layer 1 level')).toEqual(['Layer 1', 'level'])
        expect(wrapJob('Play column 1')).toEqual(['Play', 'column 1'])
        expect(wrapJob('FX 1 on/off')).toEqual(['FX 1', 'on/off'])
        expect(wrapJob('BPM')).toEqual(['BPM'])
        expect(wrapJob('a very long unbreakable-word here again more')).toHaveLength(2)
        for (const line of wrapJob('a very long unbreakable-word here again more')) expect(line.length).toBeLessThanOrEqual(9)
    })
})

describe('the words a face prints', () => {
    it('shows "Layer N" as "LN" and leaves every other word alone', () => {
        expect(shortLayer('Layer 1 level')).toBe('L1 level')
        expect(shortLayer('Layer 12 level and Layer 3')).toBe('L12 level and L3')
        expect(shortLayer('Layer level')).toBe('Layer level')
        expect(shortLayer('Master fx mix')).toBe('Master fx mix')
        expect(shortLayer(undefined)).toBe('')
    })

    it('wraps to the control\'s own line count', () => {
        expect(faceLines({}, 'Master fx mix', { wrapChars: 9, maxLines: 2 })).toEqual(['Master fx', 'mix'])
        expect(faceLines({ maxLines: 1 }, 'Layer 1 level', { wrapChars: 9, maxLines: 2 })).toEqual(['L1 level'])
    })
})
