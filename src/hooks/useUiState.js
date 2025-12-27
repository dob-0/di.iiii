import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const UI_DEFAULT_STORAGE_KEY = 'ui-default-visible'
const UI_VISIBLE_STORAGE_PREFIX = 'ui-visible'
const SELECTION_LOCK_STORAGE_PREFIX = 'selection-lock'
const LAYOUT_MODE_STORAGE_KEY = 'layout-mode'

const readUiDefaultVisible = () => {
    if (typeof window === 'undefined') return false
    try {
        const stored = window.localStorage.getItem(UI_DEFAULT_STORAGE_KEY)
        if (stored === 'true') return true
        if (stored === 'false') return false
    } catch {
        // ignore storage errors
    }
    return false
}

export function useUiState({
    spaceId,
    defaults = {}
} = {}) {
    const {
        isPerfVisible: defaultPerfVisible = false,
        isGizmoVisible: defaultGizmoVisible = true,
        isGridVisible: defaultGridVisible = true
    } = defaults

    const selectionLockKey = useMemo(() => {
        const id = spaceId || 'local'
        return `${SELECTION_LOCK_STORAGE_PREFIX}:${id}`
    }, [spaceId])

    const [menu, setMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        position3D: [0, 0, 0]
    })
    const [gizmoMode, setGizmoMode] = useState('translate')
    const [axisConstraint, setAxisConstraint] = useState(null)
    const freeTransformRef = useRef({ mode: null, axis: null })
    const resetAxisLock = useCallback(() => {
        setAxisConstraint(null)
        freeTransformRef.current = { mode: null, axis: null }
    }, [])

    const [isPerfVisible, setIsPerfVisible] = useState(defaultPerfVisible)
    const [isWorldPanelVisible, setIsWorldPanelVisible] = useState(false)
    const [isViewPanelVisible, setIsViewPanelVisible] = useState(false)
    const [isMediaPanelVisible, setIsMediaPanelVisible] = useState(false)
    const [isAssetPanelVisible, setIsAssetPanelVisible] = useState(false)
    const [isOutlinerPanelVisible, setIsOutlinerPanelVisible] = useState(false)
    const [isSpacesPanelVisible, setIsSpacesPanelVisible] = useState(false)
    const [isGizmoVisible, setIsGizmoVisible] = useState(defaultGizmoVisible)
    const [isGridVisible, setIsGridVisible] = useState(defaultGridVisible)
    const [isPointerDragging, setIsPointerDragging] = useState(false)
    const [isAdminMode, setIsAdminMode] = useState(false)
    const [layoutMode, setLayoutMode] = useState(() => {
        if (typeof window === 'undefined') return 'floating'
        try {
            const stored = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY)
            return stored === 'split' ? 'split' : 'floating'
        } catch {
            return 'floating'
        }
    })

    const toggleLayoutMode = useCallback(() => {
        setLayoutMode(prev => {
            const next = prev === 'floating' ? 'split' : 'floating'
            try {
                window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, next)
            } catch (error) {
                console.warn('Could not persist layout mode', error)
            }
            return next
        })
    }, [])

    const uiVisibilityQuery = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('ui')
        : null
    const uiVisibleStorageKey = useMemo(() => {
        const id = spaceId || 'local'
        return `${UI_VISIBLE_STORAGE_PREFIX}:${id}`
    }, [spaceId])

    const readStoredUiVisible = useCallback(() => {
        if (typeof window === 'undefined') return null
        try {
            const stored = window.localStorage.getItem(uiVisibleStorageKey)
            if (stored === 'true') return true
            if (stored === 'false') return false
        } catch {
            // ignore
        }
        return null
    }, [uiVisibleStorageKey])
    const [uiDefaultVisible, setUiDefaultVisible] = useState(() => readUiDefaultVisible())
    const [isUiVisible, setIsUiVisible] = useState(() => {
        if (uiVisibilityQuery === 'show') return true
        if (uiVisibilityQuery === 'hide') return false
        const stored = readStoredUiVisible()
        if (stored !== null) return stored
        return readUiDefaultVisible()
    })

    const [isSelectionLocked, setIsSelectionLocked] = useState(() => {
        if (typeof window === 'undefined') return false
        try {
            return window.localStorage.getItem(selectionLockKey) === 'true'
        } catch {
            return false
        }
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const stored = window.localStorage.getItem(selectionLockKey)
            setIsSelectionLocked(stored === 'true')
        } catch (error) {
            console.warn('Could not read selection lock preference', error)
        }
    }, [selectionLockKey])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(selectionLockKey, isSelectionLocked ? 'true' : 'false')
        } catch (error) {
            console.warn('Could not persist selection lock preference', error)
        }
    }, [isSelectionLocked, selectionLockKey])

    const toggleUiDefaultVisible = useCallback(() => {
        setUiDefaultVisible(prev => {
            const next = !prev
            try {
                window.localStorage.setItem(UI_DEFAULT_STORAGE_KEY, next ? 'true' : 'false')
            } catch (error) {
                console.warn('Unable to persist UI default visibility', error)
            }
            setIsUiVisible(next)
            return next
        })
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(uiVisibleStorageKey, isUiVisible ? 'true' : 'false')
        } catch (error) {
            console.warn('Could not persist UI visibility preference', error)
        }
    }, [isUiVisible, uiVisibleStorageKey])

    useEffect(() => {
        const handleKeyToggleSelectionLock = (event) => {
            if (event.defaultPrevented) return
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
            const target = event.target
            const tagName = (target?.tagName || '').toLowerCase()
            const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable
            if (isTyping) return
            if (event.key && event.key.toLowerCase() === 'l') {
                setIsSelectionLocked(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyToggleSelectionLock)
        return () => window.removeEventListener('keydown', handleKeyToggleSelectionLock)
    }, [])

    return {
        menu,
        setMenu,
        gizmoMode,
        setGizmoMode,
        axisConstraint,
        setAxisConstraint,
        freeTransformRef,
        resetAxisLock,
        isPerfVisible,
        setIsPerfVisible,
        isWorldPanelVisible,
        setIsWorldPanelVisible,
        isViewPanelVisible,
        setIsViewPanelVisible,
        isMediaPanelVisible,
        setIsMediaPanelVisible,
        isAssetPanelVisible,
        setIsAssetPanelVisible,
        isOutlinerPanelVisible,
        setIsOutlinerPanelVisible,
        isSpacesPanelVisible,
        setIsSpacesPanelVisible,
        isGizmoVisible,
        setIsGizmoVisible,
        isGridVisible,
        setIsGridVisible,
        isUiVisible,
        setIsUiVisible,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        isPointerDragging,
        setIsPointerDragging,
        isSelectionLocked,
        setIsSelectionLocked,
        isAdminMode,
        setIsAdminMode,
        layoutMode,
        toggleLayoutMode
    }
}
