import { afterEach, describe, expect, it } from 'vitest'
import {
    clearLocalWorkspaceDocument,
    readLocalWorkspaceDocument,
    writeLocalWorkspaceDocument
} from './localWorkspaceStorage.js'

const STORAGE_KEY = 'dii.localNodeWorkspace.test'

describe('localWorkspaceStorage', () => {
    afterEach(() => {
        window.localStorage.removeItem(STORAGE_KEY)
    })

    it('persists and reads a local node workspace document', () => {
        const document = {
            rootNodeId: 'root-node',
            nodes: [{ id: 'world-root', definitionId: 'world.root' }]
        }

        expect(writeLocalWorkspaceDocument(STORAGE_KEY, document)).toBe(true)
        expect(readLocalWorkspaceDocument(STORAGE_KEY)).toEqual(document)
    })

    it('clears a local node workspace document', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: [] }))

        expect(clearLocalWorkspaceDocument(STORAGE_KEY)).toBe(true)
        expect(readLocalWorkspaceDocument(STORAGE_KEY)).toBeNull()
    })

    it('treats corrupt persisted data as empty', () => {
        window.localStorage.setItem(STORAGE_KEY, '{bad json')

        expect(readLocalWorkspaceDocument(STORAGE_KEY)).toBeNull()
    })
})
