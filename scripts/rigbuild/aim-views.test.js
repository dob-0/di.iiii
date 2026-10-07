// @vitest-environment node
//
// The room's entry camera and view buttons follow the stage-line design (2026-10-07): before, the entry camera stood
// at z 20.2 — behind the new stage — looking at the press.
import { describe, expect, it } from 'vitest'

import { stageFrame } from '../place/rig-lib.mjs'
import { presentationPatch, viewsFor } from './aim-views.mjs'
import { loadInputs, stageLineRig } from './stage-line.mjs'

const inputs = loadInputs()
const stage = stageFrame(stageLineRig(inputs), inputs.hall)
const views = viewsFor({ design: inputs.design, stage, hall: inputs.hall })

describe('viewsFor', () => {
    it('puts the entry camera in the audience, in front of the line, looking back at the stage', () => {
        const { position, target } = views.fixedCamera
        expect(position).toEqual([0, 1.65, 41])
        expect(position[2]).toBeGreaterThan(inputs.design.barrier.z_m)
        expect(target[2]).toBeLessThan(position[2])
        // between the DJ's head (0.2 + 1.75) and the girder (7.95), over the bridge's line
        expect(target).toEqual([0, 4.95, 24])
    })
    it('keeps the DJ and the bridge both in the entry frame (vertical fov 55)', () => {
        const { position: p, target: t, fov } = views.fixedCamera
        const pitch = Math.atan2(t[1] - p[1], p[2] - t[2])
        const angle = (y, z) => Math.atan2(y - p[1], p[2] - z) - pitch
        const half = (fov / 2) * Math.PI / 180
        expect(Math.abs(angle(0.2 + 1.75, 23.3))).toBeLessThan(half)
        expect(Math.abs(angle(8.75, 24))).toBeLessThan(half)
    })
    it('aims Floor at the DJ\'s head and DJ out from the step to the floor\'s middle', () => {
        const [floor, dj] = views.presets
        expect(floor).toMatchObject({ id: 'floor', position: [0, 1.7, 41], target: [0, 1.95, 23.3] })
        expect(dj).toMatchObject({ id: 'dj', position: [0, 1.85, 23.3], target: [0, 1.6, 36.9] })
    })
})

describe('presentationPatch', () => {
    it('replaces our presets by id, keeps the others and their extra fields', () => {
        const current = { viewPresets: [{ id: 'floor', position: [0, 1.7, 50], target: [0, 5.5, 4], fov: 60, label: 'Floor', note: 'x' }, { id: 'other', position: [1, 1, 1] }] }
        const patch = presentationPatch(current, views)
        expect(patch.viewPresets.map((p) => p.id)).toEqual(['floor', 'other', 'dj'])
        expect(patch.viewPresets[0]).toMatchObject({ target: [0, 1.95, 23.3], note: 'x' })
        expect(patch.fixedCamera.position).toEqual([0, 1.65, 41])
    })
})
