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

    it('retries a failed op batch instead of dropping it, and surfaces a visible error until it clears', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'studio-project', title: 'Studio Project' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        let attempt = 0
        submitProjectOpsMock.mockImplementation(async (_projectId, _baseVersion, ops) => {
            attempt += 1
            if (attempt === 1) {
                const error = new Error('Network error')
                error.status = 500
                throw error
            }
            return { newVersion: 2, ops }
        })

        const { result } = renderHook(() => {
            const store = useProjectStore()
            const sync = useProjectDocumentSync({ projectId: 'studio-project', store })
            return { store, sync }
        })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('studio-project')
        })

        act(() => {
            result.current.sync.applyLocalOps({
                type: 'setPresentationState',
                payload: { patch: { mode: 'code', codeHtml: '<main>Retry me</main>' } }
            })
        })

        // First attempt failed: the optimistic edit must still be present
        // (never silently dropped), and a visible error must be set.
        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBeTruthy()
        })
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Retry me')
        expect(result.current.store.state.version).toBe(1)

        // Automatic retry (SYNC_RETRY_DELAY_MS) succeeds: version advances and
        // the error clears, with no user action required.
        await waitFor(() => {
            expect(result.current.store.state.version).toBe(2)
        }, { timeout: 8000 })
        expect(submitProjectOpsMock).toHaveBeenCalledTimes(2)
        expect(result.current.store.state.pendingSyncError).toBeNull()
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Retry me')
    }, 10000)

    // Regression test for the 2026-07-16 audit finding: a 401 (expired
    // session) used to be treated exactly like a transient 500 — retried
    // forever every SYNC_RETRY_DELAY_MS with a generic "sync failed" message,
    // giving the user no signal that reloading/re-authenticating (not
    // waiting) is what's actually needed.
    it('on a 401, stops auto-retrying and surfaces authExpired instead of looping forever — but never drops the edit', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'studio-project', title: 'Studio Project' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        submitProjectOpsMock.mockImplementation(async () => {
            const error = new Error('Unauthorized')
            error.status = 401
            throw error
        })

        const { result } = renderHook(() => {
            const store = useProjectStore()
            const sync = useProjectDocumentSync({ projectId: 'studio-project', store })
            return { store, sync }
        })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('studio-project')
        })

        act(() => {
            result.current.sync.applyLocalOps({
                type: 'setPresentationState',
                payload: { patch: { mode: 'code', codeHtml: '<main>Keep me</main>' } }
            })
        })

        await waitFor(() => {
            expect(result.current.store.state.authExpired).toBe(true)
        })
        expect(result.current.store.state.pendingSyncError).toMatch(/session has expired|session expired/i)
        // The edit must still be applied locally — a 401 must never drop
        // unsaved work, same guarantee as the generic-failure retry path.
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Keep me')

        // No auto-retry: waiting past SYNC_RETRY_DELAY_MS must NOT produce
        // another submitProjectOps call on its own.
        const callsRightAfter = submitProjectOpsMock.mock.calls.length
        await new Promise((resolve) => setTimeout(resolve, 4500))
        expect(submitProjectOpsMock.mock.calls.length).toBe(callsRightAfter)

        // Recovery path: once re-authenticated, retrySync (or the next local
        // edit) flushes the still-queued batch and clears authExpired.
        submitProjectOpsMock.mockImplementation(async (_projectId, _baseVersion, ops) => ({
            newVersion: 2,
            ops
        }))
        await act(async () => {
            await result.current.sync.retrySync()
        })
        await waitFor(() => {
            expect(result.current.store.state.authExpired).toBe(false)
        })
        expect(result.current.store.state.version).toBe(2)
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Keep me')
    }, 10000)
})
