import { describe, expect, it } from 'vitest'
import { scenesOf } from './scenesOf.js'

const doc = (showId) => ({
    entities: [
        { id: 'lamp-1', components: {} },
        { id: showId, components: { rigLooks: { looks: [{ id: 'the-wall', title: 'The wall', intent: 'everything on the back wall' }, { id: 'peak', title: 'Peak' }] } } },
    ],
    mappingState: { cues: [{ id: 'c1', lightLook: 'rig-the-wall', hold: 8 }, { id: 'c2', lightLook: 'rig-peak' }, { id: 'c3' }] },
})

describe('scenesOf — the show is the entity that carries the looks', () => {
    it('lists the cues with their look titles, whatever the show entity is called', () => {
        for (const id of ['rig-show', 'show', 'the-production-lights']) {
            expect(scenesOf(doc(id))).toEqual([
                { cueId: 'c1', lookId: 'the-wall', name: 'The wall', title: 'The wall', intent: 'everything on the back wall', hold: 8 },
                { cueId: 'c2', lookId: 'peak', name: 'Peak', title: 'Peak', intent: '', hold: null },
            ])
        }
    })

    it('is empty with no document', () => {
        expect(scenesOf(null)).toEqual([])
    })
})
