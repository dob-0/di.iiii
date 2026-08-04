import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, XROrigin } from '@react-three/xr'
import { useXrAr } from '../hooks/useXrAr.js'
import Backdrop from './Backdrop.jsx'
import DirectorPanel from './DirectorPanel.jsx'
import LightHaze from './LightHaze.jsx'
import LookAround from './LookAround.jsx'
import OrbitView from './OrbitView.jsx'
import RitualClockDriver from './RitualClockDriver.jsx'
import SceneLights, { AmbientFill } from './SceneLights.jsx'
import SplitHandle from './SplitHandle.jsx'
import Standpoint from './Standpoint.jsx'
import ViewerDolly from './ViewerDolly.jsx'
import TransformGizmo, { GIZMO_MODES, gizmoModesFor } from './TransformGizmo.jsx'
import SpatialScore from './SpatialScore.jsx'
import { isDirectorEnabled } from './directorFlag.js'
import { reelPlayers } from './reelPlayers.js'
import { XR_AR_ONLY, xrAvailability } from './xrAvailability.js'
import { describeEyeHeight } from './xrStandpoint.js'
import { totalDurationSec } from './editList.js'
import {
    patchFromGizmo,
    resolveGroupTransform,
    setTransform
} from './sequenceTransform.js'
import {
    OUTSIDE_FOG_SCALE,
    STANDPOINT,
    VIEW_INSIDE,
    VIEW_OUTSIDE,
    isOutside
} from './stageView.js'
import { formatSplit, readSplit, writeSplit } from './splitLayout.js'
import { resolveTravel } from './viewerTravel.js'
import { parseLightName, setLightValue } from './worldLights.js'
import { clipProgress, sourceProgress, useRitualClock } from './ritualClock.js'
import { SEQUENCES } from './sequences/index.js'
import useAutoHideChrome from './useAutoHideChrome.js'
import useEditHistory from './useEditHistory.js'
import usePanelToggle from './usePanelToggle.js'
import './algoVrithm.css'

// algovrithm — a virtual installation on hyperreality: pixels and code
// becoming reality. For an audience the piece plays itself; there is nothing
// to operate.
//
// The scene is code, not a Studio project document, so the Studio editor has
// nothing to open for this space. Structure:
//
//   ritualClock.js       one playhead, in seconds, plus a transport
//   sequences/index.js   the edit list — which sequence owns which seconds
//   sequences/*.jsx      one file per beat, each gets local 0..1 progress
//   editList.js          timeline maths (move/trim/ripple, gap detection)
//   DirectorPanel.jsx    author-only timeline (see directorFlag.js)
//
// Add a beat by writing a sequence file and adding a row to the edit list —
// the director panel can retime and reorder, but a new beat is real code and
// so starts as a real file.

// Standing eye height. The viewer never moves — sequences travel past them
// (see the VR rule in WhiteTunnel.jsx). Shared with stageView's STANDPOINT so
// the outside view's marker cannot drift from the real camera.
const EYE_HEIGHT = STANDPOINT.y

// Module constants, not inline literals. The playhead lives above <Canvas> so
// the director panel can share it, which means Canvas re-renders every frame —
// and a fresh `camera`/`style` object each time would have R3F re-apply the
// camera 60 times a second, fighting LookAround for control of it.
const CAMERA = { position: [0, EYE_HEIGHT, 0], fov: 72, near: 0.05, far: 200 }

// Resolution ceiling, and the single cheapest performance decision in the piece.
//
// Fragment cost scales with the SQUARE of this: a phone reporting DPR 3 rendered
// at the old cap of 2 is drawing 4× the pixels of 1×, and this piece is unusually
// fragment-heavy — the metaball field raymarches per pixel, and the reel globe
// samples two video textures per pixel across a whole surround. Those are the
// beats where a phone drops frames, in proportion to this number.
//
// Split by device rather than capped globally, because the two cases want
// opposite things. A desktop monitor at DPR 2 has the GPU to spend and the test
// pattern's hard black-on-white edges alias visibly below it. A phone or a
// standalone headset has neither the GPU nor, at arm's length through a lens,
// the ability to show the difference — 1.5 there is a 1.8× cut in every
// per-pixel cost for something nobody can see.
//
// Read once at module load: devicePixelRatio does not change without a reload,
// and re-evaluating it per render would hand R3F a new array every frame.
const MOBILE_LIKE = typeof window !== 'undefined'
    && (window.matchMedia?.('(pointer: coarse)').matches ?? false)
const DPR = MOBILE_LIKE ? [1, 1.5] : [1, 2]
const CANVAS_STYLE = { position: 'absolute', inset: 0, display: 'block', touchAction: 'none' }

function Director({ playheadSec, sequences }) {
    return (
        <>
            {sequences.map((sequence) => {
                const { id, startSec, endSec, Component, asset } = sequence
                const windowProgress = clipProgress(playheadSec, startSec, endSec)
                // Unmounted entirely while off its window, so an unplayed
                // sequence costs nothing per frame.
                if (windowProgress === null) return null

                // What this clip shows OF ITS OWN MATERIAL. Identical to the
                // window position until the clip has been cut, at which point
                // each half plays only its share — see sourceProgress in
                // ritualClock.js for why a cut needs this to be a cut.
                const progress = sourceProgress(windowProgress, sequence.source)

                // Placement lives on the edit list row, not in the sequence's
                // geometry — polar for asset clips, cartesian for written
                // sequences (see sequenceTransform.js). Either way the group
                // sits where the content sits, which is what puts the drag
                // handles on the object instead of on the floor.
                //
                // The wrapper is always present rather than conditional on a
                // non-identity transform, because mounting/unmounting a group
                // remounts the sequence inside it and would restart its
                // animation the first time anyone nudged it.
                const { position, rotation, scale } = resolveGroupTransform(sequence)

                return (
                    // `name` is how TransformGizmo finds this group. Groups
                    // mount and unmount as the playhead crosses their windows,
                    // so a name lookup survives what a threaded ref would not.
                    <group
                        key={id}
                        name={id}
                        position={position}
                        rotation={rotation}
                        scale={scale}
                    >
                        {/* `asset` is undefined for hand-written sequences,
                            which ignore the prop — only AssetClip reads it. */}
                        <Component progress={progress} asset={asset} />
                    </group>
                )
            })}
        </>
    )
}

function Stage({
    playheadSec,
    sequences,
    durationSec,
    view,
    onEnterInside,
    dragRef,
    selectedId,
    gizmoMode,
    onTransformChange,
    onTransformDragStart,
    suppressOrbitRef,
    onEyeHeight
}) {
    const outside = isOutside(view)
    const originRef = useRef(null)

    // Where the viewer has been carried to. Recomputed per frame from the
    // playhead, so it is derived state — nothing to keep in sync, and scrubbing
    // the timeline moves the viewer to exactly where they would have been.
    const travel = useMemo(
        () => resolveTravel(sequences, playheadSec),
        [sequences, playheadSec]
    )

    return (
        <>
            {/* Background and fog are driven per-sequence and blended across
                the handover — see Backdrop.jsx. Fog far planes sit well short
                of each scene's depth so it dissolves instead of ending on a
                visible rim: the cue that sells "this keeps going". */}
            <Backdrop
                playheadSec={playheadSec}
                sequences={sequences}
                fogScale={outside ? OUTSIDE_FOG_SCALE : 1}
            />
            {/* One camera controller at a time. Both write camera.rotation
                every frame, so mounting both would have them fight — see the
                note in OrbitView.jsx. LookAround is flat-screen only and
                no-ops during an XR session, where the headset already
                provides the 360 view. */}
            {outside
                ? <OrbitView dragRef={dragRef} suppressRef={suppressOrbitRef} travel={travel} />
                : <LookAround />}
            {/* Passive locomotion. Mounted in both views: from outside you are
                watching the standpoint itself glide through the installation,
                which is the only way to judge a travel move without riding it. */}
            <ViewerDolly offset={travel} originRef={originRef} onEyeHeight={onEyeHeight} />
            {outside && (
                <Standpoint
                    onEnter={onEnterInside}
                    dragRef={dragRef}
                    suppressRef={suppressOrbitRef}
                    travel={travel}
                />
            )}
            {/* Placement handles. Outside only: the gizmo is a thing you look
                AT, and from inside the piece it would be sitting in the middle
                of the work you are trying to judge. */}
            {outside && (
                <TransformGizmo
                    selectedId={selectedId}
                    mode={gizmoMode}
                    onChange={onTransformChange}
                    onDragStart={onTransformDragStart}
                    suppressOrbitRef={suppressOrbitRef}
                />
            )}
            {/* The play space. ViewerDolly moves THIS during an XR session rather
                than the camera, which the headset owns outright. */}
            <XROrigin ref={originRef} position={[0, 0, 0]} />
            {/* Atmosphere, not a sequence: it belongs to the room and runs for
                the whole piece, so the individual beats never have to hand it
                over to each other. See LightHaze.jsx for why this is in-scene
                geometry rather than a post-process bloom. */}
            <LightHaze />
            {/* ONE fill light for the whole piece, at the blend of every active
                row's `ambient` and coloured by the room itself rather than
                white. See AmbientFill in SceneLights.jsx. */}
            <AmbientFill playheadSec={playheadSec} sequences={sequences} />
            {/* Authorable lamps, mounted outside the sequence groups on
                purpose: a light belongs to the room, not to the content, so
                nudging a sequence's placement must not drag its lighting with
                it — and the gizmo can only write back a world position while
                the light's parent is the scene itself. */}
            {sequences.map((sequence) => {
                if (!sequence.lights?.length) return null
                return (
                    <SceneLights
                        key={sequence.id}
                        rowId={sequence.id}
                        lights={sequence.lights}
                        progress={clipProgress(playheadSec, sequence.startSec, sequence.endSec)}
                    />
                )
            })}
            <Director playheadSec={playheadSec} sequences={sequences} />
            {/* Synthesized spatial sound for every beat that carries none of
                its own, plus the veil's static. Reads the same playhead and
                edit list as the visuals, so a retimed row moves its sound and
                a cut row falls silent. See SpatialScore.jsx. */}
            <SpatialScore
                sequences={sequences}
                playheadSec={playheadSec}
                durationSec={durationSec}
            />
            {/* THE GLITCH VEIL IS OUT (2026-08-04, her call: "remove this,
                noisy, it's in every scene, i don't like it").

                It was doing two jobs and the second one is the reason this is
                a comment rather than a deletion. Job one was style — the feed
                breaking up between beats. Job two was covering the handover:
                two overlapping sequences cross-fading in stereo is a double
                exposure, two worlds at two depths that the eyes cannot
                converge on at once (the long argument is at the top of
                transitions.js, and it is about a headset, not a monitor).

                So handovers now dissolve raw. On the flat page that is fine
                and quieter, which is what she asked for. In the headset it is
                the thing the veil existed to prevent — judge it there before
                calling this settled, and if the crossings feel like a smear,
                the fix is NOT to bring the noise back at full strength: put
                <TransitionVeil> back (import + these four lines, both still in
                the tree) and drop VEIL_PEAK from 0.72 toward ~0.25, which is a
                thin scatter rather than the wall in her screenshot.

                Everything the veil drove is still wired: transitions.js is
                untouched and SpatialScore still reads totalVeil — its glitch
                voice is gated to zero alongside this so the piece is not left
                hissing at a handover with nothing on screen to explain it. */}
        </>
    )
}

// Memoized so the per-frame playhead above does not re-render the chrome 60
// times a second — none of it depends on the playhead.
const Chrome = memo(function Chrome({
    visible,
    isXrPresenting,
    supportedXrModes,
    isFullscreen,
    isFullscreenSupported,
    onToggleFullscreen,
    onEnterXr,
    onExitXr,
    directorEnabled,
    panelsOpen,
    xrAvailable,
    onRecheckXr,
    xrEye
}) {
    const canEnterXr = (supportedXrModes.vr || supportedXrModes.ar) && !isXrPresenting
    const hidden = visible ? '' : ' is-hidden'

    return (
        <>
            <header className={`algo-vrithm-chrome${hidden}`}>
                <span className="algo-vrithm-title">algovrithm</span>
                {/* Non-VR-literate visitors will not discover look-around on
                    their own. One line, no interface. */}
                <span className="algo-vrithm-sub">
                    {isXrPresenting ? 'algorithmic rhythm · webxr' : 'drag to look around'}
                    {/* The only trace the panel leaves when closed, and only
                        for the author. Without it the shortcut is unfindable —
                        a hidden panel and a broken one look identical, which is
                        the same mistake xrAvailability.js exists to undo. */}
                    {directorEnabled && !panelsOpen && !isXrPresenting && (
                        <em className="algo-vrithm-panel-hint"> · press H for the director</em>
                    )}
                </span>
            </header>

            <div className={`algo-vrithm-actions${hidden}`}>
                {/* Fullscreen is not a VR control — a WebXR session owns the
                    headset display and ignores the window entirely. This is for
                    the flat-screen showing: a laptop or projector where browser
                    chrome sits around the piece and wrecks it. */}
                {isFullscreenSupported && !isXrPresenting && (
                    <button type="button" onClick={onToggleFullscreen}>
                        {isFullscreen ? 'Exit full screen' : 'Full screen'}
                    </button>
                )}
                {canEnterXr && supportedXrModes.vr && (
                    <button type="button" onClick={() => onEnterXr('vr')}>Enter VR</button>
                )}
                {canEnterXr && supportedXrModes.ar && (
                    <button type="button" onClick={() => onEnterXr('ar')}>Enter AR</button>
                )}
                {/* Author-only, and only when VR is NOT available. An absent
                    Enter VR button is indistinguishable from a broken one, so
                    where the audience gets clean chrome the author gets the
                    actual reason and a way to retry — starting Link after the
                    page loaded is the normal case, and it needs no reload.
                    Behind the panel toggle because it is diagnostics, not a
                    control: on a phone, where it would otherwise be permanent
                    (no headset is ever going to appear), it would sit next to
                    Enter AR forever. */}
                {panelsOpen && !isXrPresenting && xrAvailable.state !== 'ready' && (
                    <button
                        type="button"
                        className="algo-vrithm-xr-unavailable"
                        onClick={onRecheckXr}
                    >
                        {/* Recheck only means something when re-asking could
                            change the answer. On a phone it cannot — no headset
                            is going to appear — so promising a retry there sends
                            the author tapping a button forever. */}
                        {xrAvailable.state === XR_AR_ONLY ? 'No VR on this device' : 'No VR · Recheck'}
                        {/* Rendered, not a title tooltip. This message matters
                            most on the device that cannot show one: a headset
                            browser has no hover, and the whole point is to be
                            readable while you are standing in the thing. */}
                        <em>{`${xrAvailable.reason} — ${xrAvailable.fix}`}</em>
                    </button>
                )}
                {/* What the last headset session reported about the floor.
                    Author-only, and shown AFTER the session rather than during
                    it: it is read by someone who has just taken the headset
                    off, and a standalone headset browser is not somewhere you
                    can open a console. Absent until a session has happened. */}
                {panelsOpen && !isXrPresenting && xrEye && (
                    <span className="algo-vrithm-xr-eye">{describeEyeHeight(xrEye)}</span>
                )}
                {isXrPresenting && (
                    <button type="button" onClick={onExitXr}>Exit</button>
                )}
            </div>
        </>
    )
})

/**
 * @param embedded  true when this is mounted inside another surface — Studio's
 *                  director page — rather than owning the window. The root is
 *                  `position: fixed; inset: 0` by default, which would cover
 *                  whatever it was placed under; `is-embedded` makes it absolute
 *                  so it fills the box it is given instead. See algoVrithm.css.
 * @param director  forces the panel on, for a route whose whole purpose is the
 *                  panel. Left undefined the flag decides, as it always has.
 */
export default function AlgoVrithmExperience({ embedded = false, director = undefined } = {}) {
    const xr = useXrAr()
    const rootRef = useRef(null)
    const flagDirector = useMemo(() => isDirectorEnabled(), [])
    const directorEnabled = director === undefined ? flagDirector : director

    // ---- WARM THE FOOTAGE ---------------------------------------------------
    //
    // Build the video pool the moment the piece opens, not when the footage beat
    // arrives. This is one line and it is the difference between the reel globe
    // opening instantly and opening on a wall of black.
    //
    // reelPlayers() is lazy and shared, and until now its only caller was inside
    // ReelGlobe's own useMemo — which runs when that sequence MOUNTS, twenty-
    // eight seconds into the piece. So 31 clips and about 190MB began loading at
    // the exact instant they were first needed, with no lead time at all, and
    // every cell whose clip had not buffered yet drew black. The swipe made it
    // worse rather than causing it: a swipe needs TWO clips ready per slot.
    //
    // Calling it here gives the browser the whole tunnel, scan, test pattern,
    // metaball and sphere — twenty-eight seconds — to buffer in the background.
    // The elements are created muted with preload='auto' and are not played
    // until the beat, so this costs bandwidth early and nothing else; the beats
    // it loads under are the cheapest in the piece to render.
    //
    // It does NOT replace compressing the source. See the assets README: the
    // reels are drawn about 1.4m wide on a 7m shell, so full-resolution footage
    // is being decoded and thrown away.
    // Deferred by a beat rather than run inline. Warming at mount put ~190MB of
    // video in front of the app's own modules and the first frame, so the piece
    // took visibly longer to START in exchange for the reel beat arriving full.
    // Waiting for the browser to go idle gives the tunnel a clear run and still
    // leaves twenty-plus seconds of lead before the footage is needed.
    //
    // requestIdleCallback is not in Safari, so the timeout is the real path on
    // an iPhone rather than a fallback nobody takes.
    useEffect(() => {
        const warm = () => { reelPlayers() }
        if (typeof window.requestIdleCallback === 'function') {
            const handle = window.requestIdleCallback(warm, { timeout: 2500 })
            return () => window.cancelIdleCallback?.(handle)
        }
        const handle = window.setTimeout(warm, 1200)
        return () => window.clearTimeout(handle)
    }, [])

    // The live edit list. Starts as the committed one and is only ever changed
    // by the director panel — the audience path never touches it. Edits reach
    // sequences/index.js, which stays the source of truth, via the panel's
    // "Save to source" (patches the file in place, dev only) or "Copy edit
    // list" (regenerates the array to paste).
    //
    // Behind an undo stack (Ctrl/Cmd+Z, Shift to redo). Only mounted for the
    // author: the audience has nothing to undo and should not carry a listener
    // for it. See useEditHistory.js for why continuous edits coalesce — without
    // that, one gizmo drag would be a hundred separate undos.
    const history = useEditHistory(SEQUENCES, { enabled: directorEnabled })
    const editList = history.present
    const setEditList = history.set
    const durationSec = useMemo(() => totalDurationSec(editList), [editList])

    // Above the Canvas so the director panel can share the transport. Entering
    // VR restarts the piece from the top, so a visitor who takes a while to get
    // the headset on still sees the opening.
    //
    // `loop` because this is an installation, not a screening: it runs
    // unattended for the length of an exhibition day, nobody is there to press
    // anything, and a visitor who walks up mid-piece only has to keep standing
    // there to see the beginning. The seam is covered — see the wrap in
    // ritualClock's advance().
    //
    // The clock does NOT tick itself; RitualClockDriver inside the Canvas does
    // that, so the piece runs on the headset's frame loop during a session.
    //
    // Declared HERE, high up: several things below read `clock.playheadSec`
    // during render (the gizmo's live-sequence list, for one), and a `const`
    // declared after its own readers is a temporal-dead-zone crash that takes
    // the whole route to a black screen. Keep new readers below this line.
    const clock = useRitualClock({
        durationSec,
        restartKey: xr.isXrPresenting,
        loop: true
    })

    // Inside or outside. Author-only, and forced back inside during an XR
    // session — a headset owns its own pose, so "watch yourself from across the
    // room" is not a thing that can exist there.
    const [view, setView] = useState(VIEW_INSIDE)
    const stageView = directorEnabled && !xr.isXrPresenting ? view : VIEW_INSIDE

    // Shared between OrbitView (which writes it) and Standpoint (which reads
    // it) so an orbit drag that happens to end over the marker is not also
    // treated as a click on it. A ref, not state: it changes on every pointer
    // move and must not re-render the Canvas.
    const dragRef = useRef({ moved: false, travel: 0 })

    // Set by the gizmo while a handle is being dragged, read by the orbit
    // camera so it stands down. A ref for the same reason as dragRef: it flips
    // on pointer events and must not re-render the Canvas.
    const suppressOrbitRef = useRef(false)

    // The row as it was when the current drag began. Only the scale handle
    // needs it — see patchFromGizmo.
    const dragBaselineRef = useRef(null)

    // Which sequence the placement handles are attached to, and what they do.
    // Where the author has put the seam between the piece and the editor.
    // Read once, on mount: this is a preference rather than shared state, and
    // re-reading it mid-session would fight the drag in progress.
    const [split, setSplit] = useState(() =>
        readSplit(typeof window === 'undefined' ? null : window.localStorage)
    )

    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        // Deferred: a drag fires this on every pointer move and localStorage
        // writes are synchronous. One write when the author stops moving.
        const timer = window.setTimeout(() => writeSplit(window.localStorage, split), 250)
        return () => window.clearTimeout(timer)
    }, [split])

    // Rebuilt only when the split actually changes — this file already pays
    // attention to per-render style objects (see CANVAS_STYLE below).
    const rootStyle = useMemo(() => ({ '--algo-vrithm-split': formatSplit(split) }), [split])

    const [selectedId, setSelectedId] = useState(null)
    const [gizmoMode, setGizmoMode] = useState(GIZMO_MODES[0].id)

    // One handler, two destinations: an asset clip's drag writes back into the
    // same four polar numbers the panel fields edit, so the handles and the
    // fields stay one source of truth rather than two controls disagreeing.
    const handleTransformChange = useCallback((dragged) => {
        if (!selectedId) return

        // A light is position-only, so the drag writes one field of one entry
        // in the row's `lights` array and ignores the rotation and scale the
        // gizmo also reports. The handles for those are suppressed anyway —
        // see gizmoModesFor.
        const light = parseLightName(selectedId)
        if (light) {
            setEditList((previous) => setLightValue(
                previous, light.rowId, light.lightId, 'position', dragged.position
            ))
            return
        }

        setEditList((previous) => previous.map((sequence) => {
            if (sequence.id !== selectedId) return sequence
            const patch = patchFromGizmo(sequence, dragged, dragBaselineRef.current ?? sequence)
            return patch.kind === 'placement'
                ? { ...sequence, asset: patch.asset }
                : setTransform([sequence], selectedId, patch.transform)[0]
        }))
        // `setEditList` is the history's `set`, which is stable for the hook's
        // life — but it is no longer a useState setter, so the lint rule can no
        // longer prove that and wants it declared.
    }, [selectedId, setEditList])

    const handleDragStart = useCallback(() => {
        dragBaselineRef.current = editList.find((sequence) => sequence.id === selectedId) ?? null
    }, [editList, selectedId])

    // What the gizmo can attach to right now. Recomputed against the playhead,
    // so a selection whose clip runs out simply stops being offered.
    const liveSequences = useMemo(
        () => editList.filter(
            (sequence) => clipProgress(clock.playheadSec, sequence.startSec, sequence.endSec) !== null
        ),
        [editList, clock.playheadSec]
    )

    // "Place" on a light in the panel. It has to do three things at once
    // because the handles only exist in one place: the gizmo is mounted from
    // the OUTSIDE view only (from inside, it would sit in the middle of the
    // work you are judging), so a place button that only set a selection would
    // appear to do nothing at all from where the author usually is.
    const placeTarget = useCallback((name) => {
        if (selectedId === name) {
            setSelectedId(null)
            return
        }
        setSelectedId(name)
        setGizmoMode('translate')
        setView(VIEW_OUTSIDE)
    }, [selectedId])

    // Where the last headset session actually put the viewer's eyes, and what
    // had to be done about it. Written once per session from inside the frame
    // loop (see ViewerDolly), so this is not a per-frame setState.
    const [xrEye, setXrEye] = useState(null)
    const handleEyeHeight = useCallback((measurement) => setXrEye(measurement), [])

    const enterInside = useCallback(() => setView(VIEW_INSIDE), [])
    const toggleStageView = useCallback(
        () => setView((previous) => (isOutside(previous) ? VIEW_INSIDE : VIEW_OUTSIDE)),
        []
    )

    // All authoring furniture, behind one key. Closed by default — see
    // usePanelToggle.js for why, and for why this is also the whole of the
    // phone story.
    const panels = usePanelToggle({ enabled: directorEnabled, initialOpen: embedded })

    // Auto-hide follows the panels, not the flag. With the panel closed the
    // author is watching the piece rather than working on it, and wants exactly
    // what an audience gets; keeping the header pinned because a dev flag
    // happens to be on would put furniture in shot.
    const chrome = useAutoHideChrome({ targetRef: rootRef, autoHide: !panels.open })


    // Read once: neither secure-context nor the presence of navigator.xr can
    // change during a page's life. Only DEVICE support changes, which is what
    // Recheck is for. Computed here rather than pulled from the diagnostics
    // snapshot because that builds a fresh object per call, and Chrome is
    // memoized — an unstable prop would re-render it on every frame.
    const xrEnvironment = useMemo(() => ({
        secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
        hasNavigatorXr: typeof navigator !== 'undefined' && Boolean(navigator.xr),
        hasIsSessionSupported: typeof navigator !== 'undefined' && Boolean(navigator.xr?.isSessionSupported)
    }), [])

    const xrAvailable = useMemo(
        () => xrAvailability(xrEnvironment, xr.supportedXrModes),
        [xrEnvironment, xr.supportedXrModes]
    )

    return (
        <div
            className={`algo-vrithm-root${embedded ? ' is-embedded' : ''}${directorEnabled ? ' has-director' : ''}${panels.open ? ' is-split' : ''}`}
            ref={rootRef}
            style={rootStyle}
        >
            {/* The piece's own half of the split — the top 55% while the editor
                is open, and the whole window when it is closed, which is the
                audience layout at the aspect ratio they actually get.
                Also the Canvas's positioning context: the canvas stays
                `absolute; inset: 0` and simply fills this, which is what keeps
                CANVAS_STYLE a module constant. A style object rebuilt per render
                would have R3F re-apply the camera sixty times a second. */}
            <div className="algo-vrithm-stagearea">
                {/* `flat` = no tone mapping, and it is a CORRECTNESS setting
                    here, not a look. R3F's default ACES curve maps 1.0 to
                    about 0.8, and the one thing it was being applied to was
                    scene.background — every material in the piece already
                    opts out with toneMapped={false}. Result: the two white
                    worlds (test pattern, metaball field) rendered a MID-GREY
                    sky behind content whose fog wash was true white, visibly
                    two different "whites" in one room. The piece is authored
                    in absolute values everywhere; the background now honours
                    them too. */}
                <Canvas flat dpr={DPR} camera={CAMERA} style={CANVAS_STYLE}>
                    <XR store={xr.xrStore}>
                        {/* Sits above the Suspense boundary on purpose: a
                            sequence suspending on an asset must not take the
                            playhead down with it. Renders nothing — see
                            RitualClockDriver.jsx for why the clock is ticked
                            from in here rather than from a
                            window.requestAnimationFrame loop in the hook. */}
                        <RitualClockDriver advance={clock.advance} />
                        <Suspense fallback={null}>
                            <Stage
                                playheadSec={clock.playheadSec}
                                sequences={editList}
                                durationSec={durationSec}
                                view={stageView}
                                onEnterInside={enterInside}
                                dragRef={dragRef}
                                selectedId={selectedId}
                                gizmoMode={gizmoMode}
                                onTransformChange={handleTransformChange}
                                onTransformDragStart={handleDragStart}
                                suppressOrbitRef={suppressOrbitRef}
                                onEyeHeight={handleEyeHeight}
                            />
                        </Suspense>
                    </XR>
                </Canvas>
            </div>

            <Chrome
                visible={chrome.chromeVisible}
                isXrPresenting={xr.isXrPresenting}
                supportedXrModes={xr.supportedXrModes}
                isFullscreen={chrome.isFullscreen}
                isFullscreenSupported={chrome.isFullscreenSupported}
                onToggleFullscreen={chrome.toggleFullscreen}
                onEnterXr={xr.handleEnterXrSession}
                onExitXr={xr.handleExitXrSession}
                directorEnabled={directorEnabled}
                panelsOpen={panels.open}
                xrAvailable={xrAvailable}
                onRecheckXr={xr.refreshXrSupport}
                xrEye={xrEye}
            />

            {/* Author-only, behind the H toggle, and hidden during an XR
                session where a DOM panel is neither visible nor reachable
                anyway. The view toggle sits directly above the panel rather
                than floating over it — both are authoring furniture and they
                share one bottom stack, so one condition hides all of it. */}
            {/* Sits between the two halves, on the same condition as the
                editor: with the panel closed there is no seam to move, and in
                an XR session there is no DOM to move it with. */}
            {panels.open && !xr.isXrPresenting && (
                <SplitHandle split={split} onSplit={setSplit} />
            )}

            {panels.open && !xr.isXrPresenting && (
                <div className="algo-vrithm-stage">
                    {/* Placement handles attach to a mounted group, so only
                        sequences currently on screen can be selected — pick a
                        clip that has not started and there is nothing in the
                        room to drag. Scrub to it first. */}
                    {isOutside(stageView) && (
                        <div className="algo-vrithm-stage-select">
                            {liveSequences.length === 0 && (
                                <span className="algo-vrithm-stage-empty">
                                    nothing on screen — scrub to a clip to place it
                                </span>
                            )}
                            {liveSequences.map((sequence) => (
                                <button
                                    type="button"
                                    key={sequence.id}
                                    className={sequence.id === selectedId ? 'is-selected' : ''}
                                    onClick={() => setSelectedId(
                                        sequence.id === selectedId ? null : sequence.id
                                    )}
                                >
                                    {sequence.title}
                                </button>
                            ))}
                            {selectedId && (
                                <span className="algo-vrithm-stage-modes">
                                    {/* A light gets "move" and nothing else —
                                        it has no facing and no size. */}
                                    {gizmoModesFor(selectedId).map((option) => (
                                        <button
                                            type="button"
                                            key={option.id}
                                            className={option.id === gizmoMode ? 'is-active' : ''}
                                            onClick={() => setGizmoMode(option.id)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="algo-vrithm-stage-view">
                        <button
                            type="button"
                            className={isOutside(stageView) ? 'is-outside' : ''}
                            onClick={toggleStageView}
                        >
                            {isOutside(stageView)
                                ? '↧ step inside'
                                : '⤢ see whole installation'}
                        </button>
                    </div>
                    <DirectorPanel
                        sequences={editList}
                        onChange={setEditList}
                        clock={clock}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onPlace={placeTarget}
                    />
                </div>
            )}
        </div>
    )
}
