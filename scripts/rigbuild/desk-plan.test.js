import { describe, expect, it } from 'vitest'
import library from '../../src/rigbuild/types/moxir.json'
import { exactProblems, planDesk } from './desk-plan.mjs'

// desk-plan.mjs (RIG_BUILD.md §19.5): the chosen version goes on its desk at EXACTLY the
// document's addresses, or the plan fails. Run on the desk's own code, offline (no port bound,
// nothing transmitted), on a throwaway copy of a show.

const beam = (id, universe, address, index) => ({
    id, type: 'spotLight', name: id,
    components: { transform: { position: [0, 0.7, 0], rotation: [0, 0, 0] }, fixture: { type: 'up-b380f', mode: '16ch', universe, address, index } }
})
const looks = { id: 'rig-show', type: 'group', components: { rigLooks: { looks: [{ id: 'a', title: 'A', aims: {}, colours: {}, levels: {} }] } } }
const cues = [{ id: 'show-01-a', name: 'A', fade: 0, hold: 4, lightLook: 'rig-a' }]

// A desk saved by desk.js: another version's 16ch head at U1.001, its look, its cue list running.
const showWith = (fixtures) => ({
    master: 255, blackout: false, groups: [], scenes: [], layers: [], looks: [{ id: 'rig-old', name: 'old', steps: [{ values: {} }] }],
    customProfiles: [{ name: 'UP-B380F 16ch', channels: Array.from({ length: 16 }, (_, i) => `ch${i + 1}`), cat: '_RIG' }],
    fixtures,
    cues: { project: 'other', list: [{ id: 'c', name: 'old', lookId: 'rig-old', hold: 4, fade: 0 }], loop: true, index: 0, running: true }
})
const deskFixture = (id, universe0, address, index, rigKey) => ({ id, index, name: id, universe: universe0, address, profile: 'UP-B380F 16ch', values: {}, ...(rigKey ? { rigKey } : {}) })

const plan = (show, entities) => planDesk({ show, space: 'moxir', project: 'p', entities: [...entities, looks], cues, library })

describe('desk-plan.mjs — exact or fail', () => {
    it('takes another version off the desk and patches the chosen one exactly where the document says', async () => {
        const out = await plan(showWith([deskFixture('fxold', 0, 1, 1, 'other:rig-a-01')]), [beam('rig-beam-01', 1, 1, 1), beam('rig-beam-02', 1, 17, 2)])
        expect(out.removed).toMatchObject({ other: 1 })
        expect(out.planned.fixtures.map((f) => `${f.rigKey} #${f.index} U${f.universe + 1}.${f.address}`)).toEqual(['p:rig-beam-01 #1 U1.1', 'p:rig-beam-02 #2 U1.17'])
        expect(out.planned.looks.map((l) => l.id)).toEqual(['rig-a'])
        expect(out.planned.cues).toMatchObject({ project: 'p', loop: false, running: false })
        expect('output' in out.planned).toBe(false)
    })

    it('FAILS when the document gives two lamps one address — the desk alone would move one to the next free slot', async () => {
        // Without the rule, rigpatch.js treats the second lamp as a "copy" and patches it at U1.017
        // with no flag at all: the crew's sheet (U1.001) and the real DMX would disagree.
        await expect(plan(showWith([]), [beam('rig-beam-01', 1, 1, 1), beam('rig-beam-02', 1, 1, 2)]))
            .rejects.toMatchObject({ problems: [expect.stringMatching(/rig-beam-02 \(U1\.001\) overlaps p:rig-beam-01/)] })
    })

    it('FAILS when a fixture the operator patched by hand sits on a lamp\'s channels — never moved, never removed', async () => {
        await expect(plan(showWith([deskFixture('fxmine', 0, 9, 40)]), [beam('rig-beam-01', 1, 1, 1)]))
            .rejects.toMatchObject({ problems: [expect.stringMatching(/overlaps 40\.fxmine at U1\.009, which stays on the desk/)] })
    })

    it('names a lamp with no address and a lamp past 512 (pure)', () => {
        const p = exactProblems([
            { key: 'p:a', footprint: 16, universe: null, address: null },
            { key: 'p:b', footprint: 16, universe: 1, address: 500 }
        ])
        expect(p).toEqual(['p:a: the document gives it no address', 'p:b: 16 ch from U1.500 run past 512'])
    })
})
