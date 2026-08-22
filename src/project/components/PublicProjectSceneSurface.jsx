import { useEffect, useRef, useState } from 'react'
import useXrAr from '../../hooks/useXrAr.js'
import { computeFramingCamera, getPointsBoundingSphere, getViewportAspect } from '../../utils/cameraFraming.js'
import { overlayButtonStyle } from './publicViewerStyles.js'
import lazyWithReload from '../../utils/lazyWithReload.js'

// Everything in this module -- the XR store, the camera framing math, the two
// renderers -- reaches three.js. It is loaded only from PublicProjectViewer's
// lazy() boundary, which is what keeps a code-mode published page (an <iframe
// srcDoc> and nothing else) off the ~1.6MB three-vendor chunk. Importing
// useXrAr or cameraFraming from the viewer itself puts three back on the
// critical path even though both renderers are lazy; see the guard in
// publicViewerCodeModeGraph.test.js.
const LiveProjectScene = lazyWithReload(() => import('../../components/LiveProjectScene.jsx'), 'live-project-scene')
const StudioViewport = lazyWithReload(() => import('../../studio/components/StudioViewport.jsx'), 'studio-viewport')

// A scene's saved camera can go stale (e.g. left pointed off into empty
// space mid-edit) — that's invisible to editors, who interactively orbit
// away from it, but it strands a fresh public viewer with nothing in view.
// Auto-frame from the actual entity positions instead of trusting it blindly,
// unless the project owner explicitly locked a presentation camera.
// Cap how far back the initial shot pulls: a scene can sprawl across a wide
// area (e.g. a gallery of many small image planes), and fitting the *entire*
// spread edge-to-edge shrinks individual content to unreadable specks. Start
// at a normal walk-around distance instead and let free navigation (already
// enabled outside fixed-camera mode) cover the rest.
// This number is authored for a landscape viewport; computeFramingCamera
// scales it by the same aspect correction it applies to the fit itself, so a
// portrait phone is not clamped back into a crop.
const AUTO_FRAME_MAX_DISTANCE = 25

const computeAutoFrameCamera = (document, aspect) => {
    const points = (document.entities || [])
        .map((entity) => entity?.components?.transform?.position)
        .filter(Boolean)
    const sphere = getPointsBoundingSphere(points)
    if (!sphere) return null
    return computeFramingCamera(sphere, {
        fov: document.worldState?.savedView?.fov,
        aspect,
        maxDistance: AUTO_FRAME_MAX_DISTANCE
    })
}

// `aspect` defaults to the live viewport: a published page is opened at
// whatever shape the visitor's device is, and a parent's phone in portrait is
// the narrow case the auto-frame has to survive.
export const resolveViewerCamera = (document, aspect = getViewportAspect()) => {
    const entryView = document.presentationState?.entryView || 'scene'
    const fixedCamera = document.presentationState?.fixedCamera
    if (entryView === 'fixed-camera' && fixedCamera?.locked) {
        return fixedCamera
    }
    if (entryView === 'fixed-camera') {
        return fixedCamera || document.worldState?.savedView || null
    }
    return computeAutoFrameCamera(document, aspect) || document.worldState?.savedView || null
}

export default function PublicProjectSceneSurface({
    projectId,
    document,
    title,
    entryView,
    navMode,
    onNavModeChange,
    isPreview,
    initialCameraView = null,
    xrDefaultMode = 'none',
    canOfferXrEntry = false
}) {
    // The seed can frame a custom entry view on first paint, but fixed-camera
    // and code presentations are authored choices and always win over it.
    const [cameraView, setCameraView] = useState(() => {
        const documentEntryView = document.presentationState?.entryView || 'scene'
        if (!initialCameraView || documentEntryView === 'fixed-camera' || documentEntryView === 'code') {
            return resolveViewerCamera(document)
        }
        return initialCameraView
    })
    const previousEntryViewRef = useRef(document.presentationState?.entryView || 'scene')
    const controlsRef = useRef(null)

    useEffect(() => {
        const nextEntryView = document.presentationState?.entryView || 'scene'
        const previousEntryView = previousEntryViewRef.current
        previousEntryViewRef.current = nextEntryView
        setCameraView((current) => {
            if (
                current
                && previousEntryView === nextEntryView
                && nextEntryView !== 'fixed-camera'
                && nextEntryView !== 'code'
            ) {
                return current
            }
            return resolveViewerCamera(document)
        })
    }, [document])

    const xr = useXrAr({
        default3DView: cameraView || resolveViewerCamera(document),
        controlsRef,
        setCameraPosition: (position) => setCameraView((current) => ({ ...(current || {}), position })),
        setCameraTarget: (target) => setCameraView((current) => ({ ...(current || {}), target }))
    })

    const wantsVr = xrDefaultMode === 'vr'
    const xrEntrySupported = wantsVr ? xr.supportedXrModes.vr : xr.supportedXrModes.ar

    return (
        <>
            {navMode === 'walk' ? (
                <LiveProjectScene
                    projectId={projectId}
                    interactive
                    showChrome
                    title={title}
                    onExit={() => onNavModeChange('orbit')}
                    exitLabel="← View mode"
                />
            ) : (
                <StudioViewport
                    document={document}
                    selectedEntityId={null}
                    onSelectEntity={null}
                    cursors={{}}
                    onCursorMove={null}
                    onCursorLeave={null}
                    cameraView={cameraView || resolveViewerCamera(document)}
                    controlsRef={controlsRef}
                    xrStore={xr.xrStore}
                    onCameraChange={(nextView) => {
                        if (entryView === 'fixed-camera') return
                        setCameraView(nextView)
                    }}
                    enableNavigation={entryView !== 'fixed-camera' && !isPreview}
                    showChrome={!isPreview}
                    lowPower={isPreview}
                />
            )}

            {/* AR is offered on every space by default (device permitting). The
                project's `xrDefaultMode` only *modifies* this: 'vr' switches the
                offer to VR, 'off' hides it; legacy 'none' and 'ar' both mean AR.
                Only render when the device actually supports the chosen mode so
                non-XR desktops aren't shown a dead button.

                Orbit mode renders StudioViewport, whose <XR> session has no
                XROrigin/locomotion -- entering there leaves you frozen at origin.
                So this routes immersive entry through walk mode (LiveProjectScene),
                which owns the locomotion + its own Enter AR/VR + Exit XR buttons.
                Hidden in walk mode to avoid duplicating those buttons. */}
            {canOfferXrEntry && xrEntrySupported ? (
                <div
                    style={{
                        position: 'absolute',
                        right: '1rem',
                        bottom: '1rem',
                        display: 'flex',
                        gap: '0.75rem',
                        zIndex: 20
                    }}
                >
                    <button
                        type="button"
                        style={overlayButtonStyle}
                        onClick={() => onNavModeChange('walk')}
                    >
                        {wantsVr ? 'Enter VR' : 'Enter AR'}
                    </button>
                </div>
            ) : null}
        </>
    )
}
