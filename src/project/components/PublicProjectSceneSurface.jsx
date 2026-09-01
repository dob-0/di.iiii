import { useEffect, useRef, useState } from 'react'
import useXrAr from '../../hooks/useXrAr.js'
import { computeFramingCamera, getPointsBoundingSphere, getViewportAspect } from '../../utils/cameraFraming.js'
import { overlayButtonStyle, overlayCardStyle } from './publicViewerStyles.js'
import { XR_READY, xrAvailability } from '../../xr/xrAvailability.js'
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
// Work made in the node lane. Until now the published page rendered
// `entities` and nothing else, so a project authored as a graph published as
// an EMPTY ROOM — an empty grid that reads as "the maker made nothing", which
// is the opposite of true.
//
// This is not a compiler and does not need to be: `RawViewport` already
// renders a scope's spatial nodes AND the root-scope entities in one room —
// it is what the node editor's own viewport shows, and what /out has been
// handing projectors all along. The published page had simply never been
// pointed at it. Lazily loaded like its two siblings so the code-mode path
// stays clear of it (see publicViewerCodeModeGraph.test.js).
const PublicGraphSurface = lazyWithReload(() => import('../../raw/PublicGraphSurface.jsx'), 'public-graph-surface')

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
// An authored camera is how the visit STARTS, not a promise the visitor may
// never move. Only `locked: true` — the author's explicit choice of a composed
// still — disables navigation; a plain 'fixed-camera' entry seeds the opening
// shot and then hands the camera over. Before this, entryView alone froze the
// mouse, which read as a broken page ("i can't move the camera") on every
// composed-entry room.
export const isCameraCaged = (entryView, fixedCamera) => (
    entryView === 'fixed-camera' && fixedCamera?.locked === true
)

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
    spaceId = null,
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
    const caged = isCameraCaged(entryView, document.presentationState?.fixedCamera)

    useEffect(() => {
        const nextEntryView = document.presentationState?.entryView || 'scene'
        const previousEntryView = previousEntryViewRef.current
        previousEntryViewRef.current = nextEntryView
        setCameraView((current) => {
            if (
                current
                && previousEntryView === nextEntryView
                && !isCameraCaged(nextEntryView, document.presentationState?.fixedCamera)
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
    // Same opt-in shape as the walker's `?inputdebug=1`.
    const xrDebug = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).has('xrdebug')

    // A document carries both lanes (`nodes` and `entities`) and either may be
    // empty. Whichever renderer we pick has to be the one that can show
    // everything this document holds — and only RawViewport shows both.
    const hasGraph = (document.nodes || []).length > 0

    return (
        <>
            {navMode === 'walk' ? (
                <LiveProjectScene
                    projectId={projectId}
                    spaceId={spaceId}
                    interactive
                    showChrome
                    title={title}
                    onExit={() => onNavModeChange('orbit')}
                    exitLabel="← View mode"
                />
            ) : hasGraph ? (
                <PublicGraphSurface
                    document={document}
                    interactive={!caged && !isPreview}
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
                        if (caged) return
                        setCameraView(nextView)
                    }}
                    enableNavigation={!caged && !isPreview}
                    showChrome={!isPreview}
                    lowPower={isPreview}
                    // Authored keyframes used to play ONLY while the editor's
                    // Timeline scrubber was being dragged, so a published scene
                    // sat frozen on its authored pose forever -- invisibly, since
                    // it rendered perfectly and only walk mode animated.
                    playTimelines
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

            {/* An absent button is the same picture whether the cause is a
                missing headset, plain http, or a browser without WebXR -- which
                reads as "the VR is broken" when usually nothing is. `?xrdebug=1`
                turns that silence into a sentence, on the headset itself where
                no console is reachable. Opt-in, so an exhibition audience still
                gets the clean chrome. */}
            {canOfferXrEntry && !xrEntrySupported && xrDebug ? (() => {
                const availability = xrAvailability(
                    xr.getXrDiagnosticsSnapshot().environment,
                    xr.supportedXrModes
                )
                if (availability.state === XR_READY) return null
                return (
                    <div style={{ position: 'absolute', right: '1rem', bottom: '1rem', maxWidth: '22rem', zIndex: 20 }}>
                        <div style={overlayCardStyle}>
                            <strong>No {wantsVr ? 'VR' : 'AR'} here — {availability.reason}</strong>
                            <div style={{ marginTop: '0.4rem', opacity: 0.8 }}>{availability.fix}</div>
                            <button
                                type="button"
                                style={{ ...overlayButtonStyle, marginTop: '0.6rem' }}
                                onClick={() => xr.refreshXrSupport()}
                            >
                                Recheck
                            </button>
                        </div>
                    </div>
                )
            })() : null}
        </>
    )
}
