import { describe, expect, it } from 'vitest'
import { copiedEntities, labelled, repointProjectUrls } from './copy-version.mjs'

describe('copy-version: a version kept as a labelled copy (RIG_BUILD §15.11)', () => {
    it('puts the label before the " — " so the switch button carries it', () => {
        expect(labelled('Minimal — the cut, simple: fixed lights only', 'old hall 09-29')).toBe('Minimal · old hall 09-29 — the cut, simple: fixed lights only')
        expect(labelled('Minimal · halo', 'old hall 09-29')).toBe('Minimal · halo · old hall 09-29')
        expect(labelled('The cut, full: moving heads on the line', 'old hall 09-29')).toBe('The cut, full: moving heads on the line · old hall 09-29')
    })

    it('points only the source project\'s URLs at the copy', () => {
        const doc = {
            assets: [{ id: 'a', url: '/serverXR/api/projects/moxir-hall-minimal/assets/a' }],
            other: '/serverXR/api/projects/moxir-hall-minimal-halo/assets/b',
            n: 3
        }
        const out = repointProjectUrls(doc, 'moxir-hall-minimal', 'moxir-hall-minimal-oldhall-0929')
        expect(out.assets[0].url).toBe('/serverXR/api/projects/moxir-hall-minimal-oldhall-0929/assets/a')
        expect(out.other).toBe('/serverXR/api/projects/moxir-hall-minimal-halo/assets/b')
        expect(out.n).toBe(3)
        expect(doc.assets[0].url).toBe('/serverXR/api/projects/moxir-hall-minimal/assets/a')
    })

    it('changes the version mark alone, and says what it is a copy of', () => {
        const lamp = { id: 'rig-par-1', type: 'spotLight', components: { fixture: { index: 111, universe: 1, address: 101 } } }
        const show = { id: 'rig-show', type: 'group', components: { rigLooks: { looks: [] }, rigVariant: { set: 's', id: 'minimal', title: 'Minimal — the cut', siblings: [{ id: 'minimal' }, { id: 'x' }] } } }
        const siblings = [{ id: 'minimal', projectId: 'p' }, { id: 'minimal-oldhall-0929', projectId: 'p-oldhall-0929' }]
        const [l, s] = copiedEntities([lamp, show], { from: 'p', to: 'p-oldhall-0929', label: 'old hall 09-29', suffix: 'oldhall-0929', siblings })
        expect(l).toBe(lamp)
        expect(l.components.fixture).toEqual({ index: 111, universe: 1, address: 101 })
        expect(s.components.rigLooks).toBe(show.components.rigLooks)
        expect(s.components.rigVariant).toMatchObject({ set: 's', id: 'minimal-oldhall-0929', title: 'Minimal · old hall 09-29 — the cut', copyOf: { projectId: 'p', id: 'minimal', label: 'old hall 09-29' }, siblings })
        const [, keep] = copiedEntities([lamp, show], { from: 'p', to: 'q', label: 'old', suffix: 'old' })
        expect(keep.components.rigVariant.siblings).toEqual(show.components.rigVariant.siblings)
    })
})
