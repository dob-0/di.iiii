import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createXRStore } from '@react-three/xr'
import { createDefaultArAnchor } from '../utils/ar.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function useXrAr({
    default3DView,
    controlsRef,
    setCameraPosition,
    setCameraTarget
} = {}) {
    const domOverlayRoot = useMemo(() => {
        if (typeof document === 'undefined') return undefined
        const existing = document.getElementById('xr-dom-overlay-root')
        if (existing) return existing
        const el = document.createElement('div')
        el.id = 'xr-dom-overlay-root'
        el.style.position = 'fixed'
        el.style.inset = '0'
        el.style.pointerEvents = 'none'
        // Do not append here; letting the XR store attach it avoids hierarchy issues.
        return el
    }, [])

    const xrStore = useMemo(() => createXRStore({
        offerSession: false,
        emulate: false,
        controller: { teleportPointer: true },
        hand: { teleportPointer: true },
        // Keep AR session init minimal to avoid feature errors on devices that don't support
        // layers/mesh/plane detection.
        anchors: false,
        handTracking: false,
        layers: false,
        meshDetection: false,
        planeDetection: false,
        hitTest: false,
        depthSensing: false,
        domOverlay: domOverlayRoot ?? false
    }), [domOverlayRoot])

    const [isXrPresenting, setIsXrPresenting] = useState(false)
    const [activeXrMode, setActiveXrMode] = useState(null)
    const [supportedXrModes, setSupportedXrModes] = useState({ vr: false, ar: false })
    const [xrOriginPosition, setXrOriginPosition] = useState([0, 0, 0])
    const [arAnchorTransform, setArAnchorTransform] = useState(() => createDefaultArAnchor())
    const [arPreviewScale, setArPreviewScale] = useState(1)
    const [arPreviewOffset, setArPreviewOffset] = useState([0, 0, 0])
    const previousXrModeRef = useRef(null)

    useEffect(() => {
        const unsubscribe = xrStore.subscribe((state) => {
            setIsXrPresenting(state.session != null)
            setActiveXrMode(state.mode)
        })
        return unsubscribe
    }, [xrStore])

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.xr || !navigator.xr.isSessionSupported) {
            setSupportedXrModes({ vr: false, ar: false })
            return
        }
        let isCancelled = false
        const checkSupport = async () => {
            try {
                const [vrSupported, arSupported] = await Promise.all([
                    navigator.xr.isSessionSupported('immersive-vr'),
                    navigator.xr.isSessionSupported('immersive-ar')
                ])
                if (!isCancelled) {
                    setSupportedXrModes({
                        vr: vrSupported,
                        ar: arSupported
                    })
                }
            } catch (error) {
                console.error('Failed to detect WebXR support', error)
                if (!isCancelled) {
                    setSupportedXrModes({ vr: false, ar: false })
                }
            }
        }
        checkSupport()
        return () => {
            isCancelled = true
        }
    }, [])

    const resetArAnchor = useCallback(() => {
        setArAnchorTransform(createDefaultArAnchor())
        setArPreviewScale(1)
        setArPreviewOffset([0, 0, 0])
    }, [])

    useEffect(() => {
        if (activeXrMode === 'immersive-ar' && previousXrModeRef.current !== 'immersive-ar') {
            resetArAnchor()
        }
        if (activeXrMode !== 'immersive-ar' && previousXrModeRef.current === 'immersive-ar') {
            resetArAnchor()
        }
        previousXrModeRef.current = activeXrMode
    }, [activeXrMode, resetArAnchor])

    const isArModeActive = activeXrMode === 'immersive-ar'
    const shouldCapturePreviewGestures = isArModeActive && !arAnchorTransform.anchored

    useEffect(() => {
        if (!shouldCapturePreviewGestures) return
        const gestureState = {
            pointers: new Map(),
            initialPinch: null,
            baseScale: arPreviewScale,
            lastSingle: null
        }

        const handlePointerDown = (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return
            gestureState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (gestureState.pointers.size === 2) {
                const points = Array.from(gestureState.pointers.values())
                const dx = points[0].x - points[1].x
                const dy = points[0].y - points[1].y
                gestureState.initialPinch = Math.hypot(dx, dy)
                gestureState.baseScale = arPreviewScale
            } else if (gestureState.pointers.size === 1) {
                gestureState.lastSingle = { x: event.clientX, y: event.clientY }
            }
        }

        const handlePointerMove = (event) => {
            if (!gestureState.pointers.has(event.pointerId)) return
            gestureState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (gestureState.pointers.size === 2 && gestureState.initialPinch) {
                const points = Array.from(gestureState.pointers.values())
                const dx = points[0].x - points[1].x
                const dy = points[0].y - points[1].y
                const current = Math.hypot(dx, dy)
                if (current > 0) {
                    const nextScale = clamp(
                        gestureState.baseScale * (current / gestureState.initialPinch),
                        0.2,
                        2
                    )
                    setArPreviewScale(nextScale)
                }
                event.preventDefault()
            } else if (gestureState.pointers.size === 1 && gestureState.lastSingle) {
                const current = gestureState.pointers.get(event.pointerId)
                const dx = (current.x - gestureState.lastSingle.x) * 0.002
                const dy = (current.y - gestureState.lastSingle.y) * 0.002
                gestureState.lastSingle = { ...current }
                setArPreviewOffset(prev => {
                    const next = [
                        clamp(prev[0] + dx, -2, 2),
                        prev[1],
                        clamp(prev[2] + dy, -2, 2)
                    ]
                    return next
                })
                event.preventDefault()
            }
        }

        const handlePointerUp = (event) => {
            gestureState.pointers.delete(event.pointerId)
            if (gestureState.pointers.size < 2) {
                gestureState.initialPinch = null
            }
            if (gestureState.pointers.size === 0) {
                gestureState.lastSingle = null
            }
        }

        window.addEventListener('pointerdown', handlePointerDown, { passive: false })
        window.addEventListener('pointermove', handlePointerMove, { passive: false })
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        window.addEventListener('pointerleave', handlePointerUp)
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown)
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
            window.removeEventListener('pointerleave', handlePointerUp)
        }
    }, [shouldCapturePreviewGestures, arPreviewScale])

    const handleEnterXrSession = useCallback(async (mode = 'vr') => {
        const isModeSupported = mode === 'ar' ? supportedXrModes.ar : supportedXrModes.vr
        if (!isModeSupported) {
            alert(`WebXR ${mode.toUpperCase()} is not supported on this device or browser.`)
            return
        }

        try {
            if (isXrPresenting) {
                await xrStore.getState().session?.end()
            }

            if (controlsRef?.current && default3DView) {
                controlsRef.current.object.position.set(...default3DView.position)
                controlsRef.current.target.set(...default3DView.target)
                controlsRef.current.update?.()
            }
            if (default3DView) {
                setCameraPosition?.(default3DView.position)
                setCameraTarget?.(default3DView.target)
            }

            if (mode === 'ar') {
                await xrStore.enterAR()
            } else {
                await xrStore.enterVR()
            }
        } catch (error) {
            console.error(`Failed to start ${mode.toUpperCase()} session:`, error)
            alert(`Could not start the ${mode === 'ar' ? 'AR' : 'VR'} session. Please ensure you are using a compatible browser over HTTPS.`)
        }
    }, [supportedXrModes, isXrPresenting, xrStore, controlsRef, default3DView, setCameraPosition, setCameraTarget])

    const handleExitXrSession = useCallback(async () => {
        try {
            const session = xrStore.getState().session
            await session?.end()
        } catch (error) {
            console.error('Failed to exit XR session:', error)
            alert('Could not exit the XR session cleanly. Please try again.')
        }
    }, [xrStore])

    return {
        xrStore,
        isXrPresenting,
        activeXrMode,
        isArModeActive,
        supportedXrModes,
        xrOriginPosition,
        setXrOriginPosition,
        arAnchorTransform,
        setArAnchorTransform,
        arPreviewScale,
        setArPreviewScale,
        arPreviewOffset,
        setArPreviewOffset,
        resetArAnchor,
        handleEnterXrSession,
        handleExitXrSession
    }
}
