import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectDocumentSync } from './useProjectDocumentSync.js'
import { useProjectStore } from '../state/projectStore.js'

const connectMock = vi.fn()
const disconnectMock = vi.fn()
const getProjectDocumentMock = vi.fn()
const listProjectOpsMock = vi.fn()
const submitProjectOpsMock = vi.fn()
const updateProjectDocumentMock = vi.fn()
const buildProjectEventsUrlMock = vi.fn((projectId) => `/api/projects/${projectId}/events`)

vi.mock('../services/projectSyncService.js', () => ({
    createProjectSyncService: () => ({
        connect: (...args) => connectMock(...args),
        disconnect: (...args) => disconnectMock(...args)
    })
}))

vi.mock('../services/projectsApi.js', () => ({
    buildProjectEventsUrl: (...args) => buildProjectEventsUrlMock(...args),
    getProjectDocument: (...args) => getProjectDocumentMock(...args),
    listProjectOps: (...args) => listProjectOpsMock(...args),
    submitProjectOps: (...args) => submitProjectOpsMock(...args),
    updateProjectDocument: (...args) => updateProjectDocumentMock(...args)
}))

describe('useProjectDocumentSync', () => {
    afterEach(() => {
        connectMock.mockReset()
        disconnectMock.mockReset()
        getProjectDocumentMock.mockReset()
        listProjectOpsMock.mockReset()
        submitProjectOpsMock.mockReset()
        updateProjectDocumentMock.mockReset()
        buildProjectEventsUrlMock.mockClear()
    })

    it('keeps optimistic document changes after a successful save acknowledgement', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: {
                    id: 'studio-project',
                    title: 'Studio Project'
                },
                presentationState: {
                    mode: 'scene',
                    entryView: 'scene',
                    codeHtml: ''
                },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({
            ops: [],
            latestVersion: 1
        })
        submitProjectOpsMock.mockImplementation(async (_projectId, _baseVersion, ops) => ({
            newVersion: 2,
            ops
        }))

        const { result } = renderHook(() => {
            const store = useProjectStore()
            const sync = useProjectDocumentSync({
                projectId: 'studio-project',
                store
            })
            return {
                store,
                sync
            }
        })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('studio-project')
        })

        act(() => {
            result.current.sync.applyLocalOps({
                type: 'setPresentationState',
                payload: {
                    patch: {
                        mode: 'code',
                        codeHtml: '<main>Live Studio Preview</main>'
                    }
                }
            })
        })

        await waitFor(() => {
            expect(result.current.store.state.version).toBe(2)
        })

        expect(result.current.store.state.document.presentationState.mode).toBe('code')
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Live Studio Preview')
    })
})
