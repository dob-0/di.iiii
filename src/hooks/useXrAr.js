import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createXRStore } from '@react-three/xr'

const DEFAULT_SUPPORTED_XR_MODES = { vr: false, ar: false }

const serializeXrError = (error) => {
    if (!error) return null

    return {
        name: error.name || 'Error',
        message: error.message || String(error),
        stack: error.stack || null
    }
}

const readXrEnvironment = () => {
    if (
        typeof window === 'undefined'
        || typeof document === 'undefined'
        || typeof navigator === 'undefined'
    ) {
        return {
            href: null,
            secureContext: false,
            visibilityState: 'unknown',
            userAgent: null,
            hasNavigatorXr: false,
            hasIsSessionSupported: false
        }
    }

    return {
        href: window.location?.href ?? null,
        secureContext: window.isSecureContext,
        visibilityState: document.visibilityState,
        userAgent: navigator.userAgent,
        hasNavigatorXr: Boolean(navigator.xr),
        hasIsSessionSupported: Boolean(navigator.xr?.isSessionSupported)
    }
}

const formatXrUnsupportedMessage = (mode, diagnostics) => {
    const modeLabel = mode === 'ar' ? 'AR' : 'VR'
    const environment = diagnostics?.environment ?? readXrEnvironment()
    const supportError = diagnostics?.error
    const supportErrorMessage = supportError?.message
        ? ` ${supportError.name ? `${supportError.name}: ` : ''}${supportError.message}`
        : ''

    return `WebXR ${modeLabel} is not supported on this device or browser. Secure context: ${environment.secureContext ? 'yes' : 'no'}. Visibility: ${environment.visibilityState}. navigator.xr: ${environment.hasNavigatorXr ? 'yes' : 'no'}.${supportErrorMessage}`
}

const formatXrStartError = (mode, error) => {
    const modeLabel = mode === 'ar' ? 'AR' : 'VR'
    const errorName = error?.name ? `${error.name}: ` : ''
    const errorMessage = error?.message || 'Unknown error.'
    const visibilityHint = (
        typeof document !== 'undefined'
        && document.visibilityState !== 'visible'
    )
        ? ' Keep the page visible in Chrome while starting the session.'
        : ''

    return `Could not start the ${modeLabel} session. ${errorName}${errorMessage}${visibilityHint}`
}

export function useXrAr({
    default3DView,
    controlsRef,
    setCameraPosition,
    setCameraTarget
} = {}) {
    const xrSessionInit = useMemo(() => ({
        requiredFeatures: ['local-floor'],
        optionalFeatures: []
    }), [])

    const xrStore = useMemo(() => createXRStore({
        offerSession: false,
        emulate: false,
        controller: { teleportPointer: true },
        hand: { teleportPointer: true },
        customSessionInit: xrSessionInit
    }), [xrSessionInit])

    const isMountedRef = useRef(true)
    const [isXrPresenting, setIsXrPresenting] = useState(false)
    const [activeXrMode, setActiveXrMode] = useState(null)
    const [supportedXrModes, setSupportedXrModes] = useState(DEFAULT_SUPPORTED_XR_MODES)
    const [xrEnvironment, setXrEnvironment] = useState(() => readXrEnvironment())
    const [lastSupportCheckAt, setLastSupportCheckAt] = useState(null)
    const [supportCheckError, setSupportCheckError] = useState(null)
    const [lastXrStartAttempt, setLastXrStartAttempt] = useState(null)
    const [lastXrStartError, setLastXrStartError] = useState(null)

    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
        }
    }, [])

    useEffect(() => {
        const unsubscribe = xrStore.subscribe((state) => {
            setIsXrPresenting(state.session != null)
            setActiveXrMode(state.mode)
        })
        return unsubscribe
    }, [xrStore])

    const refreshXrSupport = useCallback(async () => {
        const environment = readXrEnvironment()
        const checkedAt = new Date().toISOString()

        const applySupportState = (supportedModes, error = null) => {
            if (!isMountedRef.current) return
            setXrEnvironment(environment)
            setSupportedXrModes(supportedModes)
            setLastSupportCheckAt(checkedAt)
            setSupportCheckError(error)
        }

        if (typeof navigator === 'undefined' || !navigator.xr || !navigator.xr.isSessionSupported) {
            const error = !environment.hasNavigatorXr
                ? { name: 'Unavailable', message: 'navigator.xr is not available.' }
                : { name: 'Unavailable', message: 'navigator.xr.isSessionSupported is not available.' }
            applySupportState(DEFAULT_SUPPORTED_XR_MODES, error)
            return {
                environment,
                checkedAt,
                supportedModes: DEFAULT_SUPPORTED_XR_MODES,
                error
            }
        }

        try {
            const [vrSupported, arSupported] = await Promise.all([
                navigator.xr.isSessionSupported('immersive-vr'),
                navigator.xr.isSessionSupported('immersive-ar')
            ])
            const supportedModes = {
                vr: Boolean(vrSupported),
                ar: Boolean(arSupported)
            }
            applySupportState(supportedModes, null)
            return { environment, checkedAt, supportedModes, error: null }
        } catch (error) {
            const serializedError = serializeXrError(error)
            applySupportState(DEFAULT_SUPPORTED_XR_MODES, serializedError)
            return {
                environment,
                checkedAt,
                supportedModes: DEFAULT_SUPPORTED_XR_MODES,
                error: serializedError
            }
        }
    }, [])

    useEffect(() => {
        void refreshXrSupport()

        if (typeof document === 'undefined' || typeof window === 'undefined') {
            return undefined
        }

        const handlePageStateChange = () => {
            const environment = readXrEnvironment()
            if (isMountedRef.current) {
                setXrEnvironment(environment)
            }
            if (document.visibilityState === 'visible') {
                void refreshXrSupport()
            }
        }

        document.addEventListener('visibilitychange', handlePageStateChange)
        window.addEventListener('focus', handlePageStateChange)
        window.addEventListener('pageshow', handlePageStateChange)

        return () => {
            document.removeEventListener('visibilitychange', handlePageStateChange)
            window.removeEventListener('focus', handlePageStateChange)
            window.removeEventListener('pageshow', handlePageStateChange)
        }
    }, [refreshXrSupport])

    const isArModeActive = activeXrMode === 'immersive-ar'

    const getXrDiagnosticsSnapshot = useCallback((overrides = {}) => ({
        generatedAt: new Date().toISOString(),
        environment: overrides.environment ?? xrEnvironment,
        support: {
            vr: overrides.supportedModes?.vr ?? supportedXrModes.vr,
            ar: overrides.supportedModes?.ar ?? supportedXrModes.ar,
            lastCheckedAt: overrides.checkedAt ?? lastSupportCheckAt,
            error: overrides.supportError ?? supportCheckError
        },
        session: {
            isXrPresenting,
            activeXrMode,
            isArModeActive
        },
        sessionInit: xrSessionInit,
        lastStartAttempt: overrides.lastStartAttempt ?? lastXrStartAttempt,
        lastStartError: overrides.lastStartError ?? lastXrStartError
    }), [
        xrEnvironment,
        supportedXrModes.vr,
        supportedXrModes.ar,
        lastSupportCheckAt,
        supportCheckError,
        isXrPresenting,
        activeXrMode,
        isArModeActive,
        xrSessionInit,
        lastXrStartAttempt,
        lastXrStartError
    ])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined

        window.__DII_XR_DEBUG__ = {
            snapshot: getXrDiagnosticsSnapshot(),
            getSnapshot: () => getXrDiagnosticsSnapshot(),
            refreshSupport: () => refreshXrSupport(),
            enterAR: () => xrStore.enterAR(),
            enterVR: () => xrStore.enterVR()
        }

        return () => {
            delete window.__DII_XR_DEBUG__
        }
    }, [getXrDiagnosticsSnapshot, refreshXrSupport, xrStore])

    const showXrDiagnostics = useCallback(async () => {
        const supportResult = await refreshXrSupport()
        const snapshot = getXrDiagnosticsSnapshot({
            environment: supportResult.environment,
            supportedModes: supportResult.supportedModes,
            checkedAt: supportResult.checkedAt,
            supportError: supportResult.error
        })
        const diagnosticText = JSON.stringify(snapshot, null, 2)


        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(diagnosticText)
                alert(
                    `XR diagnostics copied to clipboard.\nAR supported: ${snapshot.support.ar ? 'yes' : 'no'}\nSecure context: ${snapshot.environment.secureContext ? 'yes' : 'no'}\nVisibility: ${snapshot.environment.visibilityState}\nURL: ${snapshot.environment.href}`
                )
                return
            }
        } catch (error) {
        }

        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            window.prompt('XR diagnostics', diagnosticText)
            return
        }

        alert(diagnosticText)
    }, [refreshXrSupport, getXrDiagnosticsSnapshot])

    const handleEnterXrSession = useCallback(async (mode = 'vr') => {
        const supportResult = await refreshXrSupport()
        const startAttempt = {
            mode,
            attemptedAt: new Date().toISOString(),
            environment: supportResult.environment,
            sessionInit: xrSessionInit
        }

        if (isMountedRef.current) {
            setLastXrStartAttempt(startAttempt)
            setLastXrStartError(null)
        }

        const isModeSupported = mode === 'ar'
            ? supportResult.supportedModes.ar
            : supportResult.supportedModes.vr
        if (!isModeSupported) {
            alert(formatXrUnsupportedMessage(mode, supportResult))
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
            const serializedError = serializeXrError(error)
            if (isMountedRef.current) {
                setLastXrStartError(serializedError)
            }
            alert(formatXrStartError(mode, error))
        }
    }, [refreshXrSupport, xrSessionInit, isXrPresenting, xrStore, controlsRef, default3DView, setCameraPosition, setCameraTarget])

    const handleExitXrSession = useCallback(async () => {
        try {
            const session = xrStore.getState().session
            await session?.end()
        } catch (error) {
            alert('Could not exit the XR session cleanly. Please try again.')
        }
    }, [xrStore])

    return {
        xrStore,
        xrSessionInit,
        isXrPresenting,
        activeXrMode,
        isArModeActive,
        supportedXrModes,
        refreshXrSupport,
        getXrDiagnosticsSnapshot,
        showXrDiagnostics,
        handleEnterXrSession,
        handleExitXrSession
    }
}

export default useXrAr
