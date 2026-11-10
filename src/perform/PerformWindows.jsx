import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapCueList from '../map/MapCueList.jsx'
import MapInspector from '../map/MapInspector.jsx'
import { MapMachinesList, MapSurfaceList, MapWallView, nextCorners } from '../map/MapDeskParts.jsx'
import { buildMapOutputPath, buildMapPath } from '../map/mapRouting.js'
import { cueForKey, isCueKey } from '../map/cueFiring.js'
import { fireLightLook, lightRelation, lightingDeskPath, setLightLooksBlackout, setLightLooksMaster } from '../map/lightingLink.js'
import { useMachinePresence } from '../project/tops/useMachinePresence.js'
import { toTopNetwork } from '../project/tops/useTopNetwork.js'
import { registerTopThumbnail } from '../project/tops/topThumbnails.js'
import { pictureIdOf, setMaster } from '../project/tops/vjDeck.js'
import { listProjects } from '../project/services/projectsApi.js'
import { phaseAt } from '../timeline/showClock.js'
import { useShowClockContext } from './useShowClock.js'
import useLaser from './useLaser.js'
import useLightLooks from './useLightLooks.js'
import useSliderSend from './useSliderSend.js'
import { goLaserLook, laserDeskPath, laserLooksPath, setLaserBlackout, setLaserFollowLight, setLaserMaster } from '../map/laserLink.js'
// The Projection desk's own stylesheet: its panes look here exactly as they do there.
import '../map/mapSurface.css'
import { WINDOW_KINDS, isKnownKind } from './presets.js'

// What each Perform window shows. Every one is a NATIVE window — a React part
// of this page on the same project document — or it says, dimly and in
// words, that it is not one yet. Nothing here frames a di.iiii page: a
// sandboxed frame of one breaks module loading in Firefox (known 2026-09-03).
//
// The windows share one context (`ctx`), built by PerformDesk:
//   document, spaceId, projectId, applyLocalOps, mapApi, renderNode,
//   machines, wall: { selectedId, setSelectedId, soloId, setSoloId, liveCueId, setLiveCueId },
//   onAddDeck, isLocalInstall

const firstOfType = (nodes, typeId) => (nodes || []).find((node) => node.typeId === typeId) || null

// THE ANATOMY (2026-11-10, owner: "like lego and minimal"). Every block is one
// header row (DesktopWindow's, restyled in perform.css) and a body made of
// these few parts, in perform.css, and nothing else:
//   Status   one line of at most four words, mono, uppercase; a hint is a `title`
//   Mark     a small square: filled = live, empty = black, dim = absent
//   Switch   one square toggle (aria-pressed) — never a native checkbox
//   Slider   NAME, a thin track with a square thumb, the number
//   Tile     one equal cell of a look grid
// No sentence sits in a block. What a sentence used to say is in a `title`.
function Status({ children, title, role = 'status', tone = '' }) {
    return <p className={`perform-status${tone ? ` is-${tone}` : ''}`} title={title} role={role}>{children}</p>
}

function Mark({ state }) {
    return <i className={`perform-mark is-${state}`} aria-hidden="true" />
}

function Switch({ on, onChange, label, title, children, disabled = false }) {
    return (
        <button type="button" className={`perform-action perform-switch${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={label} title={title} disabled={disabled} onClick={() => onChange(!on)}>
            {children}
        </button>
    )
}

function Slider({ name, label, min, max, step, value, onChange, onPointerUp, onBlur, shown, disabled = false, title }) {
    return (
        <label className="perform-slider" title={title}>
            <span>{name}</span>
            <input type="range" className="perform-range" min={min} max={max} step={step} value={value} aria-label={label} disabled={disabled} onChange={onChange} onPointerUp={onPointerUp} onBlur={onBlur} />
            <output>{shown}</output>
        </label>
    )
}

// --- the deck ---------------------------------------------------------------

function DeckWindow({ ctx }) {
    const deck = firstOfType(ctx.document.nodes, 'vj.deck')
    if (!deck) {
        return (
            <div className="perform-pane">
                <Status title="A deck is a clip grid: layers of clips, blend, opacity and a master, played by tapping. Its picture goes to a Picture Out and onto the wall.">NO DECK</Status>
                <button type="button" className="perform-action" onClick={ctx.onAddDeck} disabled={!ctx.onAddDeck} aria-label="Add a VJ deck">Add deck</button>
            </div>
        )
    }
    return <div className="perform-pane perform-pane--flush">{ctx.renderNode(deck, { placement: 'perform' })}</div>
}

// --- a picture: the project's Picture Out, else the deck's master ------------

function PictureCanvas({ nodeId, label }) {
    const canvasRef = useRef(null)
    useEffect(() => registerTopThumbnail(nodeId, canvasRef.current?.getContext?.('2d')), [nodeId])
    return <canvas ref={canvasRef} className="perform-picture" width={640} height={360} role="img" aria-label={label} />
}

// Tall enough for the picture AND the line under it? A phone's Out window
// is not: there the picture keeps the window (the deck carries its own Out).
const useTallEnough = (min = 150) => {
    const ref = useRef(null)
    const [tall, setTall] = useState(true)
    useEffect(() => {
        const el = ref.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => setTall(entry.contentRect.height >= min))
        observer.observe(el)
        return () => observer.disconnect()
    }, [min])
    return [ref, tall]
}

function OutWindow({ ctx }) {
    const [paneRef, tall] = useTallEnough()
    const nodes = ctx.document.nodes || []
    const out = firstOfType(nodes, 'top.out')
    const deck = firstOfType(nodes, 'vj.deck')
    const source = out || deck
    if (!source) {
        return (
            <div className="perform-pane">
                <Status title="Add a VJ deck, or a Picture Out in Nodes: this window shows what it sends.">NO PICTURE</Status>
            </div>
        )
    }
    const surfaces = ctx.document.mappingState?.surfaces || []
    return (
        <div className="perform-pane" ref={paneRef}>
            <PictureCanvas nodeId={pictureIdOf(source)} label={out ? (out.label || 'Picture Out') : 'Deck output'} />
            {/* One line under the picture; a window too short for both keeps the picture. */}
            {tall ? (
                <div className="perform-row">
                    <Status title="A preview, a few frames a second. The projector’s picture is the output page.">{out ? (out.label || 'Picture Out') : 'Deck master'} · preview</Status>
                    {surfaces.length ? (
                        <button type="button" className="perform-action" onClick={() => window.open(buildMapOutputPath(ctx.spaceId, ctx.projectId), `di-map-out-${ctx.projectId}`, 'noopener')}>Open output</button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

// --- the clock ----------------------------------------------------------------

function useBeat(timeline, quantum = 4) {
    const [beat, setBeat] = useState(0)
    useEffect(() => {
        if (!timeline) return undefined
        let raf = 0
        const loop = () => {
            raf = requestAnimationFrame(loop)
            const next = Math.floor(phaseAt(timeline, Date.now(), quantum))
            setBeat((current) => (current === next ? current : next))
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [timeline, quantum])
    return beat
}

// WHY "the Light desk is not open" — the answer in code (asked 2026-11-10).
// The clock is read from the BARE /light/api/clock, which is not keyed to a
// space. `up:false` is its answer when no desk has been BUILT on this machine
// yet (serverXR/src/routes/lightingRoutes.js, the `!desk` clock branch) —
// that is "closed". When some desk is up it says `up:true` and names whose
// show it runs (`show`), and this page used to follow it whatever the show:
// a platina page followed moxir's tempo. `lightRelation` (lightingLink.js)
// keeps that behaviour (it is the clock's design: one desk per machine) and
// now says it: LIGHT: OTHER SHOW.
const LIGHT_WORDS = { closed: 'LIGHT DESK OFF', off: 'NO LIGHT DESK', other: 'LIGHT: OTHER SHOW' }
const LIGHT_WHY = {
    closed: 'The Light desk is not open on this machine; open it and it leads.',
    off: 'There is no Light desk here (it runs on a local di.iiii).',
    other: 'The open Light desk runs another space’s show. This page follows its tempo, and its looks stay shut.'
}

function ClockWindow({ ctx }) {
    const clock = useShowClockContext()
    const beat = useBeat(clock?.timeline)
    if (!clock) return <div className="perform-pane"><Status>NO CLOCK</Status></div>
    const light = clock.light
    const relation = lightRelation(light, ctx?.spaceId)
    const leaderWord = clock.leader === 'light'
        ? (relation === 'other' ? LIGHT_WORDS.other : 'LIGHT LEADS')
        : (relation === 'own' ? 'DECK TEMPO' : LIGHT_WORDS[relation] || 'DECK TEMPO')
    const why = clock.leader === 'light'
        ? `The Light desk leads${light?.show ? ` (${light.show}’s show)` : ''}. The deck follows it.${relation === 'other' ? ` ${LIGHT_WHY.other}` : ''}${clock.offset ? ` Clock offset ${Math.round(clock.offset.offset)} ms, round trip ${Math.round(clock.offset.rtt)} ms.` : ''}`
        : relation === 'own'
            ? 'The deck’s own tempo — this device does not follow the Light desk.'
            : `The deck’s own tempo. ${LIGHT_WHY[relation] || ''}`
    return (
        <div className="perform-pane perform-bar" data-leader={clock.leader} data-bpm={clock.timeline.bpm} data-epoch={clock.timeline.epoch}>
            <span className="perform-bpm" aria-label="Show tempo" title="BPM">{clock.timeline.bpm.toFixed(1)}</span>
            <div className="perform-beats" role="img" aria-label={`Beat ${beat + 1} of 4`}>
                {[0, 1, 2, 3].map((n) => <span key={n} className={`perform-beat${n === beat ? ' is-on' : ''}`} />)}
            </div>
            <button type="button" className="perform-action" onClick={() => clock.tap()} disabled={!clock.canTap}>Tap</button>
            <button type="button" className="perform-action" onClick={() => clock.reset()} disabled={!clock.canTap}>Reset</button>
            {light?.up ? <Switch on={clock.follow} onChange={clock.setFollow} label="Follow Light" title="Follow the Light desk’s tempo">Follow</Switch> : null}
            <Status title={why}>{leaderWord}</Status>
        </div>
    )
}

// --- master and blackout --------------------------------------------------------

// One tag per target: PICTURE / LIGHT / LASER, each live, black or absent, read
// from the real state (the deck's master, the Light desk's clock, the laser desk).
// A small square (filled = live, empty = black, dim = absent) and the word.
function StateTag({ name, state, note, why }) {
    return (
        <span className={`perform-state is-${state}`} data-target={name.toLowerCase()} data-state={state} title={why || `${name} ${state}`}>
            <Mark state={state} />
            {name}
            {note ? <span className="perform-state-note"> {note}</span> : null}
            <span className="perform-sr"> {state}</span>
        </span>
    )
}

// The laser desk has no show key (serverXR/src/laser: nothing in the desk or
// engine state names a space or show), so this page cannot tell whether it
// holds THIS space's laser look. It says so, in two words, instead of calm.
const LASER_SCOPE = 'MACHINE-WIDE'
const LASER_SCOPE_WHY = 'The laser desk belongs to this machine, not to a space: it holds no show key, so this page cannot tell whose look it is playing. Its blackout and master act on whatever it holds.'

function MasterWindow({ ctx }) {
    const clock = useShowClockContext()
    const light = clock?.light
    const relation = lightRelation(light, ctx.spaceId)
    // Only a desk that runs THIS space's show is ever written to. 'other' = another
    // show on this machine's desk: nothing is sent to it (the server would answer 409 too).
    const lightOwn = relation === 'own'
    const laser = useLaser()
    const deckNode = firstOfType(ctx.document.nodes, 'vj.deck')
    const deckMaster = Number(deckNode?.values?.deck?.master ?? 1)
    const [restore, setRestore] = useState(null) // the deck level before a blackout
    // True only when THIS page put the light / laser desk dark AND the desk said yes: only then does it lift it.
    const [laserSetHere, setLaserSetHere] = useState(false)
    const [lightSetHere, setLightSetHere] = useState(false)
    // Targets whose last POST failed, with the direction to retry: { LIGHT: 'on' | 'off', LASER: ... }.
    const [pending, setPending] = useState({})
    const laserUp = laser.desk?.reachable === true
    const laserBlack = laserUp && laser.desk.blackout === true
    const pendingNames = Object.keys(pending)
    const blackedOut = restore !== null || (lightOwn && light?.blackout === true) || lightSetHere || laserSetHere || pendingNames.length > 0
    const lightSlider = useSliderSend((raw) => setLightLooksMaster(raw / 255, { spaceId: ctx.spaceId }))
    const laserSlider = useSliderSend((level) => setLaserMaster(level))
    const writeDeckMaster = useCallback((level) => {
        if (!deckNode) return
        ctx.applyLocalOps({
            type: 'updateNode',
            payload: { nodeId: deckNode.id, patch: { values: { ...deckNode.values, deck: setMaster(deckNode.values?.deck, level) } } }
        })
    }, [ctx, deckNode])

    // One button, everything dark: the deck's master to zero (kept, to come
    // back to), the Light desk's blackout and the laser desk's blackout. The
    // wall shows the deck's picture, so it goes dark with it. Each target is
    // sent on its own; one that fails is named, keeps its own state and is
    // RETRIED by the next press (the others are not touched again). A flag
    // ("this page set it") is set only when the desk answered yes.
    // The Light is sent only to a desk that runs this space's show, at the
    // space's own address. Lifting the laser blackout never arms: arming is the Laser page's.
    const toggleBlackout = async () => {
        const jobs = [] // [name, direction, promise]
        const wasLaserBlack = laserBlack
        const sendLight = (dir) => jobs.push(['LIGHT', dir, setLightLooksBlackout(dir === 'on', { spaceId: ctx.spaceId })])
        const sendLaser = (dir) => jobs.push(['LASER', dir, setLaserBlackout(dir === 'on')])
        if (pendingNames.length) {
            for (const name of pendingNames) {
                if (name === 'LIGHT' && lightOwn) sendLight(pending.LIGHT)
                if (name === 'LASER' && laserUp) sendLaser(pending.LASER)
            }
        } else if (!blackedOut) {
            if (deckNode) {
                setRestore(deckMaster)
                writeDeckMaster(0)
            }
            if (lightOwn) sendLight('on')
            if (laserUp) sendLaser('on')
        } else {
            if (deckNode && restore !== null) writeDeckMaster(restore || 1)
            setRestore(null)
            if (lightOwn) sendLight('off')
            if (laserSetHere) sendLaser('off')
        }
        const results = await Promise.all(jobs.map(async ([name, dir, call]) => [name, dir, await call]))
        const next = { ...pending }
        for (const name of pendingNames) if (!jobs.some(([n]) => n === name)) delete next[name] // its target is gone: nothing to retry
        for (const [name, dir, ok] of results) {
            if (!ok) { next[name] = dir; continue }
            delete next[name]
            if (name === 'LIGHT') setLightSetHere(dir === 'on')
            if (name === 'LASER') setLaserSetHere(dir === 'on' ? !wasLaserBlack : false)
        }
        setPending(next)
        laser.refresh()
    }

    const pictureState = !deckNode ? 'absent' : (restore !== null || deckMaster === 0 ? 'black' : 'live')
    const lightState = pending.LIGHT ? 'failed' : (relation === 'other' ? 'other' : (!light?.up ? 'absent' : (light.blackout || lightSetHere ? 'black' : 'live')))
    const laserState = pending.LASER ? 'failed' : (!laserUp ? 'absent' : (laserBlack ? 'black' : 'live'))
    const shownLaser = laserSlider.local ?? (laserUp ? laser.desk.master : 1)
    const shownLight = lightSlider.local ?? (light?.master ?? 255)

    return (
        <div className="perform-pane perform-bar perform-master">
            <button
                type="button"
                className={`perform-action perform-action--danger${blackedOut ? ' is-on' : ''}`}
                aria-pressed={blackedOut}
                onClick={toggleBlackout}
                disabled={!deckNode && !lightOwn && !laserUp}
                title={pendingNames.length ? `Press again to retry: ${pendingNames.join(', ')}` : undefined}
            >
                {blackedOut ? 'Blackout · on' : 'Blackout'}
            </button>
            <div className="perform-states" role="group" aria-label="What is black">
                <StateTag name="PICTURE" state={pictureState} />
                <StateTag name="LIGHT" state={lightState} note={relation === 'other' ? 'other show' : ''} why={relation === 'other' ? LIGHT_WHY.other : undefined} />
                <StateTag name="LASER" state={laserState} note={laserUp ? LASER_SCOPE.toLowerCase() : ''} why={laserUp ? LASER_SCOPE_WHY : undefined} />
            </div>
            {pendingNames.length ? <Status role="alert" tone="danger" title="The others were sent. Press again to retry the ones named.">NO ANSWER: {pendingNames.join(', ')}</Status> : null}
            {deckNode ? (
                <Slider name="DECK" label="Deck master" min="0" max="1" step="0.01" value={deckMaster} shown={Math.round(deckMaster * 100)}
                    onChange={(event) => { setRestore(null); writeDeckMaster(Number(event.target.value)) }} />
            ) : null}
            {light?.up ? (
                <Slider name="LIGHT" label="Light master" min="0" max="255" step="1" value={shownLight} shown={Math.round((shownLight / 255) * 100)}
                    disabled={!lightOwn} title={lightOwn ? undefined : LIGHT_WHY.other}
                    onChange={(event) => { if (lightOwn) lightSlider.push(Number(event.target.value)) }}
                    onPointerUp={lightSlider.release} onBlur={lightSlider.release} />
            ) : null}
            {laserUp ? (
                <Slider name="LASER" label="Laser level" min="0" max="1" step="0.01" value={shownLaser} shown={Math.round(shownLaser * 100)}
                    onChange={(event) => laserSlider.push(Number(event.target.value))}
                    onPointerUp={laserSlider.release} onBlur={laserSlider.release} />
            ) : null}
        </div>
    )
}

// --- the light ------------------------------------------------------------------
//
// The Light desk's looks as tiles, beside the deck (picture) and the laser: the
// same anatomy as the Laser block. Press = fire (the call a cue makes). It asks
// the desk only when the show clock says one is up, and asks at the SPACE's own
// address, so a desk running another show answers "other show" and is not
// pressed (lightingLink.js, readLightLooks).

function LightLooksWindow({ ctx }) {
    const clock = useShowClockContext()
    const relation = lightRelation(clock?.light, ctx.spaceId)
    const { reading, refresh } = useLightLooks({ spaceId: ctx.spaceId, enabled: relation === 'own' })
    const masterSlider = useSliderSend((level) => setLightLooksMaster(level, { spaceId: ctx.spaceId }))
    if (relation !== 'own') {
        return <div className="perform-pane perform-light" data-light={relation}><Status title={LIGHT_WHY[relation]}>{LIGHT_WORDS[relation]}</Status></div>
    }
    if (!reading) return <div className="perform-pane perform-light"><Status>READING LIGHT</Status></div>
    if (reading.state !== 'own') {
        const word = reading.state === 'other' ? LIGHT_WORDS.other : LIGHT_WORDS.off
        return <div className="perform-pane perform-light" data-light={reading.state}><Status title={LIGHT_WHY[reading.state === 'other' ? 'other' : 'off']}>{word}</Status></div>
    }
    const shown = masterSlider.local ?? (reading.master ?? 255) / 255
    return (
        <div className="perform-pane perform-light" data-light="own" data-live={reading.liveId || ''}>
            <div className="perform-row">
                <Mark state={reading.blackout ? 'black' : 'live'} />
                <Status title={`${reading.looks.length} looks on the desk`}>{reading.blackout ? 'LIGHT BLACKOUT' : `${reading.looks.length} LOOKS`}</Status>
                <Slider name="MASTER" label="Light desk master" min="0" max="1" step="0.01" value={shown} shown={Math.round(shown * 100)}
                    onChange={(event) => masterSlider.push(Number(event.target.value))}
                    onPointerUp={masterSlider.release} onBlur={masterSlider.release} />
            </div>
            {reading.looks.length ? (
                <div className="perform-tiles" role="group" aria-label="Light looks">
                    {reading.looks.map((look) => (
                        <button
                            key={look.id}
                            type="button"
                            className={`perform-action perform-tile${reading.liveId === look.id ? ' is-live' : ''}`}
                            aria-pressed={reading.liveId === look.id}
                            data-look={look.id}
                            title={look.name}
                            onClick={async () => { await fireLightLook(look.id, { spaceId: ctx.spaceId }); refresh() }}
                        >
                            {look.name}
                        </button>
                    ))}
                </div>
            ) : <Status>NO LOOKS</Status>}
        </div>
    )
}

// --- the laser ------------------------------------------------------------------
//
// Reads /laser/api/state and /laser/desk/api/state; writes only what the Laser
// desk page itself writes for a look, its master and its follow-light switch.
// ARMING IS NOT HERE and is not reachable from here: "armed" is a read-only
// word and a link to the Laser page, where the owner's hand arms.

function LaserWindow() {
    const laser = useLaser()
    const masterSlider = useSliderSend((level) => setLaserMaster(level))
    const { engine, desk } = laser
    if (!laser.known) return <div className="perform-pane perform-laser"><Status>READING LASER</Status></div>
    if (!engine?.reachable) {
        return <div className="perform-pane perform-laser"><Status>NO LASER ENGINE</Status></div>
    }
    const shownMaster = masterSlider.local ?? (desk?.reachable ? desk.master : 1)
    return (
        <div className="perform-pane perform-laser" data-armed={engine.armed ? 'yes' : 'no'}>
            <div className="perform-row">
                <Mark state={desk?.reachable && desk.blackout ? 'black' : (engine.armed ? 'live' : 'absent')} />
                <Status title={engine.sim === null ? '' : `Simulation ${engine.sim ? 'on' : 'off'}`}>
                    {engine.connected}/{engine.total} CUBES · {engine.armed ? 'ARMED' : 'NOT ARMED'}
                </Status>
                <Status title={LASER_SCOPE_WHY}>{LASER_SCOPE}</Status>
                {!engine.armed ? <a className="perform-link" href={laserDeskPath()} target="_blank" rel="noreferrer" title="Arm on the Laser page">Laser page</a> : null}
            </div>
            {desk?.reachable ? (
                <>
                    {desk.blackout ? <Status tone="danger">LASER BLACKOUT</Status> : null}
                    {desk.looks.length ? (
                        <div className="perform-tiles" role="group" aria-label="Laser looks">
                            {desk.looks.map((look) => (
                                <button
                                    key={look.id}
                                    type="button"
                                    className={`perform-action perform-tile${desk.liveId === look.id ? ' is-live' : ''}`}
                                    aria-pressed={desk.liveId === look.id}
                                    data-look={look.id}
                                    title={look.name}
                                    onClick={async () => { await goLaserLook(look.id); laser.refresh() }}
                                >
                                    {look.name}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="perform-row">
                            <Status>NO LOOKS</Status>
                            <a className="perform-link" href={laserLooksPath()} target="_blank" rel="noreferrer" title="Make one on the Laser desk">Laser desk</a>
                        </div>
                    )}
                    <div className="perform-row">
                        <Slider name="MASTER" label="Laser master" min="0" max="1" step="0.01" value={shownMaster} shown={Math.round(shownMaster * 100)}
                            onChange={(event) => masterSlider.push(Number(event.target.value))}
                            onPointerUp={masterSlider.release} onBlur={masterSlider.release} />
                        <Switch on={desk.followLight} label="Laser follows Light" title="The laser takes the Light desk’s look and tempo"
                            onChange={async (on) => { await setLaserFollowLight(on); laser.refresh() }}>Follow light</Switch>
                    </div>
                </>
            ) : <Status>LASER DESK: NO ANSWER</Status>}
        </div>
    )
}

// --- the wall (the Projection desk's panes) ------------------------------------

function WallWindow({ ctx }) {
    const mapping = ctx.document.mappingState
    const network = useMemo(() => toTopNetwork(ctx.document), [ctx.document])
    const surfaces = mapping?.surfaces || []
    if (!surfaces.length) {
        return (
            <div className="perform-pane">
                <Status title="Add one in the Surfaces block, then drag its corners onto the shape on the wall.">NO SURFACES</Status>
            </div>
        )
    }
    return (
        <div className="perform-pane perform-pane--flush">
            <MapWallView
                mapping={mapping}
                spaceId={ctx.spaceId}
                network={network}
                assets={ctx.document.assets || null}
                projectId={ctx.projectId}
                soloSurfaceId={ctx.wall.soloId}
                selectedId={ctx.wall.selectedId}
                onSelectSurface={ctx.wall.setSelectedId}
                onCornersChange={(surfaceId, corners) => ctx.mapApi.updateSurface(surfaceId, { corners })}
                onMaskChange={(surfaceId, mask) => ctx.mapApi.updateSurface(surfaceId, { mask })}
                hint={false}
            />
        </div>
    )
}

function WallOutWindow({ ctx }) {
    const mapping = ctx.document.mappingState
    const network = useMemo(() => toTopNetwork(ctx.document), [ctx.document])
    const surfaces = mapping?.surfaces || []
    return (
        <div className="perform-pane perform-pane--flush">
            {surfaces.length ? (
                <MapWallView
                    mapping={mapping}
                    spaceId={ctx.spaceId}
                    network={network}
                    assets={ctx.document.assets || null}
                    projectId={ctx.projectId}
                    live
                    editable={false}
                    hint={false}
                />
            ) : <Status title="The wall is empty: nothing goes out yet.">NOTHING OUT</Status>}
            <div className="perform-pane perform-pane--bar">
                <button type="button" className="perform-action" onClick={() => window.open(buildMapOutputPath(ctx.spaceId, ctx.projectId), `di-map-out-${ctx.projectId}`, 'noopener')}>Open output</button>
            </div>
        </div>
    )
}

function SurfacesWindow({ ctx }) {
    const surfaces = ctx.document.mappingState?.surfaces || []
    return (
        <div className="perform-pane">
            <MapSurfaceList
                compact
                surfaces={surfaces}
                selectedId={ctx.wall.selectedId}
                soloId={ctx.wall.soloId}
                onSelect={ctx.wall.setSelectedId}
                onAdd={() => {
                    const id = ctx.mapApi.addSurface({ name: `Surface ${surfaces.length + 1}`, corners: nextCorners(surfaces.length) })
                    ctx.wall.setSelectedId(id)
                }}
                onToggle={(surface) => ctx.mapApi.updateSurface(surface.id, { enabled: !surface.enabled })}
                onSolo={ctx.wall.setSoloId}
                onFront={(surfaceId) => {
                    const ids = surfaces.map((surface) => surface.id)
                    const index = ids.indexOf(surfaceId)
                    if (index === -1 || index === ids.length - 1) return
                    ids.splice(index + 1, 0, ids.splice(index, 1)[0])
                    ctx.mapApi.reorderSurfaces(ids)
                }}
            />
        </div>
    )
}

function CuesWindow({ ctx }) {
    const mapping = ctx.document.mappingState
    const cues = useMemo(() => mapping?.cues || [], [mapping])
    const surfaces = mapping?.surfaces || []
    const { mapApi, wall } = ctx
    const fire = useCallback((cue) => {
        if (!cue) return
        mapApi.fireCue(cue)
        wall.setLiveCueId(cue.id)
    }, [mapApi, wall])

    // 1-9 fire cues here as on the Projection desk (src/map/cueFiring.js
    // holds the binding), while this window is open.
    useEffect(() => {
        const onKeyDown = (event) => {
            const tag = event.target?.tagName
            if (tag && /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            if (!isCueKey(event.key)) return
            const cue = cueForKey(cues, event.key)
            if (cue) { fire(cue); event.preventDefault() }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [cues, fire])

    return (
        <div className="perform-pane">
            <MapCueList
                compact
                cues={cues}
                surfaces={surfaces}
                liveCueId={wall.liveCueId}
                onFire={fire}
                onCapture={(cueId) => {
                    const captured = {}
                    surfaces.forEach((surface) => {
                        captured[surface.id] = { enabled: surface.enabled, opacity: surface.opacity, source: { kind: surface.source.kind, ref: surface.source.ref } }
                    })
                    mapApi.updateCue(cueId, { surfaces: captured })
                }}
                onAdd={() => mapApi.addCue({ name: `Cue ${cues.length + 1}`, key: cues.length < 9 ? String(cues.length + 1) : '' })}
                onUpdate={mapApi.updateCue}
                onDelete={mapApi.deleteCue}
                onReorder={mapApi.reorderCues}
            />
        </div>
    )
}

function MachinesWindow({ ctx }) {
    const { machines, ndiScan } = useMachinePresence(ctx.spaceId, { ndi: 'poll' })
    return (
        <div className="perform-pane">
            <MapMachinesList compact machines={machines} ndiScan={ndiScan} surfaces={ctx.document.mappingState?.surfaces || []} />
        </div>
    )
}

function SurfaceSettingsWindow({ ctx }) {
    const surfaces = ctx.document.mappingState?.surfaces || []
    const surface = surfaces.find((item) => item.id === ctx.wall.selectedId) || null
    const [projectOptions, setProjectOptions] = useState([])
    useEffect(() => {
        let cancelled = false
        listProjects(ctx.spaceId)
            .then((result) => {
                if (cancelled) return
                const list = Array.isArray(result) ? result : (result?.projects || [])
                setProjectOptions(list.filter((project) => project?.id && project.id !== ctx.projectId))
            })
            .catch(() => { if (!cancelled) setProjectOptions([]) })
        return () => { cancelled = true }
    }, [ctx.spaceId, ctx.projectId])
    const pictureOutOptions = (ctx.document.nodes || []).filter((node) => node.typeId === 'top.out').map((node) => ({ id: node.id, label: node.label || 'Picture Out' }))
    return (
        <div className="perform-pane">
            <MapInspector
                surface={surface}
                projectId={ctx.projectId}
                assets={ctx.document.assets}
                projectOptions={projectOptions}
                pictureOutOptions={pictureOutOptions}
                machines={ctx.machines || []}
                clipboard={null}
                onUpdate={ctx.mapApi.updateSurface}
                onUpsertAsset={ctx.mapApi.upsertAsset}
                onDelete={(surfaceId) => { ctx.mapApi.deleteSurface(surfaceId); ctx.wall.setSelectedId(null) }}
                onDuplicate={(surfaceId) => {
                    const original = surfaces.find((item) => item.id === surfaceId)
                    if (!original) return
                    const id = ctx.mapApi.addSurface({ ...original, name: `${original.name || original.id} copy`, corners: original.corners.map(([x, y]) => [x + 0.02, y + 0.02]) })
                    ctx.wall.setSelectedId(id)
                }}
                onCopy={() => {}}
                onPasteShape={() => {}}
                onPasteLook={() => {}}
                onMaskFromOutline={(surfaceId) => ctx.mapApi.updateSurface(surfaceId, { mask: [[0, 0], [1, 0], [1, 1], [0, 1]] })}
                onResetCorners={(surfaceId) => ctx.mapApi.updateSurface(surfaceId, { corners: nextCorners(surfaces.findIndex((item) => item.id === surfaceId)) })}
            />
            <a className="perform-link" href={buildMapPath(ctx.spaceId, ctx.projectId)} title="Copy, paste, masks and the wall photo are on the Projection desk.">Projection desk</a>
        </div>
    )
}

// --- not a native window yet --------------------------------------------------

function ComingWindow({ kind, ctx }) {
    const known = isKnownKind(kind) ? WINDOW_KINDS[kind] : null
    const lightKind = known?.family === 'light'
    return (
        <div className="perform-pane perform-coming" data-coming={kind} title={known ? known.coming : 'A newer di.iiii made this window. It is kept in the preset, and opens there.'}>
            <span className="perform-coming-tag">{known ? 'Coming in phase 2' : 'Not in this version'}</span>
            {lightKind && ctx.isLocalInstall ? (
                <a className="perform-link" href={lightingDeskPath({ spaceId: ctx.spaceId, projectId: ctx.projectId })} target="_blank" rel="noreferrer">Light page</a>
            ) : null}
        </div>
    )
}

const NATIVE = {
    deck: DeckWindow,
    out: OutWindow,
    clock: ClockWindow,
    master: MasterWindow,
    lightlooks: LightLooksWindow,
    laser: LaserWindow,
    wall: WallWindow,
    wallout: WallOutWindow,
    surfaces: SurfacesWindow,
    cues: CuesWindow,
    machines: MachinesWindow,
    surface: SurfaceSettingsWindow
}

export const isNativeKind = (kind) => Object.prototype.hasOwnProperty.call(NATIVE, kind)

export const windowTitle = (kind) => (isKnownKind(kind) ? WINDOW_KINDS[kind].label : kind)

export default function PerformWindowBody({ kind, ctx }) {
    const Native = NATIVE[kind]
    if (Native) return <Native ctx={ctx} />
    return <ComingWindow kind={kind} ctx={ctx} />
}
