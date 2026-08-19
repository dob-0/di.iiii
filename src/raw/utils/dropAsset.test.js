import { describe, expect, it } from 'vitest'
import {
    describeRejectedFiles,
    partitionDroppedFiles,
    pickNodeTypeForFile,
    resolveDropScopeId
} from './dropAsset.js'

// Browsers set File.type from the OS mime table, which has no entry for .glb
// on most Linux desktops — the real drop that motivated this arrives with an
// EMPTY type and only a filename to go on. Every model case below is written
// that way on purpose.
const file = (name, type = '') => ({ name, type })

describe('pickNodeTypeForFile', () => {
    it('recognises every model format the loader actually supports, by name alone', () => {
        for (const name of ['scan.glb', 'scan.gltf', 'scan.obj', 'scan.stl', 'scan.fbx']) {
            expect(pickNodeTypeForFile(file(name)), name).toBe('geom.model')
        }
    })

    it('recognises video, sound and images', () => {
        expect(pickNodeTypeForFile(file('clip.mp4', 'video/mp4'))).toBe('media.video')
        expect(pickNodeTypeForFile(file('take.mov'))).toBe('media.video')
        expect(pickNodeTypeForFile(file('score.wav', 'audio/wav'))).toBe('media.audio')
        expect(pickNodeTypeForFile(file('score.mp3'))).toBe('media.audio')
        expect(pickNodeTypeForFile(file('poster.png', 'image/png'))).toBe('view.image')
    })

    it('is honest about what it cannot take', () => {
        expect(pickNodeTypeForFile(file('notes.txt', 'text/plain'))).toBeNull()
        expect(pickNodeTypeForFile(file('sheet.pdf', 'application/pdf'))).toBeNull()
        expect(pickNodeTypeForFile(null)).toBeNull()
    })

    it('does not trust a generic mime over the filename', () => {
        // Chrome hands .glb over as application/octet-stream; trusting that
        // blindly is how a model becomes "unsupported file".
        expect(pickNodeTypeForFile(file('scan.glb', 'application/octet-stream'))).toBe('geom.model')
    })
})

describe('partitionDroppedFiles', () => {
    it('splits a mixed drop instead of failing the whole thing', () => {
        const { accepted, rejected } = partitionDroppedFiles([
            file('scan.glb'),
            file('notes.txt', 'text/plain'),
            file('clip.mp4', 'video/mp4')
        ])
        expect(accepted.map((entry) => entry.typeId)).toEqual(['geom.model', 'media.video'])
        expect(rejected.map((entry) => entry.name)).toEqual(['notes.txt'])
    })

    it('survives an empty or absent drop', () => {
        expect(partitionDroppedFiles()).toEqual({ accepted: [], rejected: [] })
        expect(partitionDroppedFiles([])).toEqual({ accepted: [], rejected: [] })
    })
})

describe('resolveDropScopeId', () => {
    // A stand-in for the DOM: an element whose closest() finds a world panel.
    const panel = (scopeAttr) => ({
        closest: (selector) => (selector === '[data-world-scope-id]'
            ? { getAttribute: () => scopeAttr }
            : null)
    })
    const bare = { closest: () => null }

    it('drops into the room you dropped on', () => {
        expect(resolveDropScopeId(() => panel('world-7'), 10, 10, null)).toBe('world-7')
    })

    it('falls back to the current scope when the drop missed every room', () => {
        expect(resolveDropScopeId(() => bare, 10, 10, 'scope-3')).toBe('scope-3')
        expect(resolveDropScopeId(() => null, 10, 10, 'scope-3')).toBe('scope-3')
    })

    // The root scope is written as '' because null has no attribute form. A
    // room at root must still be a room, not "no room found".
    it('reads a root-scope room as the root scope, not as a miss', () => {
        expect(resolveDropScopeId(() => panel(''), 10, 10, 'scope-3')).toBeNull()
    })

    it('survives being handed no lookup at all', () => {
        expect(resolveDropScopeId(null, 10, 10, 'scope-3')).toBe('scope-3')
    })
})

describe('describeRejectedFiles', () => {
    it('says nothing when nothing was refused', () => {
        expect(describeRejectedFiles([])).toBe('')
    })

    it('names the files and says what would work', () => {
        const message = describeRejectedFiles([file('notes.txt')])
        expect(message).toContain('notes.txt')
        expect(message).toContain('.glb')
    })

    it('does not recite a hundred filenames at someone', () => {
        const message = describeRejectedFiles(
            Array.from({ length: 12 }, (_, i) => file(`f${i}.txt`))
        )
        expect(message).toContain('and 9 more')
    })
})
