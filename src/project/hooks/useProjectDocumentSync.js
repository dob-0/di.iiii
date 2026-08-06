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
// applyLocalOps used to call flushQueue synchronously every time -- fine for
// a single click, but a continuous edit (slider/color-picker drag) firing
// many ops per second turned into roughly one POST per input event on a
// fast connection (optimistic apply already made the edit feel instant
// locally, so this bought nothing perceptually). A short throttle window
// coalesces bursts into far fewer requests without ever waiting more than
// this long to actually sync -- unlike a naive trailing debounce, a
// continuous multi-second drag still flushes periodically instead of only
// once at the very end (2026-07-17 perf audit).
const FLUSH_THROTTLE_MS = 50

// The server keeps a bounded op window (maxOpHistory, 500 by default), so a
// client that fell further behind than that window can never be caught up from
// ops alone. Jumping versionRef to latestVersion anyway makes the client look
// current while missing history — a silent fork. Detect it instead: the
// returned window has to start at the very next version after ours.
const hasOpGap = (ops = [], fromVersion = 0, latestVersion = null) => {
    if (!Number.isFinite(latestVersion) || latestVersion <= fromVersion) return false
    const versions = ops.map((op) => Number(op?.version)).filter((version) => Number.isFinite(version))
    if (!versions.length) return true
    return Math.min(...versions) > fromVersion + 1
}

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
    const flushThrottleTimerRef = useRef(null)
    const localClientIdRef = useRef(generateId(clientIdPrefix))
    const seenOpIdsRef = useRef(new Set())
    const seenOpOrderRef = useRef([])
    // Read by callbacks that must not re-create themselves on every document
    // change (reloadDocument is an effect dependency).
    const stateRef = useRef(state)
    useEffect(() => {
        stateRef.current = state
    }, [state])

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

    // The editors are rendered without a key, so switching projects reuses
    // this hook instance. Everything below is per-project state: left alone,
    // the previous project's version blocks the new document forever behind
    // the stale-version guard (permanent "Loading project…"), and ops still
    // queued for the old project get POSTed into the new one.
    useEffect(() => {
        versionRef.current = 0
        pendingQueueRef.current = []
        seenOpIdsRef.current = new Set()
        seenOpOrderRef.current = []
        isFlushingRef.current = false
        clearTimeout(retryTimerRef.current)
        if (flushThrottleTimerRef.current !== null) {
            clearTimeout(flushThrottleTimerRef.current)
            flushThrottleTimerRef.current = null
        }
    }, [projectId])

    const reloadDocument = useCallback(async () => {
        if (!projectId) return
        dispatch?.({ type: 'load-start' })
        try {
            const response = await getProjectDocument(projectId)
            const nextVersion = Number(response.version) || 0
            if (nextVersion < versionRef.current) {
                // The realtime catch-up (onReady) already advanced past this
                // snapshot while the GET was in flight — applying it now would
                // silently revert the document to a stale state. The load is
                // still over though: returning without a terminal dispatch
                // left `loading` true forever ("Loading project…" with a
                // perfectly good document underneath it).
                dispatch?.({
                    type: 'load-success',
                    document: stateRef.current?.document,
                    version: versionRef.current
                })
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
        // The SSE stream and this client's own HTTP flush responses race
        // independently -- a broadcast for an already-superseded op can
        // arrive after a later op already advanced versionRef (proxy
        // buffering, or simply a slow SSE push overtaken by a fast POST
        // response). Never let a stale/duplicate version regress the
        // tracked version backward; only move forward.
        const nextVersion = Number.isFinite(version) && version > versionRef.current
            ? version
            : null
        if (!unseen.length) {
            if (nextVersion !== null) {
                versionRef.current = nextVersion
            }
            return
        }
        rememberSeenOps(unseen)
        dispatch?.({
            type: 'apply-ops',
            ops: unseen,
            version: nextVersion !== null ? nextVersion : undefined
        })
        if (nextVersion !== null) {
            versionRef.current = nextVersion
        }
    }, [dispatch, rememberSeenOps])

    // Takes the server's document wholesale, without the load-start/loading
    // flash of reloadDocument -- used when ops alone can no longer reconcile
    // the client (retention gap, post-conflict divergence).
    const resyncDocument = useCallback(async () => {
        const response = await getProjectDocument(projectId)
        const nextVersion = Number(response?.version) || 0
        versionRef.current = nextVersion
        dispatch?.({
            type: 'replace-document',
            document: response.document,
            version: nextVersion
        })
        // The snapshot only holds what the server accepted; edits still queued
        // locally were applied optimistically and would visually vanish if they
        // weren't put back on top (they are resubmitted, not lost).
        if (pendingQueueRef.current.length) {
            dispatch?.({ type: 'apply-ops', ops: [...pendingQueueRef.current] })
        }
    }, [dispatch, projectId])

    // Brings the client level with the server from `fromVersion`, either from
    // ops the caller already has (a 409 body) or by fetching the window.
    // Returns 'applied' when remote ops were replayed on top of local ones (an
    // order the server does not share -- the caller has to reconcile),
    // 'resynced' when the document was taken from the server instead, and
    // 'level' when there was nothing to catch up on.
    const catchUp = useCallback(async (fromVersion, providedOps = null, providedLatestVersion = null) => {
        let ops = Array.isArray(providedOps) ? providedOps : []
        let latestVersion = Number(providedLatestVersion)
        if (!ops.length) {
            const response = await listProjectOps(projectId, fromVersion)
            ops = Array.isArray(response?.ops) ? response.ops : []
            latestVersion = Number(response?.latestVersion)
        }
        if (hasOpGap(ops, fromVersion, latestVersion)) {
            await resyncDocument()
            return 'resynced'
        }
        applyRemoteOps(ops, latestVersion)
        return ops.length ? 'applied' : 'level'
    }, [applyRemoteOps, projectId, resyncDocument])

    const flushQueue = useCallback(async () => {
        if (isFlushingRef.current || !projectId || !pendingQueueRef.current.length) {
            return
        }
        isFlushingRef.current = true
        let consecutiveConflicts = 0
        let resyncAfterConflict = false

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
                    if (resyncAfterConflict) {
                        resyncAfterConflict = false
                        try {
                            await resyncDocument()
                        } catch (resyncError) {
                            pushActivity(`Project resync failed: ${resyncError.message || 'unknown error'}`, 'error')
                        }
                    }
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
                        const serverOps = Array.isArray(error?.data?.pendingOps) ? error.data.pendingOps : []
                        const baseVersion = versionRef.current
                        // Re-queue BEFORE the catch-up await: the batch is
                        // already spliced off the queue, so a throw inside
                        // listProjectOps would unwind past the unshift and
                        // silently drop ops the UI has already applied
                        // optimistically ("never drop an edit", above).
                        pendingQueueRef.current.unshift(...batch)
                        // The conflict body carries the server's whole retained
                        // op window, not just what this client missed --
                        // replaying ops already baked into the loaded snapshot
                        // would apply them a second time.
                        const missedOps = serverOps.filter((op) => {
                            const version = Number(op?.version)
                            return !Number.isFinite(version) || version > baseVersion
                        })
                        try {
                            if (await catchUp(baseVersion, missedOps, latestVersion) === 'applied') {
                                // Remote ops just landed on top of the local
                                // ones, but the resubmit below puts the local
                                // ones on top of the remote ones server-side.
                                // Only the server's order is authoritative, so
                                // take its document once the resubmit lands.
                                resyncAfterConflict = true
                            }
                        } catch (catchUpError) {
                            pushActivity(`Project sync failed: ${catchUpError.message || 'catch-up failed'}`, 'error')
                            dispatch?.({
                                type: 'pending-sync-error',
                                error: catchUpError.message || 'Project sync failed.'
                            })
                            clearTimeout(retryTimerRef.current)
                            retryTimerRef.current = setTimeout(() => {
                                void flushQueue()
                            }, SYNC_RETRY_DELAY_MS)
                            break
                        }
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
    }, [catchUp, dispatch, projectId, pushActivity, rememberSeenOps, resyncDocument])

    // Coalesces bursts of applyLocalOps calls (see FLUSH_THROTTLE_MS above)
    // into one flushQueue() per window, instead of one per call.
    const scheduleFlush = useCallback(() => {
        if (flushThrottleTimerRef.current !== null) return
        flushThrottleTimerRef.current = setTimeout(() => {
            flushThrottleTimerRef.current = null
            void flushQueue()
        }, FLUSH_THROTTLE_MS)
    }, [flushQueue])

    useEffect(() => () => {
        if (flushThrottleTimerRef.current !== null) clearTimeout(flushThrottleTimerRef.current)
    }, [])

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
        scheduleFlush()
    }, [dispatch, opIdPrefix, pushActivity, rememberSeenOps, scheduleFlush])

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
                await catchUp(versionRef.current)
            },
            // A failed post-connect catch-up used to be swallowed, leaving the
            // stream reading "connected" while the document sat silently
            // behind the server.
            onReadyError: (error) => {
                dispatch?.({
                    type: 'scene-stream-state',
                    value: 'degraded',
                    error: 'Project catch-up failed — reconnecting.'
                })
                pushActivity(`Project catch-up failed: ${error?.message || 'unknown error'}`, 'error')
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
    }, [applyRemoteOps, catchUp, dispatch, projectId, pushActivity])

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
