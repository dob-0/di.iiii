import { useCallback, useEffect, useMemo } from 'react'

export function useSelectionGroupActions({
    selectionGroups = [],
    persistSelectionGroups,
    selectedObjectIds = [],
    applySelection,
    expandIdsWithGroups,
    resetAxisLock
} = {}) {
    useEffect(() => {
        resetAxisLock?.()
    }, [resetAxisLock, selectedObjectIds])

    const handleCreateSelectionGroup = useCallback((customMembers) => {
        const baseMembers = Array.isArray(customMembers) && customMembers.length
            ? customMembers
            : (Array.isArray(selectedObjectIds) ? selectedObjectIds : [])
        const members = expandIdsWithGroups?.(baseMembers) || baseMembers
        if (members.length < 2) {
            alert('Select at least two objects to group.')
            return
        }
        const defaultName = `Group ${selectionGroups.length + 1}`
        const name = window.prompt('Group name?', defaultName)?.trim()
        if (!name) return
        const newGroup = {
            id: `group-${Date.now()}`,
            name,
            members
        }
        persistSelectionGroups?.([...selectionGroups, newGroup])
    }, [expandIdsWithGroups, persistSelectionGroups, selectedObjectIds, selectionGroups])

    const handleSelectSelectionGroup = useCallback((groupId) => {
        const group = selectionGroups.find(entry => entry.id === groupId)
        if (!group?.members?.length) return
        applySelection?.(group.members)
    }, [applySelection, selectionGroups])

    const handleDeleteSelectionGroup = useCallback((groupId) => {
        persistSelectionGroups?.(selectionGroups.filter(group => group.id !== groupId))
    }, [persistSelectionGroups, selectionGroups])

    const handleUngroupSelection = useCallback(() => {
        if (!selectedObjectIds.length) return
        const updated = selectionGroups
            .map(group => ({
                ...group,
                members: group.members.filter(memberId => !selectedObjectIds.includes(memberId))
            }))
            .filter(group => group.members.length >= 2)
        persistSelectionGroups?.(updated)
    }, [persistSelectionGroups, selectedObjectIds, selectionGroups])

    const selectionHasGroup = useMemo(() => {
        if (!selectedObjectIds.length) return false
        return selectionGroups.some(group => group.members.some(memberId => selectedObjectIds.includes(memberId)))
    }, [selectedObjectIds, selectionGroups])

    return {
        handleCreateSelectionGroup,
        handleSelectSelectionGroup,
        handleDeleteSelectionGroup,
        handleUngroupSelection,
        selectionHasGroup
    }
}

export default useSelectionGroupActions
