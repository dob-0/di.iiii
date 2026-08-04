import { memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, XROrigin } from '@react-three/xr'
import { useXrAr } from '../hooks/useXrAr.js'
import Backdrop from './Backdrop.jsx'
import LightHaze from './LightHaze.jsx'
import LookAround from './LookAround.jsx'
import RitualClockDriver from './RitualClockDriver.jsx'
import SceneLights, { AmbientFill } from './SceneLights.jsx'
import ViewerDolly from './ViewerDolly.jsx'
import SpatialScore from './SpatialScore.jsx'
import { reelPlayers } from './reelPlayers.js'
import { totalDurationSec } from './editList.js'
import { resolveGroupTransform } from './sequenceTransform.js'
import { STANDPOINT } from './stageView.js'
import { resolveTravel } from './viewerTravel.js'
import { clipProgress, sourceProgress, useRitualClock } from './ritualClock.js'
import { SEQUENCES } from './sequences/index.js'
import useAutoHideChrome from './useAutoHideChrome.js'
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
//
// Add a beat by writing a sequence file and adding a row to the edit list.
//
// THE EDITOR IS NOT HERE ANY MORE (2026-08-05). The director panel, the
// placement gizmo, the outside "see whole installation" view and the split
// layout moved to the Raw lane — see src/raw/components/DirectorPanelWindow.
// What is left is the piece as an audience gets it: it plays itself, full
// screen, and in VR or AR. There is nothing here to operate, which is why
// there is no longer a flag guarding whether the operating furniture appears.
//
// Retiming is now done in Raw against the same edit list, or by editing
// sequences/index.js directly, which stays the source of truth either way.

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

function Stage({ playheadSec, sequences, durationSec }) {
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
            <Backdrop playheadSec={playheadSec} sequences={sequences} fogScale={1} />
            {/* The viewer stands inside the piece and looks around. LookAround
                is flat-screen only and no-ops during an XR session, where the
                headset already provides the 360 view. The orbit camera that
                used to be the other half of this choice was the author's
                outside view and left with the editor. */}
            <LookAround />
            {/* Passive locomotion — sequences travel past a viewer who never
                walks. */}
            <ViewerDolly offset={travel} originRef={originRef} />
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
    onExitXr
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
                {isXrPresenting && (
                    <button type="button" onClick={onExitXr}>Exit</button>
                )}
            </div>
        </>
    )
})

export default function AlgoVrithmExperience() {
    const xr = useXrAr()
    const rootRef = useRef(null)

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

    // The committed edit list, played as written. Nothing on this path mutates
    // it: editing moved to Raw, and sequences/index.js is the source of truth.
    const editList = SEQUENCES
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

    // The header hides itself while the piece plays — there is no authoring
    // furniture left to keep it pinned for.
    const chrome = useAutoHideChrome({ targetRef: rootRef, autoHide: true })


    return (
        <div className="algo-vrithm-root" ref={rootRef}>
            {/* The whole window, always — the audience layout at the aspect
                ratio they actually get.
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
            />

        </div>
    )
}
