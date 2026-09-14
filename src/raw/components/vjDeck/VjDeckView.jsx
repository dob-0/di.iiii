import { useEffect, useMemo, useRef, useState } from 'react'
import { registerTopThumbnail } from '../../../project/tops/topThumbnails.js'
import {
    BLEND_MODES,
    CLIP_MODES,
    DECK_INPUTS,
    addColumn,
    addLayer,
    clearLayer,
    clipNodeId,
    masterNodeId,
    normalizeDeck,
    removeLayer,
    setBlend,
    setBpm,
    setClip,
    setMaster,
    setOpacity,
    tapTempo,
    trigger,
    triggerColumn,
    updateClip
} from '../../../project/tops/vjDeck.js'
import { detectAssetMediaKind } from '../../../utils/mediaAssetTypes.js'
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
// network runner is live fills them; until then the tile shows its name.

const PLACEMENTS = new Set(['window', 'inside', 'perform'])

function DeckPicture({ nodeId, className, label }) {
    const canvasRef = useRef(null)
    useEffect(() => {
        const context = canvasRef.current?.getContext?.('2d')
        return registerTopThumbnail(nodeId, context)
    }, [nodeId])
    return <canvas ref={canvasRef} className={className} width={160} height={90} aria-label={label} role="img" />
}

const inputLabel = (input) => `In ${DECK_INPUTS.indexOf(input) + 1}`
const percent = (value) => `${Math.round(value * 100)}`

export default function VjDeckView({ node, onPatchValues = null, assets = [], placement = 'window', onUploadFile = null, now = () => Date.now() }) {
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
    const assetName = (id) => (assets || []).find((asset) => asset?.id === id)?.name || id

    const write = (nextDeck) => {
        if (editable) onPatchValues({ deck: nextDeck })
    }

    // A selection whose slot was emptied (here or by another window) lets go.
    const selectedClip = selected ? deck.layers[selected.layer]?.clips[selected.column] || null : null
    useEffect(() => {
        if (selected && !selectedClip) setSelected(null)
    }, [selected, selectedClip])

    const onTap = () => {
        const state = tapTempo(tapsRef.current, now())
        tapsRef.current = state.taps
        if (state.bpm !== null) write(setBpm(deck, state.bpm))
    }

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
    const gridStyle = { '--vj-columns': deck.columns }

    return (
        <div className={`vj-deck vj-deck--${mode}`} data-placement={mode}>
            <header className="vj-deck-top">
                <div className="vj-deck-tempo">
                    <span className="vj-deck-label">BPM</span>
                    <output className="vj-deck-bpm" aria-label="Tempo">{deck.bpm.toFixed(1)}</output>
                    <button type="button" className="vj-deck-button" onClick={onTap} disabled={!editable}>Tap</button>
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
                <div className="vj-deck-out">
                    <span className="vj-deck-label">Out</span>
                    <DeckPicture nodeId={masterNodeId(deckId)} className="vj-deck-out-picture" label="Deck output" />
                </div>
                <div className="vj-deck-actions">
                    <button type="button" className="vj-deck-button" onClick={() => write(addLayer(deck))} disabled={!editable}>+ Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(removeLayer(deck, deck.layers.length - 1))} disabled={!editable || deck.layers.length <= 1} aria-label="Remove the top layer">- Layer</button>
                    <button type="button" className="vj-deck-button" onClick={() => write(addColumn(deck))} disabled={!editable}>+ Column</button>
                </div>
            </header>

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
                        <div className="vj-deck-row" role="group" aria-label={layer.name} key={layer.id} data-active={layer.active >= 0 ? 'true' : 'false'}>
                            <div className="vj-deck-layer">
                                <span className="vj-deck-layer-name" title={layer.name}>{layer.name}</span>
                                <div className="vj-deck-layer-line">
                                    <select
                                        className="vj-deck-chip"
                                        value={layer.blend}
                                        disabled={!editable}
                                        aria-label={`${layer.name} blend`}
                                        onChange={(event) => write(setBlend(deck, index, event.target.value))}
                                    >
                                        {BLEND_MODES.map((label, value) => <option key={label} value={String(value)}>{label}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        className="vj-deck-button"
                                        onClick={() => write(clearLayer(deck, index))}
                                        disabled={!editable || layer.active < 0}
                                        aria-label={`Clear ${layer.name}`}
                                    >
                                        Clear
                                    </button>
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
                                const name = clip ? (clip.label || (clip.kind === 'input' ? inputLabel(clip.input) : assetName(clip.asset))) : ''
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
                                        {playing && clip.kind === 'asset'
                                            ? <DeckPicture nodeId={clipNodeId(deckId, index)} className="vj-deck-tile-picture" label={name} />
                                            : null}
                                        <span className="vj-deck-tile-name">{clip ? name : '+'}</span>
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {picking ? (
                <section className="vj-deck-panel" aria-label="Add a clip">
                    <div className="vj-deck-panel-head">
                        <span className="vj-deck-label">
                            Add to {deck.layers[picking.layer]?.name}, slot {picking.column + 1}
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
                    <div className="vj-deck-pick">
                        <span className="vj-deck-label">Footage</span>
                        <div className="vj-deck-pick-list">
                            {videoAssets.map((asset) => (
                                <button key={asset.id} type="button" className="vj-deck-button vj-deck-asset" onClick={() => place({ kind: 'asset', asset: asset.id, label: asset.name || '' })}>
                                    {asset.name || asset.id}
                                </button>
                            ))}
                            {!videoAssets.length ? <span className="vj-deck-dim">No video in this project yet.</span> : null}
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
            ) : selectedClip ? (
                <ClipSettings
                    key={`${selected.layer}:${selected.column}`}
                    clip={selectedClip}
                    title={`${deck.layers[selected.layer].name}, slot ${selected.column + 1}`}
                    name={selectedClip.label || (selectedClip.kind === 'input' ? inputLabel(selectedClip.input) : assetName(selectedClip.asset))}
                    editable={editable}
                    onChange={(patch) => write(updateClip(deck, selected.layer, selected.column, patch))}
                    onRemove={() => write(setClip(deck, selected.layer, selected.column, null))}
                    onClose={() => setSelected(null)}
                />
            ) : (
                <p className="vj-deck-hint">Tap a clip to play it on its layer. Tap an empty slot to add one.</p>
            )}
        </div>
    )
}

function ClipSettings({ clip, title, name, editable, onChange, onRemove, onClose }) {
    const isInput = clip.kind === 'input'
    return (
        <section className="vj-deck-panel" aria-label="Clip settings">
            <div className="vj-deck-panel-head">
                <span className="vj-deck-label">{title}</span>
                <span className="vj-deck-clip-name">{name}</span>
                <button type="button" className="vj-deck-button vj-deck-button--quiet" onClick={onClose}>Close</button>
            </div>
            {isInput ? (
                <p className="vj-deck-dim">This slot plays whatever is wired into {inputLabel(clip.input)}.</p>
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
