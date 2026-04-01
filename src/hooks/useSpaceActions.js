import { useCallback } from 'react'
import { deleteSpace, toggleSpacePermanent, setSpaceAllowEdits } from '../storage/spaceStore.js'
import { slugifySpaceName, isValidSpaceSlug } from '../utils/spaceNames.js'
import { isReservedAppSegment } from '../utils/spaceRouting.js'

export function useSpaceActions({
    spaceId,
    handleCreateSpaceEntry,
    isCreatingSpace,
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
                    console.warn('Failed to delete server space', error)
                    alert('Could not delete the server space. Please try again.')
                    return
                }
                if (!status) {
                    console.warn('Server unavailable; removing local space only.', error)
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
                    console.warn('Failed to update server space', error)
                    alert('Could not update the server space. Please try again.')
                    return
                }
                if (!status) {
                    console.warn('Server unavailable; keeping local change only.', error)
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
                    console.warn('Failed to update server space edit lock', error)
                    alert('Could not update the server space permissions. Please try again.')
                    return
                }
                if (!status) {
                    console.warn('Server unavailable; keeping local change only.', error)
                    alert('Server is unavailable. Local change only.')
                }
            }
        } else if (supportsServerSpaces && isOfflineMode) {
            alert('Offline mode enabled. Local change only.')
        }
        setSpaceAllowEdits(spaceIdentifier, nextValue)
        await refreshSpaces()
    }, [isOfflineMode, refreshSpaces, supportsServerSpaces, updateServerSpace])

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
        await handleCreateSpaceEntry({ isPermanent: false, label, slug })
    }, [handleCreateSpaceEntry, isCreatingSpace, spaces])

    return {
        handleDeleteSpace,
        handleToggleSpacePermanent,
        handleToggleSpaceEditLock,
        handleQuickSpaceCreate
    }
}

export default useSpaceActions
