import { describe, expect, it } from 'vitest'
import { documentCues, showOfDocument } from './show-loop.mjs'

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
