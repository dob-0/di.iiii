import { useCallback, useState } from 'react'

const DEFAULT_OPEN = ['library', 'inspector']

export function useStudioPanelState() {
    const [open, setOpen] = useState(() => new Set(DEFAULT_OPEN))

    const toggle = useCallback((id) => {
        setOpen((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const show = useCallback((id) => {
        setOpen((prev) => (prev.has(id) ? prev : new Set([...prev, id])))
    }, [])

    const hide = useCallback((id) => {
        setOpen((prev) => {
            if (!prev.has(id)) return prev
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }, [])

    const isOpen = useCallback((id) => open.has(id), [open])

    return { open, toggle, show, hide, isOpen }
}
