import { useCallback, useMemo, useState } from 'react'
import { hotbarSlots } from './hotbar.js'
import { arrangeSlots, pinAt } from './inventory.js'

// THE HAND — the hotbar's slots, which one is in hand, and the arrangement this person
// keeps (a tile pinned from the inventory). One hook for the rig Build surface and the
// Studio's Walk, so a slot pinned in one is in the other (the key is the project's).
// The arrangement is a convenience kept in this browser, not the show's data.

const keyOf = (projectId) => `rigbuild.hotbar.${projectId}`

export function useHotbar({ projectId, entities, library }) {
    const pinKey = keyOf(projectId)
    const [pinned, setPinned] = useState(() => { try { return JSON.parse(window.localStorage.getItem(pinKey) || '[]') } catch { return [] } })
    const { slots: allSlots } = useMemo(() => hotbarSlots({ entities, library }), [entities, library])
    const slots = useMemo(() => arrangeSlots(allSlots, pinned), [allSlots, pinned])
    const [slotIndex, setSlotIndex] = useState(0)
    /** Pin a tile to a slot (or the one in hand); returns the sentence for it, or '' when the tile cannot be pinned. */
    const pinToHotbar = useCallback((tile, at) => {
        if (!tile.hotbarId) return ''
        const next = pinAt(pinned, tile.hotbarId, at ?? (slotIndex < slots.length ? slotIndex : null), allSlots.map((x) => x.id))
        setPinned(next)
        try { window.localStorage.setItem(pinKey, JSON.stringify(next)) } catch { /* a private window keeps it for the visit */ }
        const i = next.indexOf(tile.hotbarId)
        if (i >= 0) setSlotIndex(i)
        return `${tile.code} in the hotbar, key ${i === 9 ? 0 : i + 1}`
    }, [pinned, slotIndex, slots.length, allSlots, pinKey])
    return { slots, slotIndex, setSlotIndex, pinToHotbar }
}

export default useHotbar
