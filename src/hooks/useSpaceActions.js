import { useCallback } from 'react'
import { deleteSpace, toggleSpacePermanent } from '../storage/spaceStore.js'
import { slugifySpaceName, isValidSpaceSlug } from '../utils/spaceNames.js'

export function useSpaceActions({
    spaceId,
    handleCreateSpaceEntry,
    isCreatingSpace,
    spaces,
    refreshSpaces
}) {
    const handleDeleteSpace = useCallback(async (spaceIdentifier) => {
        if (!spaceIdentifier || spaceIdentifier === spaceId) return
        const confirmed = window.confirm('Delete this space link? This cannot be undone.')
        if (!confirmed) return
        deleteSpace(spaceIdentifier)
        await refreshSpaces()
    }, [refreshSpaces, spaceId])

    const handleToggleSpacePermanent = useCallback(async (spaceIdentifier, nextValue) => {
        toggleSpacePermanent(spaceIdentifier, nextValue)
        await refreshSpaces()
    }, [refreshSpaces])

    const handleQuickSpaceCreate = useCallback(async () => {
        const label = window.prompt('Name this space:', '')?.trim()
        if (!label) return
        const slug = slugifySpaceName(label)
        if (!isValidSpaceSlug(slug)) {
            alert('Use lowercase letters, numbers, or dashes (min 3 characters).')
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
        handleQuickSpaceCreate
    }
}

export default useSpaceActions
