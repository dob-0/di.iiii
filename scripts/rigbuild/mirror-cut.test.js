import { describe, expect, it } from 'vitest'
import { isCut, mirrorCut, mirrorEntity } from './mirror-cut.mjs'

const ent = (name, position, rotation = [0, 0, 0]) => ({ id: name, name, components: { transform: { position, rotation, scale: [1, 1, 1] } } })

describe('mirrorCut', () => {
    it('mirrors only the cut: the truss and what hangs on it, never the hall or a floor lamp', () => {
        const doc = { entities: [ent('MOXIR — the hall', [0, 0, 0]), ent('truss line (hung from the crane bridge, sloped)', [-4.588, 3.98, 4.8], [0, 0, 0.2618]), ent('UP-B380F beam380-columns 1', [-11, 0.3, 24])] }
        const { doc: next, moved } = mirrorCut(doc)
        expect(moved.map((m) => m.id)).toEqual(['truss line (hung from the crane bridge, sloped)'])
        expect(next.entities[0]).toEqual(doc.entities[0])
        expect(next.entities[2]).toEqual(doc.entities[2])
        expect(next.entities[1].components.transform.position).toEqual([4.588, 3.98, 4.8])
        expect(next.entities[1].components.transform.rotation).toEqual([0, -0, -0.2618])
    })

    it('a mirror of a mirror is the original (nothing drifts)', () => {
        const e = ent('UP-PL5403 par-cut-x 1', [-4.687, 3.58, 4.8], [3.141592654, 0.3, 1.481503537])
        expect(mirrorEntity(mirrorEntity(e)).components.transform).toEqual({ position: [-4.687, 3.58, 4.8], rotation: [3.141592654, 0.3, 1.481503537], scale: [1, 1, 1] })
    })

    it('keeps the names true: sides swap, a pick u changes sign', () => {
        expect(mirrorEntity(ent('Tie-off hl: house-left end to the nave column at x −11.6', [-6, 3.6, 4.8])).name).toBe('Tie-off hr: house-right end to the nave column at x +11.6')
        expect(mirrorEntity(ent('Bridle leg, pick 1/3 (u -5.75 m)', [-5, 7, 4.8])).name).toBe('Bridle leg, pick 1/3 (u 5.75 m)')
        expect(mirrorEntity(ent('Bridle leg, pick 3/3 (u 5.25 m)', [5, 7, 4.8])).name).toBe('Bridle leg, pick 3/3 (u −5.25 m)')
    })

    it('knows the cut by its names', () => {
        expect(isCut({ name: 'EXT-LC-ULTRA-MK2 lasercube-cut 3' })).toBe(true)
        expect(isCut({ name: 'UP-PL5403 par-columns 3' })).toBe(false)
        expect(isCut({ name: 'EXT-HAZER hazer 1' })).toBe(false)
    })
})
