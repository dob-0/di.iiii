import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createProjectSyncService } from '../services/projectSyncService.js'
import {
    buildProjectEventsUrl,
    getProjectDocument,
    listProjectOps,
    submitProjectOps,
    updateProjectDocument
} from '../services/projectsApi.js'
import { generateId } from '../../shared/projectSchema.js'

const MAX_SEEN_OPS = 2000
// A failed op batch is retried automatically after this delay rather than
// hot-looping against a persistent failure (e.g. the backend being down).
const SYNC_RETRY_DELAY_MS = 4000
// A 409 (version conflict) catches up and resubmits immediately -- fine
// against an isolated race, but with no cap a client that can never win a
// sustained version race against a faster concurrent writer would retry
// forever. After this many consecutive conflicts in one flush, fall back to
// the same "surface an error, wait, retry" path as any other failure instead
// of resubmitting instantly again.
const MAX_CONSECUTIVE_CONFLICT_RETRIES = 5

export function useProjectDocumentSync({
    projectId,
    store,
    clientIdPrefix = 'project-client',
    opIdPrefix = 'project-op'
} = {}) {
    const dispatch = store?.dispatch
    const state = store?.state
    const syncServiceRef = useRef(createProjectSyncService())
    const versionRef = useRef(0)
    const pendingQueueRef = useRef([])
    const isFlushingRef = useRef(false)
    const retryTimerRef = useRef(null)
    const localClientIdRef = useRef(generateId(clientIdPrefix))
    const seenOpIdsRef = useRef(new Set())
    const seenOpOrderRef = useRef([])

    const rememberSeenOps = useCallback((ops = []) => {
        ops.forEach((op) => {
            const opId = typeof op?.opId === 'string' ? op.opId : ''
            if (!opId || seenOpIdsRef.current.has(opId)) return
            seenOpIdsRef.current.add(opId)
            seenOpOrderRef.current.push(opId)
        })
        while (seenOpOrderRef.current.length > MAX_SEEN_OPS) {
            const oldest = seenOpOrderRef.current.shift()
            if (oldest) seenOpIdsRef.current.delete(oldest)
        }
    }, [])

    const pushActivity = useCallback((message, level = 'info') => {
        dispatch?.({
            type: 'append-activity',
            message,
            level
        })
    }, [dispatch])

    const reloadDocument = useCallback(async () => {
        if (!projectId) return
        dispatch?.({ type: 'load-start' })
        try {
            const response = await getProjectDocument(projectId)
            const nextVersion = Number(response.version) || 0
            if (nextVersion < versionRef.current) {
                // The realtime catch-up (onReady) already advanced past this
                // snapshot while the GET was in flight — applying it now would
                // silently revert the document to a stale state.
                return
            }
            versionRef.current = nextVersion
            dispatch?.({
                type: 'load-success',
                document: response.document,
                version: versionRef.current
            })
        } catch (error) {
            dispatch?.({
                type: 'load-error',
                error: error.message || 'Failed to load project.'
            })
        }
    }, [dispatch, projectId])

    useEffect(() => {
        reloadDocument()
    }, [reloadDocument])

    useEffect(() => {
        versionRef.current = Number(state?.version) || 0
    }, [state?.version])

    useEffect(() => () => {
        clearTimeout(retryTimerRef.current)
    }, [projectId])

    const applyRemoteOps = useCallback((ops = [], version = null) => {
        const unseen = ops.filter((op) => {
            const opId = typeof op?.opId === 'string' ? op.opId : ''
            return !opId || !seenOpIdsRef.current.has(opId)
        })
        if (!unseen.length) {
            if (Number.isFinite(version)) {
                versionRef.current = version
            }
            return
        }
        rememberSeenOps(unseen)
        dispatch?.({
            type: 'apply-ops',
            ops: unseen,
            version: Number.isFinite(version) ? version : undefined
        })
        if (Number.isFinite(version)) {
            versionRef.current = version
        }
    }, [dispatch, rememberSeenOps])

    const flushQueue = useCallback(async () => {
        if (isFlushingRef.current || !projectId || !pendingQueueRef.current.length) {
            return
        }
        isFlushingRef.current = true
        let consecutiveConflicts = 0

        try {
            while (pendingQueueRef.current.length) {
                const batch = pendingQueueRef.current.splice(0, pendingQueueRef.current.length)
                try {
                    const response = await submitProjectOps(projectId, versionRef.current, batch)
                    consecutiveConflicts = 0
                    const appliedOps = Array.isArray(response?.ops) && response.ops.length ? response.ops : batch
                    rememberSeenOps(appliedOps)
                    versionRef.current = Number(response?.newVersion) || versionRef.current
                    dispatch?.({
                        type: 'set-version',
                        version: versionRef.current
                    })
                    dispatch?.({ type: 'pending-sync-error', error: null, authExpired: false })
                } catch (error) {
                    if (error?.status === 401) {
                        // Session expired mid-edit: retrying with the same
                        // stale session will just fail again forever (the
                        // "silent infinite retry" bug — see docs/ai/known-fixes.md).
                        // Keep the edit queued (never drop it) but stop
                        // auto-retrying; it'll try again on the next local
                        // edit, by which point the user has hopefully signed
                        // back in. Surface a distinct message so this reads
                        // as "you're signed out," not a generic sync hiccup.
                        pendingQueueRef.current.unshift(...batch)
                        pushActivity('Your session has expired — sign in again to keep syncing.', 'error')
                        dispatch?.({
                            type: 'pending-sync-error',
                            error: 'Session expired — sign in again to keep syncing.',
                            authExpired: true
                        })
                        clearTimeout(retryTimerRef.current)
                        break
                    }
                    if (error?.status === 409) {
                        consecutiveConflicts += 1
                        if (consecutiveConflicts > MAX_CONSECUTIVE_CONFLICT_RETRIES) {
                            // Sustained version race against a faster concurrent
                            // writer -- stop resubmitting instantly. Fall through
                            // to the same queue-and-delay path every other error
                            // uses instead of looping forever.
                            pendingQueueRef.current.unshift(...batch)
                            pushActivity('Project sync is stuck behind concurrent edits — retrying shortly.', 'error')
                            dispatch?.({
                                type: 'pending-sync-error',
                                error: 'Sync is stuck behind concurrent edits — retrying shortly.'
                            })
                            clearTimeout(retryTimerRef.current)
                            retryTimerRef.current = setTimeout(() => {
                                void flushQueue()
                            }, SYNC_RETRY_DELAY_MS)
                            break
                        }
                        const latestVersion = Number(error?.data?.latestVersion)
                        const pendingOps = Array.isArray(error?.data?.pendingOps) ? error.data.pendingOps : []
                        if (Number.isFinite(latestVersion)) {
                            versionRef.current = latestVersion
                        }
                        if (pendingOps.length) {
                            applyRemoteOps(pendingOps, latestVersion)
                        } else {
                            const catchUp = await listProjectOps(projectId, versionRef.current)
                            applyRemoteOps(catchUp.ops || [], catchUp.latestVersion)
                        }
                        pendingQueueRef.current.unshift(...batch)
                        continue
                    }
                    // Never drop an edit: a network blip, 5xx, or expired auth
                    // must not silently discard ops the UI has already applied
                    // optimistically (see docs/ai/known-fixes.md). Put the batch
                    // back, surface a visible error, and retry after a delay
                    // instead of hot-looping against a persistent failure.
                    pendingQueueRef.current.unshift(...batch)
                    pushActivity(`Project sync failed: ${error.message || 'unknown error'}`, 'error')
                    dispatch?.({
                        type: 'pending-sync-error',
                        error: error.message || 'Project sync failed.'
                    })
                    clearTimeout(retryTimerRef.current)
                    retryTimerRef.current = setTimeout(() => {
                        void flushQueue()
                    }, SYNC_RETRY_DELAY_MS)
                    break
                }
            }
        } finally {
            isFlushingRef.current = false
        }
    }, [applyRemoteOps, dispatch, projectId, pushActivity, rememberSeenOps])

    const applyLocalOps = useCallback((ops = [], options = {}) => {
        const normalizedOps = (Array.isArray(ops) ? ops : [ops])
            .filter(Boolean)
            .map((op) => ({
                opId: op.opId || generateId(opIdPrefix),
                clientId: localClientIdRef.current,
                ...op
            }))
        if (!normalizedOps.length) return

        rememberSeenOps(normalizedOps)
        pendingQueueRef.current.push(...normalizedOps)
        dispatch?.({
            type: 'apply-ops',
            ops: normalizedOps
        })
        if (options.activityMessage) {
            pushActivity(options.activityMessage, options.activityLevel || 'info')
        }
        void flushQueue()
    }, [dispatch, flushQueue, opIdPrefix, pushActivity, rememberSeenOps])

    const replaceDocument = useCallback(async (document, options = {}) => {
        if (!projectId) return
        const response = await updateProjectDocument(projectId, document)
        versionRef.current = Number(response?.version) || versionRef.current
        dispatch?.({
            type: 'replace-document',
            document: response.document || document,
            version: versionRef.current
        })
        if (options.activityMessage) {
            pushActivity(options.activityMessage)
        }
    }, [dispatch, projectId, pushActivity])

    useEffect(() => {
        if (!projectId) return undefined
        const syncService = syncServiceRef.current
        dispatch?.({ type: 'scene-stream-state', value: 'connecting', error: null })

        syncService.connect({
            eventsUrl: buildProjectEventsUrl(projectId),
            onProjectOp: ({ version, ops }) => {
                applyRemoteOps(ops || [], Number(version))
            },
            onReady: async () => {
                dispatch?.({ type: 'scene-stream-state', value: 'connected', error: null })
                const catchUp = await listProjectOps(projectId, versionRef.current)
                applyRemoteOps(catchUp.ops || [], Number(catchUp.latestVersion))
            },
            onOpen: () => {
                dispatch?.({ type: 'scene-stream-state', value: 'connecting', error: null })
            },
            onError: () => {
                dispatch?.({
                    type: 'scene-stream-state',
                    value: 'degraded',
                    error: 'Project event stream is reconnecting.'
                })
            }
        })

        return () => {
            syncService.disconnect()
        }
    }, [applyRemoteOps, dispatch, projectId])

    const syncState = useMemo(() => ({
        presenceState: state?.presenceState || 'disconnected',
        sceneStreamState: state?.sceneStreamState || 'idle',
        sceneStreamError: state?.sceneStreamError || null,
        pendingSyncError: state?.pendingSyncError || null,
        authExpired: Boolean(state?.authExpired)
    }), [state?.presenceState, state?.sceneStreamError, state?.sceneStreamState, state?.pendingSyncError, state?.authExpired])

    return {
        applyLocalOps,
        replaceDocument,
        reloadDocument,
        // Exposed so a "sign in again" prompt can retry the queued edit
        // immediately after re-auth, instead of waiting for the next local
        // edit to happen to naturally retrigger flushQueue.
        retrySync: flushQueue,
        syncState,
        localClientId: localClientIdRef.current
    }
}
