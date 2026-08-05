import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPreviewRequest } from '../utils/previewMode.js'

const UI_DEFAULT_STORAGE_KEY = 'ui-default-visible'
const UI_VISIBLE_STORAGE_PREFIX = 'ui-visible'
const SELECTION_LOCK_STORAGE_PREFIX = 'selection-lock'
const INTERACTION_MODE_STORAGE_PREFIX = 'interaction-mode'

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
    const [isInspectorPanelVisible, setIsInspectorPanelVisible] = useState(true)
    const [isSpacesPanelVisible, setIsSpacesPanelVisible] = useState(false)
    const [isGizmoVisible, setIsGizmoVisible] = useState(defaultGizmoVisible)
    const [isGridVisible, setIsGridVisible] = useState(defaultGridVisible)
    const [isPointerDragging, setIsPointerDragging] = useState(false)
    const interactionModeStorageKey = useMemo(() => {
        const id = spaceId || 'local'
        return `${INTERACTION_MODE_STORAGE_PREFIX}:${id}`
    }, [spaceId])
    const [interactionMode, setInteractionModeState] = useState(() => {
        if (typeof window === 'undefined') return 'navigate'
        try {
            const stored = window.localStorage.getItem(interactionModeStorageKey)
            return stored === 'edit' ? 'edit' : 'navigate'
        } catch {
            return 'navigate'
        }
    })
    const [isAdminMode, setIsAdminMode] = useState(false)
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
        // A thumbnail iframe shares localStorage with the Studio owner who is
        // looking at it, so a stored `true` from their own editing session would
        // otherwise open the full toolbar inside the card.
        if (isPreviewRequest()) return false
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
        } catch {
            // ignore
        }
    }, [selectionLockKey])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(selectionLockKey, isSelectionLocked ? 'true' : 'false')
        } catch {
            // ignore
        }
    }, [isSelectionLocked, selectionLockKey])


    const toggleUiDefaultVisible = useCallback(() => {
        setUiDefaultVisible(prev => {
            const next = !prev
            try {
                window.localStorage.setItem(UI_DEFAULT_STORAGE_KEY, next ? 'true' : 'false')
            } catch {
                // ignore
            }
            setIsUiVisible(next)
            return next
        })
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const stored = window.localStorage.getItem(interactionModeStorageKey)
            setInteractionModeState(stored === 'edit' ? 'edit' : 'navigate')
        } catch {
            setInteractionModeState('navigate')
        }
    }, [interactionModeStorageKey])

    const setInteractionMode = useCallback((nextModeOrUpdater) => {
        setInteractionModeState(prev => {
            const resolved = typeof nextModeOrUpdater === 'function'
                ? nextModeOrUpdater(prev)
                : nextModeOrUpdater
            const nextMode = resolved === 'edit' ? 'edit' : 'navigate'
            try {
                window.localStorage.setItem(interactionModeStorageKey, nextMode)
            } catch {
                // ignore
            }
            if (nextMode === 'edit') {
                setIsGizmoVisible(true)
            } else {
                setIsGizmoVisible(false)
            }
            return nextMode
        })
    }, [interactionModeStorageKey])

    const toggleInteractionMode = useCallback(() => {
        setInteractionMode(prev => (prev === 'edit' ? 'navigate' : 'edit'))
    }, [setInteractionMode])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            window.localStorage.setItem(uiVisibleStorageKey, isUiVisible ? 'true' : 'false')
        } catch {
            // ignore
        }
    }, [isUiVisible, uiVisibleStorageKey])

    return useMemo(() => ({
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
        isInspectorPanelVisible,
        setIsInspectorPanelVisible,
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
        interactionMode,
        setInteractionMode,
        toggleInteractionMode,
        isSelectionLocked,
        setIsSelectionLocked,
        isAdminMode,
        setIsAdminMode,
    }), [
        menu,
        gizmoMode,
        axisConstraint,
        freeTransformRef,
        resetAxisLock,
        isPerfVisible,
        isWorldPanelVisible,
        isViewPanelVisible,
        isMediaPanelVisible,
        isAssetPanelVisible,
        isOutlinerPanelVisible,
        isInspectorPanelVisible,
        isSpacesPanelVisible,
        isGizmoVisible,
        isGridVisible,
        isUiVisible,
        uiDefaultVisible,
        toggleUiDefaultVisible,
        isPointerDragging,
        interactionMode,
        setInteractionMode,
        toggleInteractionMode,
        isSelectionLocked,
        isAdminMode,
    ])
}
