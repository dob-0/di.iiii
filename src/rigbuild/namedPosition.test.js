import { describe, expect, it } from 'vitest'

import { MOUNT_POSITION } from './mountPosition.js'
import { namedPositionKey } from './looks.js'
import { groupKeys } from '../../scripts/rigbuild/looks.mjs'

// 2026-10-02 (known-full's curtain): two groups of one type on the same mount (the X's six
// PL5403 and the curtain's seven, both hung under the cut) landed on one look key, and the
// build refused it. A group that says `named: true` gets its own position, the way the halo's
// groups do, so a look can aim and light each on its own.
describe('a group that names its own position', () => {
    it('keeps the cut\'s two hung PAR groups apart', () => {
        const rig = {
            classes: { par: { code: 'UP-PL5403' } },
            groups: [
                { id: 'par-cut-x', class: 'par', mount: 'truss-header' },
                { id: 'par-cut-curtain', class: 'par', mount: 'truss-header', named: true }
            ]
        }
        const keys = groupKeys(rig)
        expect(keys.get('par-cut-x')).toBe('truss/up-pl5403')
        expect(keys.get('par-cut-curtain')).toBe('named-par-cut-curtain/up-pl5403')
    })
    it('still refuses two unnamed groups on one key', () => {
        const rig = {
            classes: { par: { code: 'UP-PL5403' } },
            groups: [{ id: 'a', class: 'par', mount: 'truss-header' }, { id: 'b', class: 'par', mount: 'truss-header' }]
        }
        expect(() => groupKeys(rig)).toThrow(/could not tell them apart/)
    })
    it('reads the lamp\'s own words back to the same key the looks were keyed by', () => {
        expect(MOUNT_POSITION['truss-header']({ id: 'par-cut-curtain', named: true })).toBe('named-par-cut-curtain')
        expect(MOUNT_POSITION['truss-header']({ id: 'par-cut-x' })).toBe('truss')
        expect(namedPositionKey({ position: 'named par cut curtain' })).toBe('named-par-cut-curtain')
        expect(namedPositionKey({ position: 'halo par halo ring' })).toBe('halo-par-halo-ring')
        expect(namedPositionKey({ position: 'truss header' })).toBe(null)
    })
})
