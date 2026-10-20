// H5 of the local-hosting decision (2026-10-02): an edit made in a tab whose
// server is gone must never vanish silently. Each case below fails on the code
// before this change, where waiting edits lived only in the tab's memory
// (pendingQueueRef) and the page never said how many were waiting.
import { useCallback, useMemo } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeUnsaved, useProjectDocumentSync } from './useProjectDocumentSync.js'
import { useProjectStore } from '../state/projectStore.js'
import { createMemoryPendingOpsStore, pendingOpsKey } from '../services/pendingOpsStore.js'

const connectMock = vi.fn()
const disconnectMock = vi.fn()
const getProjectDocumentMock = vi.fn()
const listProjectOpsMock = vi.fn()
const submitProjectOpsMock = vi.fn()

vi.mock('../services/projectSyncService.js', () => ({
    createProjectSyncService: () => ({
        connect: (...args) => connectMock(...args),
        disconnect: (...args) => disconnectMock(...args)
    })
}))

vi.mock('../services/projectsApi.js', () => ({
    buildProjectEventsUrl: (projectId) => `/api/projects/${projectId}/events`,
    getProjectDocument: (...args) => getProjectDocumentMock(...args),
    listProjectOps: (...args) => listProjectOpsMock(...args),
    submitProjectOps: (...args) => submitProjectOpsMock(...args),
    updateProjectDocument: vi.fn()
}))

const PROJECT = 'studio-project'

const baseDocument = (codeHtml = '') => ({
    projectMeta: { id: PROJECT, spaceId: 'main', title: 'Studio Project' },
    presentationState: { mode: 'scene', entryView: 'scene', codeHtml },
    entities: []
})

// What apiFetch throws when fetch() never reached the server.
const unreachable = () => Object.assign(
    new Error('ServerXR is unreachable. Check that the server is running and CORS allows this origin.'),
    { isServerUnavailable: true }
)

const editOp = (codeHtml) => ({
    type: 'setPresentationState',
    payload: { patch: { mode: 'code', codeHtml } }
})

const openEditor = (pendingStore) => renderHook(() => {
    const store = useProjectStore()
    const sync = useProjectDocumentSync({ projectId: PROJECT, store, pendingStore })
    return { store, sync }
})

const serverDown = () => submitProjectOpsMock.mockImplementation(async () => { throw unreachable() })
const serverUp = (newVersion = 2) => submitProjectOpsMock.mockImplementation(async (_id, _base, ops) => ({ newVersion, ops }))

describe('unsaved edits survive a dead server and say so', () => {
    afterEach(() => {
        connectMock.mockReset()
        disconnectMock.mockReset()
        getProjectDocumentMock.mockReset()
        listProjectOpsMock.mockReset()
        submitProjectOpsMock.mockReset()
        vi.unstubAllGlobals()
    })

    it('says plainly that edits are not saved, counts them, and clears once they land', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverDown()

        const { result } = openEditor(pendingStore)
        await waitFor(() => expect(result.current.store.state.hasLoaded).toBe(true))

        act(() => { result.current.sync.applyLocalOps(editOp('<main>one</main>')) })
        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBe('Not saved — server unreachable · 1 change waiting')
        })

        // A second edit while the server is still gone: the count follows.
        act(() => { result.current.sync.applyLocalOps(editOp('<main>two</main>')) })
        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBe('Not saved — server unreachable · 2 changes waiting')
        })
        expect(result.current.sync.syncState.pendingOpCount).toBe(2)

        serverUp()
        await waitFor(() => expect(result.current.store.state.version).toBe(2), { timeout: 8000 })
        expect(result.current.store.state.pendingSyncError).toBeNull()
        expect(result.current.sync.syncState.pendingOpCount).toBe(0)
        await waitFor(() => expect(pendingStore.records.size).toBe(0))
    }, 12000)

    it('keeps waiting edits through a reload and sends them when the server answers', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverDown()

        const first = openEditor(pendingStore)
        await waitFor(() => expect(first.result.current.store.state.hasLoaded).toBe(true))
        act(() => { first.result.current.sync.applyLocalOps(editOp('<main>made before the reload</main>')) })
        await waitFor(() => expect(first.result.current.store.state.pendingSyncError).toMatch(/1 change waiting/))
        const sentBefore = submitProjectOpsMock.mock.calls[0][2]
        expect(pendingStore.records.size).toBe(1)

        // The reload: the tab's memory is gone, the browser's store is not.
        first.unmount()
        submitProjectOpsMock.mockReset()
        serverUp()

        const second = openEditor(pendingStore)
        await waitFor(() => expect(submitProjectOpsMock).toHaveBeenCalledTimes(1))
        const [, baseVersion, replayed] = submitProjectOpsMock.mock.calls[0]
        expect(baseVersion).toBe(1)
        expect(replayed.map((op) => op.opId)).toEqual(sentBefore.map((op) => op.opId))
        await waitFor(() => expect(second.result.current.store.state.version).toBe(2))
        expect(second.result.current.store.state.document.presentationState.codeHtml).toContain('made before the reload')
        await waitFor(() => expect(pendingStore.records.size).toBe(0))
        expect(second.result.current.store.state.pendingSyncError).toBeNull()
    }, 12000)

    it('shows edits from before the reload as waiting while the server is gone, and sends them when it is back', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        await pendingStore.write(pendingOpsKey(PROJECT, 'gone-tab'), {
            projectId: PROJECT,
            clientId: 'gone-tab',
            ops: [{ opId: 'op-a', ...editOp('<main>a</main>') }, { opId: 'op-b', ...editOp('<main>b</main>') }],
            sinceVersion: 1,
            updatedAt: 1
        })
        getProjectDocumentMock.mockImplementation(async () => { throw unreachable() })

        const { result } = openEditor(pendingStore)
        await waitFor(() => {
            expect(result.current.store.state.pendingSyncError).toBe('Not saved — server unreachable · 2 changes waiting')
        })
        expect(submitProjectOpsMock).not.toHaveBeenCalled()
        expect(pendingStore.records.size).toBe(1)

        // The server comes back: the stream reconnects, the document loads
        // (the failed first load used to stay failed), and the edits go out.
        getProjectDocumentMock.mockReset()
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverUp()
        await act(async () => { await connectMock.mock.calls[0][0].onReady({}) })
        await waitFor(() => expect(submitProjectOpsMock).toHaveBeenCalledTimes(1))
        expect(submitProjectOpsMock.mock.calls[0][2].map((op) => op.opId)).toEqual(['op-a', 'op-b'])
        await waitFor(() => expect(result.current.store.state.pendingSyncError).toBeNull())
        expect(result.current.store.state.loadError).toBeNull()
        expect(result.current.store.state.document.presentationState.codeHtml).toBe('<main>b</main>')
        await waitFor(() => expect(pendingStore.records.size).toBe(0))
    })

    it('never sends or draws twice an edit the server already has', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        const landed = { opId: 'op-landed', clientId: 'gone-tab', ...editOp('<main>landed</main>') }
        const notLanded = { opId: 'op-not-landed', clientId: 'gone-tab', type: 'createEntity', payload: { entity: { id: 'box-1', type: 'box' } } }
        await pendingStore.write(pendingOpsKey(PROJECT, 'gone-tab'), {
            projectId: PROJECT, clientId: 'gone-tab', ops: [landed, notLanded], sinceVersion: 1, updatedAt: 1
        })
        // The response to the first send was lost, but the server committed
        // `landed` as version 2: the document and the op log both have it.
        getProjectDocumentMock.mockResolvedValue({ version: 2, document: baseDocument('<main>landed</main>') })
        listProjectOpsMock.mockImplementation(async (_id, since) => ({
            ops: since < 2 ? [{ ...landed, version: 2 }] : [],
            latestVersion: 2
        }))
        serverUp(3)
        const applied = []

        const { result } = renderHook(() => {
            const store = useProjectStore()
            // Stable, like useReducer's own dispatch: the hook's effects key on it.
            const baseDispatch = store.dispatch
            const dispatch = useCallback((action) => {
                if (action.type === 'apply-ops') applied.push(...action.ops.map((op) => op.opId))
                baseDispatch(action)
            }, [baseDispatch])
            const spied = useMemo(() => ({ state: store.state, dispatch }), [store.state, dispatch])
            const sync = useProjectDocumentSync({ projectId: PROJECT, store: spied, pendingStore })
            return { store, sync }
        })

        await waitFor(() => expect(submitProjectOpsMock).toHaveBeenCalledTimes(1))
        const [, baseVersion, sent] = submitProjectOpsMock.mock.calls[0]
        expect(baseVersion).toBe(2)
        expect(sent.map((op) => op.opId)).toEqual(['op-not-landed'])
        expect(applied).toEqual(['op-not-landed'])
        await waitFor(() => expect(result.current.store.state.version).toBe(3))
        await waitFor(() => expect(pendingStore.records.size).toBe(0))
    })

    it('replays at once when the event stream reconnects, not at the next timed retry', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverDown()

        const { result } = openEditor(pendingStore)
        await waitFor(() => expect(result.current.store.state.hasLoaded).toBe(true))
        act(() => { result.current.sync.applyLocalOps(editOp('<main>waiting</main>')) })
        await waitFor(() => expect(result.current.store.state.pendingSyncError).toMatch(/server unreachable/))
        expect(submitProjectOpsMock).toHaveBeenCalledTimes(1)

        serverUp()
        const startedAt = Date.now()
        await act(async () => {
            await connectMock.mock.calls[0][0].onReady({})
        })
        await waitFor(() => expect(result.current.store.state.version).toBe(2), { timeout: 1500 })
        // The timed retry is 4 s away; the reconnect is what sent it.
        expect(Date.now() - startedAt).toBeLessThan(3000)
        expect(submitProjectOpsMock).toHaveBeenCalledTimes(2)
        expect(result.current.store.state.pendingSyncError).toBeNull()
    })

    it('asks before the page is left while edits wait, and not after they land', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverDown()

        const { result } = openEditor(pendingStore)
        await waitFor(() => expect(result.current.store.state.hasLoaded).toBe(true))
        act(() => { result.current.sync.applyLocalOps(editOp('<main>waiting</main>')) })
        await waitFor(() => expect(result.current.store.state.pendingSyncError).toMatch(/1 change waiting/))

        const leaving = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(leaving)
        expect(leaving.defaultPrevented).toBe(true)

        serverUp()
        await act(async () => { await connectMock.mock.calls[0][0].onReady({}) })
        await waitFor(() => expect(result.current.store.state.version).toBe(2))
        const leavingAgain = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(leavingAgain)
        expect(leavingAgain.defaultPrevented).toBe(false)
    })

    it('does not take over the edits of another tab that is still open', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        const liveKey = pendingOpsKey(PROJECT, 'live-tab')
        await pendingStore.write(liveKey, {
            projectId: PROJECT, clientId: 'live-tab', ops: [{ opId: 'op-live', ...editOp('<main>theirs</main>') }], sinceVersion: 1, updatedAt: 1
        })
        vi.stubGlobal('navigator', {
            ...navigator,
            locks: {
                request: vi.fn(() => new Promise(() => {})),
                query: async () => ({ held: [{ name: `dii-pending-ops:${liveKey}` }] })
            }
        })
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        serverUp()

        const { result } = openEditor(pendingStore)
        await waitFor(() => expect(result.current.store.state.hasLoaded).toBe(true))
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(submitProjectOpsMock).not.toHaveBeenCalled()
        expect(result.current.store.state.document.presentationState.codeHtml).toBe('')
        expect(pendingStore.records.has(liveKey)).toBe(true)
    })

    it('keeps, and does not send, edits made against another copy of the project', async () => {
        const pendingStore = createMemoryPendingOpsStore()
        const key = pendingOpsKey(PROJECT, 'gone-tab')
        await pendingStore.write(key, {
            projectId: PROJECT, clientId: 'gone-tab', ops: [{ opId: 'op-elsewhere', ...editOp('<main>other db</main>') }], sinceVersion: 40, updatedAt: 1
        })
        // Same address, same project id, a shorter history: another database.
        getProjectDocumentMock.mockResolvedValue({ version: 3, document: baseDocument() })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 3 })
        serverUp(4)

        const { result } = openEditor(pendingStore)
        await waitFor(() => {
            expect(result.current.store.state.activity.some((entry) => /another copy of this project/.test(entry.message))).toBe(true)
        })
        expect(submitProjectOpsMock).not.toHaveBeenCalled()
        expect(pendingStore.records.has(key)).toBe(true)
        expect(result.current.store.state.pendingOpCount).toBe(0)
    })

    it('words the banner the same way in both lanes', () => {
        expect(describeUnsaved('server unreachable', 3)).toBe('Not saved — server unreachable · 3 changes waiting')
        expect(describeUnsaved('server unreachable', 1)).toBe('Not saved — server unreachable · 1 change waiting')
        expect(describeUnsaved('session expired, sign in again to keep syncing', 0)).toBe('Not saved — session expired, sign in again to keep syncing')
    })
})
