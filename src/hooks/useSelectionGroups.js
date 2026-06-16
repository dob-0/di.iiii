import { useCallback, useEffect, useMemo, useState } from 'react'

const GROUPS_STORAGE_PREFIX = 'selection-groups'

export function useSelectionGroups({ spaceId } = {}) {
    const groupsStorageKey = useMemo(() => {
        if (!spaceId) return null
        return `${GROUPS_STORAGE_PREFIX}:${spaceId}`
    }, [spaceId])

    const loadSelectionGroups = useCallback(() => {
        if (!groupsStorageKey || typeof window === 'undefined') return []
        try {
            return JSON.parse(window.localStorage.getItem(groupsStorageKey) || '[]')
        } catch {
            return []
        }
    }, [groupsStorageKey])

    const [selectionGroups, setSelectionGroups] = useState(() => loadSelectionGroups())

    useEffect(() => {
        setSelectionGroups(loadSelectionGroups())
    }, [loadSelectionGroups])

    const persistSelectionGroups = useCallback((nextGroups) => {
        setSelectionGroups(nextGroups)
        if (!groupsStorageKey || typeof window === 'undefined') return
        try {
            window.localStorage.setItem(groupsStorageKey, JSON.stringify(nextGroups))
        } catch {
            // ignore
        }
    }, [groupsStorageKey])

    const expandIdsWithGroups = useCallback((ids) => {
        if (!Array.isArray(ids) || !ids.length) return []
        const set = new Set(ids.filter(Boolean))
        selectionGroups.forEach(group => {
            const intersects = group.members?.some(memberId => set.has(memberId))
            if (intersects) {
                group.members.forEach(memberId => set.add(memberId))
            }
        })
        return Array.from(set)
    }, [selectionGroups])

    return {
        selectionGroups,
        persistSelectionGroups,
        expandIdsWithGroups
    }
}

export default useSelectionGroups
