import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createProjectSyncService } from '../services/projectSyncService.js'
import {
    buildProjectEventsUrl,
    getProjectDocument,
    listProjectOps,
    submitProjectOps,
    updateProjectDocument
} from '../services/projectsApi.js'
import {
    createDefaultPendingOpsStore,
    heldPendingOpsLocks,
    holdPendingOpsLock,
    pendingOpsKey,
    pendingOpsLockName
} from '../services/pendingOpsStore.js'
import { generateId } from '../../shared/projectSchema.js'
import { placeOps } from '../../shared/placement.js'

// The one sentence the page shows while edits are not on the server
// (decision 2026-10-02-local-hosting, H5). Both lanes render it as is
// (.studio-sync-alert, .raw-sync-alert).
export const describeUnsaved = (reason, count = 0) => {
    const waiting = count > 0 ? ` · ${count} ${count === 1 ? 'change' : 'changes'} waiting` : ''
    return `Not saved — ${reason}${waiting}`
}

// apiFetch marks a fetch that never reached the server (isServerUnavailable);
// a proxy in front of a dead server answers 502 (Vite 8, Caddy) or 503/504.
export const isServerUnreachableError = (error) => (
    Boolean(error?.isServerUnavailable) || [502, 503, 504].includes(Number(error?.status))
)

const describeFailure = (error, fallback = 'project sync failed') => (
    isServerUnreachableError(error) ? 'server unreachable' : (error?.message || fallback)
)

const opIdOf = (op) => (typeof op?.opId === 'string' ? op.opId : '')

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
// How long the read-back of waiting edits may take before sync goes on
// without it (the edits stay in the store for the next visit).
const RESTORE_READ_TIMEOUT_MS = 5000

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
    opIdPrefix = 'project-op',
    // Where waiting edits are kept between visits (pendingOpsStore.js).
    // Defaults to IndexedDB; tests pass a memory store they share across
    // "reloads".
    pendingStore = null
} = {}) {
    const dispatch = store?.dispatch
    const state = store?.state
    const syncServiceRef = useRef(createProjectSyncService())
    const [pendingOpsStore] = useState(() => pendingStore || createDefaultPendingOpsStore())
    const versionRef = useRef(0)
    const pendingQueueRef = useRef([])
    // The batch on the wire. Spliced off pendingQueueRef while it is sent, so
    // without this a reload mid-request had nothing left to keep.
    const inFlightRef = useRef([])
    // Edits from an earlier visit (a reload, a closed tab, another tab that is
    // gone), read back from pendingOpsStore and not yet replayed.
    // status: 'idle' | 'reading' | 'ready' | 'done'
    const restoreRef = useRef({ status: 'idle', ops: [], keys: [], sinceVersion: null })
    // The document version when the oldest waiting edit was made: the replay
    // asks the server for everything since then to skip what it already has.
    const sinceVersionRef = useRef(null)
    // True once this project's document is in the store (load or resync);
    // restored edits are applied on top of it, never on the empty stand-in.
    const documentReadyRef = useRef(false)
    const loadFailureRef = useRef(null)
    // Why the waiting edits are not on the server, if they are not:
    // { reason, authExpired }. The banner text is built from it and the count.
    const failureRef = useRef(null)
    const persistChainRef = useRef(Promise.resolve())
    const persistWarnedRef = useRef(false)
    const projectIdRef = useRef(projectId)
    const flushQueueRef = useRef(null)
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

    const waitingCount = useCallback(() => (
        restoreRef.current.ops.length + inFlightRef.current.length + pendingQueueRef.current.length
    ), [])

    // Tells the store how many edits wait, and keeps the banner's count true.
    const reportWaiting = useCallback(() => {
        const count = waitingCount()
        dispatch?.({ type: 'pending-ops-count', count })
        const failure = failureRef.current
        if (failure) {
            dispatch?.({
                type: 'pending-sync-error',
                error: describeUnsaved(failure.reason, count),
                authExpired: Boolean(failure.authExpired)
            })
        }
    }, [dispatch, waitingCount])

    const setFailure = useCallback((reason, { authExpired = false } = {}) => {
        failureRef.current = { reason, authExpired }
        reportWaiting()
    }, [reportWaiting])

    const clearFailure = useCallback(() => {
        failureRef.current = null
        dispatch?.({ type: 'pending-sync-error', error: null, authExpired: false })
        reportWaiting()
    }, [dispatch, reportWaiting])

    // Writes what waits (in flight + queued) for this tab and project, or
    // removes the record when nothing does. Writes are chained so they land in
    // the order they were asked for; flushQueue awaits the chain before it
    // sends, so an edit is in the browser's store before it is on the wire.
    const persistWaiting = useCallback(() => {
        const currentProjectId = projectIdRef.current
        if (!currentProjectId) return persistChainRef.current
        const clientId = localClientIdRef.current
        const key = pendingOpsKey(currentProjectId, clientId)
        const ops = [...inFlightRef.current, ...pendingQueueRef.current]
        const record = ops.length
            ? {
                projectId: currentProjectId,
                spaceId: stateRef.current?.document?.projectMeta?.spaceId || null,
                clientId,
                ops,
                sinceVersion: Number.isFinite(sinceVersionRef.current) ? sinceVersionRef.current : versionRef.current,
                updatedAt: Date.now(),
                origin: typeof window !== 'undefined' ? window.location?.origin || null : null
            }
            : null
        persistChainRef.current = persistChainRef.current
            .then(() => (record ? pendingOpsStore.write(key, record) : pendingOpsStore.remove(key)))
            .catch((error) => {
                if (persistWarnedRef.current) return
                persistWarnedRef.current = true
                console.warn('[project-sync] could not keep waiting edits in this browser:', error?.message || error)
            })
        return persistChainRef.current
    }, [pendingOpsStore])

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
    //
    // The old project's waiting edits are NOT dropped any more: they stay in
    // pendingOpsStore under the old project's key and are replayed the next
    // time that project is opened at this address.
    useEffect(() => {
        projectIdRef.current = projectId
        versionRef.current = 0
        pendingQueueRef.current = []
        inFlightRef.current = []
        sinceVersionRef.current = null
        documentReadyRef.current = false
        loadFailureRef.current = null
        failureRef.current = null
        seenOpIdsRef.current = new Set()
        seenOpOrderRef.current = []
        isFlushingRef.current = false
        clearTimeout(retryTimerRef.current)
        if (flushThrottleTimerRef.current !== null) {
            clearTimeout(flushThrottleTimerRef.current)
            flushThrottleTimerRef.current = null
        }
        restoreRef.current = { status: projectId ? 'reading' : 'idle', ops: [], keys: [], sinceVersion: null }
        dispatch?.({ type: 'pending-ops-count', count: 0 })
        dispatch?.({ type: 'pending-sync-error', error: null, authExpired: false })
        if (!projectId) return undefined

        // This tab's claim on its own record (pendingOpsStore.js, Web Locks):
        // while it is held, another tab will not take these edits over.
        const ownKey = pendingOpsKey(projectId, localClientIdRef.current)
        const releaseLock = holdPendingOpsLock(ownKey)
        let cancelled = false

        // Read back what an earlier visit left waiting: our own record (this
        // tab, before a project switch) and any record whose tab is gone.
        void (async () => {
            let records = []
            try {
                // Bounded: a browser store that never answers must not hold
                // every new edit back (flushQueue waits for this read).
                let timer = null
                const [stored, held] = await Promise.race([
                    Promise.all([pendingOpsStore.list(projectId), heldPendingOpsLocks()]),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('browser store did not answer')), RESTORE_READ_TIMEOUT_MS)
                    })
                ]).finally(() => clearTimeout(timer))
                records = stored.filter((record) => record.key === ownKey || !held.has(pendingOpsLockName(record.key)))
            } catch (error) {
                console.warn('[project-sync] could not read waiting edits from this browser:', error?.message || error)
            }
            if (cancelled) return
            records.sort((a, b) => (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0))
            const seen = new Set()
            const ops = []
            records.forEach((record) => {
                (Array.isArray(record.ops) ? record.ops : []).forEach((op) => {
                    const opId = opIdOf(op)
                    if (!opId || seen.has(opId)) return
                    seen.add(opId)
                    ops.push(op)
                })
            })
            const versions = records.map((record) => Number(record.sinceVersion)).filter(Number.isFinite)
            restoreRef.current = {
                status: 'ready',
                ops,
                keys: records.map((record) => record.key).filter((key) => key !== ownKey),
                sinceVersion: versions.length ? Math.min(...versions) : 0
            }
            if (ops.length && !documentReadyRef.current && loadFailureRef.current) {
                failureRef.current = { reason: describeFailure(loadFailureRef.current, 'project did not load'), authExpired: false }
            }
            reportWaiting()
            void flushQueueRef.current?.()
        })()

        return () => {
            cancelled = true
            releaseLock()
        }
    }, [dispatch, pendingOpsStore, projectId, reportWaiting])

    // Once the document is in the store, restored edits can go on top of it.
    const markDocumentReady = useCallback(() => {
        documentReadyRef.current = true
        loadFailureRef.current = null
        if (restoreRef.current.ops.length) void flushQueueRef.current?.()
    }, [])

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
                markDocumentReady()
                return
            }
            versionRef.current = nextVersion
            dispatch?.({
                type: 'load-success',
                document: response.document,
                version: versionRef.current
            })
            markDocumentReady()
        } catch (error) {
            dispatch?.({
                type: 'load-error',
                error: error.message || 'Failed to load project.'
            })
            // Edits from an earlier visit are waiting and the server did not
            // answer: say so now, not when the first send fails.
            loadFailureRef.current = error
            if (waitingCount()) setFailure(describeFailure(error, 'project did not load'))
        }
    }, [dispatch, markDocumentReady, projectId, setFailure, waitingCount])

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
        // weren't put back on top (they are resubmitted, not lost). The batch
        // on the wire counts too: its echo is filtered as already seen.
        const unacknowledged = [...inFlightRef.current, ...pendingQueueRef.current]
        if (unacknowledged.length) {
            dispatch?.({ type: 'apply-ops', ops: unacknowledged })
        }
        markDocumentReady()
    }, [dispatch, markDocumentReady, projectId])

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

    // Puts a batch that did not land back at the head of the queue.
    const requeue = useCallback((batch) => {
        inFlightRef.current = []
        pendingQueueRef.current.unshift(...batch)
    }, [])

    // Edits read back from an earlier visit go on top of the loaded document,
    // except the ones the server already has. Proven safe to replay twice
    // (report B4, serverXR/src/routes/projectRoutes.js POST /ops): every op
    // carries an opId, and the server skips an opId already in its retained
    // log. This filters on the client as well, from the same log, so an edit
    // that landed before the reload is neither drawn twice here nor sent again.
    const adoptRestored = useCallback(async () => {
        const restore = restoreRef.current
        const since = Number.isFinite(restore.sinceVersion) ? restore.sinceVersion : 0
        const response = await listProjectOps(projectId, since)
        const serverOps = Array.isArray(response?.ops) ? response.ops : []
        const latestVersion = Number(response?.latestVersion)
        if (Number.isFinite(latestVersion) && latestVersion < since) {
            // The server's history is shorter than the one these edits were
            // made against: another database behind the same address (a dev
            // copy on a reused port), or a restore. Replaying would write old
            // edits into a different history. Keep them in this browser, untouched,
            // and say so.
            restoreRef.current = { status: 'done', ops: [], keys: [], sinceVersion: null }
            pushActivity(
                `${restore.ops.length} unsaved ${restore.ops.length === 1 ? 'change' : 'changes'} from an earlier visit were made against another copy of this project (it was at version ${since}, this server is at ${latestVersion}). They are kept in this browser and not sent.`,
                'error'
            )
            reportWaiting()
            return
        }
        const known = new Set(serverOps.map(opIdOf).filter(Boolean))
        const queued = new Set([...inFlightRef.current, ...pendingQueueRef.current].map(opIdOf).filter(Boolean))
        const replay = restore.ops.filter((op) => {
            const opId = opIdOf(op)
            return opId && !known.has(opId) && !queued.has(opId)
        })
        restoreRef.current = { status: 'done', ops: [], keys: [], sinceVersion: null }
        if (replay.length) {
            sinceVersionRef.current = Math.min(
                Number.isFinite(sinceVersionRef.current) ? sinceVersionRef.current : since,
                since
            )
            rememberSeenOps(replay)
            // Older than anything made since the page opened, so first in line.
            pendingQueueRef.current.unshift(...replay)
            dispatch?.({ type: 'apply-ops', ops: replay })
            pushActivity(`${replay.length} unsaved ${replay.length === 1 ? 'change' : 'changes'} from an earlier visit are being saved now.`)
        }
        // Ours first, then the records we took over: never a moment where
        // the edits are in neither.
        await persistWaiting()
        await Promise.all(restore.keys.map((key) => pendingOpsStore.remove(key).catch(() => {})))
        reportWaiting()
    }, [dispatch, pendingOpsStore, persistWaiting, projectId, pushActivity, rememberSeenOps, reportWaiting])

    const scheduleRetry = useCallback(() => {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = setTimeout(() => {
            void flushQueueRef.current?.()
        }, SYNC_RETRY_DELAY_MS)
    }, [])

    const flushQueue = useCallback(async () => {
        if (isFlushingRef.current || !projectId) return
        const restore = restoreRef.current
        // Wait for the read-back: it finishes by calling flushQueue, so the
        // older edits go out before anything made since.
        if (restore.status === 'reading') return
        const hasRestored = restore.ops.length > 0
        // Restored edits need the document under them; load/resync calls back.
        if (hasRestored && !documentReadyRef.current) return
        if (!hasRestored && !pendingQueueRef.current.length) return
        isFlushingRef.current = true
        let consecutiveConflicts = 0
        let resyncAfterConflict = false

        try {
            if (hasRestored) {
                try {
                    await adoptRestored()
                } catch (error) {
                    pushActivity(`Project sync failed: ${error.message || 'unknown error'}`, 'error')
                    setFailure(describeFailure(error))
                    scheduleRetry()
                    return
                }
            }
            while (pendingQueueRef.current.length) {
                const batch = pendingQueueRef.current.splice(0, pendingQueueRef.current.length)
                inFlightRef.current = batch
                // In the browser's store before it is on the wire.
                await persistChainRef.current
                try {
                    const response = await submitProjectOps(projectId, versionRef.current, batch)
                    // The editor moved to another project while this was on
                    // the wire: nothing below belongs to the new one. The
                    // batch's record stays under the old project's key until
                    // that project is opened again (and is skipped there, as
                    // the server now has it).
                    if (projectIdRef.current !== projectId) return
                    consecutiveConflicts = 0
                    inFlightRef.current = []
                    const appliedOps = Array.isArray(response?.ops) && response.ops.length ? response.ops : batch
                    rememberSeenOps(appliedOps)
                    versionRef.current = Number(response?.newVersion) || versionRef.current
                    if (!waitingCount()) sinceVersionRef.current = null
                    void persistWaiting()
                    dispatch?.({
                        type: 'set-version',
                        version: versionRef.current
                    })
                    clearFailure()
                    if (resyncAfterConflict) {
                        resyncAfterConflict = false
                        try {
                            await resyncDocument()
                        } catch (resyncError) {
                            pushActivity(`Project resync failed: ${resyncError.message || 'unknown error'}`, 'error')
                        }
                    }
                } catch (error) {
                    if (projectIdRef.current !== projectId) return
                    if (error?.status === 401) {
                        // Session expired mid-edit: retrying with the same
                        // stale session will just fail again forever (the
                        // "silent infinite retry" bug — see docs/ai/known-fixes.md).
                        // Keep the edit queued (never drop it) but stop
                        // auto-retrying; it'll try again on the next local
                        // edit, by which point the user has hopefully signed
                        // back in. Surface a distinct message so this reads
                        // as "you're signed out," not a generic sync hiccup.
                        requeue(batch)
                        pushActivity('Your session has expired — sign in again to keep syncing.', 'error')
                        setFailure('session expired, sign in again to keep syncing', { authExpired: true })
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
                            requeue(batch)
                            pushActivity('Project sync is stuck behind concurrent edits — retrying shortly.', 'error')
                            setFailure('sync is stuck behind concurrent edits, retrying shortly')
                            scheduleRetry()
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
                        requeue(batch)
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
                            setFailure(describeFailure(catchUpError))
                            scheduleRetry()
                            break
                        }
                        continue
                    }
                    // Never drop an edit: a network blip, 5xx, or expired auth
                    // must not silently discard ops the UI has already applied
                    // optimistically (see docs/ai/known-fixes.md). Put the batch
                    // back, surface a visible error, and retry after a delay
                    // instead of hot-looping against a persistent failure.
                    requeue(batch)
                    pushActivity(`Project sync failed: ${error.message || 'unknown error'}`, 'error')
                    setFailure(describeFailure(error))
                    scheduleRetry()
                    break
                }
            }
        } finally {
            isFlushingRef.current = false
        }
    }, [adoptRestored, catchUp, clearFailure, dispatch, persistWaiting, projectId, pushActivity, rememberSeenOps, requeue, resyncDocument, scheduleRetry, setFailure, waitingCount])

    useEffect(() => {
        flushQueueRef.current = flushQueue
    }, [flushQueue])

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

    // Build zones (shared/placement.cjs): the server puts every hangable thing in
    // a wall slot and sends the rewritten ops back. Applied locally as sent, a
    // dropped photo stood where the hand left it until that echo arrived, then
    // jumped (2026-09-28: 76ms on localhost, a network round trip on the site).
    // Placing the batch HERE with the server's own twin (src/shared/placement.js,
    // proven to agree in placement.test.js) shows at once what the server will
    // decide — and a drag, one op per frame, snaps from slot to slot as it goes.
    const documentRef = useRef(state?.document)
    useEffect(() => { documentRef.current = state?.document }, [state?.document])

    const applyLocalOps = useCallback((ops = [], options = {}) => {
        const listed = (Array.isArray(ops) ? ops : [ops]).filter(Boolean)
        const normalizedOps = placeOps(documentRef.current, listed)
            .map((op) => ({
                opId: op.opId || generateId(opIdPrefix),
                clientId: localClientIdRef.current,
                ...op
            }))
        if (!normalizedOps.length) return

        rememberSeenOps(normalizedOps)
        if (!waitingCount()) sinceVersionRef.current = versionRef.current
        pendingQueueRef.current.push(...normalizedOps)
        // Kept in the browser before it is sent (flushQueue awaits this write).
        void persistWaiting()
        dispatch?.({
            type: 'apply-ops',
            ops: normalizedOps
        })
        reportWaiting()
        if (options.activityMessage) {
            pushActivity(options.activityMessage, options.activityLevel || 'info')
        }
        scheduleFlush()
    }, [dispatch, opIdPrefix, persistWaiting, pushActivity, rememberSeenOps, reportWaiting, scheduleFlush, waitingCount])

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
                // The first load failed (the server was gone when the page
                // opened): it was never retried, so the page sat on the load
                // error and edits read back from an earlier visit had no
                // document to go on. The server answers again — load now.
                if (loadFailureRef.current && !documentReadyRef.current) {
                    await reloadDocument()
                }
                await catchUp(versionRef.current)
                // The server is back: send what waited now, not at the next
                // 4 s retry. Not while signed out — that waits for sign-in.
                if (!failureRef.current?.authExpired) void flushQueueRef.current?.()
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
    }, [applyRemoteOps, catchUp, dispatch, projectId, pushActivity, reloadDocument])

    // While edits wait, leaving the page asks first (the browser's own
    // dialog). They are kept in this browser either way, but only at this
    // address and only until they reach the server. `online` sends them as soon
    // as the machine is back on a network.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onBeforeUnload = (event) => {
            if (!waitingCount()) return undefined
            event.preventDefault()
            event.returnValue = ''
            return ''
        }
        const onOnline = () => {
            if (!failureRef.current?.authExpired) void flushQueueRef.current?.()
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        window.addEventListener('online', onOnline)
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload)
            window.removeEventListener('online', onOnline)
        }
    }, [waitingCount])

    const syncState = useMemo(() => ({
        presenceState: state?.presenceState || 'disconnected',
        sceneStreamState: state?.sceneStreamState || 'idle',
        sceneStreamError: state?.sceneStreamError || null,
        pendingSyncError: state?.pendingSyncError || null,
        pendingOpCount: Number(state?.pendingOpCount) || 0,
        authExpired: Boolean(state?.authExpired)
    }), [state?.presenceState, state?.sceneStreamError, state?.sceneStreamState, state?.pendingSyncError, state?.pendingOpCount, state?.authExpired])

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
