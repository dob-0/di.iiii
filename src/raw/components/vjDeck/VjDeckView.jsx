import { useEffect, useMemo, useRef, useState } from 'react'
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
import { useShowClockContext } from '../../../perform/useShowClock.js'
import { DEFAULT_BPM } from '../../../timeline/showClock.js'
import { clipStill } from './clipStills.js'
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
// Laid out like Resolume's (docs/ai/sessions/feat-vj-resolume-layout.md): a top
// bar, the clip grid beside two monitors (PREVIEW, OUTPUT), and SOURCES and CLIP
// panels underneath. A tap only plays; the selected clip's settings are always
// in the CLIP panel, so nothing covers the grid and nothing needs a Close.

const PLACEMENTS = new Set(['window', 'inside', 'perform'])

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

const inputLabel = (input) => `In ${DECK_INPUTS.indexOf(input) + 1}`
const mediaDevicesOf = () => (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function' ? navigator.mediaDevices : null)

// The cameras this page can see, by label. Labels are empty until the person
// has allowed a camera once; then `needsPermission` offers the one button.
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
        } catch {
            setState((current) => ({ ...current, error: 'The camera was not allowed.' }))
            return
        }
        await read()
    }
    return { ...state, allow }
}

function CameraPicker({ onPick }) {
    const { supported, cameras, needsPermission, error, allow } = useCameras()
    return (
        <div className="vj-deck-pick vj-deck-cameras" role="group" aria-label="Cameras">
            <span className="vj-deck-label">Cameras</span>
            <div className="vj-deck-pick-list">
                {cameras.map((camera) => (
                    <button key={`${camera.id}:${camera.label}`} type="button" className="vj-deck-button vj-deck-camera" aria-label={`Camera ${camera.label}`} onClick={() => onPick(camera)}>
                        {camera.label}
                    </button>
                ))}
                {needsPermission ? <button type="button" className="vj-deck-button vj-deck-allow-cameras" onClick={allow}>Allow cameras</button> : null}
                {!supported ? <span className="vj-deck-dim vj-deck-camera-none">No camera on this machine</span> : null}
                {supported && !cameras.length && !needsPermission && !error ? <span className="vj-deck-dim vj-deck-camera-none">No camera on this machine</span> : null}
                {error ? <span className="vj-deck-dim" role="status">{error}</span> : null}
            </div>
        </div>
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
    const [uploading, setUploading] = useState('')
    const [notice, setNotice] = useState('')
    const tapsRef = useRef([])

    // The same list and value a Video node's picker uses: the PROJECT's files
    // (document.assets), video only, stored as the asset id; an upload goes
    // through uploadProjectAsset like the inspector's. top.clip resolves it.
    const videoAssets = useMemo(
        () => (assets || []).filter((asset) => asset?.id && detectAssetMediaKind(asset) === 'video'),
        [assets]
    )
    const clipName = (clip) => (clip.label || (clip.kind === 'input' ? inputLabel(clip.input) : clip.kind === 'camera' ? clip.camera : assetName(clip.asset)))
    const assetName = (id) => (assets || []).find((asset) => asset?.id === id)?.name || id

    const write = (nextDeck) => {
        if (editable) onPatchValues({ deck: nextDeck })
    }

    // A selection whose slot was emptied (here or by another window) lets go.
    const selectedClip = selected ? deck.layers[selected.layer]?.clips[selected.column] || null : null
    useEffect(() => {
        if (selected && !selectedClip) setSelected(null)
    }, [selected, selectedClip])

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
        if (state.bpm !== null) write(setBpm(deck, state.bpm, state.epoch))
    }
    const onResetTempo = () => {
        if (clock) {
            clock.reset()
            return
        }
        tapsRef.current = []
        write(setBpm(deck, DEFAULT_BPM, now()))
    }
    const clipUrl = (clip) => (clip?.kind === 'asset' ? resolveClipUrl(clip.asset, spaceId, { assets, projectId }) : '')

    const onTile = (layerIndex, column) => {
        const clip = deck.layers[layerIndex].clips[column]
        if (!clip) {
            if (!editable) return
            setPicking({ layer: layerIndex, column })
            return
        }
        setSelected({ layer: layerIndex, column })
        write(trigger(deck, layerIndex, column))
    }

    const place = (clip) => {
        if (!picking) return
        const next = setClip(deck, picking.layer, picking.column, { speed: 1, mode: '0', in: 0, out: 1, ...clip })
        write(next)
        setSelected({ layer: picking.layer, column: picking.column })
        setPicking(null)
    }

    const onFile = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !onUploadFile) return
        setUploading(file.name)
        setNotice('')
        try {
            const asset = await onUploadFile(file)
            if (asset?.id) place({ kind: 'asset', asset: asset.id, label: asset.name || file.name })
            else setNotice(`Could not bring in ${file.name}.`)
        } catch {
            setNotice(`Could not bring in ${file.name}.`)
        } finally {
            setUploading('')
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
                ? (selectedPlaying ? cameraNodeId(deckId, selectedClip.camera) : '')
                : selectedPlaying ? clipNodeId(deckId, selected.layer) : ''

    return (
        <div className={`vj-deck vj-deck--${mode}`} data-placement={mode} data-bpm={shownBpm} data-leader={clock?.leader || 'deck'}>
            <header className="vj-deck-top">
                <div className="vj-deck-tempo">
                    <span className="vj-deck-label">BPM</span>
                    <output className="vj-deck-bpm" aria-label="Tempo">{shownBpm.toFixed(1)}</output>
                    <button type="button" className="vj-deck-button" onClick={onTap} disabled={!editable && !followsLight}>Tap</button>
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
                        title="Crossfader: A on the left, B on the right"
                        onChange={(event) => write(setCrossfade(deck, event.target.value))}
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
                        onChange={(event) => write(setMaster(deck, event.target.value))}
                    />
                    <span className="vj-deck-number">{percent(deck.master)}</span>
                </label>
                <div className="vj-deck-actions">
                    <button type="button" className="vj-deck-button" onClick={() => write(addLayer(deck))} disabled={!editable}>+ Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(removeLayer(deck, deck.layers.length - 1))} disabled={!editable || deck.layers.length <= 1} aria-label="Remove the top layer">- Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(addColumn(deck))} disabled={!editable}>+ Column</button>
                </div>
            </header>

            <div className="vj-deck-main">
                <div className="vj-deck-scroll">
                    <div className="vj-deck-grid" style={gridStyle}>
                        <div className="vj-deck-row vj-deck-columns" role="group" aria-label="Columns">
                            <span className="vj-deck-label vj-deck-columns-head">Columns</span>
                            {columns.map((column) => (
                                <button
                                    key={column}
                                    type="button"
                                    className="vj-deck-button vj-deck-column"
                                    onClick={() => write(triggerColumn(deck, column))}
                                    disabled={!editable}
                                    aria-label={`Play column ${column + 1}`}
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
                                            title="Bypass layer"
                                            disabled={!editable}
                                            onClick={() => write(setBypass(deck, layer.id, !layer.bypass))}
                                        >B</button>
                                        <button
                                            type="button"
                                            className="vj-deck-button vj-deck-toggle vj-deck-solo"
                                            aria-pressed={layer.solo}
                                            aria-label={`Solo ${layer.name}`}
                                            title="Solo layer"
                                            disabled={!editable}
                                            onClick={() => write(setSolo(deck, layer.id, !layer.solo))}
                                        >S</button>
                                        <span className="vj-deck-layer-name" title={layer.name}>{layer.name}</span>
                                        <button
                                            type="button"
                                            className="vj-deck-button vj-deck-layer-clear"
                                            onClick={() => write(clearLayer(deck, index))}
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
                                            title="Crossfader side"
                                            onChange={(event) => write(setSide(deck, layer.id, event.target.value))}
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
                                            title={BLEND_MODES[Number(layer.blend)] || ''}
                                            onChange={(event) => write(setBlend(deck, index, event.target.value))}
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
                                            onChange={(event) => write(setOpacity(deck, index, event.target.value))}
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
                                            className={`vj-deck-tile${clip ? '' : ' vj-deck-tile--empty'}${playing ? ' is-playing' : ''}${isSelected ? ' is-selected' : ''}`}
                                            aria-pressed={clip ? playing : undefined}
                                            aria-label={clip ? `${layer.name}, slot ${column + 1}: ${name}` : `${layer.name}, slot ${column + 1}: add a clip`}
                                            disabled={!clip && !editable}
                                            onClick={() => onTile(index, column)}
                                        >
                                            {clip && clip.kind === 'asset'
                                                ? <ClipStill url={clipUrl(clip)} inPoint={clip.in} outPoint={clip.out} label={name} />
                                                : null}
                                            {playing && clip.kind === 'asset'
                                                ? <DeckPicture nodeId={clipNodeId(deckId, index)} className="vj-deck-tile-picture" label={name} />
                                                : null}
                                            {playing && clip.kind === 'camera'
                                                ? <DeckPicture nodeId={cameraNodeId(deckId, clip.camera)} className="vj-deck-tile-picture" label={name} />
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

                <aside className="vj-deck-monitors" aria-label="Monitors">
                    <figure className="vj-deck-monitor vj-deck-monitor--preview">
                        <figcaption className="vj-deck-label vj-deck-monitor-caption">Preview</figcaption>
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
                            {!selectedClip ? <span className="vj-deck-dim vj-deck-monitor-empty">Select a clip</span> : null}
                        </div>
                    </figure>
                    <figure className="vj-deck-monitor vj-deck-monitor--output">
                        <figcaption className="vj-deck-label vj-deck-monitor-caption">Output</figcaption>
                        <div className="vj-deck-monitor-screen">
                            <DeckPicture nodeId={masterNodeId(deckId)} className="vj-deck-monitor-picture" label="Deck output" width={320} height={180} />
                        </div>
                    </figure>
                </aside>
            </div>

            <div className="vj-deck-bottom">
                {picking ? (
                    <section className="vj-deck-panel vj-deck-sources" aria-label="Add a clip">
                        <div className="vj-deck-panel-head">
                            <span className="vj-deck-label">
                                Sources: add to {deck.layers[picking.layer]?.name}, slot {picking.column + 1}
                            </span>
                            <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={() => setPicking(null)}>Cancel</button>
                        </div>
                        <div className="vj-deck-pick">
                            <span className="vj-deck-label">Wired in</span>
                            <div className="vj-deck-pick-list">
                                {DECK_INPUTS.map((input) => (
                                    <button key={input} type="button" className="vj-deck-button" onClick={() => place({ kind: 'input', input, label: inputLabel(input) })}>
                                        {inputLabel(input)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <CameraPicker onPick={(camera) => place({ kind: 'camera', camera: camera.label, device: camera.id, label: camera.label })} />
                        <div className="vj-deck-pick">
                            <span className="vj-deck-label">Footage</span>
                            <div className="vj-deck-pick-list">
                                {videoAssets.map((asset) => (
                                    <button key={asset.id} type="button" className="vj-deck-button vj-deck-asset" onClick={() => place({ kind: 'asset', asset: asset.id, label: asset.name || '' })}>
                                        {asset.name || asset.id}
                                    </button>
                                ))}
                                {!videoAssets.length ? <span className="vj-deck-dim" title="No video in this project yet.">{mode === 'perform' ? 'No video' : 'No video in this project yet.'}</span> : null}
                                {onUploadFile ? (
                                    <label className="vj-deck-button vj-deck-upload">
                                        {uploading ? `Bringing in ${uploading}` : 'Upload video'}
                                        <input type="file" accept="video/*" onChange={onFile} disabled={Boolean(uploading)} />
                                    </label>
                                ) : null}
                                {notice ? <span className="vj-deck-dim" role="status">{notice}</span> : null}
                            </div>
                        </div>
                    </section>
                ) : (
                    <section className="vj-deck-panel vj-deck-sources" aria-label="Sources">
                        <div className="vj-deck-panel-head"><span className="vj-deck-label">Sources</span></div>
                        <p className="vj-deck-hint" title="Tap an empty slot to choose a clip for it: a wired input, a camera or footage. Tap a clip to play it on its layer.">
                            {mode === 'perform' ? 'Tap a slot' : 'Tap an empty slot to choose a clip for it: a wired input, a camera or footage. Tap a clip to play it on its layer.'}
                        </p>
                    </section>
                )}
                {selectedClip ? (
                    <ClipSettings
                        compact={mode === 'perform'}
                        key={`${selected.layer}:${selected.column}`}
                        clip={selectedClip}
                        title={`${deck.layers[selected.layer].name}, slot ${selected.column + 1}`}
                        name={selectedName}
                        editable={editable}
                        onChange={(patch) => write(updateClip(deck, selected.layer, selected.column, patch))}
                        onRemove={() => write(setClip(deck, selected.layer, selected.column, null))}
                    />
                ) : (
                    <section className="vj-deck-panel vj-deck-clip" aria-label="Clip">
                        <div className="vj-deck-panel-head"><span className="vj-deck-label">Clip</span></div>
                        <p className="vj-deck-hint">Select a clip</p>
                    </section>
                )}
            </div>
        </div>
    )
}

function ClipSettings({ clip, title, name, editable, onChange, onRemove, compact = false }) {
    const isInput = clip.kind === 'input'
    const isCamera = clip.kind === 'camera'
    return (
        <section className="vj-deck-panel vj-deck-clip" aria-label="Clip settings">
            <div className="vj-deck-panel-head">
                <span className="vj-deck-label">{title}</span>
                <span className="vj-deck-clip-name">{name}</span>
            </div>
            {isInput ? (
                <p className="vj-deck-dim" title={`This slot plays whatever is wired into ${inputLabel(clip.input)}.`}>{compact ? `Wired: ${inputLabel(clip.input)}` : `This slot plays whatever is wired into ${inputLabel(clip.input)}.`}</p>
            ) : isCamera ? (
                <p className="vj-deck-dim vj-deck-clip-camera">Camera: {clip.camera}</p>
            ) : (
                <div className="vj-deck-settings">
                    <label className="vj-deck-setting">
                        <span className="vj-deck-label">Speed</span>
                        <input type="range" min="0" max="4" step="0.05" value={clip.speed} disabled={!editable} aria-label="Speed" onChange={(event) => onChange({ speed: Number(event.target.value) })} />
                        <span className="vj-deck-number">{clip.speed.toFixed(2)}x</span>
                    </label>
                    <label className="vj-deck-setting">
                        <span className="vj-deck-label">In</span>
                        <input type="range" min="0" max="1" step="0.01" value={clip.in} disabled={!editable} aria-label="In point" onChange={(event) => onChange({ in: Number(event.target.value) })} />
                        <span className="vj-deck-number">{percent(clip.in)}%</span>
                    </label>
                    <label className="vj-deck-setting">
                        <span className="vj-deck-label">Out</span>
                        <input type="range" min="0" max="1" step="0.01" value={clip.out} disabled={!editable} aria-label="Out point" onChange={(event) => onChange({ out: Number(event.target.value) })} />
                        <span className="vj-deck-number">{percent(clip.out)}%</span>
                    </label>
                    <div className="vj-deck-setting" role="radiogroup" aria-label="Play mode">
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
                </div>
            )}
            <div className="vj-deck-panel-foot">
                <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={onRemove} disabled={!editable}>Remove clip</button>
            </div>
        </section>
    )
}
