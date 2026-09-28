import { useCallback, useEffect, useMemo, useState } from 'react'
import MapInspector from './MapInspector.jsx'
import { MapMachinesList, MapSurfaceList, MapWallView, nextCorners } from './MapDeskParts.jsx'
import MapCueList from './MapCueList.jsx'
import { cueForKey, isCueKey } from './cueFiring.js'
import { useMapDocument } from './useMapDocument.js'
import { useProjectLayers } from '../project/useProjectLayers.js'
import { toTopNetwork } from '../project/tops/useTopNetwork.js'
import { buildMapOutputPath } from './mapRouting.js'
import { listProjects } from '../project/services/projectsApi.js'
import { transportWarning } from './transportCeiling.js'
import { lightingDeskPath, probeLightingDesk } from './lightingLink.js'
import { useMachinePresence } from '../project/tops/useMachinePresence.js'
import { showFromValue, showOptions, showValue } from './mapMachines.js'
import { buildStudioProjectPath, navigateToStudioPath } from '../studio/utils/studioRouting.js'
import SurfaceBar from '../components/SurfaceBar.jsx'
import DeskPerformSwitch from '../perform/DeskPerformSwitch.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'
import useSpaceName from '../hooks/useSpaceName.js'
import { isEmbedRequest, isPreviewRequest, signalPreviewReady } from '../utils/previewMode.js'
import { generateId } from '../shared/projectSchema.js'
import {
    addPointAfterHeld,
    moveSurfacesOps,
    nudgePoint,
    pastedSurface,
    removePoint,
    surfacesFromClipboardText,
    surfacesToClipboardText
} from './pointEditing.js'
import './mapSurface.css'

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
//
// The desk is laid out the way Resolume's Advanced Output is, because that
// is the layout in the hands of everyone who has mapped a wall: the list on
// the left, the picture in the middle, the numbers on the right. No modes.
// A selected surface shows its corners and its points at once; every value
// on the right can be typed.

const GRID_CHOICES = [
    { value: 0, label: 'off' },
    { value: 12, label: '12' },
    { value: 24, label: '24' },
    { value: 48, label: '48' },
    { value: 96, label: '96' }
]

export default function MapSurface({ projectId, spaceId }) {
    const {
        store, document: doc, mapping, surfaces, syncState, applyOps,
        addSurface, updateSurface, reorderSurfaces, setOutput, upsertAsset,
        addCue, updateCue, deleteCue, reorderCues, fireCue,
        undo, redo, canUndo, canRedo
    } = useMapDocument(projectId, { role: 'desk' })
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

    // THE SELECTION is a list, last one primary: the one whose numbers are on
    // the right and whose points are on the stage. Ctrl+A takes every
    // surface; shift-click adds one; the arrows, Delete, Ctrl+C move, take
    // and carry the whole list.
    const [selectedIds, setSelectedIds] = useState([])
    // The held point of the primary surface: what Delete takes and the
    // arrows move. Null when the hand is on the surface itself.
    const [selectedPointIndex, setSelectedPointIndex] = useState(null)
    const [soloId, setSoloId] = useState(null)
    // The desk shows the real picture by default — what you are putting on
    // the wall is what you see while you pin it. Cards instead when the
    // laptop cannot afford to run every source twice.
    const [live, setLive] = useState(true)
    const [snap, setSnap] = useState(true)
    const [liveCueId, setLiveCueId] = useState(null)
    const [clipboard, setClipboard] = useState(null)
    const [projectOptions, setProjectOptions] = useState([])
    const [open, setOpen] = useState({ cues: true, machines: false, photo: false, carry: false })
    // The project's picture operators: what a Pictures surface runs, and the
    // Picture Out nodes the inspector offers to show.
    const network = useMemo(() => toTopNetwork(doc), [doc])
    const pictureOutOptions = useMemo(
        () => (doc?.nodes || []).filter((node) => node.typeId === 'top.out').map((node) => ({ id: node.id, label: node.label || 'Picture Out' })),
        [doc]
    )
    const [localReference, setLocalReference] = useState('')
    const [transferText, setTransferText] = useState(null)
    const [lightingHere, setLightingHere] = useState(false)

    const output = useMemo(() => mapping?.output || { width: 1920, height: 1080 }, [mapping])
    const cues = useMemo(() => mapping?.cues || [], [mapping])
    const reference = mapping?.reference || { url: '', opacity: 0.5, visible: false }
    // Surfaces that were deleted (here or on another desk) leave the
    // selection on their own; nothing downstream has to check.
    const selection = useMemo(() => {
        const ids = new Set(surfaces.map((surface) => surface.id))
        return selectedIds.filter((id) => ids.has(id))
    }, [selectedIds, surfaces])
    const primaryId = selection.length ? selection[selection.length - 1] : null
    const selected = surfaces.find((surface) => surface.id === primaryId) || null
    const selectedPoint = selected && selectedPointIndex !== null && selected.points?.[selectedPointIndex] ? selectedPointIndex : null

    // Click: this one only. Shift-click: add it, or take it out again.
    // Clicking a surface that is already in the selection makes it the
    // primary without dropping the others — so the numbers on the right can
    // be walked through a group.
    const select = useCallback((surfaceId, shift = false) => {
        setSelectedPointIndex(null)
        setSelectedIds((current) => {
            if (!surfaceId) return []
            if (shift) return current.includes(surfaceId) ? current.filter((id) => id !== surfaceId) : [...current, surfaceId]
            if (current.includes(surfaceId)) return [...current.filter((id) => id !== surfaceId), surfaceId]
            return [surfaceId]
        })
    }, [])
    const selectAll = useCallback(() => {
        setSelectedPointIndex(null)
        setSelectedIds(surfaces.map((surface) => surface.id))
    }, [surfaces])

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

    const onCornersChange = useCallback((surfaceId, corners) => updateSurface(surfaceId, { corners }), [updateSurface])
    const onPointsChange = useCallback((surfaceId, points) => updateSurface(surfaceId, { points }), [updateSurface])

    // A body drag moves every selected surface, as ONE op batch per tick —
    // one undo step for the group, and the wall never shows half of it moved.
    const onMoveSelection = useCallback((delta, startSurfaces) => {
        const ops = moveSurfacesOps(startSurfaces, selection, delta)
        if (ops.length) applyOps(ops)
    }, [selection, applyOps])

    // One arrow press is one OUTPUT pixel — one pixel of the projector, the
    // unit the operator is actually watching on the wall. With a point held,
    // the arrows move THAT point by the same pixel; otherwise every selected
    // surface, together.
    const nudge = useCallback((dx, dy) => {
        if (!selected) return
        const delta = [dx / output.width, dy / output.height]
        if (selectedPoint !== null) {
            updateSurface(selected.id, { points: nudgePoint(selected.points, selectedPoint, delta) })
            return
        }
        const ops = moveSurfacesOps(surfaces, selection, delta)
        if (ops.length) applyOps(ops)
    }, [selected, selectedPoint, output, surfaces, selection, updateSurface, applyOps])

    // A point was put on an edge (double-click on the stage, or "+ Point" on
    // the right): written, its surface made primary, and the new point held —
    // ready for the arrows, a drag, or a number typed on the right.
    const onAddPoint = useCallback((surfaceId, points, index) => {
        updateSurface(surfaceId, { points })
        setSelectedIds((current) => (current.includes(surfaceId) ? [...current.filter((id) => id !== surfaceId), surfaceId] : [surfaceId]))
        setSelectedPointIndex(index)
    }, [updateSurface])

    const onAddPointAfterHeld = useCallback(() => {
        if (!selected) return
        const added = addPointAfterHeld(selected, selectedPoint)
        if (added) onAddPoint(selected.id, added.points, added.index)
    }, [selected, selectedPoint, onAddPoint])

    // Delete with a point held takes the point and holds the next one along,
    // so Delete, Delete, Delete unbends a surface point by point — it never
    // falls through to the surfaces while a point is held. With no point
    // held it takes every selected surface, as one batch: one Ctrl+Z brings
    // them all back.
    const deleteHeld = useCallback(() => {
        if (!selected) return
        if (selectedPoint !== null) {
            const points = removePoint(selected.points, selectedPoint)
            updateSurface(selected.id, { points })
            setSelectedPointIndex(points.length ? Math.min(selectedPoint, points.length - 1) : null)
            return
        }
        applyOps(selection.map((surfaceId) => ({ type: 'deleteMappingSurface', payload: { surfaceId } })))
        setSelectedIds([])
    }, [selected, selectedPoint, selection, updateSurface, applyOps])

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

    // Paste, and Ctrl+D, are one batch: a group pasted is one undo step, and
    // it is selected as a group so it can be moved into place at once.
    const pasteSurfaces = useCallback((list) => {
        if (!list?.length) return
        const created = list.map((surface) => ({ ...pastedSurface(surface), id: generateId('srf') }))
        applyOps(created.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })))
        setSelectedPointIndex(null)
        setSelectedIds(created.map((surface) => surface.id))
    }, [applyOps])

    const selectedSurfaces = useMemo(
        () => selection.map((id) => surfaces.find((surface) => surface.id === id)).filter(Boolean),
        [selection, surfaces]
    )

    const onDuplicate = useCallback(() => pasteSurfaces(selectedSurfaces), [pasteSurfaces, selectedSurfaces])
    const onCopy = useCallback(() => {
        if (!selectedSurfaces.length) return
        setClipboard(selectedSurfaces)
        navigator.clipboard?.writeText(surfacesToClipboardText(selectedSurfaces)).catch(() => { /* no clipboard permission */ })
    }, [selectedSurfaces])

    const onPasteShape = useCallback((surfaceId) => {
        const source = clipboard?.[0]
        if (!source) return
        updateSurface(surfaceId, { corners: source.corners, points: source.points || [] })
    }, [clipboard, updateSurface])

    const onPasteLook = useCallback((surfaceId) => {
        const source = clipboard?.[0]
        if (!source) return
        updateSurface(surfaceId, {
            source: source.source,
            resolution: source.resolution,
            opacity: source.opacity,
            brightness: source.brightness,
            contrast: source.contrast,
            saturation: source.saturation,
            hue: source.hue,
            blend: source.blend
        })
    }, [clipboard, updateSurface])

    // --- keyboard -------------------------------------------------------

    // The keys are Resolume's, because those are the keys in every mapper's
    // hands already: Ctrl+A for everything, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
    // for history, Ctrl+C / Ctrl+V / Ctrl+D to carry a surface, Delete for
    // the held point or the held surfaces, arrows to nudge, Escape to let go.
    useEffect(() => {
        const inField = (target) => Boolean(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

        const onKeyDown = (event) => {
            if (inField(event.target)) return

            if (event.metaKey || event.ctrlKey) {
                const key = event.key.toLowerCase()
                if (key === 'a') { selectAll(); event.preventDefault(); return }
                if (key === 'z' && !event.shiftKey) { undo(); event.preventDefault(); return }
                if (key === 'y' || (key === 'z' && event.shiftKey)) { redo(); event.preventDefault(); return }
                if (key === 'd') { onDuplicate(); event.preventDefault(); return }
                // Ctrl+C and Ctrl+V arrive as the copy and paste events below,
                // which is where the system clipboard can be read and written.
                return
            }

            // The binding itself is in src/map/cueFiring.js, because the 3D
            // scene listens for the same keys on the same cues. A cue key with
            // nothing bound to it still returns here rather than falling
            // through — a digit is never a nudge.
            if (isCueKey(event.key)) {
                const cue = cueForKey(cues, event.key)
                if (cue) { onFireCue(cue); event.preventDefault() }
                return
            }

            const step = event.shiftKey ? 10 : 1
            switch (event.key) {
                case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break
                case 'ArrowRight': nudge(step, 0); event.preventDefault(); break
                case 'ArrowUp': nudge(0, -step); event.preventDefault(); break
                case 'ArrowDown': nudge(0, step); event.preventDefault(); break
                case 'Delete': case 'Backspace': deleteHeld(); event.preventDefault(); break
                case 's': case 'S': setSnap((value) => !value); break
                // Escape lets go one level at a time: the point first, then
                // the surfaces — the way a hand lets go of a thing it is
                // holding before it steps back from the table.
                case 'Escape':
                    if (selectedPoint !== null) setSelectedPointIndex(null)
                    else setSelectedIds([])
                    break
                default: break
            }
        }

        // Ctrl+C writes the selection to the SYSTEM clipboard as text, not
        // only to the desk's own memory: the window that aligns a wall is
        // often a second window or a second machine, and text is the one
        // thing every clipboard everywhere agrees on. A field keeps its own
        // copy and paste.
        const onCopyEvent = (event) => {
            if (inField(event.target) || !selectedSurfaces.length || !event.clipboardData) return
            event.clipboardData.setData('text/plain', surfacesToClipboardText(selectedSurfaces))
            event.preventDefault()
            setClipboard(selectedSurfaces)
        }

        // Ctrl+V: surfaces on the system clipboard win — they may have come
        // from another machine — and the desk's own copy is the fallback for
        // a browser that would not hand the text over.
        const onPasteEvent = (event) => {
            if (inField(event.target)) return
            const fromText = surfacesFromClipboardText(event.clipboardData?.getData('text/plain'))
            const list = fromText.length ? fromText : clipboard
            if (!list?.length) return
            event.preventDefault()
            pasteSurfaces(list)
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('copy', onCopyEvent)
        window.addEventListener('paste', onPasteEvent)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('copy', onCopyEvent)
            window.removeEventListener('paste', onPasteEvent)
        }
    }, [nudge, cues, onFireCue, undo, redo, selectedPoint, clipboard, onDuplicate, deleteHeld, selectAll, selectedSurfaces, pasteSurfaces])

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
            ...incoming.surfaces.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })),
            ...(Array.isArray(incoming.cues) ? incoming.cues : []).map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
            {
                type: 'setMappingState',
                payload: {
                    patch: {
                        output: incoming.output,
                        background: incoming.background,
                        grid: incoming.grid,
                        reference: incoming.reference
                    }
                }
            }
        ]
        // ONE batch: an import is a single version bump rather than a stutter
        // of thirty, and a half-applied import can never be what is on the
        // wall when somebody walks in.
        applyOps(ops)
        return ''
    }, [surfaces, cues, applyOps])

    const openOutput = useCallback(() => {
        window.open(buildMapOutputPath(spaceId, projectId), `di-map-out-${projectId}`, 'noopener')
    }, [spaceId, projectId])

    const moveSurface = useCallback((surfaceId, direction) => {
        const index = surfaces.findIndex((surface) => surface.id === surfaceId)
        const target = index + direction
        if (index === -1 || target < 0 || target >= surfaces.length) return
        const ids = surfaces.map((surface) => surface.id)
        ids.splice(target, 0, ids.splice(index, 1)[0])
        reorderSurfaces(ids)
    }, [surfaces, reorderSurfaces])

    const toggleSection = (key) => setOpen((current) => ({ ...current, [key]: !current[key] }))
    const referenceUrl = localReference || reference.url

    const status = selectedPoint !== null
        ? `Point ${selectedPoint + 1} of ${selected?.name || selected?.id} — drag or arrow it and the picture bends with it. Delete takes it. Type it on the right.`
        : selection.length > 1
            ? `${selection.length} surfaces — drag or arrow them together. Delete, Ctrl+C, Ctrl+D act on all.`
            : selected
                ? 'Drag a corner to pin, drag inside to move, double-click an edge to add a point that bends the picture. Shift-click adds to the selection. Ctrl+A all · Ctrl+Z undo.'
                : 'Pick a surface, or Add one for each shape on the wall.'

    return (
        <div className="map-desk">
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
                    <button
                        type="button"
                        className="map-action is-quiet"
                        onClick={() => navigateToStudioPath(buildStudioProjectPath(projectId, spaceId))}
                        title="Back to the room for this project"
                    >←</button>
                    <span className="map-bar-lane">Projection</span>
                    <span className="map-bar-project">{doc?.projectMeta?.title || projectId}</span>
                </div>
                <div className="map-bar-controls">
                    {/* The same undo as the keys, for a finger on a tablet at the desk.
                        Firing a cue is not undone: it is a performance, not an edit. */}
                    <button type="button" className="map-action" onClick={undo} disabled={!canUndo()}
                        title="Undo the last change to the mapping (Ctrl/Cmd+Z)">Undo</button>
                    <button type="button" className="map-action" onClick={redo} disabled={!canRedo()}
                        title="Redo (Shift+Ctrl/Cmd+Z)">Redo</button>
                    <label className="map-field map-field-inline" title="The projector's pixels">
                        <span>Output</span>
                        <input type="number" min="1" value={output.width}
                            onChange={(event) => setOutput({ output: { ...output, width: Number(event.target.value) || 1 } })} />
                        <span aria-hidden="true">×</span>
                        <input type="number" min="1" value={output.height}
                            onChange={(event) => setOutput({ output: { ...output, height: Number(event.target.value) || 1 } })} />
                    </label>
                    <label className="map-field map-field-inline" title="Which machine and screen the stage box puts this mapping on. Any screen: the one kiosk a stage machine already runs.">
                        <span>Show on</span>
                        <select value={showValue(output.show)} onChange={(event) => {
                            const show = showFromValue(event.target.value, machines)
                            const { show: _dropped, ...rest } = output
                            setOutput({ output: show ? { ...rest, show } : rest })
                        }}>
                            {showOptions(machines, output.show).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                    <label className="map-field map-field-inline">
                        <span>Grid</span>
                        <select value={mapping?.grid || 0} onChange={(event) => setOutput({ grid: Number(event.target.value) })}>
                            {GRID_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                    </label>
                    <button type="button" className={`map-toggle${snap ? ' is-on' : ''}`} onClick={() => setSnap((value) => !value)}
                        title="Snap corners to neighbours and the frame. Hold alt while dragging to ignore it. (S)">Snap</button>
                    <button type="button" className={`map-toggle${live ? ' is-on' : ''}`} onClick={() => setLive((value) => !value)}
                        title="Run every source here as well as on the wall. Off shows a name card in each surface instead, which costs the laptop nothing.">Live</button>
                    <span className="map-bar-gap" aria-hidden="true" />
                    <button type="button" className="map-action is-quiet" onClick={undo} title="Undo (Ctrl+Z)">↶</button>
                    <button type="button" className="map-action is-quiet" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
                    <button type="button" className="map-action" onClick={openOutput} title="The wall's window: black, nothing but the surfaces. Drag it onto the projector.">Output ↗</button>
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
                </div>
            </header>

            <div className="map-body">
                <aside className="map-panel map-panel-left">
                    <MapSurfaceList
                        surfaces={surfaces}
                        selectedIds={selection}
                        primaryId={primaryId}
                        soloId={soloId}
                        onSelect={select}
                        onAdd={() => {
                            const id = addSurface({ name: `Surface ${surfaces.length + 1}`, corners: nextCorners(surfaces.length) })
                            select(id)
                        }}
                        onToggle={(surface) => updateSurface(surface.id, { enabled: !surface.enabled })}
                        onSolo={setSoloId}
                        note={transportNote}
                    />

                    <section className={`map-section${open.cues ? ' is-open' : ''}`}>
                        <button type="button" className="map-section-head" onClick={() => toggleSection('cues')} aria-expanded={open.cues}>
                            <span>Cues</span><span className="map-section-count">{cues.length || ''}</span>
                        </button>
                        {open.cues ? (
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
                        ) : null}
                    </section>

                    <MapMachinesList
                        machines={machines}
                        ndiScan={ndiScan}
                        surfaces={surfaces}
                        open={open.machines}
                        onToggle={() => toggleSection('machines')}
                    />

                    <section className={`map-section${open.photo ? ' is-open' : ''}`}>
                        <button type="button" className="map-section-head" onClick={() => toggleSection('photo')} aria-expanded={open.photo}>
                            <span>Wall photo</span><span className="map-section-count">{reference.visible && referenceUrl ? 'on' : ''}</span>
                        </button>
                        {open.photo ? (
                            <div className="map-section-body">
                                <p className="map-empty">A photo of the wall behind the surfaces, to trace edges over. Desk only — never projected.</p>
                                <div className="map-row">
                                    <label className="map-mini">
                                        Choose file
                                        <input type="file" accept="image/*" className="map-field-file-input" onChange={(event) => {
                                            const file = event.target.files?.[0]
                                            if (!file) return
                                            // Held in this browser only: a blob URL means nothing to
                                            // another machine, and a wall photo baked into the
                                            // document as base64 would follow every edit forever.
                                            setLocalReference(URL.createObjectURL(file))
                                            setOutput({ reference: { ...reference, visible: true } })
                                        }} />
                                    </label>
                                    <button type="button" className={`map-mini${reference.visible ? ' is-on' : ''}`}
                                        onClick={() => setOutput({ reference: { ...reference, visible: !reference.visible } })}
                                        disabled={!referenceUrl}>Show</button>
                                </div>
                                <label className="map-field map-field-slider">
                                    <span>Opacity</span>
                                    <input type="range" min="0" max="1" step="0.01" value={reference.opacity}
                                        onChange={(event) => setOutput({ reference: { ...reference, opacity: Number(event.target.value) } })} />
                                    <output>{Number(reference.opacity).toFixed(2)}</output>
                                </label>
                            </div>
                        ) : null}
                    </section>

                    <section className={`map-section${open.carry ? ' is-open' : ''}`}>
                        <button type="button" className="map-section-head" onClick={() => toggleSection('carry')} aria-expanded={open.carry}>
                            <span>Carry</span><span className="map-section-count" />
                        </button>
                        {open.carry ? (
                            <div className="map-section-body">
                                <p className="map-empty">The whole mapping as text, to paste into the desk on another machine.</p>
                                <div className="map-row">
                                    <button type="button" className="map-mini" onClick={exportMapping}>Export</button>
                                    <button type="button" className="map-mini" onClick={() => setTransferText('')}>Import</button>
                                </div>
                            </div>
                        ) : null}
                    </section>
                </aside>

                <MapWallView
                    mapping={mapping}
                    spaceId={spaceId}
                    network={network}
                    assets={doc?.assets || null}
                    projectId={projectId}
                    live={live}
                    soloSurfaceId={soloId}
                    selectedIds={selection}
                    selectedPointIndex={selectedPoint}
                    snap={snap}
                    referenceUrl={referenceUrl}
                    reference={reference}
                    onSelect={select}
                    onSelectPoint={setSelectedPointIndex}
                    onCornersChange={onCornersChange}
                    onMoveSelection={onMoveSelection}
                    onPointsChange={onPointsChange}
                    onAddPoint={onAddPoint}
                    hint={false}
                />
                <p className="map-status" role="status">{status}</p>

                <aside className="map-panel map-panel-right">
                    <MapInspector
                        surface={selected}
                        selectionCount={selection.length}
                        output={output}
                        projectId={projectId}
                        assets={doc?.assets}
                        projectOptions={projectOptions}
                        pictureOutOptions={pictureOutOptions}
                        machines={machines}
                        clipboard={clipboard?.[0] || null}
                        selectedPointIndex={selectedPoint}
                        onSelectPoint={setSelectedPointIndex}
                        onUpdate={updateSurface}
                        onUpsertAsset={upsertAsset}
                        onDelete={deleteHeld}
                        onDuplicate={onDuplicate}
                        onCopy={onCopy}
                        onPasteShape={onPasteShape}
                        onPasteLook={onPasteLook}
                        onAddPoint={onAddPointAfterHeld}
                        // Points AND any cut-out mask an older document still
                        // carries: Clear means "the plain picture, pinned by
                        // its corners", whichever way it had been shaped.
                        onClearPoints={(surfaceId) => { updateSurface(surfaceId, { points: [], mask: [] }); setSelectedPointIndex(null) }}
                        onResetCorners={(surfaceId) => updateSurface(surfaceId, {
                            corners: nextCorners(surfaces.findIndex((surface) => surface.id === surfaceId))
                        })}
                        onReorder={moveSurface}
                    />
                </aside>
            </div>

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
