import { useCallback, useState } from 'react'

const DEFAULT_OPEN = ['create', 'scene']

export function useStudioPanelState(initialOpen = null) {
    const [open, setOpen] = useState(() => new Set(initialOpen || DEFAULT_OPEN))

    const toggle = useCallback((id) => {
        setOpen((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const isOpen = useCallback((id) => open.has(id), [open])

    return { open, toggle, isOpen }
}
