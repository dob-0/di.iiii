import { describe, expect, it } from 'vitest'
import { findWalkAtView, parseWalkAt, walkAtSpawn } from './walkAt.js'

const doc = { presentationState: { viewPresets: [
    { id: 'floor', live: true },
    { id: 'room-cafe', label: 'Cafe', position: [14, 1.6, -40], target: [20, 1.6, -48], live: false, link: true },
    { id: 'cafe', position: [99, 9, 99], target: [0, 0, 0], live: true },
    { id: 'secret', position: [0, 1.6, 0], target: [0, 1.6, 5], live: false }
] } }

describe('walkAt (the pose hook)', () => {
    it('reads ?at and ?pose, refuses junk', () => {
        expect(parseWalkAt('?at=cafe')).toEqual({ id: 'cafe' })
        expect(parseWalkAt('?pose=1,1.6,-2,90')).toEqual({ pose: [1, 1.6, -2, 90] })
        expect(parseWalkAt('?pose=1,2')).toBe(null)
        expect(parseWalkAt('?at=<script>')).toBe(null)
        expect(parseWalkAt('')).toBe(null)
    })
    it('finds a room by its room id, and never a work view', () => {
        expect(findWalkAtView(doc.presentationState.viewPresets, 'cafe')?.id).toBe('room-cafe')
        expect(findWalkAtView(doc.presentationState.viewPresets, 'secret')).toBe(null)
        expect(findWalkAtView(doc.presentationState.viewPresets, 'room-cafe')?.id).toBe('room-cafe')
        expect(findWalkAtView(doc.presentationState.viewPresets, 'floor')).toBe(null) // no camera
    })
    it('turns a view into the walker pose, facing its target', () => {
        const s = walkAtSpawn(doc, { id: 'cafe' })
        expect(s.x).toBe(14); expect(s.z).toBe(-40); expect(s.altY).toBe(1.6); expect(s.pitch).toBe(0)
        // forward = (sin yaw, cos yaw) must point at the target
        expect(Math.sin(s.yaw)).toBeCloseTo(6 / 10, 5); expect(Math.cos(s.yaw)).toBeCloseTo(-8 / 10, 5)
        const p = walkAtSpawn(doc, { pose: [1, 1.6, 2, 90] })
        expect(p.yaw).toBeCloseTo(Math.PI / 2, 6); expect(p.altY).toBe(1.6)
        expect(walkAtSpawn(doc, { id: 'nowhere' })).toBe(null)
    })
})

import { normalizeViewData, toStoredViews } from '../project/viewport/smartView/viewData.js'
describe('a linkable view survives the Studio writing the list back', () => {
    it('keeps link through normalize + store', () => {
        const stored = toStoredViews(normalizeViewData(doc.presentationState.viewPresets))
        expect(stored.find((v) => v.id === 'room-cafe')).toMatchObject({ live: false, link: true })
        expect(stored.find((v) => v.id === 'secret').link).toBeUndefined()
    })
})
