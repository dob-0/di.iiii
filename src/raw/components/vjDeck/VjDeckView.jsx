import { useEffect, useMemo, useRef, useState } from 'react'
import { useTopReport } from '../../../project/tops/topReports.js'
import { registerTopThumbnail } from '../../../project/tops/topThumbnails.js'
import {
    BLEND_MODES,
    CLIP_MODES,
    DECK_INPUTS,
    addColumn,
    addLayer,
    cameraNodeId,
    clearLayer,
    clipNodeId,
    masterNodeId,
    moveClip,
    normalizeDeck,
    removeLayer,
    setBlend,
    setBpm,
    setBypass,
    setClip,
    setCrossfade,
    setMaster,
    setOpacity,
    setSide,
    setSolo,
    tapTempo,
    trigger,
    triggerColumn,
    updateClip
} from '../../../project/tops/vjDeck.js'
import { detectAssetMediaKind } from '../../../utils/mediaAssetTypes.js'
import { resolveClipUrl } from '../../../project/tops/clipVideos.js'
import { readNdiSources } from '../../../project/tops/machineDevices.js'
import { isTypingTarget } from '../../../perform/windowKeys.js'
import { useShowClockContext } from '../../../perform/useShowClock.js'
import { DEFAULT_BPM } from '../../../timeline/showClock.js'
import { clipStill } from './clipStills.js'
import { useDeckMidi } from '../../../perform/midi/useDeckMidi.js'
import DeckMidiControl from '../../../perform/midi/DeckMidiControl.jsx'
import MidiMapOverlay from '../../../perform/midi/MidiMapOverlay.jsx'
import K2LayoutPanel from '../../../perform/midi/K2LayoutPanel.jsx'
import { resetDeckValue } from '../../../perform/midi/deckBinding.js'
import ContextMenu from '../ContextMenu.jsx'
import EffectsPanel from './EffectsPanel.jsx'
import DeckSeam from './DeckSeam.jsx'
import useDeckLayout from './useDeckLayout.js'
import './vjDeck.css'

// The VJ deck: Resolume's clip grid for one vj.deck node.
//
// ONE component for every place the deck is shown — a window on the patch,
// inside the node, docked in the perform split. `placement` changes density
// only; what a tap does is the same everywhere, and the only state that
// matters lives in node.values.deck, so two placements of one deck never
// disagree.
//
// Pictures: the deck registers card-thumbnail canvases under the ids its
// expansion gives the playing clips and the master (tops/vjDeck.js). Whatever
// network runner is live fills them; until then the tile shows its name. A
// playing INPUT tile shows the node wired into that input (`inputSources`).
//
// Laid out like Resolume's (PROGRESS.md (the feat-vj-resolume-layout entry)): a top
// bar, the clip grid beside two monitors (PREVIEW, OUTPUT), and SOURCES and CLIP
// panels underneath. A tap only plays; the selected clip's settings are always
// in the CLIP panel, so nothing covers the grid and nothing needs a Close.

const PLACEMENTS = new Set(['window', 'inside', 'perform'])

// How the two monitors are shown is THIS viewer's choice (a phone and a desk want different
// ones), so it is kept on the device, never in the show document. Storage may be blocked.
export const MONITOR_SIZES = ['s', 'm', 'l']
const MONITOR_KEY = 'di.vjDeck.monitors'
const readMonitorPrefs = () => {
    try {
        const saved = JSON.parse(window.localStorage.getItem(MONITOR_KEY) || '{}')
        return { size: MONITOR_SIZES.includes(saved?.size) ? saved.size : 'l', hidden: saved?.hidden === true }
    } catch {
        return { size: 'l', hidden: false }
    }
}
const writeMonitorPrefs = (prefs) => {
    try { window.localStorage.setItem(MONITOR_KEY, JSON.stringify(prefs)) } catch { /* the choice lasts until the page closes */ }
}

function DeckPicture({ nodeId, className, label, width = 160, height = 90 }) {
    const canvasRef = useRef(null)
    useEffect(() => {
        const context = canvasRef.current?.getContext?.('2d')
        return registerTopThumbnail(nodeId, context)
    }, [nodeId])
    return <canvas ref={canvasRef} className={className} width={width} height={height} aria-label={label} role="img" />
}

// The at-rest picture of a filled slot: one frame of the clip (clipStills.js).
// A playing slot shows the engine's live picture instead, drawn over this.
function ClipStill({ url, inPoint, outPoint, label, className = 'vj-deck-tile-picture vj-deck-tile-still' }) {
    const [still, setStill] = useState(null)
    useEffect(() => {
        let cancelled = false
        setStill(null)
        clipStill(url, inPoint, outPoint).then((value) => { if (!cancelled) setStill(value) })
        return () => { cancelled = true }
    }, [url, inPoint, outPoint])
    if (!still) return null
    return <img className={className} src={still} alt="" aria-hidden="true" data-still-of={label} />
}

// Drag and drop: a filled tile carries its slot, a Sources row carries a clip
// to make. Both go through dataTransfer with their own type, so a file or a
// link dragged in from outside is never mistaken for one.
export const DRAG_CLIP = 'application/x-di-deck-clip'
export const DRAG_SOURCE = 'application/x-di-deck-source'
const dragHas = (event, type) => Array.from(event.dataTransfer?.types || []).includes(type)
const dragRead = (event, type) => {
    try { return JSON.parse(event.dataTransfer.getData(type)) } catch { return null }
}

const inputLabel = (input) => `In ${DECK_INPUTS.indexOf(input) + 1}`
const mediaDevicesOf = () => (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function' ? navigator.mediaDevices : null)

// The cameras this page can see, by label. Labels are empty until the person
// has allowed a camera once; then `needsPermission` offers the one button.
// Only these three mean the device is held by another program; a missing camera
// and a refusal each say their own thing; anything else is neutral.
const BUSY_CAMERA_ERRORS = new Set(['NotReadableError', 'TrackStartError', 'AbortError'])
export const cameraFailureText = (failure) => {
    const name = failure?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Cameras are blocked for this page: allow them in the address bar.'
    if (BUSY_CAMERA_ERRORS.has(name)) return 'The camera is busy in another program.'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera on this machine'
    if (name === 'CameraNotFound') return failure.camera ? `Camera "${failure.camera}" not found.` : 'Camera not found.'
    return 'Could not open the camera.'
}

// Why a playing camera clip shows no picture: the engine's own report for its
// camera node (topReports camera.error / errorName), in the same words as above.
// Null while the camera is fine or not yet tried.
function CameraFailure({ nodeId, camera, className }) {
    const report = useTopReport(nodeId)?.camera
    if (!report?.blocked && !report?.errorName) return null
    if (!report.error && !report.errorName) return null
    const text = report.errorName ? cameraFailureText({ name: report.errorName, camera }) : report.error
    return <span className={`vj-deck-dim ${className}`} role="status">{text}</span>
}

function useCameras() {
    const [state, setState] = useState({ supported: true, cameras: [], needsPermission: false, error: '' })
    const read = async () => {
        const media = mediaDevicesOf()
        if (!media) { setState({ supported: false, cameras: [], needsPermission: false, error: '' }); return }
        try {
            const inputs = (await media.enumerateDevices()).filter((device) => device.kind === 'videoinput')
            const cameras = inputs.filter((device) => device.label).map((device) => ({ id: device.deviceId || '', label: device.label }))
            setState({ supported: true, cameras, needsPermission: inputs.length > 0 && cameras.length === 0, error: '' })
        } catch {
            setState({ supported: true, cameras: [], needsPermission: false, error: 'Could not list the cameras.' })
        }
    }
    useEffect(() => {
        read()
        const media = mediaDevicesOf()
        media?.addEventListener?.('devicechange', read)
        return () => media?.removeEventListener?.('devicechange', read)
    }, [])
    const allow = async () => {
        const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
        try {
            const stream = await media.getUserMedia({ video: true })
            stream.getTracks().forEach((track) => track.stop())
        } catch (failure) {
            // 2026-11-10 (owner row N3529): the default camera can be held by another
            // program. The person's Allow still counts, so read the list again; say
            // no only when the browser really refused or the list is still unnamed.
            await read()
            setState((current) => (current.cameras.length ? current : { ...current, error: cameraFailureText(failure) }))
            return
        }
        await read()
    }
    return { ...state, allow }
}

// The NDI sources this machine's finder sees, read AFTER the first paint and never awaited by the
// panel: a machine without NDI answers nothing within the 1500 ms leash (machineDevices.js) and the
// list stays "none seen". Not played by the deck yet (the gap is written in docs/ai/known-fixes.md).
function useNetworkSources() {
    const [sources, setSources] = useState([])
    useEffect(() => {
        let alive = true
        const timer = setTimeout(() => {
            readNdiSources().then((found) => { if (alive) setSources(found) }).catch(() => {})
        }, 0)
        return () => { alive = false; clearTimeout(timer) }
    }, [])
    return sources
}

// One row of the Sources list: a small kind label, the name and, when it has one, a state.
// The row is the drag handle (type DRAG_SOURCE, the clip to make); the name is
// the button, which puts the clip in the target slot. A row with no clip (a network
// source the deck cannot play yet) is shown, not draggable and not placeable.
function SourceRow({ kind, name, label, clip, editable, canPlace, onPlace, state = '', stateTone = '' }) {
    const playable = Boolean(clip)
    return (
        // The row is only a drag handle; its button is the keyboard and touch way to the same thing.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div className={`vj-deck-source${playable ? '' : ' is-unplayable'}`} draggable={editable && playable} onDragStart={(event) => {
            if (!clip) { event.preventDefault(); return }
            event.dataTransfer.setData(DRAG_SOURCE, JSON.stringify(clip))
            event.dataTransfer.effectAllowed = 'copy'
        }}>
            <span className="vj-deck-source-kind">{kind}</span>
            <button type="button" className="vj-deck-button vj-deck-source-name" aria-label={label} title={name} disabled={!canPlace || !playable} onClick={() => clip && onPlace(clip)}>{name}</button>
            {state ? <span className={`vj-deck-source-state${stateTone ? ` is-${stateTone}` : ''}`}>{state}</span> : null}
        </div>
    )
}

// ALWAYS visible, in four groups with a header each: DEVICES (the cameras the browser lists), NETWORK
// (NDI), INPUTS (In 1 to 4) and FILES (the videos of the project, with the upload row). A row is dragged
// onto any slot, or clicked to fill the slot that is picked or selected (`target`).
function SourcesPanel({ mode, editable, target, targetName, picking, onCancel, onPlace, videoAssets, onUploadFile, uploading, onFile, notice, liveCameras = [] }) {
    const { supported, cameras, needsPermission, error, allow } = useCameras()
    const network = useNetworkSources()
    const canPlace = editable && Boolean(target)
    const row = (props) => <SourceRow key={`${props.kind}:${props.label}`} editable={editable} canPlace={canPlace} onPlace={onPlace} {...props} />
    return (
        <section className="vj-deck-panel vj-deck-sources" aria-label={picking ? 'Add a clip' : 'Sources'}>
            <div className="vj-deck-panel-head">
                <span className="vj-deck-label">{target ? `Sources: ${picking ? 'add to' : 'put in'} ${targetName}` : 'Sources'}</span>
                {picking ? <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={onCancel}>Cancel</button> : null}
            </div>
            {notice ? <span className="vj-deck-dim" role="status">{notice}</span> : null}
            <div className="vj-deck-source-list">
                {/* Named only while a slot is being filled: the grid's own group count stays what it was. */}
                <div role={picking ? 'group' : undefined} aria-label={picking ? 'Cameras' : undefined} className="vj-deck-source-group vj-deck-source-devices">
                    <div className="vj-deck-source-head">Devices</div>
                    {cameras.map((camera) => row({ kind: 'Camera', name: camera.label, label: `Camera ${camera.label}`, state: liveCameras.includes(camera.label) ? 'Live' : 'Ready', stateTone: liveCameras.includes(camera.label) ? 'live' : '', clip: { kind: 'camera', camera: camera.label, device: camera.id, label: camera.label } }))}
                    {needsPermission ? <button type="button" className="vj-deck-button vj-deck-allow-cameras" onClick={allow}>Allow cameras</button> : null}
                    {!supported || (!cameras.length && !needsPermission && !error) ? <span className="vj-deck-dim vj-deck-camera-none">No camera on this machine</span> : null}
                    {error ? <span className="vj-deck-dim" role="status">{error}</span> : null}
                </div>
                <div className="vj-deck-source-group vj-deck-source-network">
                    <div className="vj-deck-source-head">Network</div>
                    {network.map((source) => row({ kind: 'NDI', name: source.label, label: `NDI ${source.label}`, state: 'Not on deck yet', stateTone: 'off', clip: null }))}
                    {!network.length ? <span className="vj-deck-dim vj-deck-network-none">None seen</span> : null}
                </div>
                <div className="vj-deck-source-group vj-deck-source-inputs">
                    <div className="vj-deck-source-head">Inputs</div>
                    {DECK_INPUTS.map((input) => row({ kind: 'Input', name: inputLabel(input), label: inputLabel(input), clip: { kind: 'input', input, label: inputLabel(input) } }))}
                </div>
                <div className="vj-deck-source-group vj-deck-source-files">
                    <div className="vj-deck-source-head">Files</div>
                    {onUploadFile ? (
                        <div className="vj-deck-source vj-deck-source--upload">
                            <span className="vj-deck-source-kind">File</span>
                            <label className="vj-deck-button vj-deck-upload">
                                {uploading ? `Bringing in ${uploading}` : 'Upload video'}
                                <input type="file" accept="video/*" onChange={onFile} disabled={Boolean(uploading)} />
                            </label>
                        </div>
                    ) : null}
                    <div className="vj-deck-source-files-list">
                        {videoAssets.map((asset) => row({ kind: 'Video', name: asset.name || asset.id, label: asset.name || asset.id, clip: { kind: 'asset', asset: asset.id, label: asset.name || '' } }))}
                        {!videoAssets.length ? <span className="vj-deck-dim" title="No video in this project yet.">{mode === 'perform' ? 'No video' : 'No video in this project yet.'}</span> : null}
                    </div>
                </div>
            </div>
            {!target ? <p className="vj-deck-hint">{mode === 'perform' ? 'Drag onto a slot' : 'Drag a source onto a slot, or tap a slot first and then a source.'}</p> : null}
        </section>
    )
}

// PREVIEW of a camera clip that is not playing: a private look at the device
// (a second reader; OUTPUT is untouched). If the device cannot be opened twice
// or at all, the caller's fallback text stays.
function CameraPreview({ camera, device, className }) {
    const videoRef = useRef(null)
    useEffect(() => {
        const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
        if (!media?.getUserMedia || !media.enumerateDevices) return undefined
        let cancelled = false
        let stream = null
        ;(async () => {
            try {
                const list = (await media.enumerateDevices()).filter((item) => item.kind === 'videoinput')
                const found = list.find((item) => item.label && item.label === camera) || list.find((item) => device && item.deviceId === device)
                if (!found) return
                stream = await media.getUserMedia({ video: { deviceId: { exact: found.deviceId } } })
                if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
                if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play?.()?.catch?.(() => {}) }
            } catch { /* the fallback text stays */ }
        })()
        return () => {
            cancelled = true
            stream?.getTracks?.().forEach((track) => track.stop())
        }
    }, [camera, device])
    return <video ref={videoRef} className={className} muted playsInline aria-label={`Preview of ${camera}`} data-camera-preview="true" />
}
const percent = (value) => `${Math.round(value * 100)}`

export default function VjDeckView({ node, onPatchValues = null, assets = [], inputSources = {}, placement = 'window', onUploadFile = null, now = () => Date.now(), spaceId = '', projectId = null }) {
    const deck = useMemo(() => normalizeDeck(node?.values?.deck), [node?.values?.deck])
    const deckId = node?.id || ''
    const editable = typeof onPatchValues === 'function'
    const [selected, setSelected] = useState(null) // { layer, column }
    const [picking, setPicking] = useState(null) // { layer, column }
    const [dropTarget, setDropTarget] = useState(null) // { layer, column } under a drag
    const [uploading, setUploading] = useState('')
    const [notice, setNotice] = useState('')
    // Effects: the stack shown is a layer's (the selected clip's layer unless one is picked) or the master's.
    const [fxScope, setFxScope] = useState('layer')
    const [fxPick, setFxPick] = useState(null)
    const tapsRef = useRef([])
    const rootRef = useRef(null)
    const scrollRef = useRef(null)
    // PREVIEW ONLY: a click selects (the Preview pane shows it) and TAKE sends it live.
    // View state of this person's screen, not of the show; MIDI always goes live.
    const [previewOnly, setPreviewOnly] = useState(false)
    const [monitors, setMonitors] = useState(readMonitorPrefs) // { size: 's'|'m'|'l', hidden }
    // The borders between the panels: this viewer's sizes, never the show's (useDeckLayout.js).
    const deckLayout = useDeckLayout(rootRef)
    const paneId = (name) => `vj-deck-${deckLayout.uid}-${name}`
    const seam = (id, shown, orientation, label, controls, sign = 1) => (shown ? (
        <DeckSeam
            key={id}
            id={id}
            orientation={orientation}
            label={label}
            controls={controls}
            sign={sign}
            now={deckLayout.stateOf(id)}
            read={() => deckLayout.read(id)}
            onPreview={deckLayout.preview}
            onCommit={deckLayout.commit}
            onCancel={deckLayout.cancel}
            onReset={deckLayout.resetSeam}
        />
    ) : null)
    const setMonitorPrefs = (patch) => setMonitors((current) => { const next = { ...current, ...patch }; writeMonitorPrefs(next); return next })

    // The same list and value a Video node's picker uses: the PROJECT's files
    // (document.assets), video only, stored as the asset id; an upload goes
    // through uploadProjectAsset like the inspector's. top.clip resolves it.
    const videoAssets = useMemo(
        () => (assets || []).filter((asset) => asset?.id && detectAssetMediaKind(asset) === 'video'),
        [assets]
    )
    const liveCameras = deck.layers.map((layer) => layer.clips[layer.active]).filter((clip) => clip?.kind === 'camera').map((clip) => clip.camera)
    const clipName = (clip) => (clip.label || (clip.kind === 'input' ? inputLabel(clip.input) : clip.kind === 'camera' ? clip.camera : assetName(clip.asset)))
    const assetName = (id) => (assets || []).find((asset) => asset?.id === id)?.name || id

    // The newest deck this view has seen or written: an upload that finishes after a
    // long wait places its clip into THIS, never into the deck captured when the file
    // was chosen (that would undo every change made meanwhile).
    // End room for the snap (SPEC rule 3): when the layer rows overflow their box, the grid gets
    // room below the last row so that row can also rest right under the Columns header.
    useEffect(() => {
        const box = scrollRef.current
        if (!box || typeof ResizeObserver === 'undefined') return undefined
        const measure = () => {
            const rows = box.querySelectorAll('.vj-deck-row:not(.vj-deck-columns)')
            const head = box.querySelector('.vj-deck-columns')
            const last = rows[rows.length - 1]
            if (!last || !head) return
            const boxTop = box.getBoundingClientRect().top - box.scrollTop
            const lastRect = last.getBoundingClientRect()
            const contentBottom = lastRect.bottom - boxTop
            const gap = parseFloat(getComputedStyle(box.firstElementChild).rowGap) || 0
            const room = contentBottom > box.clientHeight + 1 ? Math.max(0, Math.round(box.clientHeight - head.offsetHeight - gap - lastRect.height)) : 0
            box.style.setProperty('--vj-end-room', `${room}px`)
        }
        measure()
        const watcher = new ResizeObserver(measure)
        watcher.observe(box)
        box.querySelectorAll('.vj-deck-row').forEach((row) => watcher.observe(row))
        return () => watcher.disconnect()
    }, [deck.layers.length, deck.columns])

    const latestDeck = useRef(deck)
    useEffect(() => { latestDeck.current = deck }, [deck])
    const write = (nextDeck) => {
        if (editable) { latestDeck.current = nextDeck; onPatchValues({ deck: nextDeck }) }
    }

    // A selection whose slot was emptied (here or by another window) lets go.
    const selectedClip = selected ? deck.layers[selected.layer]?.clips[selected.column] || null : null
    useEffect(() => {
        if (selected && !selectedClip) setSelected(null)
    }, [selected, selectedClip])

    // Where a Sources row goes when clicked: the slot being filled, else the selected one.
    const targetSlot = picking || (selectedClip ? selected : null)

    // ONE show clock (src/perform/useShowClock.js), when the page has one: the
    // Light desk leads it, and this deck shows and taps THAT tempo. Without a
    // clock on the page the deck keeps its own, as it always did.
    const clock = useShowClockContext()
    const followsLight = clock?.leader === 'light'
    const shownBpm = clock ? clock.timeline.bpm : deck.bpm
    const onTap = () => {
        if (clock) {
            clock.tap()
            return
        }
        const state = tapTempo(tapsRef.current, now())
        tapsRef.current = state.taps
        if (state.bpm !== null) write(setBpm(latestDeck.current, state.bpm, state.epoch))
    }
    const onResetTempo = () => {
        if (clock) {
            clock.reset()
            return
        }
        tapsRef.current = []
        write(setBpm(latestDeck.current, DEFAULT_BPM, now()))
    }
    // MIDI (src/perform/midi): live while the deck is on screen; Learn binds the
    // control clicked on the deck (data-midi-target) to the next controller message.
    const fxLayer = Math.min(deck.layers.length - 1, Math.max(0, fxPick ?? selected?.layer ?? 0))
    const [k2Open, setK2Open] = useState(false)
    const [fxIndex, setFxIndex] = useState(0) // which effect of the selected stack the K2's third pot row turns
    // K2 LAYER button: this layer's effects (leaves Master scope); K2 encoder 6 push: the next effect
    const onFxLayer = (index) => { setFxPick(index); setFxScope('layer'); setFxIndex(0) }
    const midi = useDeckMidi({ deckId, deck, write, stored: node?.values?.midiMap, console: node?.values?.midiConsole, onPatch: editable ? onPatchValues : null, onTap, enabled: editable, fxLayer: fxScope === 'master' ? -1 : fxLayer, fxEffect: fxIndex, onFxLayer, onFxEffect: setFxIndex })
    const learnKeyOf = (event) => event.target?.closest?.('[data-midi-target]')?.getAttribute('data-midi-target') || ''
    const onLearnClick = (event) => {
        if (!midi.learning) return
        const key = learnKeyOf(event)
        if (key && midi.pickTarget(key)) { event.preventDefault(); event.stopPropagation() }
    }
    // While Learn is on a click on a control SELECTS it; the control itself must not
    // move or open (a range would drag, a select would open). Pointer, mouse and key
    // starts are stopped in the capture phase; with Learn off none of this runs.
    const onLearnPress = (event) => {
        if (midi.learning && learnKeyOf(event)) event.preventDefault()
    }
    const onLearnKey = (event) => {
        if (!midi.learning || event.key === 'Tab' || event.key === 'Escape') return
        const key = learnKeyOf(event)
        if (!key) return
        event.preventDefault()
        if (event.key === 'Enter' || event.key === ' ') midi.pickTarget(key)
    }
    // Right-click (or Shift+F10 / the menu key) on any control with a MIDI target: map it,
    // remove its map, put its value back. Anything else keeps the browser's own menu.
    const [menu, setMenu] = useState(null) // { x, y, key, label, fromKeyboard }
    const targetOf = (event) => event.target?.closest?.('[data-midi-target]') || null
    const openMenu = (el, x, y, fromKeyboard) => {
        setMenu({ x, y, key: el.getAttribute('data-midi-target'), label: el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('data-midi-target'), fromKeyboard })
    }
    const onDeckContextMenu = (event) => {
        if (!editable) return
        const el = targetOf(event)
        if (!el) return
        event.preventDefault()
        openMenu(el, event.clientX, event.clientY, false)
    }
    const onDeckMenuKey = (event) => {
        if (!editable || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return
        const el = targetOf(event)
        if (!el) return
        event.preventDefault()
        const r = el.getBoundingClientRect()
        openMenu(el, r.left, r.bottom, true)
    }
    const onResetValue = (key) => { const next = resetDeckValue(latestDeck.current, key); if (next) write(next) }
    const onDeckKeyDown = (event) => { onDeckMenuKey(event); if (!event.defaultPrevented) onLearnKey(event) }
    const menuItems = (() => {
        if (!menu) return []
        const bound = midi.bindingOf(menu.key)
        const items = [{ heading: bound ? bound.text : 'Not mapped' }, { id: 'map', label: 'Map to MIDI', hint: 'Then move or press the control on the controller', run: () => midi.mapOnce(menu.key) }]
        if (bound?.learned) items.push({ id: 'unmap', label: 'Remove MIDI map', run: () => midi.unmap(menu.key) })
        else if (bound) items.push({ id: 'unmap', label: 'Remove MIDI map', kb: 'K2 default', disabled: true, hint: 'The K2 default map cannot be removed; map the control to override it' })
        if (resetDeckValue(deck, menu.key)) items.push({ id: 'reset', label: 'Reset value', run: () => onResetValue(menu.key) })
        return items
    })()
    const clipUrl = (clip) => (clip?.kind === 'asset' ? resolveClipUrl(clip.asset, spaceId, { assets, projectId }) : '')

    const onTile = (layerIndex, column) => {
        const clip = deck.layers[layerIndex].clips[column]
        if (!clip) {
            if (!editable) return
            setPicking({ layer: layerIndex, column })
            return
        }
        setSelected({ layer: layerIndex, column })
        setFxPick(null)
        if (previewOnly) return
        // A click on the tile that is already playing only selects it (to reach its clip and effects): it stopped
        // the layer before, so picking a clip to change an effect switched the picture off (owner, N3634).
        // The x beside the layer's name is the one way to stop a layer.
        if (deck.layers[layerIndex].active !== column) write(trigger(latestDeck.current, layerIndex, column))
    }

    // Take: the previewed clip goes live (the only way out in Preview only besides MIDI).
    const takeLive = () => {
        if (!selected || !selectedClip || !editable) return
        write(trigger(latestDeck.current, selected.layer, selected.column))
    }
    // Deselect: nothing selected, the Preview pane and the Clip panel go back to empty.
    const deselect = () => { setSelected(null); setFxPick(null) }
    // A click on the grid's own background (not on a tile or a control) deselects.
    const onGridBackground = (event) => {
        const list = event.target.classList
        if (list?.contains('vj-deck-scroll') || list?.contains('vj-deck-grid') || list?.contains('vj-deck-row')) deselect()
    }

    // Esc clears the selection; Enter takes in Preview only. Never from a field, never while a
    // menu is open or Learn is on, only when focus is on this deck or on nothing. The deck
    // stops the event it used, so the Perform window keys (Esc hides a window) do not also run:
    // windowKeyAction ignores a defaultPrevented key.
    const keyState = useRef({})
    useEffect(() => { keyState.current = { selected: Boolean(selectedClip), previewOnly, learning: midi.learning, deselect, takeLive } })
    useEffect(() => {
        const onKey = (event) => {
            const live = keyState.current
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
            if (event.key !== 'Escape' && event.key !== 'Enter') return
            if (live.learning || !live.selected || isTypingTarget(event.target)) return
            const target = event.target
            const mine = target === document.body || target === document.documentElement || rootRef.current?.contains(target)
            if (!mine || document.querySelector('[role="menu"], [aria-haspopup][aria-expanded="true"]')) return
            if (event.key === 'Escape') { live.deselect(); event.preventDefault(); return }
            if (!live.previewOnly) return
            // Enter on another button is that button's; on a tile or on Take it is ours.
            if (target?.closest?.('button, a, summary') && !target.closest('.vj-deck-tile, .vj-deck-take')) return
            live.takeLive()
            event.preventDefault()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    // `slot` is the slot that was picked when the clip was chosen (an upload can finish
    // long after); the deck it goes into is always the latest one.
    const place = (clip, slot = targetSlot) => {
        if (!slot) return
        const next = setClip(latestDeck.current, slot.layer, slot.column, { speed: 1, mode: '0', in: 0, out: 1, ...clip })
        write(next)
        setSelected({ layer: slot.layer, column: slot.column })
        setPicking(null)
    }

    const onFile = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !onUploadFile) return
        const slot = targetSlot
        setUploading(file.name)
        setNotice('')
        try {
            const asset = await onUploadFile(file)
            if (asset?.id && slot) place({ kind: 'asset', asset: asset.id, label: asset.name || file.name }, slot)
            else if (asset?.id) setNotice(`${file.name} is in the list: drag it onto a slot.`)
            else setNotice(`Could not bring in ${file.name}.`)
        } catch (failure) {
            // 2026-11-10 (owner row N3529): the server refuses a file over its limit
            // with 413; say that, with the file's size, instead of a bare "could not".
            setNotice(failure?.status === 413
                ? (Number.isFinite(failure.maxBytes)
                    ? `${file.name} is too large: this di takes ${Math.round(failure.maxBytes / (1024 * 1024))} MB.`
                    : `${file.name}: the server refused it for size.`)
                : `Could not bring in ${file.name}${failure?.message ? `: ${failure.message}` : ''}.`)
        } finally {
            setUploading('')
        }
    }

    // Drag and drop. A filled tile drags its slot (moveClip); a Sources row drags a clip to
    // make. Every slot, filled or empty, takes either. A plain click is untouched.
    const onTileDragStart = (event, layerIndex, column) => {
        event.dataTransfer.setData(DRAG_CLIP, JSON.stringify({ layer: layerIndex, column }))
        event.dataTransfer.effectAllowed = 'move'
    }
    const onTileDragOver = (event, layerIndex, column) => {
        if (!editable || !(dragHas(event, DRAG_CLIP) || dragHas(event, DRAG_SOURCE))) return
        event.preventDefault()
        event.dataTransfer.dropEffect = dragHas(event, DRAG_CLIP) ? 'move' : 'copy'
        setDropTarget((current) => (current?.layer === layerIndex && current?.column === column ? current : { layer: layerIndex, column }))
    }
    const onTileDrop = (event, layerIndex, column) => {
        setDropTarget(null)
        if (!editable) return
        const to = { layer: layerIndex, column }
        const from = dragRead(event, DRAG_CLIP)
        if (from) {
            event.preventDefault()
            write(moveClip(latestDeck.current, from, to))
            if (selected && selected.layer === from.layer && selected.column === from.column) setSelected(to)
            return
        }
        const source = dragRead(event, DRAG_SOURCE)
        if (source) {
            event.preventDefault()
            place({ speed: 1, mode: '0', in: 0, out: 1, ...source }, to)
        }
    }

    const mode = PLACEMENTS.has(placement) ? placement : 'window'
    // Top layer first on screen; index 0 is the bottom of the stack.
    const rows = deck.layers.map((layer, index) => ({ layer, index })).reverse()
    const columns = Array.from({ length: deck.columns }, (_, column) => column)
    const gridStyle = { '--vj-columns': deck.columns, '--vj-layers': deck.layers.length }

    const selectedName = selectedClip ? clipName(selectedClip) : ''
    const selectedPlaying = Boolean(selectedClip) && deck.layers[selected.layer].active === selected.column
    const selectedPictureId = !selectedClip
        ? ''
        : selectedClip.kind === 'input'
            ? inputSources?.[selectedClip.input] || ''
            : selectedClip.kind === 'camera'
                ? (selectedPlaying ? cameraNodeId(deckId, selectedClip.camera, selectedClip.device) : '')
                : selectedPlaying ? clipNodeId(deckId, selected.layer) : ''

    const takeButton = (
        <button
            type="button"
            className="vj-deck-button vj-deck-take"
            disabled={!editable || !selectedClip}
            onClick={takeLive}
            title="Send the previewed clip live (Enter)"
        >Take</button>
    )

    return (
        <div ref={rootRef} className={`vj-deck vj-deck--${mode}`} data-placement={mode} data-monitor-size={monitors.size} data-layout={deckLayout.custom ? 'custom' : 'default'} data-preview-only={previewOnly ? 'true' : 'false'} data-bpm={shownBpm} data-leader={clock?.leader || 'deck'} onClickCapture={onLearnClick} onPointerDownCapture={onLearnPress} onMouseDownCapture={onLearnPress} onKeyDownCapture={onDeckKeyDown} onContextMenuCapture={onDeckContextMenu}>
            <header className="vj-deck-top">
                <div className="vj-deck-tempo">
                    <span className="vj-deck-label">BPM</span>
                    <output className="vj-deck-bpm" aria-label="Tempo">{shownBpm.toFixed(1)}</output>
                    <button type="button" className="vj-deck-button" data-midi-target="tap" onClick={onTap} disabled={!editable && !followsLight}>Tap</button>
                    <button
                        type="button"
                        className="vj-deck-button vj-deck-button--quiet"
                        onClick={onResetTempo}
                        disabled={!editable && !followsLight}
                        aria-label={`Reset the tempo to ${DEFAULT_BPM}`}
                        title={`Back to ${DEFAULT_BPM} bpm, the beat on this instant`}
                    >Reset</button>
                    {followsLight ? <span className="vj-deck-dim vj-deck-leader" title="The Light desk on this machine keeps the show’s tempo; the deck follows it.">follows Light</span> : null}
                </div>
                <DeckMidiControl midi={midi} editable={editable} />
                <button
                    type="button"
                    className={`vj-deck-button${k2Open ? ' is-on' : ''}`}
                    aria-pressed={k2Open}
                    onClick={() => setK2Open((on) => !on)}
                    title="Show the Xone:K2 layout with what each control does and what it sends"
                >K2</button>
                <button
                    type="button"
                    className="vj-deck-button vj-deck-preview-only"
                    aria-pressed={previewOnly}
                    title="ON: a click only selects and shows in Preview; TAKE or Enter sends it live. MIDI always goes live."
                    onClick={() => setPreviewOnly((value) => !value)}
                >Preview only <span className="vj-deck-state" aria-hidden="true">{previewOnly ? 'on' : 'off'}</span></button>
                <div className="vj-deck-crossfader">
                    <span className="vj-deck-label">A</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={deck.crossfade}
                        disabled={!editable}
                        aria-label="Crossfader"
                        data-midi-target="crossfade"
                        title="Crossfader: A on the left, B on the right"
                        onChange={(event) => write(setCrossfade(latestDeck.current, event.target.value))}
                    />
                    <span className="vj-deck-label">B</span>
                </div>
                <label className="vj-deck-master">
                    <span className="vj-deck-label">Master</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={deck.master}
                        disabled={!editable}
                        aria-label="Master"
                        data-midi-target="master"
                        onChange={(event) => write(setMaster(latestDeck.current, event.target.value))}
                    />
                    <span className="vj-deck-number">{percent(deck.master)}</span>
                </label>
                <div className="vj-deck-actions">
                    <button type="button" className="vj-deck-button" onClick={() => write(addLayer(latestDeck.current))} disabled={!editable}>+ Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(removeLayer(latestDeck.current, latestDeck.current.layers.length - 1))} disabled={!editable || deck.layers.length <= 1} aria-label="Remove the top layer">- Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(addColumn(latestDeck.current))} disabled={!editable}>+ Column</button>
                </div>
            </header>

            <div className="vj-deck-main" style={{ '--vj-layers': deck.layers.length }}>
                {/* Pointer shortcut only: the keyboard way to deselect is Esc (handled on document). */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className="vj-deck-scroll" id={paneId('grid')} ref={scrollRef} onClick={onGridBackground}>
                    <div className="vj-deck-grid" style={gridStyle}>
                        <div className="vj-deck-row vj-deck-columns" role="group" aria-label="Columns">
                            <span className="vj-deck-label vj-deck-columns-head">Columns</span>
                            {columns.map((column) => (
                                <button
                                    key={column}
                                    type="button"
                                    className="vj-deck-button vj-deck-column"
                                    onClick={() => write(triggerColumn(latestDeck.current, column))}
                                    disabled={!editable}
                                    aria-label={`Play column ${column + 1}`}
                                    data-midi-target={`column:${column}`}
                                >
                                    {column + 1}
                                </button>
                            ))}
                        </div>
                        {rows.map(({ layer, index }) => (
                            <div
                                className="vj-deck-row"
                                role="group"
                                aria-label={layer.name}
                                key={layer.id}
                                data-active={layer.active >= 0 ? 'true' : 'false'}
                                data-bypass={layer.bypass ? 'true' : 'false'}
                                data-solo={layer.solo ? 'true' : 'false'}
                            >
                                <div className="vj-deck-layer">
                                    {/* The blend keeps a line without Clear: beside it the
                                        select had ~70px and read "Diff" and "Scre" (the
                                        owner's screen, 2026-09-24). */}
                                    <div className="vj-deck-layer-line">
                                        <button
                                            type="button"
                                            className="vj-deck-button vj-deck-toggle vj-deck-bypass"
                                            aria-pressed={layer.bypass}
                                            aria-label={`Bypass ${layer.name}`}
                                            data-midi-target={`bypass:${index}`}
                                            title="Bypass layer"
                                            disabled={!editable}
                                            onClick={() => write(setBypass(latestDeck.current, layer.id, !layer.bypass))}
                                        >B</button>
                                        <button
                                            type="button"
                                            className="vj-deck-button vj-deck-toggle vj-deck-solo"
                                            aria-pressed={layer.solo}
                                            aria-label={`Solo ${layer.name}`}
                                            data-midi-target={`solo:${index}`}
                                            title="Solo layer"
                                            disabled={!editable}
                                            onClick={() => write(setSolo(latestDeck.current, layer.id, !layer.solo))}
                                        >S</button>
                                        <span className="vj-deck-layer-name" title={layer.name}>{layer.name}</span>
                                        <button
                                            type="button"
                                            className="vj-deck-button vj-deck-layer-clear"
                                            onClick={() => write(clearLayer(latestDeck.current, index))}
                                            disabled={!editable || layer.active < 0}
                                            aria-label={`Clear ${layer.name}`}
                                            title="Clear layer"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <div className="vj-deck-layer-line">
                                        <select
                                            className="vj-deck-chip vj-deck-side"
                                            value={layer.side}
                                            disabled={!editable}
                                            aria-label={`Crossfader side for ${layer.name}`}
                                            data-midi-target={`side:${index}`}
                                            title="Crossfader side"
                                            onChange={(event) => write(setSide(latestDeck.current, layer.id, event.target.value))}
                                        >
                                            <option value="">A/B –</option>
                                            <option value="a">A</option>
                                            <option value="b">B</option>
                                        </select>
                                        <select
                                            className="vj-deck-chip vj-deck-blend"
                                            value={layer.blend}
                                            disabled={!editable}
                                            aria-label={`${layer.name} blend`}
                                            data-midi-target={`blend:${index}`}
                                            title={BLEND_MODES[Number(layer.blend)] || ''}
                                            onChange={(event) => write(setBlend(latestDeck.current, index, event.target.value))}
                                        >
                                            {BLEND_MODES.map((label, value) => <option key={label} value={String(value)}>{label}</option>)}
                                        </select>
                                    </div>
                                    <div className="vj-deck-layer-line">
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={layer.opacity}
                                            disabled={!editable}
                                            aria-label={`${layer.name} opacity`}
                                            data-midi-target={`opacity:${index}`}
                                            onChange={(event) => write(setOpacity(latestDeck.current, index, event.target.value))}
                                        />
                                        <span className="vj-deck-number">{percent(layer.opacity)}</span>
                                    </div>
                                </div>
                                {columns.map((column) => {
                                    const clip = layer.clips[column]
                                    const playing = layer.active === column && Boolean(clip)
                                    const isSelected = selected?.layer === index && selected?.column === column
                                    const name = clip ? clipName(clip) : ''
                                    return (
                                        <button
                                            key={column}
                                            type="button"
                                            className={`vj-deck-tile${clip ? '' : ' vj-deck-tile--empty'}${playing ? ' is-playing' : ''}${isSelected ? ' is-selected' : ''}${dropTarget?.layer === index && dropTarget?.column === column ? ' is-drop-target' : ''}`}
                                            aria-pressed={clip ? playing : undefined}
                                            title={clip ? name : undefined}
                                            data-midi-target={`clip:${index}:${column}`}
                                            aria-label={clip ? `${layer.name}, slot ${column + 1}: ${name}` : `${layer.name}, slot ${column + 1}: add a clip`}
                                            disabled={!clip && !editable}
                                            draggable={Boolean(clip) && editable}
                                            onDragStart={clip ? (event) => onTileDragStart(event, index, column) : undefined}
                                            onDragOver={(event) => onTileDragOver(event, index, column)}
                                            onDragLeave={() => setDropTarget((current) => (current?.layer === index && current?.column === column ? null : current))}
                                            onDragEnd={() => setDropTarget(null)}
                                            onDrop={(event) => onTileDrop(event, index, column)}
                                            onClick={() => onTile(index, column)}
                                        >
                                            {clip && clip.kind === 'asset'
                                                ? <ClipStill url={clipUrl(clip)} inPoint={clip.in} outPoint={clip.out} label={name} />
                                                : null}
                                            {playing && clip.kind === 'asset'
                                                ? <DeckPicture nodeId={clipNodeId(deckId, index)} className="vj-deck-tile-picture" label={name} />
                                                : null}
                                            {playing && clip.kind === 'camera'
                                                ? <DeckPicture nodeId={cameraNodeId(deckId, clip.camera, clip.device)} className="vj-deck-tile-picture" label={name} />
                                                : null}
                                            {playing && clip.kind === 'camera'
                                                ? <CameraFailure nodeId={cameraNodeId(deckId, clip.camera, clip.device)} camera={clip.camera} className="vj-deck-tile-fail" />
                                                : null}
                                            {clip?.kind === 'input' && inputSources?.[clip.input]
                                                ? <DeckPicture nodeId={inputSources[clip.input]} className="vj-deck-tile-picture" label={name} />
                                                : null}
                                            <span className="vj-deck-tile-name">{clip ? name : '+'}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <aside className="vj-deck-monitors" id={paneId('monitors')} aria-label="Monitors">
                    <div className="vj-deck-monitor-tools">
                        <div className="vj-deck-sizes" role="toolbar" aria-label="Monitor size">
                            {MONITOR_SIZES.map((size) => (
                                <button
                                    key={size}
                                    type="button"
                                    className="vj-deck-button vj-deck-size"
                                    aria-pressed={monitors.size === size && deckLayout.layout.monitorW == null}
                                    aria-label={`Monitor size ${size.toUpperCase()}`}
                                    onClick={() => { setMonitorPrefs({ size }); deckLayout.clearMonitorW() }}
                                >{size.toUpperCase()}</button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="vj-deck-button vj-deck-preview-toggle"
                            aria-pressed={!monitors.hidden}
                            aria-label={monitors.hidden ? 'Show Preview' : 'Hide Preview'}
                            onClick={() => setMonitorPrefs({ hidden: !monitors.hidden })}
                        >{monitors.hidden ? 'Show preview' : 'Hide preview'}</button>
                        {previewOnly && monitors.hidden ? takeButton : null}
                        {deckLayout.custom ? (
                            <button type="button" className="vj-deck-button vj-deck-layout-reset" onClick={deckLayout.resetAll} title="Put every panel back to its usual size">Reset layout</button>
                        ) : null}
                    </div>
                    {monitors.hidden ? null : (
                    <figure className="vj-deck-monitor vj-deck-monitor--preview">
                        <figcaption className="vj-deck-label vj-deck-monitor-caption"><span>Preview</span>{previewOnly ? takeButton : null}</figcaption>
                        <div className="vj-deck-monitor-screen">
                            {selectedClip && !selectedPlaying && !(selectedClip.kind === 'asset')
                                ? <span className="vj-deck-dim vj-deck-monitor-empty vj-deck-monitor-idle">{selectedName}<br />not playing</span>
                                : null}
                            {selectedClip && selectedClip.kind === 'camera' && !selectedPlaying
                                ? <CameraPreview camera={selectedClip.camera} device={selectedClip.device} className="vj-deck-monitor-picture" />
                                : null}
                            {selectedClip && selectedClip.kind === 'asset' && !selectedPlaying
                                ? <ClipStill url={clipUrl(selectedClip)} inPoint={selectedClip.in} outPoint={selectedClip.out} label={selectedName} className="vj-deck-monitor-picture" />
                                : null}
                            {selectedPictureId
                                ? <DeckPicture nodeId={selectedPictureId} className="vj-deck-monitor-picture" label={`Preview of ${selectedName}`} width={320} height={180} />
                                : null}
                            {selectedClip && selectedClip.kind === 'camera' && selectedPlaying
                                ? <CameraFailure nodeId={selectedPictureId} camera={selectedClip.camera} className="vj-deck-monitor-empty vj-deck-monitor-fail" />
                                : null}
                            {!selectedClip ? <span className="vj-deck-dim vj-deck-monitor-empty">Select a clip</span> : null}
                        </div>
                    </figure>
                    )}
                    <figure className="vj-deck-monitor vj-deck-monitor--output">
                        <figcaption className="vj-deck-label vj-deck-monitor-caption">Output</figcaption>
                        <div className="vj-deck-monitor-screen">
                            <DeckPicture nodeId={masterNodeId(deckId)} className="vj-deck-monitor-picture" label="Deck output" width={320} height={180} />
                        </div>
                    </figure>
                </aside>
                {seam('s1', deckLayout.shown.s1s2, 'vertical', 'Resize the layer strip and the clip grid', paneId('grid'))}
                {seam('s2', deckLayout.shown.s1s2, 'vertical', 'Resize the clip grid and the monitors', paneId('monitors'), -1)}
                {seam('s4', deckLayout.shown.s4, 'horizontal', 'Resize the clip grid and the panels below', paneId('bottom'))}
            </div>

            <div className="vj-deck-bottom" id={paneId('bottom')}>
                <SourcesPanel
                    mode={mode}
                    editable={editable}
                    target={targetSlot}
                    targetName={targetSlot ? `${deck.layers[targetSlot.layer]?.name}, slot ${targetSlot.column + 1}` : ''}
                    picking={Boolean(picking)}
                    onCancel={() => setPicking(null)}
                    onPlace={(clip) => place(clip)}
                    videoAssets={videoAssets}
                    onUploadFile={onUploadFile}
                    uploading={uploading}
                    onFile={onFile}
                    notice={notice}
                    liveCameras={liveCameras}
                />
                {selectedClip ? (
                    <ClipSettings
                        key={`${selected.layer}:${selected.column}`}
                        clip={selectedClip}
                        title={`${deck.layers[selected.layer].name}, slot ${selected.column + 1}`}
                        name={selectedName}
                        editable={editable}
                        onChange={(patch) => write(updateClip(latestDeck.current, selected.layer, selected.column, patch))}
                        onRemove={() => write(setClip(latestDeck.current, selected.layer, selected.column, null))}
                    />
                ) : (
                    <section className="vj-deck-panel vj-deck-clip" aria-label="Clip">
                        <div className="vj-deck-panel-head"><span className="vj-deck-label">Clip</span></div>
                        <p className="vj-deck-hint">Select a clip</p>
                    </section>
                )}
                <EffectsPanel deck={deck} scope={fxScope} layerIndex={fxLayer} onScope={setFxScope} onLayer={setFxPick} editable={editable} write={write} fxIndex={fxIndex} />
                {seam('s5', deckLayout.shown.s56, 'vertical', 'Resize Sources and Clip', paneId('bottom'))}
                {seam('s6', deckLayout.shown.s56, 'vertical', 'Resize Clip and Effects', paneId('bottom'))}
            </div>
            <MidiMapOverlay rootRef={rootRef} midi={midi} layoutKey={deck} />
            {k2Open ? <K2LayoutPanel map={midi.map} monitor={midi.k2Monitor} console={midi.k2Console} consoles={midi.consoles} onPickConsole={editable ? midi.pickConsole : undefined} fxEffect={fxIndex} onClose={() => setK2Open(false)} /> : null}
            <ContextMenu open={Boolean(menu)} x={menu?.x} y={menu?.y} title={menu?.label} items={menuItems} fromKeyboard={Boolean(menu?.fromKeyboard)} onClose={() => setMenu(null)} />
        </div>
    )
}

function ClipSettings({ clip, title, name, editable, onChange, onRemove }) {
    const isInput = clip.kind === 'input'
    const isCamera = clip.kind === 'camera'
    return (
        <section className="vj-deck-panel vj-deck-clip" aria-label="Clip settings">
            <div className="vj-deck-panel-head">
                <span className="vj-deck-label">{title}</span>
                <span className="vj-deck-clip-name">{name}</span>
            </div>
            <div className="vj-deck-list vj-deck-settings">
                <div className="vj-deck-list-row">
                    <span className="vj-deck-label">Source</span>
                    <span className="vj-deck-list-value vj-deck-clip-camera" title={isInput ? `This slot plays whatever is wired into ${inputLabel(clip.input)}.` : undefined}>
                        {isInput ? `Wired: ${inputLabel(clip.input)}` : isCamera ? `Camera: ${clip.camera}` : `Video: ${name}`}
                    </span>
                </div>
                {!isInput && !isCamera ? (
                    <>
                        <label className="vj-deck-list-row vj-deck-setting">
                            <span className="vj-deck-label">Speed</span>
                            <input type="range" min="0" max="4" step="0.05" value={clip.speed} disabled={!editable} aria-label="Speed" onChange={(event) => onChange({ speed: Number(event.target.value) })} />
                            <span className="vj-deck-number">{clip.speed.toFixed(2)}x</span>
                        </label>
                        <label className="vj-deck-list-row vj-deck-setting">
                            <span className="vj-deck-label">In</span>
                            <input type="range" min="0" max="1" step="0.01" value={clip.in} disabled={!editable} aria-label="In point" onChange={(event) => onChange({ in: Number(event.target.value) })} />
                            <span className="vj-deck-number">{percent(clip.in)}%</span>
                        </label>
                        <label className="vj-deck-list-row vj-deck-setting">
                            <span className="vj-deck-label">Out</span>
                            <input type="range" min="0" max="1" step="0.01" value={clip.out} disabled={!editable} aria-label="Out point" onChange={(event) => onChange({ out: Number(event.target.value) })} />
                            <span className="vj-deck-number">{percent(clip.out)}%</span>
                        </label>
                        <div className="vj-deck-list-row vj-deck-setting" role="radiogroup" aria-label="Play mode">
                            <span className="vj-deck-label">Mode</span>
                            <div className="vj-deck-modes">
                                {CLIP_MODES.map((label, value) => (
                                    <button
                                        key={label}
                                        type="button"
                                        role="radio"
                                        aria-checked={clip.mode === String(value)}
                                        className={`vj-deck-button${clip.mode === String(value) ? ' is-on' : ''}`}
                                        disabled={!editable}
                                        onClick={() => onChange({ mode: String(value) })}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
            <div className="vj-deck-panel-foot">
                <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={onRemove} disabled={!editable}>Remove clip</button>
            </div>
        </section>
    )
}
