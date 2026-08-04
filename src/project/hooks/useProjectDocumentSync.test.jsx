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

    // Regression test for the 2026-07-17 perf audit: applyLocalOps used to
    // call flushQueue synchronously every time -- a continuous edit (slider
    // drag) firing many ops per second produced roughly one POST per event.
    // Rapid successive calls within the throttle window must now coalesce
    // into a single submitProjectOps call carrying every op, not one call
    // each.
    it('coalesces rapid successive applyLocalOps calls into a single network request', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'studio-project', title: 'Studio Project' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        submitProjectOpsMock.mockImplementation(async (_projectId, _baseVersion, ops) => ({
            newVersion: 2,
            ops
        }))

        const { result } = renderHook(() => {
            const store = useProjectStore()
            const sync = useProjectDocumentSync({ projectId: 'studio-project', store })
            return { store, sync }
        })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('studio-project')
        })

        // Five rapid "drag" updates fired back-to-back, well within the
        // throttle window -- these must all land in ONE network request.
        act(() => {
            for (let i = 0; i < 5; i += 1) {
                result.current.sync.applyLocalOps({
                    type: 'setPresentationState',
                    payload: { patch: { mode: 'code', codeHtml: `<main>Drag frame ${i}</main>` } }
                })
            }
        })

        await waitFor(() => {
            expect(result.current.store.state.version).toBe(2)
        })

        expect(submitProjectOpsMock).toHaveBeenCalledTimes(1)
        expect(submitProjectOpsMock.mock.calls[0][2]).toHaveLength(5)
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Drag frame 4')
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

    // Regression test for the 2026-07-17 audit finding: a sustained version
    // conflict (409) used to catch-up-and-resubmit with no cap at all -- a
    // client that can never win a version race against a faster concurrent
    // writer would retry instantly forever. It must now give up after
    // MAX_CONSECUTIVE_CONFLICT_RETRIES, surface a visible error, and fall
    // back to the same delayed-retry path as any other failure (which then
    // succeeds once the race clears).
    it('gives up resubmitting after sustained 409 conflicts and falls back to a delayed retry', async () => {
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
            if (attempt <= 6) {
                const error = new Error('Version conflict')
                error.status = 409
                error.data = { latestVersion: 1, pendingOps: [] }
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
                payload: { patch: { mode: 'code', codeHtml: '<main>Conflict me</main>' } }
            })
        })

        // Six consecutive 409s (past the cap) must stop resubmitting
        // instantly and surface a visible error -- never drop the edit.
        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBeTruthy()
        })
        expect(attempt).toBe(6)
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Conflict me')

        // The delayed retry (SYNC_RETRY_DELAY_MS) then succeeds once the mock
        // stops conflicting, same as the generic-error retry path.
        await waitFor(() => {
            expect(result.current.store.state.version).toBe(2)
        }, { timeout: 8000 })
        expect(result.current.store.state.pendingSyncError).toBeNull()
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

    // Regression test for audit batch 2: on a 409 with no pendingOps the batch
    // is already spliced off the queue when the catch-up GET runs. If that GET
    // threw, the exception unwound past the re-queue and the edit was gone —
    // the exact failure the "never drop an edit" contract exists to prevent.
    it('never drops the batch when the 409 catch-up request itself fails', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'studio-project', title: 'Studio Project' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        let conflicts = 0
        submitProjectOpsMock.mockImplementation(async (_projectId, _baseVersion, ops) => {
            conflicts += 1
            if (conflicts === 1) {
                const error = new Error('Version conflict')
                error.status = 409
                error.data = { latestVersion: 1, pendingOps: [] }
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

        // The catch-up GET fails exactly once — the conditions that produce
        // sustained 409s (backend flapping) are the same ones that break it.
        listProjectOpsMock.mockRejectedValueOnce(new Error('Catch-up failed'))

        act(() => {
            result.current.sync.applyLocalOps({
                type: 'setPresentationState',
                payload: { patch: { mode: 'code', codeHtml: '<main>Survive me</main>' } }
            })
        })

        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBeTruthy()
        })
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Survive me')

        // The queued batch survives and the delayed retry persists it.
        await waitFor(() => {
            expect(result.current.store.state.version).toBe(2)
        }, { timeout: 8000 })
        expect(result.current.store.state.pendingSyncError).toBeNull()
        expect(result.current.store.state.document.presentationState.codeHtml).toContain('Survive me')
    }, 12000)

    // Regression test for audit batch 2: the editors render this hook without
    // a key, so switching projects reuses the instance. The previous project's
    // version used to survive in versionRef and the stale-version guard then
    // rejected the new project's document forever — a permanent "Loading
    // project…" with no terminal dispatch.
    it('loads a second project whose version is lower than the first project\'s', async () => {
        getProjectDocumentMock.mockImplementation(async (projectId) => (
            projectId === 'high-version-project'
                ? {
                    version: 500,
                    document: {
                        projectMeta: { id: 'high-version-project', title: 'High' },
                        presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                        entities: []
                    }
                }
                : {
                    version: 3,
                    document: {
                        projectMeta: { id: 'fresh-project', title: 'Fresh' },
                        presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                        entities: []
                    }
                }
        ))
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 0 })

        const { result, rerender } = renderHook(({ projectId }) => {
            const store = useProjectStore()
            const sync = useProjectDocumentSync({ projectId, store })
            return { store, sync }
        }, { initialProps: { projectId: 'high-version-project' } })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('high-version-project')
        })
        expect(result.current.store.state.version).toBe(500)

        rerender({ projectId: 'fresh-project' })

        await waitFor(() => {
            expect(result.current.store.state.document.projectMeta.id).toBe('fresh-project')
        })
        expect(result.current.store.state.version).toBe(3)
        expect(result.current.store.state.loading).toBe(false)
    }, 10000)
})
