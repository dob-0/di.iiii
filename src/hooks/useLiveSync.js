import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSceneSyncService } from '../services/sceneSyncService.js'
import { preferLocalAssetsBaseUrl } from '../utils/assetsBaseUrl.js'
import {
    applySceneOps,
    buildCollaborativeSceneSnapshot,
    buildSceneOpsFromSnapshots,
    getSceneSnapshotSignature
} from '../services/collaborativeSceneOps.js'

const MAX_SEEN_OP_IDS = 2000

export function useLiveSync({
    enabled = false,
    isLoading = false,
    isOfflineMode = false,
    isLiveSyncEnabled = false,
    spaceId,
    supportsServerSpaces,
    buildSpaceApiUrl,
    serverAssetBaseUrl = '',
    getServerSceneOps,
    getServerScene,
    submitSceneOps,
    sceneSnapshot,
    applyRemoteScene,
    applySceneState,
    applyScenePatch,
    setSceneVersion,
    liveClientIdRef,
    sceneVersionRef
} = {}) {
    const sceneSyncServiceRef = useRef(createSceneSyncService())
    const acknowledgedSceneRef = useRef(null)
    const desiredSceneRef = useRef(null)
    const isFlushingRef = useRef(false)
    const needsFlushRef = useRef(false)
    const isApplyingRemoteRef = useRef(false)
    const seenOpIdsRef = useRef(new Set())
    const seenOpOrderRef = useRef([])
    const applyIncomingOpsRef = useRef(null)
    const filterUnseenOpsRef = useRef(null)
    const handleSceneOpsEventRef = useRef(null)
    const reloadFullSceneRef = useRef(null)
    const sceneSignature = useMemo(() => getSceneSnapshotSignature(sceneSnapshot), [sceneSnapshot])
    const [sceneStreamState, setSceneStreamState] = useState('idle')
    const [sceneStreamError, setSceneStreamError] = useState(null)

    const resolveAssetsBaseUrl = useCallback((sceneData = null) => {
        return preferLocalAssetsBaseUrl({
            sceneBaseUrl: sceneData?.assetsBaseUrl || '',
            serverAssetBaseUrl
        }) || undefined
    }, [serverAssetBaseUrl])

    const setSceneVersionValue = useCallback((version) => {
        if (typeof version !== 'number' || Number.isNaN(version)) return
        if (sceneVersionRef) {
            sceneVersionRef.current = version
        }
        setSceneVersion?.(version)
    }, [sceneVersionRef, setSceneVersion])

    const rememberSeenOps = useCallback((ops = []) => {
        const seenIds = seenOpIdsRef.current
        const order = seenOpOrderRef.current
        ops.forEach((op) => {
            const opId = typeof op?.opId === 'string' ? op.opId : ''
            if (!opId || seenIds.has(opId)) return
            seenIds.add(opId)
            order.push(opId)
        })
        while (order.length > MAX_SEEN_OP_IDS) {
            const oldest = order.shift()
            if (oldest) {
                seenIds.delete(oldest)
            }
        }
    }, [])

    const filterUnseenOps = useCallback((ops = []) => {
        const seenIds = seenOpIdsRef.current
        return ops.filter((op) => {
            const opId = typeof op?.opId === 'string' ? op.opId : ''
            return !opId || !seenIds.has(opId)
        })
    }, [])

    const reloadFullScene = useCallback(async (serverVersion = null) => {
        if (!spaceId || typeof getServerScene !== 'function') return false
        const response = await getServerScene(spaceId)
        if (!response?.scene) return false
        const collaborativeSnapshot = buildCollaborativeSceneSnapshot(response.scene)
        acknowledgedSceneRef.current = collaborativeSnapshot
        desiredSceneRef.current = collaborativeSnapshot
        await applyRemoteScene?.(response.scene, {
            silent: true,
            assetsBaseUrl: resolveAssetsBaseUrl(response.scene),
            serverVersion: typeof response.version === 'number' ? response.version : serverVersion
        })
        if (typeof response.version === 'number') {
            setSceneVersionValue(response.version)
        } else if (typeof serverVersion === 'number') {
            setSceneVersionValue(serverVersion)
        }
        return true
    }, [applyRemoteScene, getServerScene, resolveAssetsBaseUrl, setSceneVersionValue, spaceId])

    const applyIncomingOps = useCallback(async (ops = [], version = null) => {
        const filteredOps = filterUnseenOps(ops)
        if (!filteredOps.length) {
            if (typeof version === 'number') {
                setSceneVersionValue(version)
            }
            return
        }

        rememberSeenOps(filteredOps)

        const localClientId = liveClientIdRef?.current
        const isLocalEcho = filteredOps.every((op) => op?.clientId && op.clientId === localClientId)
        const previousAcknowledged = acknowledgedSceneRef.current || desiredSceneRef.current || sceneSnapshot

        if (isLocalEcho) {
            acknowledgedSceneRef.current = buildCollaborativeSceneSnapshot(applySceneOps(previousAcknowledged, filteredOps))
            if (typeof version === 'number') {
                setSceneVersionValue(version)
            }
            return
        }

        const replaceOp = filteredOps.find((op) => op?.type === 'replaceScene' && op?.payload?.scene)
        isApplyingRemoteRef.current = true

        try {
            if (replaceOp?.payload?.scene) {
                const replacementScene = replaceOp.payload.scene
                const collaborativeSnapshot = buildCollaborativeSceneSnapshot(replacementScene)
                acknowledgedSceneRef.current = collaborativeSnapshot
                desiredSceneRef.current = collaborativeSnapshot
                await applyRemoteScene?.(replacementScene, {
                    silent: true,
                    assetsBaseUrl: resolveAssetsBaseUrl(replacementScene),
                    serverVersion: version
                })
                if (typeof version === 'number') {
                    setSceneVersionValue(version)
                }
                return
            }

            const previousDesired = desiredSceneRef.current || previousAcknowledged
            const nextAcknowledged = buildCollaborativeSceneSnapshot(applySceneOps(previousAcknowledged, filteredOps))
            const nextDesired = buildCollaborativeSceneSnapshot(applySceneOps(previousDesired, filteredOps))
            acknowledgedSceneRef.current = nextAcknowledged
            desiredSceneRef.current = nextDesired
            applySceneState?.(nextDesired, { serverVersion: version })
            if (typeof version === 'number') {
                setSceneVersionValue(version)
            }
        } finally {
            Promise.resolve().then(() => {
                isApplyingRemoteRef.current = false
            })
        }
    }, [
        applyRemoteScene,
        applySceneState,
        filterUnseenOps,
        liveClientIdRef,
        rememberSeenOps,
        resolveAssetsBaseUrl,
        sceneSnapshot,
        setSceneVersionValue
    ])

    useEffect(() => {
        applyIncomingOpsRef.current = applyIncomingOps
    }, [applyIncomingOps])

    useEffect(() => {
        filterUnseenOpsRef.current = filterUnseenOps
    }, [filterUnseenOps])

    useEffect(() => {
        reloadFullSceneRef.current = reloadFullScene
    }, [reloadFullScene])

    const flushLiveOps = useCallback(async () => {
        if (isFlushingRef.current) {
            needsFlushRef.current = true
            return
        }
        if (
            !enabled
            || isLoading
            || isOfflineMode
            || !isLiveSyncEnabled
            || !supportsServerSpaces
            || !spaceId
            || typeof submitSceneOps !== 'function'
        ) {
            return
        }

        isFlushingRef.current = true

        try {
            while (true) {
                const previousSnapshot = acknowledgedSceneRef.current
                const nextSnapshot = desiredSceneRef.current
                if (!previousSnapshot || !nextSnapshot) break

                const ops = buildSceneOpsFromSnapshots({
                    previousSnapshot,
                    nextSnapshot,
                    clientId: liveClientIdRef?.current || null
                })

                if (!ops.length) {
                    acknowledgedSceneRef.current = buildCollaborativeSceneSnapshot(nextSnapshot)
                    break
                }

                try {
                    const response = await submitSceneOps(spaceId, sceneVersionRef?.current || 0, ops)
                    const appliedOps = Array.isArray(response?.ops) && response.ops.length
                        ? response.ops
                        : ops
                    rememberSeenOps(appliedOps)
                    acknowledgedSceneRef.current = buildCollaborativeSceneSnapshot(applySceneOps(previousSnapshot, appliedOps))
                    if (typeof response?.newVersion === 'number') {
                        setSceneVersionValue(response.newVersion)
                    }
                } catch (error) {
                    if (error?.status === 409) {
                        const pendingOps = Array.isArray(error?.data?.pendingOps) ? error.data.pendingOps : []
                        const latestVersion = typeof error?.data?.latestVersion === 'number'
                            ? error.data.latestVersion
                            : null
                        if (latestVersion !== null) {
                            setSceneVersionValue(latestVersion)
                        }
                        if (pendingOps.length) {
                            await applyIncomingOps(pendingOps, latestVersion)
                            continue
                        }
                        const reloaded = await reloadFullScene(latestVersion)
                        if (reloaded) {
                            continue
                        }
                    } else {
                        console.warn('Unable to sync live scene ops', error)
                    }
                    break
                }
            }
        } finally {
            isFlushingRef.current = false
            if (needsFlushRef.current) {
                needsFlushRef.current = false
                void flushLiveOps()
            }
        }
    }, [
        applyIncomingOps,
        enabled,
        isLiveSyncEnabled,
        isLoading,
        isOfflineMode,
        liveClientIdRef,
        reloadFullScene,
        rememberSeenOps,
        sceneVersionRef,
        setSceneVersionValue,
        spaceId,
        submitSceneOps,
        supportsServerSpaces
    ])

    const handleSceneOpsEvent = useCallback((payload) => {
        if (!payload) return
        if (Array.isArray(payload.ops) && payload.ops.length) {
            void applyIncomingOps(payload.ops, typeof payload.version === 'number' ? payload.version : null)
            return
        }
        if (payload.payload) {
            applyScenePatch?.(payload.payload)
        }
    }, [applyIncomingOps, applyScenePatch])

    useEffect(() => {
        handleSceneOpsEventRef.current = handleSceneOpsEvent
    }, [handleSceneOpsEvent])

    useEffect(() => {
        if (!sceneSnapshot) return
        const nextSnapshot = buildCollaborativeSceneSnapshot(sceneSnapshot)
        desiredSceneRef.current = nextSnapshot

        if (
            !enabled
            || isLoading
            || isOfflineMode
            || !isLiveSyncEnabled
            || !supportsServerSpaces
            || !spaceId
        ) {
            acknowledgedSceneRef.current = nextSnapshot
            return
        }

        if (!acknowledgedSceneRef.current) {
            acknowledgedSceneRef.current = nextSnapshot
            return
        }

        if (isApplyingRemoteRef.current) return
        if (getSceneSnapshotSignature(acknowledgedSceneRef.current) === getSceneSnapshotSignature(nextSnapshot)) {
            return
        }

        void flushLiveOps()
    }, [
        enabled,
        flushLiveOps,
        isLiveSyncEnabled,
        isLoading,
        isOfflineMode,
        sceneSignature,
        sceneSnapshot,
        spaceId,
        supportsServerSpaces
    ])

    useEffect(() => {
        if (
            !enabled
            || isLoading
            || isOfflineMode
            || !spaceId
            || !supportsServerSpaces
            || !isLiveSyncEnabled
        ) {
            const service = sceneSyncServiceRef.current
            service.disconnect()
            setSceneStreamState('idle')
            setSceneStreamError(null)
            return undefined
        }

        const service = sceneSyncServiceRef.current
        const eventsUrl = buildSpaceApiUrl?.('/events')
        if (!eventsUrl) return undefined

        let isCancelled = false
        setSceneStreamState('connecting')
        setSceneStreamError(null)

        const syncMissedOps = async () => {
            if (typeof getServerSceneOps !== 'function' || !spaceId) return
            const since = sceneVersionRef?.current || 0
            try {
                const response = await getServerSceneOps(spaceId, since)
                if (isCancelled) return
                const history = Array.isArray(response?.ops) ? response.ops : []
                const latestVersion = typeof response?.latestVersion === 'number'
                    ? response.latestVersion
                    : since
                const unseen = filterUnseenOpsRef.current?.(history) || []
                const firstVersion = typeof unseen[0]?.version === 'number' ? unseen[0].version : null
                const hasGap = firstVersion !== null && firstVersion > since + 1

                if (hasGap || (latestVersion > since && unseen.length === 0)) {
                    await reloadFullSceneRef.current?.(latestVersion)
                    return
                }

                if (unseen.length) {
                    await applyIncomingOpsRef.current?.(unseen, latestVersion)
                    return
                }

                if (latestVersion > since) {
                    setSceneVersionValue(latestVersion)
                }
            } catch (error) {
                console.warn('Failed to catch up live scene ops', error)
            }
        }

        service.connect({
            eventsUrl,
            onPatch: (payload) => {
                handleSceneOpsEventRef.current?.(payload)
            },
            onCursor: () => {},
            onOpen: () => {
                if (isCancelled) return
                setSceneStreamState('connecting')
                setSceneStreamError(null)
            },
            onReady: () => {
                if (isCancelled) return
                setSceneStreamState('connected')
                setSceneStreamError(null)
                void syncMissedOps()
            },
            onError: () => {
                if (isCancelled) return
                setSceneStreamState('degraded')
                setSceneStreamError('Scene event stream is reconnecting.')
            }
        })

        return () => {
            isCancelled = true
            service.disconnect()
        }
    }, [
        buildSpaceApiUrl,
        enabled,
        getServerSceneOps,
        isLiveSyncEnabled,
        isLoading,
        isOfflineMode,
        sceneVersionRef,
        setSceneVersionValue,
        spaceId,
        supportsServerSpaces
    ])

    return {
        isSceneStreamConnected: sceneStreamState === 'connected',
        sceneStreamState,
        sceneStreamError
    }
}

export default useLiveSync
