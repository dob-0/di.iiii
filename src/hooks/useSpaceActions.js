import { useCallback } from 'react'
import { deleteSpace, toggleSpacePermanent, setSpaceAllowEdits, setSpaceLabel } from '../storage/spaceStore.js'
import { slugifySpaceName, isValidSpaceSlug } from '../utils/spaceNames.js'
import { isReservedAppSegment } from '../utils/spaceRouting.js'

export function useSpaceActions({
    spaceId,
    handleCreateSpaceEntry,
    isCreatingSpace,
    openAfterCreateTarget = 'public',
    spaces,
    refreshSpaces,
    supportsServerSpaces = false,
    isOfflineMode = false,
    deleteServerSpace,
    updateServerSpace
}) {
    const handleDeleteSpace = useCallback(async (spaceIdentifier) => {
        if (!spaceIdentifier || spaceIdentifier === spaceId) return
        const confirmed = window.confirm('Delete this space link? This cannot be undone.')
        if (!confirmed) return
        if (supportsServerSpaces && !isOfflineMode && typeof deleteServerSpace === 'function') {
            try {
                await deleteServerSpace(spaceIdentifier)
            } catch (error) {
                const status = typeof error?.status === 'number' ? error.status : null
                if (status && status !== 404) {
                    alert('Could not delete the server space. Please try again.')
                    return
                }
                if (!status) {
                    alert('Server is unavailable. Removed local link only.')
                }
            }
        } else if (supportsServerSpaces && isOfflineMode) {
            alert('Offline mode enabled. Removed local link only.')
        }
        deleteSpace(spaceIdentifier)
        await refreshSpaces()
    }, [deleteServerSpace, isOfflineMode, refreshSpaces, spaceId, supportsServerSpaces])

    const handleToggleSpacePermanent = useCallback(async (spaceIdentifier, nextValue) => {
        if (supportsServerSpaces && !isOfflineMode && typeof updateServerSpace === 'function') {
            try {
                await updateServerSpace(spaceIdentifier, { isPermanent: nextValue })
            } catch (error) {
                const status = typeof error?.status === 'number' ? error.status : null
                if (status && status !== 404) {
                    alert('Could not update the server space. Please try again.')
                    return
                }
                if (!status) {
                    alert('Server is unavailable. Local change only.')
                }
            }
        } else if (supportsServerSpaces && isOfflineMode) {
            alert('Offline mode enabled. Local change only.')
        }
        toggleSpacePermanent(spaceIdentifier, nextValue)
        await refreshSpaces()
    }, [isOfflineMode, refreshSpaces, supportsServerSpaces, updateServerSpace])

    const handleToggleSpaceEditLock = useCallback(async (spaceIdentifier, nextValue) => {
        if (supportsServerSpaces && !isOfflineMode && typeof updateServerSpace === 'function') {
            try {
                await updateServerSpace(spaceIdentifier, { allowEdits: nextValue })
            } catch (error) {
                const status = typeof error?.status === 'number' ? error.status : null
                if (status && status !== 404) {
                    alert('Could not update the server space permissions. Please try again.')
                    return
                }
                if (!status) {
                    alert('Server is unavailable. Local change only.')
                }
            }
        } else if (supportsServerSpaces && isOfflineMode) {
            alert('Offline mode enabled. Local change only.')
        }
        setSpaceAllowEdits(spaceIdentifier, nextValue)
        await refreshSpaces()
    }, [isOfflineMode, refreshSpaces, supportsServerSpaces, updateServerSpace])

    // Public visibility lives only on the server (no local-store equivalent),
    // so this action requires a reachable server instead of degrading locally.
    const handleToggleSpacePublic = useCallback(async (spaceIdentifier, nextValue) => {
        if (!supportsServerSpaces || isOfflineMode || typeof updateServerSpace !== 'function') {
            alert('Publishing needs the server. Reconnect and try again.')
            return
        }
        try {
            await updateServerSpace(spaceIdentifier, { isPublic: nextValue })
        } catch (error) {
            const status = typeof error?.status === 'number' ? error.status : null
            if (status === 403) {
                alert('Only the space owner can change its visibility.')
            } else if (status) {
                alert('Could not update the space visibility. Please try again.')
            } else {
                alert('Server is unavailable. Visibility unchanged.')
            }
            return
        }
        await refreshSpaces()
    }, [isOfflineMode, refreshSpaces, supportsServerSpaces, updateServerSpace])

    const handleRenameSpace = useCallback(async (spaceIdentifier) => {
        if (!spaceIdentifier) return
        const currentSpace = spaces.find((space) => space.id === spaceIdentifier)
        if (!currentSpace) return
        const nextLabel = window.prompt('Rename this space label:', currentSpace.label || spaceIdentifier)?.trim()
        if (!nextLabel || nextLabel === currentSpace.label) return

        if (supportsServerSpaces && !isOfflineMode && typeof updateServerSpace === 'function') {
            try {
                await updateServerSpace(spaceIdentifier, { label: nextLabel })
            } catch (error) {
                const status = typeof error?.status === 'number' ? error.status : null
                if (status && status !== 404) {
                    alert('Could not rename the server space. Please try again.')
                    return
                }
                if (!status) {
                    alert('Server is unavailable. Local rename only.')
                }
            }
        } else if (supportsServerSpaces && isOfflineMode) {
            alert('Offline mode enabled. Local rename only.')
        }

        setSpaceLabel(spaceIdentifier, nextLabel)
        await refreshSpaces()
    }, [isOfflineMode, refreshSpaces, spaces, supportsServerSpaces, updateServerSpace])

    const handleQuickSpaceCreate = useCallback(async () => {
        const label = window.prompt('Name this space:', '')?.trim()
        if (!label) return
        const slug = slugifySpaceName(label)
        if (!isValidSpaceSlug(slug)) {
            alert('Use lowercase letters, numbers, or dashes (min 3 characters).')
            return
        }
        if (isReservedAppSegment(slug)) {
            alert('That name is reserved by the app. Please choose another one.')
            return
        }
        if (spaces.some(space => space.id === slug)) {
            alert('That name is already in use.')
            return
        }
        if (isCreatingSpace) return
        await handleCreateSpaceEntry({
            isPermanent: false,
            label,
            slug,
            openTarget: openAfterCreateTarget
        })
    }, [handleCreateSpaceEntry, isCreatingSpace, openAfterCreateTarget, spaces])

    return {
        handleDeleteSpace,
        handleRenameSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleToggleSpacePublic,
        handleQuickSpaceCreate
    }
}

export default useSpaceActions
