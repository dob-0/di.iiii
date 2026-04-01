import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createProjectSyncService } from '../services/projectSyncService.js'
import {
    buildBetaProjectEventsUrl,
    getBetaProjectDocument,
    listBetaProjectOps,
    submitBetaProjectOps,
    updateBetaProjectDocument
} from '../services/projectsApi.js'
import { generateId } from '../../shared/projectSchema.js'

const MAX_SEEN_OPS = 2000

export function useProjectDocumentSync({
    projectId,
    store
} = {}) {
    const dispatch = store?.dispatch
    const state = store?.state
    const syncServiceRef = useRef(createProjectSyncService())
    const versionRef = useRef(0)
    const pendingQueueRef = useRef([])
    const isFlushingRef = useRef(false)
    const localClientIdRef = useRef(generateId('beta-client'))
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
            const response = await getBetaProjectDocument(projectId)
            versionRef.current = Number(response.version) || 0
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

        try {
            while (pendingQueueRef.current.length) {
                const batch = pendingQueueRef.current.splice(0, pendingQueueRef.current.length)
                try {
                    const response = await submitBetaProjectOps(projectId, versionRef.current, batch)
                    const appliedOps = Array.isArray(response?.ops) && response.ops.length ? response.ops : batch
                    rememberSeenOps(appliedOps)
                    versionRef.current = Number(response?.newVersion) || versionRef.current
                    dispatch?.({
                        type: 'replace-document',
                        document: state?.document,
                        version: versionRef.current
                    })
                } catch (error) {
                    if (error?.status === 409) {
                        const latestVersion = Number(error?.data?.latestVersion)
                        const pendingOps = Array.isArray(error?.data?.pendingOps) ? error.data.pendingOps : []
                        if (Number.isFinite(latestVersion)) {
                            versionRef.current = latestVersion
                        }
                        if (pendingOps.length) {
                            applyRemoteOps(pendingOps, latestVersion)
                        } else {
                            const catchUp = await listBetaProjectOps(projectId, versionRef.current)
                            applyRemoteOps(catchUp.ops || [], catchUp.latestVersion)
                        }
                        pendingQueueRef.current.unshift(...batch)
                        continue
                    }
                    pushActivity(`Project sync failed: ${error.message || 'unknown error'}`, 'error')
                    break
                }
            }
        } finally {
            isFlushingRef.current = false
        }
    }, [applyRemoteOps, dispatch, projectId, pushActivity, rememberSeenOps, state?.document])

    const applyLocalOps = useCallback((ops = [], options = {}) => {
        const normalizedOps = (Array.isArray(ops) ? ops : [ops])
            .filter(Boolean)
            .map((op) => ({
                opId: op.opId || generateId('beta-op'),
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
    }, [dispatch, flushQueue, pushActivity, rememberSeenOps])

    const replaceDocument = useCallback(async (document, options = {}) => {
        if (!projectId) return
        const response = await updateBetaProjectDocument(projectId, document)
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
            eventsUrl: buildBetaProjectEventsUrl(projectId),
            onProjectOp: ({ version, ops }) => {
                applyRemoteOps(ops || [], Number(version))
            },
            onReady: async () => {
                dispatch?.({ type: 'scene-stream-state', value: 'connected', error: null })
                const catchUp = await listBetaProjectOps(projectId, versionRef.current)
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
        sceneStreamError: state?.sceneStreamError || null
    }), [state?.presenceState, state?.sceneStreamError, state?.sceneStreamState])

    return {
        applyLocalOps,
        replaceDocument,
        reloadDocument,
        syncState,
        localClientId: localClientIdRef.current
    }
}
