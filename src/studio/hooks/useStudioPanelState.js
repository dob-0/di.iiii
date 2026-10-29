import { useCallback, useState } from 'react'

const DEFAULT_OPEN = ['create', 'scene']

// `?open=files` / `?open=create` on a Studio address (the plain project view's "Write code" and "Add pages or
// pictures"): the one panel that choice is made in starts open, on top of whatever else was open. Only these two
// ids are read; anything else in the address is ignored.
const OPEN_FROM_ADDRESS = new Set(['files', 'create'])
export const panelFromAddress = (search) => {
    try {
        const id = new URLSearchParams(search || '').get('open')
        return OPEN_FROM_ADDRESS.has(id) ? id : null
    } catch { return null }
}

export function useStudioPanelState(initialOpen = null) {
    const [open, setOpen] = useState(() => {
        const set = new Set(initialOpen || DEFAULT_OPEN)
        const asked = typeof window !== 'undefined' ? panelFromAddress(window.location.search) : null
        if (asked) set.add(asked)
        return set
    })

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
