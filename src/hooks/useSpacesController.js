import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    createSpace,
    listSpaces,
    deleteSpace,
    cleanupSpaces,
    markSpaceActive,
    getSpaceShareUrl,
    TEMP_SPACE_TTL_MS
} from '../storage/spaceStore.js'
import {
    createServerSpace,
    listServerSpaces,
    deleteServerSpace,
    updateServerSpace
} from '../services/serverSpaces.js'
import { buildBetaHubPath } from '../beta/utils/betaRouting.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'
import { slugifySpaceName } from '../utils/spaceNames.js'
import { buildPreferencesPath } from '../utils/spaceRouting.js'
import { defaultScene, SCENE_DATA_VERSION } from '../state/sceneStore.js'
import { getSceneStorageKey, persistSceneToLocalStorage } from '../storage/scenePersistence.js'
import { useSpaceNaming } from './useSpaceNaming.js'
import { useSpaceActions } from './useSpaceActions.js'

export function useSpacesController({
    spaceId,
    defaultSpaceId = 'main',
    supportsServerSpaces = false,
    isOfflineMode = false,
    buildSpacePath,
    resetRemoteAssets,
    navigateToSpace
} = {}) {
    const [spaces, setSpaces] = useState(() => listSpaces())
    const [isCreatingSpace, setIsCreatingSpace] = useState(false)
    const [newSpaceName, setNewSpaceName] = useState('')
    const [openAfterCreateTarget, setOpenAfterCreateTarget] = useState('public')
    const serverUnavailableNoticeRef = useRef(false)

    const mergeSpaces = useCallback((localList = [], remoteList = []) => {
        const map = new Map()
        localList.forEach(space => {
            map.set(space.id, { ...space })
        })
        remoteList.forEach(space => {
            const lastActive = space.lastTouchedAt || space.updatedAt || space.createdAt || Date.now()
            const existing = map.get(space.id) || {}
            map.set(space.id, {
                ...existing,
                id: space.id,
                label: space.label || existing.label || `Space ${space.id.slice(-4)}`,
                createdAt: space.createdAt || existing.createdAt || Date.now(),
                lastActive,
                isPermanent: typeof space.permanent === 'boolean' ? space.permanent : Boolean(existing.isPermanent),
                allowEdits: typeof space.allowEdits === 'boolean' ? space.allowEdits : (existing.allowEdits !== false),
                publishedProjectId: typeof space.publishedProjectId === 'string' && space.publishedProjectId.trim()
                    ? space.publishedProjectId.trim()
                    : (existing.publishedProjectId || null)
            })
        })
        return Array.from(map.values()).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
    }, [])

    const refreshSpaces = useCallback(async () => {
        const localSpaces = listSpaces()
        if (!supportsServerSpaces) {
            setSpaces(localSpaces)
            return
        }
        try {
            const remote = await listServerSpaces()
            serverUnavailableNoticeRef.current = false
            setSpaces(mergeSpaces(localSpaces, remote))
        } catch (error) {
            if (error?.isServerUnavailable) {
                if (!serverUnavailableNoticeRef.current) {
                    serverUnavailableNoticeRef.current = true
                }
            } else {
                serverUnavailableNoticeRef.current = false
            }
            setSpaces(localSpaces)
        }
    }, [mergeSpaces, supportsServerSpaces])

    useEffect(() => {
        refreshSpaces()
    }, [refreshSpaces])

    useEffect(() => {
        cleanupSpaces(spaceId)
        if (spaceId) {
            markSpaceActive(spaceId)
        }
        refreshSpaces()
    }, [spaceId, refreshSpaces])

    useEffect(() => {
        if (!spaceId) return
        const exists = spaces.some(space => space.id === spaceId)
        if (!exists) {
            createSpace({
                label: spaceId === defaultSpaceId ? 'Main Space' : spaceId,
                slug: spaceId,
                isPermanent: true
            })
            refreshSpaces()
        }
    }, [defaultSpaceId, spaceId, spaces, refreshSpaces])

    const tempSpaceTtlHours = useMemo(() => Math.round(TEMP_SPACE_TTL_MS / (1000 * 60 * 60)), [])

    const resolveSpaceOpenPath = useCallback((targetId, target = openAfterCreateTarget) => {
        switch (target) {
            case 'studio':
                return buildStudioHubPath(targetId)
            case 'beta':
                return buildBetaHubPath(targetId)
            case 'admin':
                return buildPreferencesPath(targetId)
            case 'public':
            default:
                return buildSpacePath ? buildSpacePath(targetId) : getSpaceShareUrl(targetId)
        }
    }, [buildSpacePath, openAfterCreateTarget])

    const navigateToResolvedSpace = useCallback((url) => {
        if (typeof navigateToSpace === 'function') {
            navigateToSpace(url)
            return
        }
        window.location.assign(url)
    }, [navigateToSpace])

    const {
        trimmedSpaceName,
        newSpaceSlug,
        spaceNameFeedback,
        canCreateNamedSpace,
        canCreateSpace
    } = useSpaceNaming({
        newSpaceName,
        spaces,
        isCreatingSpace,
        buildSpacePath
    })

    const handleCreateSpaceEntry = useCallback(async ({ isPermanent = false, label, slug, openTarget } = {}) => {
        if (isCreatingSpace) return
        resetRemoteAssets?.()
        setIsCreatingSpace(true)
        try {
            let targetId = ''
            let fellBackToLocal = false
            let fallbackMessage = ''
            const shouldUseServerSpaces = supportsServerSpaces && !isOfflineMode
            if (shouldUseServerSpaces) {
                try {
                    const desiredSlug = slugifySpaceName(slug || label || '')
                    const serverSpace = await createServerSpace({
                        label,
                        slug: desiredSlug,
                        isPermanent
                    })
                    targetId = serverSpace?.id || desiredSlug
                    deleteSpace(targetId)
                    createSpace({
                        isPermanent: Boolean(serverSpace?.permanent),
                        label: serverSpace?.label || label || targetId,
                        slug: targetId
                    })
                } catch (error) {
                    const status = typeof error?.status === 'number' ? error.status : null
                    if (status === 401 || status === 403) {
                        fellBackToLocal = true
                        fallbackMessage = 'Server auth required. Created a local space instead.'
                    } else if (status && status >= 400 && status < 500) {
                        throw error
                    } else {
                        fellBackToLocal = true
                        fallbackMessage = 'Server unavailable. Created a local space instead.'
                    }
                }
            }
            if (!targetId) {
                const record = createSpace({ isPermanent, label, slug })
                targetId = record.id
            }
            const blankScene = {
                ...defaultScene,
                version: SCENE_DATA_VERSION,
                objects: [],
                defaultSceneVersion: null
            }
            persistSceneToLocalStorage(blankScene, getSceneStorageKey(targetId))
            await refreshSpaces()
            const url = resolveSpaceOpenPath(targetId, openTarget)
            if (fellBackToLocal) {
                alert(fallbackMessage || 'Server unavailable. Created a local space instead.')
            }
            navigateToResolvedSpace(url)
        } catch (error) {
            const message = error?.message || 'Could not create space. Please try again.'
            alert(message)
        } finally {
            setIsCreatingSpace(false)
        }
    }, [isCreatingSpace, isOfflineMode, navigateToResolvedSpace, refreshSpaces, resetRemoteAssets, resolveSpaceOpenPath, supportsServerSpaces])

    const handleOpenSpace = useCallback((spaceIdentifier) => {
        const url = getSpaceShareUrl(spaceIdentifier)
        window.open(url, '_blank', 'noopener')
    }, [])

    const handleCopySpaceLink = useCallback(async (spaceIdentifier) => {
        const url = getSpaceShareUrl(spaceIdentifier)
        try {
            await navigator.clipboard.writeText(url)
            return true
        } catch (error) {
            window.prompt('Copy space link', url)
            return false
        }
    }, [])

    const handleCreateNamedSpace = useCallback(async (isPermanent = false) => {
        if (!canCreateNamedSpace || isCreatingSpace) return
        const label = trimmedSpaceName || newSpaceSlug
        await handleCreateSpaceEntry({
            isPermanent,
            label,
            slug: newSpaceSlug,
            openTarget: openAfterCreateTarget
        })
        setNewSpaceName('')
    }, [canCreateNamedSpace, handleCreateSpaceEntry, isCreatingSpace, newSpaceSlug, openAfterCreateTarget, trimmedSpaceName])

    const {
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleQuickSpaceCreate
    } = useSpaceActions({
        spaceId,
        handleCreateSpaceEntry,
        isCreatingSpace,
        openAfterCreateTarget,
        spaces,
        refreshSpaces,
        supportsServerSpaces,
        isOfflineMode,
        deleteServerSpace,
        updateServerSpace
    })

    return {
        spaces,
        refreshSpaces,
        isCreatingSpace,
        newSpaceName,
        setNewSpaceName,
        openAfterCreateTarget,
        setOpenAfterCreateTarget,
        tempSpaceTtlHours,
        spaceNameFeedback,
        canCreateSpace,
        handleCreateSpaceEntry,
        handleCreateNamedSpace,
        handleOpenSpace,
        handleCopySpaceLink,
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleQuickSpaceCreate
    }
}

export default useSpacesController
