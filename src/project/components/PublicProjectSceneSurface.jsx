import { useEffect, useMemo, useRef, useState } from 'react'
import useXrAr from '../../hooks/useXrAr.js'
import { computeFramingCamera, fitCameraToAspect, getPointsBoundingSphere, getViewportAspect } from '../../utils/cameraFraming.js'
import { overlayButtonStyle, overlayCardStyle } from './publicViewerStyles.js'
import { XR_READY, xrAvailability } from '../../xr/xrAvailability.js'
import { doorsOf, fitArrivalToDoors } from '../../components/arrivalFraming.js'
import { isPlatformOwnSpace } from '../../components/MadeWithBadge.jsx'
import lazyWithReload from '../../utils/lazyWithReload.js'
import { isEmbedRequest } from '../../utils/previewMode.js'
import { resolveViewKey } from '../../utils/viewAxisPose.js'
import { runViewCommand } from '../../studio/utils/viewCommands.js'

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

// The front room's doors ARE its navigation, and its arc (x +-12.8) is wider
// than the square-viewport view fitCameraToAspect gives a phone, so the outer
// two were cut. The walker already answers this (arrivalFraming.js): step back
// along the facing direction until every door ring is inside the horizontal
// field. Applied to the composed camera the same way, and only when asked
// (`fitDoors`) and only on a portrait viewport, so no other room and no
// landscape view changes.
export const fitCameraToDoors = (camera, entities, aspect) => {
    if (!camera || camera.projection === 'orthographic' || !(aspect > 0 && aspect < 1)) return camera
    const [px, py, pz] = camera.position || []
    const [tx, , tz] = camera.target || []
    if (![px, py, pz, tx, tz].every(Number.isFinite)) return camera
    const yaw = Math.atan2(tx - px, tz - pz)
    const moved = fitArrivalToDoors({ x: px, z: pz, yaw }, doorsOf(entities), aspect, { fov: camera.fov })
    if (moved.x === px && moved.z === pz) return camera
    return { ...camera, position: [moved.x, py, moved.z] }
}

export const resolveViewerCamera = (document, aspect = getViewportAspect(), { fitDoors = false } = {}) => {
    const view = resolveComposedCamera(document, aspect)
    const fixed = document.presentationState?.entryView === 'fixed-camera'
    return fitDoors && fixed ? fitCameraToDoors(view, document.entities || [], aspect) : view
}

const resolveComposedCamera = (document, aspect) => {
    const entryView = document.presentationState?.entryView || 'scene'
    const fixedCamera = document.presentationState?.fixedCamera
    // The room's declared floor plan bounds how far back the fit may step.
    const fitOptions = { walkableAreas: document.worldState?.walkableAreas || null }
    // An authored shot gets the same aspect correction a fitted one does. It
    // was composed on somebody's landscape screen; applied verbatim it is the
    // portrait visitor who pays, and a locked camera pays hardest because
    // they cannot move to see what was cut.
    if (entryView === 'fixed-camera' && fixedCamera?.locked) {
        return fitCameraToAspect(fixedCamera, aspect, fitOptions)
    }
    if (entryView === 'fixed-camera') {
        return fitCameraToAspect(fixedCamera || document.worldState?.savedView || null, aspect, fitOptions)
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
    topClear = null,
    isPreview,
    initialCameraView = null,
    xrDefaultMode = 'none',
    canOfferXrEntry = false,
    // the lamps as the desk's live look poses them (RoomLookFollower), or null
    posedEntities = null,
    // output mode (viewport/outputMode.js): the room drawn light enough for a phone
    outputMode = false,
    lockInside = false,
    onBuilding,
    onLockPaused
}) {
    // The seed can frame a custom entry view on first paint, but fixed-camera
    // and code presentations are authored choices and always win over it.
    const [cameraView, setCameraView] = useState(() => {
        const documentEntryView = document.presentationState?.entryView || 'scene'
        if (!initialCameraView || documentEntryView === 'fixed-camera' || documentEntryView === 'code') {
            return resolveViewerCamera(document, undefined, { fitDoors: isPlatformOwnSpace(spaceId) })
        }
        return initialCameraView
    })
    const previousEntryViewRef = useRef(document.presentationState?.entryView || 'scene')
    const controlsRef = useRef(null)
    const caged = isCameraCaged(entryView, document.presentationState?.fixedCamera)

    // Blender's view keys in the PUBLIC viewer (they lived only in Studio's editor: Numpad 1/3/7 front/right/top, Ctrl = back/left/bottom,
    // Numpad 2/4/6/8 orbit 15 deg, Home = frame all; no numpad: Shift+1/3/7, Shift+Arrows). Same pure resolver and runner as Studio
    // (viewAxisPose.js resolveViewKey, viewCommands.js runViewCommand). Measured 2026-10-08: none of these moved the public camera.
    // Not while a caged (fixed) camera is on, nor while typing or on a widget that owns the key.
    const entitiesRef = useRef(document.entities || [])
    entitiesRef.current = document.entities || []
    useEffect(() => {
        if (caged || typeof window === 'undefined') return undefined
        const onKey = (event) => {
            const t = event.target
            if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest?.('[role="slider"],[role="listbox"],[role="menu"],[role="dialog"]'))) return
            const command = resolveViewKey(event)
            if (!command || !controlsRef.current) return
            event.preventDefault()
            runViewCommand(controlsRef.current, command, { entities: entitiesRef.current, selectedEntities: [] })
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [caged])

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
            return resolveViewerCamera(document, undefined, { fitDoors: isPlatformOwnSpace(spaceId) })
        })
    }, [document, spaceId])

    const xr = useXrAr({
        default3DView: cameraView || resolveViewerCamera(document, undefined, { fitDoors: isPlatformOwnSpace(spaceId) }),
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

    // The smart view (docs/architecture/SMART_VIEW.md) for a visitor: the camera kept out
    // of the floor and near the building, the cutaway from outside, the occlusion fade,
    // the view row and #view-… links. Not on a caged (locked) composition, and not on a
    // thumbnail. Inside somebody else's page (?embed=1) the row stays off — embed is
    // glass — unless the host asks for it with &views=1 (the visualiser's split).
    const [smartView] = useState(() => {
        const embed = isEmbedRequest()
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        return {
            bar: embed && params?.get('views') !== '1' ? false : 'visitor',
            constraints: true,
            deepLink: !embed
        }
    })

    // The "Inside" toggle (PublicProjectViewer) and its two reports travel with the smart view's settings.
    const smartViewLive = useMemo(() => ({ ...smartView, lockInside, onBuilding, onLockPaused }), [smartView, lockInside, onBuilding, onLockPaused])

    return (
        <>
            {navMode === 'walk' ? (
                <LiveProjectScene
                    // a new renderer on a quality switch: antialias is fixed when the context is made
                    key={outputMode ? 'lite' : 'full'}
                    outputMode={outputMode}
                    projectId={projectId}
                    spaceId={spaceId}
                    // Walk/Fly keeps the look the desk is playing: the walk scene loads its own
                    // copy of the document, and drew the room as saved (a green look walked
                    // into amber) until it was handed the posed lamps
                    entitiesOverride={posedEntities}
                    interactive
                    showChrome
                    title={title}
                    onExit={() => onNavModeChange('orbit')}
                    exitLabel="← View mode"
                    topClear={topClear}
                />
            ) : hasGraph ? (
                <PublicGraphSurface
                    document={document}
                    interactive={!caged && !isPreview}
                />
            ) : (
                <StudioViewport
                    key={outputMode ? 'lite' : 'full'}
                    document={document}
                    selectedEntityId={null}
                    onSelectEntity={null}
                    cursors={{}}
                    onCursorMove={null}
                    onCursorLeave={null}
                    cameraView={cameraView || resolveViewerCamera(document, undefined, { fitDoors: isPlatformOwnSpace(spaceId) })}
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
                    // Gated on !isPreview: a Studio space-card thumbnail
                    // (SpaceHub.jsx's SpaceCardPreview, `?preview=1`) is a
                    // static picture by design -- a wall of cards each running
                    // authored animation, fog and RenderSettingsEffect at once
                    // is the laptop-killer the picture/live split exists to
                    // avoid. Only the one card a visitor clicked into "live"
                    // (SpaceCardLive, no ?preview=1) gets timelines playing.
                    playTimelines={!isPreview}
                    // A visitor's click on an object with a link follows it.
                    // Not on a space-card picture (?preview=1).
                    followLinks={!isPreview}
                    smartView={!caged && !isPreview ? smartViewLive : null}
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
