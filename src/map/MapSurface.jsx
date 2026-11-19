import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapInspector from './MapInspector.jsx'
import { MapMachinesList, nextCorners } from './MapDeskParts.jsx'
import MapCueList from './MapCueList.jsx'
import { cueForKey, isCueKey } from './cueFiring.js'
import { useMapDocument } from './useMapDocument.js'
import useDeskClock from './useDeskClock.js'
import { useProjectLayers } from '../project/useProjectLayers.js'
import { toTopNetwork } from '../project/tops/useTopNetwork.js'
import { buildMapOutputPath } from './mapRouting.js'
import { listProjects, uploadProjectAsset } from '../project/services/projectsApi.js'
import { transportWarning } from './transportCeiling.js'
import { lightingDeskPath, probeLightingDesk } from './lightingLink.js'
import { useMachinePresence } from '../project/tops/useMachinePresence.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../studio/utils/studioRouting.js'
import SurfaceBar from '../components/SurfaceBar.jsx'
import DeskPerformSwitch from '../perform/DeskPerformSwitch.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'
import useSpaceName from '../hooks/useSpaceName.js'
import { isEmbedRequest, isPreviewRequest, signalPreviewReady } from '../utils/previewMode.js'
import { useLocalFileUrl } from './useLocalFileUrl.js'
import { ADD_CHOICES, FILE_ACCEPT, MapScreenInspector, MapScreenList, MapVisualInspector, useVisualUpload, visualForChoice } from './MapScreenParts.jsx'
import { MapDeck, MapEffectsBrowser, MapEffectsPanel, MapOutputMonitor, MapPreviewMonitor, newEffect } from './MapDeskDock.jsx'
import { MapSplit, useDeskSplits } from './MapSplit.jsx'
import { paramSpecSignature, subscribeVisualParams } from './visualParams.js'
import MapAdvancedOutput from './MapAdvancedOutput.jsx'
import { isScreenKind, presetScreens } from './wallScreens.js'
import { generateId } from '../shared/projectSchema.js'
import './mapSurface.css'
import './mapDesk.css'

// Whether the Preview monitor runs, remembered per browser: it is a second
// copy of the visual, and on a weak machine the wall wants those frames.
const PREVIEW_KEY = 'di.map.preview.v1'
const readPreviewOn = () => {
    try { return window.localStorage.getItem(PREVIEW_KEY) !== 'off' } catch { return true }
}
const writePreviewOn = (on) => {
    try { window.localStorage.setItem(PREVIEW_KEY, on ? 'on' : 'off') } catch { /* private window */ }
}

// THE MAPPER'S DESK.
//
// Five children made worlds at a day camp in Dilijan. On the last day those
// worlds have to land on five coloured rectangles of paper taped to a
// container wall, from one projector, in a room that only just goes dark. That
// is projection mapping, and until now it meant leaving the platform for
// Resolume or MadMapper — exporting the work to a file, and mapping the file.
//
// This maps the WORK. A surface names a project and the project runs on the
// wall; a surface can equally name a URL, which is the only reason this camp's
// own work can be shown at all, since it lives in pages that were never
// di.iiii projects.
//
// Everything here is DOM under a CSS matrix3d corner-pin (see cornerPin.js).
// That is a deliberate architectural choice, not a shortcut: a WebGL
// compositor cannot sample a cross-origin page, and half the sources we must
// show are cross-origin pages.

export default function MapSurface({ projectId, spaceId }) {
    const {
        store, document: doc, mapping, surfaces, syncState, applyOps,
        addSurface, updateSurface, deleteSurface, setOutput, upsertAsset,
        addCue, updateCue, deleteCue, reorderCues, fireCue,
        addVisual, updateVisual, deleteVisual, reorderVisuals, play, setVisualThumb, setVisualParamSpec,
        undo, redo, canUndo, canRedo
    } = useMapDocument(projectId, { role: 'desk' })
    // The beat every LFO swings to: the mapping's tempo, or the bar show's.
    useDeskClock(mapping?.tempo)
    // Every machine showing this space, and what each one has: the wall is usually another computer.
    // ?preview=1 — a PICTURE of this desk on another page (a Kit card on
    // /tools). It shows the mapping and follows it, but joins no machine
    // link: a thumbnail is not a machine on the desk, and it must not appear
    // in the Machines list of whoever is really working here.
    const [isPreview] = useState(() => isPreviewRequest())
    const { machines, ndiScan } = useMachinePresence(isPreview ? null : spaceId)
    // The one bar, above the desk's own. Never on /out — that is MapOutput,
    // the wall's picture, and a bar there would be projected with the work.
    const localInstall = useLocalInstall()
    const spaceName = useSpaceName(spaceId)
    const [isEmbed] = useState(() => isEmbedRequest() || isPreviewRequest())
    // Nothing here draws to a WebGL canvas, so the app-wide paint watcher has
    // nothing to see; the picture says itself once the mapping has loaded.
    const hasLoaded = Boolean(store?.state?.hasLoaded)
    useEffect(() => {
        if (isPreview && hasLoaded) signalPreviewReady(spaceId)
    }, [isPreview, hasLoaded, spaceId])
    // The bar grows with the project (src/project/layers.js); Projection itself
    // is never taken off the bar while you stand on it.
    const barLayers = useProjectLayers(doc, projectId, store?.state?.hasLoaded).open

    const [selectedId, setSelectedId] = useState(null)
    const [soloId, setSoloId] = useState(null)
    // The desk's two panels with tabs (MapDeskDock.jsx): the effect panel
    // shows the open clip or the composition; the browser on the right holds
    // the effects list and everything that used to sit around the stage.
    const [fxTab, setFxTab] = useState('clip')
    const [browserTab, setBrowserTab] = useState('screens')
    const [moreOpen, setMoreOpen] = useState(false)
    // One docked desk; the lines between its parts are dragged (MapSplit.jsx).
    const deskSplits = useDeskSplits()
    const [previewOn, setPreviewOnState] = useState(readPreviewOn)
    const setPreviewOn = useCallback((on) => { setPreviewOnState(on); writePreviewOn(on) }, [])
    // On from the start (2026-10-25): the desk is where you SEE what you are
    // putting on the wall. Off, every page visual was a card of its own
    // address — a data: URL became a screen of base64 — and that read as
    // "the mapper can't show it".
    const [live, setLive] = useState(true)
    const [selectedVisualId, setSelectedVisualId] = useState(null)
    // The mapping window (MapAdvancedOutput.jsx), Resolume's Advanced Output.
    const [mappingOpen, setMappingOpen] = useState(false)
    const [liveCueId, setLiveCueId] = useState(null)
    const [clipboard, setClipboard] = useState(null)
    const [projectOptions, setProjectOptions] = useState([])
    // The project's picture operators: what a Pictures surface runs, and the
    // Picture Out nodes the inspector offers to show.
    const network = useMemo(() => toTopNetwork(doc), [doc])
    const pictureOutOptions = useMemo(
        () => (doc?.nodes || []).filter((node) => node.typeId === 'top.out').map((node) => ({ id: node.id, label: node.label || 'Picture Out' })),
        [doc]
    )
    const [localReference, setLocalReferenceFile] = useLocalFileUrl()
    const [transferText, setTransferText] = useState(null)
    const [lightingHere, setLightingHere] = useState(false)

    const output = useMemo(() => mapping?.output || { width: 1920, height: 1080 }, [mapping])
    const cues = useMemo(() => mapping?.cues || [], [mapping])
    const visuals = useMemo(() => mapping?.visuals || [], [mapping])
    const playing = mapping?.playing || ''
    // Like Resolume, there is always an open clip once there are clips: the
    // one picked by name, else what is playing, else the first.
    const selectedVisual = visuals.find((visual) => visual.id === selectedVisualId)
        || visuals.find((visual) => visual.id === playing)
        || visuals[0]
        || null
    const upload = useVisualUpload({ projectId, onUpsertAsset: upsertAsset })
    const reference = mapping?.reference || { url: '', opacity: 0.5, visible: false }

    const syncLabel = useMemo(() => {
        if (syncState?.authExpired) return { tone: 'error', text: 'signed out', detail: 'Sign in again to keep editing.' }
        if (syncState?.pendingSyncError) return { tone: 'error', text: 'not saving', detail: String(syncState.pendingSyncError) }
        return null
    }, [syncState])

    // Measured on the real output route: over HTTP/1.1 the fifth page surface
    // never loads, because each one holds a project event stream open and six
    // persistent connections per origin is the browser's whole budget. The
    // operator has to know that before the room fills, not after.
    const transportNote = useMemo(() => transportWarning(surfaces), [surfaces])

    useEffect(() => {
        let cancelled = false
        listProjects(spaceId)
            .then((result) => {
                if (cancelled) return
                const list = Array.isArray(result) ? result : (result?.projects || [])
                setProjectOptions(list.filter((project) => project?.id && project.id !== projectId))
            })
            .catch(() => { if (!cancelled) setProjectOptions([]) })
        return () => { cancelled = true }
    }, [spaceId, projectId])

    // The lighting desk is a LOCAL runtime only. Probed once, on mount: if
    // nothing answers, the link is not drawn at all rather than offered and
    // then leading to a 404 — a hosted tab must not advertise a rig it has no
    // way to reach.
    useEffect(() => {
        let cancelled = false
        probeLightingDesk().then((here) => { if (!cancelled) setLightingHere(here) })
        return () => { cancelled = true }
    }, [])

    // --- geometry -------------------------------------------------------

    // Lining screens up lives in the Mapping window now (its own keys, drag,
    // warp); the desk only plays and colours what is on them.

    // --- cues -----------------------------------------------------------

    const onFireCue = useCallback((cue) => {
        if (!cue) return
        fireCue(cue)
        setLiveCueId(cue.id)
    }, [fireCue])

    // A capture records what each surface is SHOWING — never where it is. See
    // the note at the top of MapCueList.jsx.
    const onCaptureCue = useCallback((cueId) => {
        const captured = {}
        surfaces.forEach((surface) => {
            captured[surface.id] = {
                enabled: surface.enabled,
                opacity: surface.opacity,
                source: { kind: surface.source.kind, ref: surface.source.ref }
            }
        })
        updateCue(cueId, { surfaces: captured })
    }, [surfaces, updateCue])

    // --- copying --------------------------------------------------------

    const onDuplicate = useCallback((surfaceId) => {
        const surface = surfaces.find((entry) => entry.id === surfaceId)
        if (!surface) return
        // Offset so the copy is visibly its own thing rather than hiding
        // exactly underneath the original.
        const id = addSurface({
            ...surface,
            name: `${surface.name || surface.id} copy`,
            corners: surface.corners.map(([x, y]) => [x + 0.02, y + 0.02])
        })
        setSelectedId(id)
    }, [surfaces, addSurface])

    const onPasteShape = useCallback((surfaceId) => {
        if (!clipboard) return
        updateSurface(surfaceId, { corners: clipboard.corners, mask: clipboard.mask })
    }, [clipboard, updateSurface])

    const onPasteLook = useCallback((surfaceId) => {
        if (!clipboard) return
        updateSurface(surfaceId, {
            source: clipboard.source,
            resolution: clipboard.resolution,
            opacity: clipboard.opacity,
            brightness: clipboard.brightness,
            contrast: clipboard.contrast,
            saturation: clipboard.saturation,
            hue: clipboard.hue,
            blend: clipboard.blend
        })
    }, [clipboard, updateSurface])

    // A mask that starts as the surface's own outline is the shape most paper
    // actually wants: a rectangle with one or two corners pulled in.
    const onMaskFromOutline = useCallback((surfaceId) => {
        updateSurface(surfaceId, { mask: [[0, 0], [1, 0], [1, 1], [0, 1]] })
    }, [updateSurface])

    // A thumbnail the Preview took of a clip: stored as a project file (never
    // as base64 inside the document, which would ride along on every save).
    const onThumb = useCallback(async (visualId, blob) => {
        if (!projectId || !blob) return
        try {
            const asset = await uploadProjectAsset(projectId, new File([blob], `thumb-${visualId}.jpg`, { type: 'image/jpeg' }))
            if (!asset?.url) return
            upsertAsset(asset)
            setVisualThumb(visualId, asset.url)
        } catch {
            // A thumbnail is a nicety; the tile keeps its label.
        }
    }, [projectId, upsertAsset, setVisualThumb])

    // A clip that tells the desk its settings (any copy of its page, in any
    // monitor) has them kept on the visual, so the panel can show them before
    // a copy loads and the wall gets the chosen values.
    const visualsRef = useRef(visuals)
    useEffect(() => { visualsRef.current = visuals }, [visuals])
    useEffect(() => subscribeVisualParams((ref, spec) => {
        visualsRef.current
            .filter((visual) => visual.source?.ref === ref && paramSpecSignature(visual.paramSpec) !== paramSpecSignature(spec))
            .forEach((visual) => setVisualParamSpec(visual.id, spec))
    }), [setVisualParamSpec])

    // --- effects ----------------------------------------------------------

    const compEffects = useMemo(() => mapping?.effects || [], [mapping])
    const addEffect = useCallback((target, type, visualId = null) => {
        const effect = newEffect(type)
        if (!effect) return
        if (target === 'comp') {
            setOutput({ effects: [...compEffects, effect] })
            return
        }
        const visual = visualId ? visuals.find((entry) => entry.id === visualId) : selectedVisual
        if (!visual) return
        updateVisual(visual.id, { effects: [...(visual.effects || []), effect] })
    }, [compEffects, visuals, selectedVisual, setOutput, updateVisual])

    // --- keyboard -------------------------------------------------------

    useEffect(() => {
        const onKeyDown = (event) => {
            // The mapping window has its own keys while it is open.
            if (mappingOpen) return
            const target = event.target
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
            // Undo / redo, the keys every editor here answers to: Ctrl/Cmd+Z,
            // Shift+Ctrl/Cmd+Z and Ctrl+Y. Any other chord stays the browser's.
            if (event.metaKey || event.ctrlKey) {
                const key = event.key.toLowerCase()
                if (key === 'z' && !event.shiftKey) { undo(); event.preventDefault() }
                else if ((key === 'z' && event.shiftKey) || key === 'y') { redo(); event.preventDefault() }
                return
            }

            // The binding itself is in src/map/cueFiring.js, because the 3D
            // scene listens for the same keys on the same cues. A cue key with
            // nothing bound to it still returns here rather than falling
            // through — a digit is never a nudge or a mask.
            // With a visuals bank, the digits play it: 1-9 the first nine
            // tiles, 0 black. A project still mapped the old way (no visuals)
            // keeps its cue keys exactly as they were.
            if (visuals.length && /^[0-9]$/.test(event.key)) {
                const index = Number(event.key) - 1
                if (index < 0) play('')
                else if (visuals[index]) play(visuals[index].id)
                event.preventDefault()
                return
            }
            if (isCueKey(event.key)) {
                const cue = cueForKey(cues, event.key)
                if (cue) { onFireCue(cue); event.preventDefault() }
                return
            }

            if (event.key === 'Escape') setSelectedId(null)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [cues, onFireCue, undo, redo, visuals, play, mappingOpen])

    // --- screens and visuals ---------------------------------------------

    // A preset is ONE batch: five screens are one undo step, not five.
    const onAddScreens = useCallback((preset) => {
        const made = presetScreens(preset, output, surfaces.filter((surface) => isScreenKind(surface.source.kind)).length + 1)
            .map((screen) => ({ ...screen, id: generateId('srf') }))
        applyOps(made.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })))
        setSelectedVisualId(null)
        setSelectedId(made[0]?.id || null)
    }, [output, surfaces, applyOps])

    const onAddVisual = useCallback((entry) => {
        if (entry?.choice) {
            const visual = visualForChoice(entry.choice, visuals.length)
            if (!visual) return
            const id = addVisual(visual)
            setSelectedId(null)
            setSelectedVisualId(id)
            return
        }
        addVisual(entry)
    }, [visuals.length, addVisual])

    // Files dropped anywhere on the desk become visuals.
    const onDeskDragOver = useCallback((event) => {
        if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
    }, [])
    const onDeskDrop = useCallback(async (event) => {
        if (!event.dataTransfer?.files?.length) return
        event.preventDefault()
        const made = await upload.bringIn(event.dataTransfer.files)
        made.forEach((visual) => addVisual(visual))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [upload.bringIn, addVisual])

    // --- carrying a mapping between machines ----------------------------

    const exportMapping = useCallback(() => {
        setTransferText(JSON.stringify(mapping, null, 2))
    }, [mapping])

    const importMapping = useCallback((text) => {
        let incoming = null
        try {
            incoming = JSON.parse(text)
        } catch {
            return 'That is not JSON.'
        }
        if (!incoming || !Array.isArray(incoming.surfaces)) return 'No surfaces in that.'
        // Replace, in one batch: everything currently here goes, then the
        // incoming mapping is built. A merge would silently keep surfaces the
        // person pasting has never seen.
        const ops = [
            ...surfaces.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })),
            ...cues.map((cue) => ({ type: 'deleteMappingCue', payload: { cueId: cue.id } })),
            ...visuals.map((visual) => ({ type: 'deleteMappingVisual', payload: { visualId: visual.id } })),
            ...(Array.isArray(incoming.visuals) ? incoming.visuals : []).map((visual) => ({ type: 'createMappingVisual', payload: { visual } })),
            ...incoming.surfaces.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })),
            ...(Array.isArray(incoming.cues) ? incoming.cues : []).map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
            {
                type: 'setMappingState',
                payload: {
                    patch: {
                        output: incoming.output,
                        background: incoming.background,
                        grid: incoming.grid,
                        reference: incoming.reference,
                        fade: incoming.fade,
                        playing: incoming.playing || ''
                    }
                }
            }
        ]
        // ONE batch: an import is a single version bump rather than a stutter
        // of thirty, and a half-applied import can never be what is on the
        // wall when somebody walks in.
        applyOps(ops)
        return ''
    }, [surfaces, cues, visuals, applyOps])

    const openOutput = useCallback(() => {
        window.open(buildMapOutputPath(spaceId, projectId), `di-map-out-${projectId}`, 'noopener')
    }, [spaceId, projectId])

    const referenceUrl = localReference || reference.url
    const stageProps = { spaceId, network, assets: doc?.assets || null, projectId, live }
    const inspectedScreen = surfaces.find((surface) => surface.id === selectedId) || null

    // --- the panels, built once, placed as windows or stacked ----------------

    // Clicking a clip's picture plays it AND opens it, as triggering a clip
    // in Resolume selects it: its effects are then in the panel, so the clip
    // on the wall takes effects without first being opened by name (Emily,
    // 2026-11-10: "you should be on preview mode of clip to add effects but i
    // want also on output mode"). Its name still opens it without playing.
    // The number keys only play, so a show played from the keyboard never
    // pulls the panel away from the clip being prepared.
    const playAndOpen = useCallback((visualId) => {
        play(visualId)
        if (visualId) setSelectedVisualId(visualId)
    }, [play])
    const playingVisual = visuals.find((visual) => visual.id === playing) || null

    const browserPanel = <MapEffectsBrowser visual={selectedVisual} target={fxTab} onAdd={(type) => addEffect(fxTab, type)} />
    const previewPanel = (
        <MapPreviewMonitor
            mapping={mapping}
            visual={selectedVisual}
            playing={playing}
            enabled={previewOn}
            onEnabled={setPreviewOn}
            stageProps={stageProps}
            onPlay={play}
            onDropEffect={(type) => { addEffect('clip', type); setFxTab('clip') }}
            onThumb={onThumb}
        />
    )
    // While the Mapping window is open it draws the wall; a second stage
    // behind it would only spend the frames.
    const outputPanel = mappingOpen ? <section className="map-dock-panel map-monitor" aria-label="Output" /> : (
        <MapOutputMonitor
            mapping={mapping}
            playingVisual={playingVisual}
            soloSurfaceId={soloId}
            stageProps={stageProps}
            referenceUrl={referenceUrl}
            reference={reference}
            onPlayVisual={playAndOpen}
            onDropEffect={(type, zone) => {
                if (zone === 'clip' && playingVisual) {
                    addEffect('clip', type, playingVisual.id)
                    setSelectedVisualId(playingVisual.id)
                    setFxTab('clip')
                    return
                }
                addEffect('comp', type)
                setFxTab('comp')
            }}
            onOpenOutput={openOutput}
            onOpenMapping={() => setMappingOpen(true)}
        />
    )
    const clipsPanel = (
        <MapDeck
            visuals={visuals}
            playing={playing}
            selectedVisualId={selectedVisual?.id || null}
            fade={mapping?.fade || 0}
            upload={upload}
            addChoices={ADD_CHOICES}
            fileAccept={FILE_ACCEPT}
            onPlay={playAndOpen}
            onSelect={(visualId) => { setSelectedVisualId(visualId); setFxTab('clip') }}
            onAdd={onAddVisual}
            onFade={(fade) => setOutput({ fade })}
            onReorder={reorderVisuals}
            onDropEffect={(visualId, type) => { addEffect('clip', type, visualId); setSelectedVisualId(visualId); setFxTab('clip') }}
            onDelete={(visualId) => { deleteVisual(visualId); if (visualId === selectedVisualId) setSelectedVisualId(null) }}
        />
    )
    const effectsPanel = (
        <MapEffectsPanel
            tab={fxTab}
            onTab={setFxTab}
            visual={selectedVisual}
            playing={playing}
            compEffects={compEffects}
            onVisualChange={updateVisual}
            onCompEffects={(effects) => setOutput({ effects })}
            onTempo={(tempo) => setOutput({ tempo })}
            onAddEffect={(target, type) => addEffect(target, type)}
            onPlay={play}
            browser={browserPanel}
            sourceEditor={selectedVisual ? (
                <MapVisualInspector
                    visual={selectedVisual}
                    playing={playing}
                    projectOptions={projectOptions}
                    upload={upload}
                    onUpdate={updateVisual}
                    onDelete={(visualId) => { deleteVisual(visualId); setSelectedVisualId(null) }}
                    onPlay={play}
                    onClose={null}
                />
            ) : null}
        />
    )
    const screensPanel = (
        <>
            <MapScreenList
                surfaces={surfaces}
                visuals={visuals}
                output={output}
                selectedId={selectedId}
                soloId={soloId}
                onSelect={(surfaceId) => setSelectedId(surfaceId === selectedId ? null : surfaceId)}
                onToggle={(surface) => updateSurface(surface.id, { enabled: !surface.enabled })}
                onSolo={setSoloId}
                onAddScreens={onAddScreens}
            />
            <p className="map-empty">Line screens up in <button type="button" className="map-link" onClick={() => setMappingOpen(true)}>Mapping</button>.</p>
            {inspectedScreen && isScreenKind(inspectedScreen.source.kind) ? (
                <MapScreenInspector
                    surface={inspectedScreen}
                    visuals={visuals}
                    output={output}
                    onUpdate={updateSurface}
                    onDelete={(surfaceId) => { deleteSurface(surfaceId); setSelectedId(null) }}
                    onDuplicate={onDuplicate}
                    onUseDirectSource={(surfaceId) => updateSurface(surfaceId, { source: { kind: 'test', ref: 'card' } })}
                />
            ) : inspectedScreen ? (
                <MapInspector
                    surface={inspectedScreen}
                    projectId={projectId}
                    assets={doc?.assets}
                    projectOptions={projectOptions}
                    pictureOutOptions={pictureOutOptions}
                    machines={machines}
                    clipboard={clipboard}
                    onUpdate={updateSurface}
                    onUpsertAsset={upsertAsset}
                    onDelete={(surfaceId) => { deleteSurface(surfaceId); setSelectedId(null) }}
                    onDuplicate={onDuplicate}
                    onCopy={(surfaceId) => setClipboard(surfaces.find((surface) => surface.id === surfaceId) || null)}
                    onPasteShape={onPasteShape}
                    onPasteLook={onPasteLook}
                    onMaskFromOutline={onMaskFromOutline}
                    onResetCorners={(surfaceId) => updateSurface(surfaceId, {
                        corners: nextCorners(surfaces.findIndex((surface) => surface.id === surfaceId))
                    })}
                />
            ) : null}
        </>
    )
    const machinesPanel = <MapMachinesList machines={machines} ndiScan={ndiScan} surfaces={surfaces} />
    const setupPanel = (
        <>
            {/* Cues are the old way of switching. A project that has
                some keeps them; a new one never sees the panel. */}
            {cues.length ? (
                <details className="map-fold" open>
                    <summary>Cues</summary>
                    <MapCueList
                        cues={cues}
                        surfaces={surfaces}
                        liveCueId={liveCueId}
                        onFire={onFireCue}
                        onCapture={onCaptureCue}
                        onAdd={() => addCue({ name: `Cue ${cues.length + 1}`, key: cues.length < 9 ? String(cues.length + 1) : '' })}
                        onUpdate={updateCue}
                        onDelete={deleteCue}
                        onReorder={reorderCues}
                    />
                </details>
            ) : null}
            <details className="map-fold" open>
                <summary>Wall photo</summary>
                <div className="map-section">
                    <p className="map-empty">A photo of the wall, over the Output monitor, to check edges against. Desk only — never on the output.</p>
                    <div className="map-row">
                        <label className="map-mini" style={{ cursor: 'pointer' }}>
                            Choose file
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (!file) return
                                // Held in this browser only: a blob URL means nothing to
                                // another machine, and a wall photo baked into the
                                // document as base64 would follow every edit forever.
                                setLocalReferenceFile(file)
                                setOutput({ reference: { ...reference, visible: true } })
                            }} />
                        </label>
                        <button type="button" className={`map-mini${reference.visible ? ' is-on' : ''}`}
                            onClick={() => setOutput({ reference: { ...reference, visible: !reference.visible } })}
                            disabled={!referenceUrl}>Show</button>
                    </div>
                    <MapReferenceOpacity value={reference.opacity} onChange={(opacity) => setOutput({ reference: { ...reference, opacity } })} />
                </div>
            </details>
            <details className="map-fold" open>
                <summary>Carry</summary>
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={exportMapping}>Export</button>
                    <button type="button" className="map-mini" onClick={() => setTransferText('')}>Import</button>
                </div>
            </details>
        </>
    )

    return (
        <div className="map-desk map-desk-dock" role="region" aria-label="Projection desk" onDragOver={onDeskDragOver} onDrop={onDeskDrop}>
            <SurfaceBar
                here="map"
                space={spaceId}
                spaceLabel={spaceName}
                project={projectId}
                projectLabel={doc?.projectMeta?.title}
                isLocalInstall={localInstall.isLocal}
                hidden={isEmbed}
                layers={barLayers}
            >
                <DeskPerformSwitch current="desk" space={spaceId} project={projectId} from="map" />
            </SurfaceBar>
            <header className="map-bar">
                <div className="map-bar-title">
                    <span className="map-bar-lane">Projection</span>
                    <span className="map-bar-project">{doc?.projectMeta?.title || projectId}</span>
                </div>
                <div className="map-bar-controls">
                    <button
                        type="button"
                        className="map-action"
                        onClick={() => navigateToStudioPath(buildStudioProjectPath(projectId, spaceId))}
                        title="Back to the room for this project"
                    >← Studio</button>
                    {/* The same undo as the keys, for a finger on a tablet at the desk.
                        Firing a cue is not undone: it is a performance, not an edit. */}
                    <button type="button" className="map-action" onClick={undo} disabled={!canUndo()}
                        title="Undo the last change to the mapping (Ctrl/Cmd+Z)">Undo</button>
                    <button type="button" className="map-action" onClick={redo} disabled={!canRedo()}
                        title="Redo (Shift+Ctrl/Cmd+Z)">Redo</button>
                    <label className="map-field map-field-inline" title="The composition: the size of the wall picture">
                        <span>Output</span>
                        <input type="number" min="1" value={output.width}
                            onChange={(event) => setOutput({ output: { ...output, width: Number(event.target.value) || 1 } })} />
                        <span aria-hidden="true">x</span>
                        <input type="number" min="1" value={output.height}
                            onChange={(event) => setOutput({ output: { ...output, height: Number(event.target.value) || 1 } })} />
                    </label>
                    <button type="button" className="map-action map-action-mapping" onClick={() => setMappingOpen(true)}
                        title="The mapping window: slices, input selection, transform, warp points, soft edge, the device the wall plays on">Mapping</button>
                    <button type="button" className={`map-toggle${moreOpen ? ' is-on' : ''}`} onClick={() => setMoreOpen((value) => !value)}
                        title="Screens list, machines, wall photo, export / import">More</button>
                    <button type="button" className={`map-toggle${live ? ' is-on' : ''}`} onClick={() => setLive((value) => !value)}
                        title="Run project, page and camera sources on this desk too. Off: they show as cards, and the wall gets every frame.">Live</button>
                    {lightingHere ? (
                        <a
                            className="map-action"
                            href={lightingDeskPath({ spaceId, projectId, label: doc?.projectMeta?.title })}
                            target="_blank"
                            rel="noreferrer"
                            title="The lighting desk on this machine — a map cue can recall one of its scenes"
                        >Light</a>
                    ) : null}
                    {syncLabel ? <span className={`map-sync map-sync-${syncLabel.tone}`} title={syncLabel.detail}>{syncLabel.text}</span> : null}
                    {transportNote ? <span className="map-warning" role="status">{transportNote}</span> : null}
                </div>
            </header>

                <div className="map-room" style={deskSplits.styles.room}>
                    {/* What you SEE: the wall on top, what you are about to send under it. */}
                    <div className="map-monitors" style={deskSplits.styles.monitors}>
                        {outputPanel}
                        <MapSplit axis="y" name="monitors" cssVar="--map-split-monitors" label="Output | Preview"
                            value={deskSplits.splits.monitors} onChange={(value) => deskSplits.set('monitors', value)} />
                        {previewPanel}
                    </div>
                    <MapSplit axis="x" name="left" cssVar="--map-split-left" label="Monitors | clips and effects"
                        value={deskSplits.splits.left} onChange={(value) => deskSplits.set('left', value)} />
                    {/* What you DO: pick a clip, then change it. */}
                    <div className="map-work" style={deskSplits.styles.work}>
                        {clipsPanel}
                        <MapSplit axis="y" name="work" cssVar="--map-split-work" label="Clips | effects"
                            value={deskSplits.splits.work} onChange={(value) => deskSplits.set('work', value)} />
                        {effectsPanel}
                    </div>
                    {moreOpen ? (
                        <aside className="map-drawer" aria-label="More">
                            <div className="map-drawer-head">
                                <div className="map-tabs" role="tablist">
                                    {[['screens', 'Screens'], ['machines', 'Machines'], ['more', 'Wall photo · carry']].map(([id, label]) => (
                                        <button key={id} type="button" role="tab" aria-selected={browserTab === id}
                                            className={`map-tab${browserTab === id ? ' is-on' : ''}`}
                                            onClick={() => setBrowserTab(id)}>{label}</button>
                                    ))}
                                </div>
                                <button type="button" className="map-mini" onClick={() => setMoreOpen(false)}>Close</button>
                            </div>
                            <div className="map-dock-scroll">
                                {browserTab === 'screens' ? screensPanel : null}
                                {browserTab === 'machines' ? machinesPanel : null}
                                {browserTab === 'more' ? setupPanel : null}
                            </div>
                        </aside>
                    ) : null}
                </div>

            {mappingOpen ? (
                <MapAdvancedOutput
                    mapping={mapping}
                    surfaces={surfaces}
                    visuals={visuals}
                    output={output}
                    machines={machines}
                    spaceId={spaceId}
                    projectId={projectId}
                    network={network}
                    assets={doc?.assets || null}
                    applyOps={applyOps}
                    setOutput={setOutput}
                    undo={undo}
                    redo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    play={play}
                    onClose={() => setMappingOpen(false)}
                />
            ) : null}

            {transferText !== null ? (
                <MapTransfer
                    text={transferText}
                    onApply={importMapping}
                    onClose={() => setTransferText(null)}
                />
            ) : null}
        </div>
    )
}

function MapReferenceOpacity({ value, onChange }) {
    return (
        <label className="map-field map-field-slider">
            <span>Opacity</span>
            <input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
            <output>{Number(value).toFixed(2)}</output>
        </label>
    )
}

// Carrying a mapping between machines, as text you can read. Not a file
// download: the machine that aligns a wall is often not the machine that made
// it, and a paste box crosses a chat window, a notes app or a USB stick alike.
function MapTransfer({ text, onApply, onClose }) {
    const [value, setValue] = useState(text)
    const [problem, setProblem] = useState('')
    return (
        <div className="map-transfer">
            <div className="map-transfer-panel">
                <div className="map-panel-head">
                    <h2>{text ? 'Projection as text' : 'Paste a projection'}</h2>
                    <button type="button" className="map-mini" onClick={onClose}>Close</button>
                </div>
                <textarea
                    className="map-transfer-text"
                    value={value}
                    spellCheck="false"
                    onChange={(event) => setValue(event.target.value)}
                />
                {problem ? <p className="map-warning">{problem}</p> : null}
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={() => {
                        navigator.clipboard?.writeText(value).catch(() => { /* no clipboard permission */ })
                    }}>Copy to clipboard</button>
                    <button type="button" className="map-mini" onClick={() => {
                        const message = onApply(value)
                        if (message) setProblem(message)
                        else onClose()
                    }}>Replace this projection</button>
                </div>
            </div>
        </div>
    )
}
