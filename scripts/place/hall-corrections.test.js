// @vitest-environment node
// 2026-10-02 hall corrections (the owner's check of the photographs; emily-41's researchers): the
// layer file says what changed and the committed hall record (what the rig is hung against) agrees.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from './common.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/place/rigs', f), 'utf8'))
const layer = read('moxir-hall-dims-2026-10-02.json')
const hall = read('moxir-hall-2026-10-02-crane-dj.hall.json').geometry

describe('the 2026-10-02 hall corrections', () => {
    it('the left low wall is two closed bays and the right row has no wall', () => {
        expect(layer.low_walls).toHaveLength(1)
        expect(layer.low_walls[0].row).toBe('left')
        const [a, b] = layer.low_walls[0].from_door_m
        expect(b - a).toBe(12)
        expect(layer.low_walls[0].seen).toMatch(/004/)
    })
    it('every change carries a source (photo ids or the standard)', () => {
        expect(layer.sources.photos).toMatch(/004/)
        expect(layer.sources.standards).toMatch(/e\.txt/)
        expect(layer.notes.join(' ')).toMatch(/Kislovodsk/)
    })
    it('the nave crane\'s cab hangs at the +x end, clear of the rig\'s x range, and the trolley stays on its side', () => {
        for (const crane of hall.cranes) expect(crane.cab.x_m[0]).toBeGreaterThan(8)
        expect(hall.cranes[0].trolley.x_m[0]).toBeGreaterThan(7)
    })
    it('the roof underside is 10.8 m with the 2.5 m space frame above it, and the lantern is 3.2 m', () => {
        expect(hall.truss_bottom_m).toBe(10.8)
        expect(Math.round((hall.truss_top_centre_m - hall.truss_bottom_m) * 100) / 100).toBe(2.5)
        expect(layer.lantern_h_m).toBe(3.2)
    })
})
