import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// "When I zoom max I can't move — the camera feels stuck" (owner, 2026-09-02).
// CameraControls stops dead at minDistance and every drag then orbits a pivot a
// hand's width in front of the lens. `infinityDolly` is the one switch that turns
// zoom-past-the-minimum into moving forward. StudioViewport is a full R3F tree that
// needs a WebGL context jsdom will not give it, so — like liveProjectSceneSeams.test.js
// next door — this reads the file and holds the shape: the prop stays on the ONE
// orbit rig that Studio, the public viewer and the hub all share.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(path.join(HERE, 'StudioViewport.jsx'), 'utf8')

describe('StudioOrbit keeps moving past the minimum zoom distance', () => {
    it('renders CameraControls with infinityDolly on', () => {
        const start = SOURCE.indexOf('<CameraControls')
        expect(start).toBeGreaterThan(-1)
        const end = SOURCE.indexOf('/>', start)
        const props = SOURCE.slice(start, end)
        expect(props).toMatch(/\binfinityDolly\b/)
        // and it must not be switched off in the same element
        expect(props).not.toMatch(/infinityDolly=\{\s*false\s*\}/)
    })

    it('still has a finite minimum distance for the dolly to pivot from', () => {
        const start = SOURCE.indexOf('<CameraControls')
        const props = SOURCE.slice(start, SOURCE.indexOf('/>', start))
        expect(props).toMatch(/minDistance=\{\s*0?\.\d+\s*\}/)
    })
})
