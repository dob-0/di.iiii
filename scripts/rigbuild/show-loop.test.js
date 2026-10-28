import { describe, expect, it } from 'vitest'
import { documentCues, showOfDocument, startCalls } from './show-loop.mjs'

const document = { mappingState: { loop: true, showSource: 'clock', cues: [
    { id: 'v2-01-the-road-in', name: 'The road in', fade: 6, hold: 30, lightLook: 'rig-the-road-in', surfaces: {} },
    { id: 'v2-02-first-light', name: 'First light', fade: 5, hold: 28, lightLook: 'rig-first-light', surfaces: {} }
] } }

describe('show-loop with no --show/--rig: the document\'s own cues are the show (2026-10-15)', () => {
    it('reads the cue list back into the show shape, look ids without the desk prefix, ids kept', () => {
        const show = showOfDocument(document, 'moxir-v2-11')
        expect(show).toMatchObject({ project: 'moxir-v2-11', loop: true, source: 'clock', fromDocument: true })
        expect(show.cues).toEqual([
            { id: 'v2-01-the-road-in', look: 'the-road-in', name: 'The road in', fade: 6, hold: 30 },
            { id: 'v2-02-first-light', look: 'first-light', name: 'First light', fade: 5, hold: 28 }
        ])
    })
    it('the runner gets the document\'s cues as they are: same ids, same desk look ids', () => {
        expect(documentCues(document).map((c) => [c.id, c.lightLook])).toEqual([['v2-01-the-road-in', 'rig-the-road-in'], ['v2-02-first-light', 'rig-first-light']])
    })
    it('a document without scenes says so instead of falling back to a built-in show', () => {
        expect(() => showOfDocument({ mappingState: { cues: [] } }, 'empty')).toThrow(/no cue list/)
        expect(() => showOfDocument({}, 'none')).toThrow(/no cue list/)
    })
})

describe('a show the desk plays never keeps a clock (MOXIR 2026-10-17)', () => {
    it('clockOffOps takes showSource clock off, and leaves any other document alone', async () => {
        const { clockOffOps } = await import('./show-loop.mjs')
        expect(clockOffOps({ mappingState: { showSource: 'clock', cues: [] } })).toEqual([{ type: 'setMappingState', payload: { patch: { showSource: 'desk' } } }])
        expect(clockOffOps({ mappingState: { cues: [] } })).toEqual([])
        expect(clockOffOps(null)).toEqual([])
    })
})

describe('starting the show turns play-in-order on (MOXIR 2026-10-17)', () => {
    it('GO cue 1, then play in order, in that order: a GO on a named cue turns play-in-order off on the desk', () => {
        expect(startCalls()).toEqual([['/api/cues/go', { index: 0 }], ['/api/cues/autoplay', { autoplay: true }]])
    })
})
