import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The wheel used to die at camera-controls' minDistance: a room's Inside lock holds the camera
// ≥ 2 m from its target (SmartView INSIDE_MIN_DISTANCE), so from MOXIR's landing view the zoom
// moved 15 m in 6 steps and then nothing for the next 34 (2026-10-04). infinityDolly carries the
// target forward with the camera instead; the target stays inside its boundary. The controls are
// mounted through drei, whose props become the instance's fields, so the prop is the contract.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(here, 'StudioViewport.jsx'), 'utf8')

describe('the viewport zoom', () => {
    it('never stops at the minimum distance: the camera controls dolly through (infinityDolly)', () => {
        const controls = source.slice(source.indexOf('<CameraControls'), source.indexOf('/>', source.indexOf('<CameraControls')))
        expect(controls).toMatch(/\binfinityDolly(\s|=\{true\})/)
    })
})
