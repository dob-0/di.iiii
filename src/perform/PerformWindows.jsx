import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapCueList from '../map/MapCueList.jsx'
import MapInspector from '../map/MapInspector.jsx'
import { MapMachinesList, MapSurfaceList, MapWallView, nextCorners } from '../map/MapDeskParts.jsx'
import { buildMapOutputPath, buildMapPath } from '../map/mapRouting.js'
import { cueForKey, isCueKey } from '../map/cueFiring.js'
import { lightingDeskPath, setLightBlackout, setLightMaster } from '../map/lightingLink.js'
import { useMachinePresence } from '../project/tops/useMachinePresence.js'
import { toTopNetwork } from '../project/tops/useTopNetwork.js'
import { registerTopThumbnail } from '../project/tops/topThumbnails.js'
import { pictureIdOf, setMaster } from '../project/tops/vjDeck.js'
import { listProjects } from '../project/services/projectsApi.js'
import { phaseAt } from '../timeline/showClock.js'
import { useShowClockContext } from './useShowClock.js'
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

// --- the deck ---------------------------------------------------------------

function DeckWindow({ ctx }) {
    const deck = firstOfType(ctx.document.nodes, 'vj.deck')
    if (!deck) {
        return (
            <div className="perform-pane">
                <p className="perform-read">No VJ deck in this project yet.</p>
                <p className="perform-dim">A deck is a clip grid: layers of clips, blend, opacity and a master, played by tapping. Its picture goes to a Picture Out and onto the wall.</p>
                <button type="button" className="perform-action" onClick={ctx.onAddDeck} disabled={!ctx.onAddDeck}>Add a VJ deck</button>
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

function OutWindow({ ctx }) {
    const nodes = ctx.document.nodes || []
    const out = firstOfType(nodes, 'top.out')
    const deck = firstOfType(nodes, 'vj.deck')
    const source = out || deck
    if (!source) {
        return (
            <div className="perform-pane">
                <p className="perform-read">Nothing makes a picture yet.</p>
                <p className="perform-dim">Add a VJ deck, or a Picture Out in Nodes: this window shows what it sends.</p>
            </div>
        )
    }
    const surfaces = ctx.document.mappingState?.surfaces || []
    return (
        <div className="perform-pane perform-pane--sized">
            <PictureCanvas nodeId={pictureIdOf(source)} label={out ? (out.label || 'Picture Out') : 'Deck output'} />
            {/* One line under the picture; a window too short for both keeps the picture. */}
            <div className="perform-clock perform-out-row">
                <span className="perform-dim" title="A preview, a few frames a second. The projector’s picture is the output page.">
                    {out ? (out.label || 'Picture Out') : 'Deck master'} · preview
                </span>
                {surfaces.length ? (
                    <button type="button" className="perform-action" onClick={() => window.open(buildMapOutputPath(ctx.spaceId, ctx.projectId), `di-map-out-${ctx.projectId}`, 'noopener')}>Open output</button>
                ) : null}
            </div>
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

function ClockWindow() {
    const clock = useShowClockContext()
    const beat = useBeat(clock?.timeline)
    if (!clock) return <div className="perform-pane"><p className="perform-dim">No clock on this page.</p></div>
    const light = clock.light
    const leaderLine = clock.leader === 'light'
        ? `The Light desk leads${light?.show ? ` (${light.show}’s show)` : ''}. The deck follows it.`
        : light?.up
            ? 'The deck’s own tempo — this device does not follow the Light desk.'
            : light?.reachable
                ? 'The deck’s own tempo. The Light desk is not open on this machine; open it and it leads.'
                : 'The deck’s own tempo. There is no Light desk here (it runs on a local di.iiii).'
    return (
        <div className="perform-pane" data-leader={clock.leader} data-bpm={clock.timeline.bpm} data-epoch={clock.timeline.epoch}>
            <div className="perform-clock">
                <span className="perform-clock-bpm" aria-label="Show tempo">{clock.timeline.bpm.toFixed(1)}</span>
                <span className="perform-dim">BPM</span>
                <div className="perform-beats" aria-label={`Beat ${beat + 1} of 4`}>
                    {[0, 1, 2, 3].map((n) => <span key={n} className={`perform-beat${n === beat ? ' is-on' : ''}`} />)}
                </div>
                <button type="button" className="perform-action" onClick={() => clock.tap()} disabled={!clock.canTap}>Tap</button>
                <button type="button" className="perform-action" onClick={() => clock.reset()} disabled={!clock.canTap}>Reset</button>
                {light?.up ? (
                    <label className="perform-toggle">
                        <input type="checkbox" checked={clock.follow} onChange={(event) => clock.setFollow(event.target.checked)} />
                        Follow Light
                    </label>
                ) : null}
            </div>
            <p className="perform-dim" role="status">{leaderLine}</p>
            {clock.leader === 'light' && clock.offset ? (
                <p className="perform-dim">clock offset {Math.round(clock.offset.offset)} ms · round trip {Math.round(clock.offset.rtt)} ms</p>
            ) : null}
        </div>
    )
}

// --- master and blackout --------------------------------------------------------

function MasterWindow({ ctx }) {
    const clock = useShowClockContext()
    const light = clock?.light
    const deckNode = firstOfType(ctx.document.nodes, 'vj.deck')
    const deckMaster = Number(deckNode?.values?.deck?.master ?? 1)
    const [restore, setRestore] = useState(null) // the deck level before a blackout
    const blackedOut = restore !== null || light?.blackout === true
    const writeDeckMaster = useCallback((level) => {
        if (!deckNode) return
        ctx.applyLocalOps({
            type: 'updateNode',
            payload: { nodeId: deckNode.id, patch: { values: { ...deckNode.values, deck: setMaster(deckNode.values?.deck, level) } } }
        })
    }, [ctx, deckNode])

    // One button, everything dark: the deck's master to zero (kept, to come
    // back to) and, when a Light desk is up, its blackout. The wall shows the
    // deck's picture, so it goes dark with it.
    const toggleBlackout = () => {
        if (!blackedOut) {
            if (deckNode) {
                setRestore(deckMaster)
                writeDeckMaster(0)
            }
            if (light?.up) setLightBlackout(true)
            return
        }
        if (deckNode && restore !== null) writeDeckMaster(restore || 1)
        setRestore(null)
        if (light?.up) setLightBlackout(false)
    }

    return (
        <div className="perform-pane">
            <button
                type="button"
                className={`perform-action perform-action--danger${blackedOut ? ' is-on' : ''}`}
                aria-pressed={blackedOut}
                onClick={toggleBlackout}
                disabled={!deckNode && !light?.up}
            >
                {blackedOut ? 'Blackout · on' : 'Blackout'}
            </button>
            {deckNode ? (
                <label className="perform-master-row">
                    <span>Deck</span>
                    <input type="range" min="0" max="1" step="0.01" value={deckMaster} aria-label="Deck master"
                        onChange={(event) => { setRestore(null); writeDeckMaster(Number(event.target.value)) }} />
                    <span>{Math.round(deckMaster * 100)}</span>
                </label>
            ) : <p className="perform-dim">No deck in this project.</p>}
            {light?.up ? (
                <label className="perform-master-row">
                    <span>Light</span>
                    <input type="range" min="0" max="255" step="1" value={light.master ?? 255} aria-label="Light master"
                        onChange={(event) => setLightMaster(Number(event.target.value) / 255)} />
                    <span>{Math.round(((light.master ?? 255) / 255) * 100)}</span>
                </label>
            ) : (
                <p className="perform-dim">{light?.reachable ? 'Lights: the Light desk is not open on this machine.' : 'Lights: no Light desk here.'}</p>
            )}
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
                <p className="perform-read">No surfaces on the wall yet.</p>
                <p className="perform-dim">Add one in the Surfaces window, then drag its corners onto the shape on the wall.</p>
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
            ) : <p className="perform-dim">The wall is empty: nothing goes out yet.</p>}
            <div className="perform-pane" style={{ height: 'auto', flex: 'none' }}>
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
    const { machines, ndiScan } = useMachinePresence(ctx.spaceId)
    return (
        <div className="perform-pane">
            <MapMachinesList machines={machines} ndiScan={ndiScan} surfaces={ctx.document.mappingState?.surfaces || []} />
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
            <a className="perform-dim" href={buildMapPath(ctx.spaceId, ctx.projectId)}>Copy, paste, masks and the wall photo are on the Projection desk.</a>
        </div>
    )
}

// --- not a native window yet --------------------------------------------------

function ComingWindow({ kind, ctx }) {
    const known = isKnownKind(kind) ? WINDOW_KINDS[kind] : null
    const lightKind = known?.family === 'light'
    return (
        <div className="perform-pane perform-coming" data-coming={kind}>
            <span className="perform-coming-tag">{known ? 'Coming in phase 2' : 'Not in this version'}</span>
            <p className="perform-read">{known ? known.label : kind}</p>
            <p className="perform-dim">
                {known
                    ? known.coming
                    : 'A newer di.iiii made this window. It is kept in the preset, and opens there.'}
            </p>
            {lightKind && ctx.isLocalInstall ? (
                <a className="perform-action" href={lightingDeskPath({ spaceId: ctx.spaceId, projectId: ctx.projectId })} target="_blank" rel="noreferrer">Open the Light page</a>
            ) : null}
        </div>
    )
}

const NATIVE = {
    deck: DeckWindow,
    out: OutWindow,
    clock: ClockWindow,
    master: MasterWindow,
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
