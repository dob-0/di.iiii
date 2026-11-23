import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import MapStage from './MapStage.jsx'
import { useMeasuredStage } from './MapDeskParts.jsx'
import { resolveMapSourceRef } from './MapSourceView.jsx'
import {
    EFFECT_GROUPS, effectCatalogue, effectDef, effectParams, hasCssForm, newEffect, visualTakesShaders
} from './visualEffects.js'
import { paramValue } from './visualParams.js'
import {
    LFO_BEATS, LFO_DEFAULT, LFO_WAVES, OPACITY_SPEC, anyLfoMoving, lfoMoving, lfoRange, lfoValueAt, readLfo, takesLfo, withLfo
} from './paramLfo.js'
import { deskBeat, deskTempo, engineAutopilot, setEngineAutopilot, subscribeDeskTempo, subscribeEngineAutopilot, tapTempo, tempoKeepingBeat } from './deskBeat.js'

// THE DESK, LAID OUT LIKE RESOLUME'S COMPOSITION WINDOW (2026-11-10).
//
// Emily's ask: "I don't need this big [stage] here, I want output and preview
// monitor, also effect panels". So the desk stopped being a place to line
// screens up (that is the Mapping window, MapAdvancedOutput.jsx, Resolume's
// Advanced Output) and became the place to PLAY:
//
//   the deck       visuals as clips. The picture plays it on the wall; the
//                  name opens it in the Preview and the effect panel without
//                  touching the wall — her laser desk's rule, which is
//                  Resolume's (desk-ui-like-resolume).
//   effects panel  the selected clip's effects, or the composition's, as a
//                  stack of cards. Clips keep their own effects; editing the
//                  playing clip changes the wall as you drag.
//   Preview        the selected clip alone, with its effects.
//   Output         the wall as it is, every screen.
//   browser        the effects to drag onto a clip, the panel or a monitor.
//
// SECOND PASS, same evening — her words: "preview and output monitors should
// be here, we are having so much space … make it more understandable and
// logical". So the screen reads left to right as what you SEE and what you DO:
// Preview over Output, big, down the left; on the right the clips (the op-art
// loops are clips too) and, under them, the open clip's effects as cards with
// the effect list beside them. Screens, machines, wall photo and carry went to
// a More drawer: they are set-up, not show.

export const EFFECT_DRAG_TYPE = 'application/x-di-effect'
export const VISUAL_DRAG_TYPE = 'application/x-di-visual'

const KIND_LABEL = {
    video: 'Video', image: 'Image', html: 'HTML', url: 'Web', camera: 'Camera', ndi: 'NDI',
    stream: 'Input', project: 'di', colour: 'Colour', test: 'Test', network: 'Pictures'
}

// A clip named after an uploaded file's hash ("f9d1dc84fdbf…") says nothing
// to a person: show its kind and the first few characters instead. Display
// only — the stored name is untouched and Source → Name renames it.
export const clipName = (visual) => {
    const name = visual?.name || ''
    if (/^[0-9a-f]{20,}$/i.test(name)) return `${KIND_LABEL[visual.source?.kind] || 'Clip'} ${name.slice(0, 4)}`
    return name
}

const carriesEffect = (event) => Array.from(event.dataTransfer?.types || []).includes(EFFECT_DRAG_TYPE)
const carriesVisual = (event) => Array.from(event.dataTransfer?.types || []).includes(VISUAL_DRAG_TYPE)

// --- the deck ---------------------------------------------------------------

function ClipThumb({ visual }) {
    const { kind, ref } = visual.source
    // A captured picture of the clip (Preview takes one by itself), else the
    // file itself where it is a picture, else its kind.
    if (visual.thumb) return <img className="map-clip-media" src={resolveMapSourceRef(visual.thumb)} alt="" draggable="false" />
    if (kind === 'image' && ref) return <img className="map-clip-media" src={resolveMapSourceRef(ref)} alt="" draggable="false" />
    if (kind === 'video' && ref) return <video className="map-clip-media" src={`${resolveMapSourceRef(ref)}#t=0.5`} muted playsInline preload="metadata" />
    if (kind === 'colour') return <span className="map-clip-fill" style={{ background: ref || '#ffffff' }} />
    return <span className="map-clip-kind">{KIND_LABEL[kind] || kind}</span>
}

// How big the clip tiles are, remembered per browser (Emily, 2026-11-10:
// "make their default size smaller, like 13 in a line").
const CLIP_SIZE_KEY = 'di.map.deck.size.v1'
const CLIP_SIZE = { min: 56, max: 220, start: 68 }
const readClipSize = () => {
    try {
        const value = Number(window.localStorage.getItem(CLIP_SIZE_KEY))
        return value >= CLIP_SIZE.min && value <= CLIP_SIZE.max ? value : CLIP_SIZE.start
    } catch {
        return CLIP_SIZE.start
    }
}

export function MapDeck({
    visuals, playing, selectedVisualId, fade, upload, addChoices, fileAccept,
    onPlay, onSelect, onAdd, onFade, onReorder, onDropEffect, onDelete
}) {
    const fileRef = useRef(null)
    const [dragId, setDragId] = useState(null)
    const [effectOver, setEffectOver] = useState(null)
    // Where a dragged clip would land: before or after which tile.
    const [dropAt, setDropAt] = useState(null)
    const [size, setSizeState] = useState(readClipSize)
    const [notice, setNotice] = useState('')
    const setSize = (value) => {
        setSizeState(value)
        try { window.localStorage.setItem(CLIP_SIZE_KEY, String(value)) } catch { /* private window */ }
    }
    const addFrom = async (files) => {
        const made = await upload.bringIn(files)
        made.forEach((visual) => onAdd(visual))
    }
    const remove = (visual) => {
        armed.current = { id: null, at: -Infinity }
        onDelete(visual.id)
        setNotice(`Removed “${clipName(visual)}”. Ctrl+Z brings it back.`)
    }
    // Delete on a focused tile: the clip ON THE WALL needs a second Delete
    // within 3 s. A clicked tile keeps focus, so one stray key blacked the
    // wall mid-set (audit 11-12). Any other clip, and the × button, go at once.
    const armed = useRef({ id: null, at: -Infinity })
    const removeByKey = (visual, at) => {
        if (visual.id === playing && (armed.current.id !== visual.id || at - armed.current.at > 3000)) {
            armed.current = { id: visual.id, at }
            setNotice(`“${clipName(visual)}” is on the wall. Press Delete again to remove it.`)
            return
        }
        remove(visual)
    }
    // A notice says what just happened, then goes; it used to stay after the
    // clip it named was brought back.
    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 6000)
        return () => clearTimeout(timer)
    }, [notice])
    const sideOf = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        return event.clientX < rect.left + (rect.width / 2) ? 'before' : 'after'
    }
    const shownNotice = upload.notice || notice
    return (
        <section className="map-deck" aria-label="Visuals">
            <div className="map-deck-head">
                <h2>Clips</h2>
                <select className="map-deck-add" value="" disabled={upload.busy} onChange={(event) => {
                    const choice = event.target.value
                    if (choice === 'file') fileRef.current?.click()
                    else if (choice) onAdd({ choice })
                }}>
                    <option value="">{upload.busy ? 'Bringing in…' : '+ Add'}</option>
                    {addChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
                <input ref={fileRef} type="file" multiple accept={fileAccept} style={{ display: 'none' }}
                    onChange={(event) => { addFrom(event.target.files); event.target.value = '' }} />
                <label className="map-field map-field-inline" title="How long one visual takes to fade into the next">
                    <span>Fade</span>
                    <input type="number" min="0" max="30" step="0.1" value={fade}
                        onChange={(event) => onFade(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} />
                    <span aria-hidden="true">s</span>
                </label>
                <label className="map-deck-size" title="How big the clips are (double-click to reset)">
                    <span>Size</span>
                    <input type="range" min={CLIP_SIZE.min} max={CLIP_SIZE.max} step="2" value={size}
                        onChange={(event) => setSize(Number(event.target.value))}
                        onDoubleClick={() => setSize(CLIP_SIZE.start)} />
                </label>
                <span className={`map-deck-notice${upload.tone === 'error' ? ' is-error' : ''}`} role="status">
                    {shownNotice || 'Picture = play · name = preview · drag to move · × to remove · keys 1–9, 0 = black'}
                </span>
            </div>
            <div className={`map-deck-tiles${size < 96 ? ' is-small' : ''}`} role="list" style={{ '--map-clip-size': `${size}px` }}>
                <div role="listitem" className={`map-clip map-clip-black${playing ? '' : ' is-playing'}`}>
                    <button type="button" className="map-clip-play" onClick={() => onPlay('')} title="Nothing on the wall (key 0)">
                        <span className="map-clip-thumb">
                            <span className="map-clip-fill" style={{ background: '#000' }} />
                            {playing ? null : <span className="map-clip-badge is-live">LIVE</span>}
                        </span>
                    </button>
                    <span className="map-clip-name is-static"><kbd>0</kbd> Black</span>
                </div>
                {visuals.map((visual, index) => {
                    const effectCount = (visual.effects || []).filter((effect) => effect.on !== false).length
                    const drop = dropAt?.id === visual.id ? dropAt.side : null
                    return (
                        <div
                            key={visual.id}
                            role="listitem"
                            className={[
                                'map-clip',
                                visual.id === playing ? 'is-playing' : '',
                                visual.id === selectedVisualId ? 'is-selected' : '',
                                visual.id === dragId ? 'is-dragging' : '',
                                visual.id === effectOver ? 'is-effect-target' : '',
                                drop ? `is-drop-${drop}` : ''
                            ].filter(Boolean).join(' ')}
                            draggable="true"
                            onDragStart={(event) => {
                                event.dataTransfer.setData(VISUAL_DRAG_TYPE, visual.id)
                                event.dataTransfer.effectAllowed = 'copyMove'
                                setDragId(visual.id)
                            }}
                            onDragEnd={() => { setDragId(null); setDropAt(null) }}
                            onDragOver={(event) => {
                                if (carriesVisual(event) || carriesEffect(event)) event.preventDefault()
                                if (carriesEffect(event) && effectOver !== visual.id) setEffectOver(visual.id)
                                if (carriesVisual(event) && dragId && dragId !== visual.id) {
                                    const side = sideOf(event)
                                    if (dropAt?.id !== visual.id || dropAt.side !== side) setDropAt({ id: visual.id, side })
                                }
                            }}
                            onDragLeave={() => {
                                setEffectOver((value) => (value === visual.id ? null : value))
                                setDropAt((value) => (value?.id === visual.id ? null : value))
                            }}
                            onDrop={(event) => {
                                setEffectOver(null)
                                setDropAt(null)
                                const effectType = event.dataTransfer.getData(EFFECT_DRAG_TYPE)
                                if (effectType) {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onDropEffect(visual.id, effectType)
                                    return
                                }
                                const from = event.dataTransfer.getData(VISUAL_DRAG_TYPE)
                                if (!from || from === visual.id) return
                                event.preventDefault()
                                event.stopPropagation()
                                const ids = visuals.map((entry) => entry.id).filter((id) => id !== from)
                                const at = ids.indexOf(visual.id) + (sideOf(event) === 'after' ? 1 : 0)
                                ids.splice(at, 0, from)
                                onReorder(ids)
                            }}
                        >
                            <button type="button" className="map-clip-play" onClick={() => onPlay(visual.id)}
                                onKeyDown={(event) => { if (event.key === 'Delete') { event.preventDefault(); removeByKey(visual, event.timeStamp) } }}
                                title={`Play “${clipName(visual)}” on the wall${index < 9 ? ` (key ${index + 1})` : ''}`}>
                                <span className="map-clip-thumb">
                                    <ClipThumb visual={visual} />
                                    {effectCount ? <span className="map-clip-fx" title={`${effectCount} effect${effectCount === 1 ? '' : 's'}`}>fx {effectCount}</span> : null}
                                    {visual.id === playing ? <span className="map-clip-badge is-live">LIVE</span> : null}
                                    {visual.id === selectedVisualId && visual.id !== playing ? <span className="map-clip-badge">PREVIEW</span> : null}
                                </span>
                            </button>
                            <button type="button" className="map-clip-delete" onClick={() => remove(visual)}
                                aria-label={`Remove “${clipName(visual)}”`} title="Remove this clip (Ctrl+Z brings it back)">×</button>
                            <button type="button" className="map-clip-name" onClick={() => onSelect(visual.id)}
                                onKeyDown={(event) => { if (event.key === 'Delete') { event.preventDefault(); removeByKey(visual, event.timeStamp) } }}
                                title={`${clipName(visual)} — open it in Preview and its effects; the wall stays as it is`}>
                                {index < 9 ? <kbd>{index + 1}</kbd> : null}
                                <span className="map-clip-label">{clipName(visual)}</span>
                            </button>
                        </div>
                    )
                })}
                <div role="listitem" className="map-clip map-clip-add">
                    <button type="button" className="map-clip-play" onClick={() => fileRef.current?.click()} disabled={upload.busy}
                        title="Bring in video, image or HTML files">
                        <span className="map-clip-thumb"><span className="map-clip-kind">+</span></span>
                    </button>
                    <span className="map-clip-name is-static">Add files</span>
                </div>
            </div>
        </section>
    )
}

// --- one effect, as a card ------------------------------------------------

// --- one setting: the control a VJ desk uses --------------------------------
//
// Emily, 2026-11-11, chose this from five styles ("Thin slider + number box"),
// after the fill bar made the name look smaller than its control: a thin line
// with a cyan fill and a small thumb, no longer than 320px, so the number box
// right after it stays near the name. Click or drag the line (shift-drag for
// fine, arrow keys step, shift ×10, Home/End, Enter jumps to the box);
// double-click it for the default. The box always shows the number. Click it
// and type, then Enter (Esc cancels), or press ↑/↓ in it to step. A short
// choice is a row of tabs, on/off is a small switch, a colour is a swatch.

const decimalsOf = (step) => {
    const text = String(step ?? 0.01)
    return text.includes('.') ? Math.min(4, text.split('.')[1].length) : 0
}
const formatValue = (value, spec) => Number(value).toFixed(decimalsOf(spec.step))
const clamp01 = (value) => Math.min(1, Math.max(0, value))

function FillBar({ spec, value, onChange, compact = false, lfo = null }) {
    const trackRef = useRef(null)
    const markRef = useRef(null)
    const inputRef = useRef(null)
    const dragRef = useRef(null)
    const pressesRef = useRef([])
    // The box's text while someone types in it; null = it shows the value.
    const [editing, setEditing] = useState(null)
    const cancelRef = useRef(false)
    const min = Number(spec.min ?? 0)
    const max = Number(spec.max ?? 1)
    const step = Number(spec.step) > 0 ? Number(spec.step) : 0.01
    const span = (max - min) || 1
    const fit = (raw) => {
        const stepped = min + (Math.round((raw - min) / step) * step)
        return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimalsOf(step)))
    }
    const at = (clientX) => {
        const rect = trackRef.current.getBoundingClientRect()
        return min + (clamp01((clientX - rect.left) / Math.max(1, rect.width)) * span)
    }
    const commitText = () => {
        if (cancelRef.current) { cancelRef.current = false; setEditing(null); return }
        if (editing === null) return
        const number = Number(String(editing).replace(',', '.'))
        if (Number.isFinite(number) && String(editing).trim() !== '') onChange(fit(number))
        setEditing(null)
    }
    const fraction = clamp01((value - min) / span)
    // A line that runs both ways from zero (−1…1, −180…180) fills from the middle.
    const fromMiddle = min < 0 && max > 0
    const zero = clamp01((0 - min) / span)
    const fill = fromMiddle
        ? { left: `${Math.min(zero, fraction) * 100}%`, width: `${Math.abs(fraction - zero) * 100}%` }
        : { left: 0, width: `${fraction * 100}%` }
    // An LFO on it: a pale stretch where it swings, and a mark that rides the
    // beat — written straight to the element each frame, never through state.
    const moving = lfoMoving(lfo)
    const swing = moving ? lfoRange({ min, max }, value, lfo) : null
    const lfoSpec = useMemo(() => ({ min, max, kind: 'number', key: spec.key || spec.label }), [min, max, spec.key, spec.label])
    useEffect(() => {
        if (!moving) return undefined
        let frame = 0
        const step = () => {
            const live = lfoValueAt(lfoSpec, value, lfo, deskBeat())
            if (markRef.current) markRef.current.style.left = `${clamp01((live - min) / span) * 100}%`
            frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [moving, lfo, lfoSpec, value, min, span])
    return (
        <div className={`map-param-num${compact ? ' is-compact' : ''}`}>
            <div
                ref={trackRef}
                className="map-param-track"
                role="slider"
                tabIndex={0}
                aria-label={spec.label}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={value}
                aria-valuetext={`${formatValue(value, spec)}${spec.unit || ''}`}
                title="Click or drag · shift-drag for fine · double-click for the default"
                onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    event.currentTarget.focus()
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                    pressesRef.current = [...pressesRef.current.slice(-1), { at: performance.now(), before: value }]
                    if (event.shiftKey) {
                        dragRef.current = { fine: true, x: event.clientX, start: value }
                    } else {
                        dragRef.current = { fine: false }
                        onChange(fit(at(event.clientX)))
                    }
                }}
                onPointerMove={(event) => {
                    const drag = dragRef.current
                    if (!drag) return
                    if (drag.fine) {
                        const width = Math.max(1, trackRef.current.getBoundingClientRect().width)
                        onChange(fit(drag.start + (((event.clientX - drag.x) / width) * span * 0.1)))
                    } else {
                        onChange(fit(at(event.clientX)))
                    }
                }}
                onPointerUp={() => { dragRef.current = null }}
                onPointerCancel={() => { dragRef.current = null }}
                onDoubleClick={() => {
                    // Double-click = the default. Without one, put back what
                    // the two presses of the double-click moved it from.
                    if (spec.default !== undefined) { onChange(fit(Number(spec.default))); return }
                    const first = pressesRef.current[0]
                    if (first && performance.now() - first.at < 700 && first.before !== value) onChange(first.before)
                }}
                onKeyDown={(event) => {
                    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]
                    // The keys this line uses stop here, so a window's own shortcuts
                    // (the Mapping window nudges and deletes pieces) never act too.
                    if (delta) {
                        event.preventDefault(); event.stopPropagation()
                        onChange(fit(value + (delta * step * (event.shiftKey ? 10 : 1))))
                    } else if (event.key === 'Home') { event.preventDefault(); event.stopPropagation(); onChange(min) }
                    else if (event.key === 'End') { event.preventDefault(); event.stopPropagation(); onChange(max) }
                    else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); inputRef.current?.focus() }
                }}
            >
                {swing ? (
                    <span className="map-param-swing" style={{ left: `${clamp01((swing[0] - min) / span) * 100}%`, width: `${clamp01((swing[1] - swing[0]) / span) * 100}%` }} />
                ) : null}
                <span className="map-param-line" />
                <span className="map-param-fill" style={fill} />
                <span className="map-param-thumb" style={{ left: `${fraction * 100}%` }} />
                {moving ? <span ref={markRef} className="map-param-lfo-mark" /> : null}
            </div>
            <label className="map-param-numbox">
                <input
                    ref={inputRef}
                    className="map-param-input"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing ?? formatValue(value, spec)}
                    aria-label={`${spec.label} value`}
                    onFocus={(event) => { setEditing(formatValue(value, spec)); event.target.select() }}
                    onChange={(event) => setEditing(event.target.value)}
                    onBlur={commitText}
                    onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                        else if (event.key === 'Escape') { event.preventDefault(); cancelRef.current = true; event.currentTarget.blur() }
                        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault()
                            const typed = Number(String(editing ?? value).replace(',', '.'))
                            const next = fit((Number.isFinite(typed) ? typed : value) + ((event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)))
                            onChange(next)
                            setEditing(formatValue(next, spec))
                        }
                    }}
                />
                {spec.unit ? <small>{spec.unit}</small> : null}
            </label>
        </div>
    )
}

// One setting = one row, as in Resolume's clip panel: the name in a fixed
// column on the left, the control filling the rest, ↺ at the end. Every row
// of every card has the same three columns, so names line up under names
// and bars under bars (Emily, 2026-11-10: "parametres under each other and
// more coordinated"). Right-click the row, double-click the name, or ↺
// puts it back to how it comes.
export function ParamRow({ spec, value, onChange, lfo, onLfo }) {
    const [lfoOpen, setLfoOpen] = useState(false)
    const canLfo = Boolean(onLfo) && takesLfo(spec)
    const fallback = spec.default
    const isDefault = spec.kind === 'number'
        ? Math.abs(Number(value) - Number(fallback)) < 1e-9
        : value === fallback
    const reset = () => { if (!isDefault && fallback !== undefined) onChange(fallback) }
    let control
    if (spec.kind === 'toggle') {
        control = (
            <button type="button" role="switch" aria-checked={Boolean(value)} aria-label={spec.label}
                className={`map-param-switch${value ? ' is-on' : ''}`} onClick={() => onChange(!value)}>
                <span className="map-param-knob" aria-hidden="true" />
            </button>
        )
    } else if (spec.kind === 'choice') {
        const options = spec.options || []
        const short = options.length <= 5 && options.reduce((sum, [, label]) => sum + String(label).length, 0) <= 48
        control = short ? (
            <div className="map-param-tabs" role="radiogroup" aria-label={spec.label}>
                {options.map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={value === id}
                        className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>{label}</button>
                ))}
            </div>
        ) : (
            <div className="map-param-box">
                <select className="map-param-select" value={value} aria-label={spec.label} onChange={(event) => onChange(event.target.value)}>
                    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
            </div>
        )
    } else if (spec.kind === 'colour') {
        control = (
            <label className="map-param-box map-param-colour">
                <span className="map-param-swatch" style={{ background: value }} />
                <span className="map-param-hex">{value}</span>
                <input type="color" value={value} aria-label={spec.label} onChange={(event) => onChange(event.target.value)} />
            </label>
        )
    } else {
        control = <FillBar spec={spec} value={value} onChange={onChange} lfo={canLfo ? lfo : null} />
    }
    // A row that could have an LFO keeps a fourth column even when this
    // setting can't (a choice, a speed), so the ↺ of every row lines up.
    let lfoSlot = null
    if (onLfo) {
        lfoSlot = canLfo
            ? <LfoButton label={spec.label} lfo={lfo} open={lfoOpen} onToggle={setLfoOpen} onLfo={onLfo} />
            : <span className="map-param-lfo-none" aria-hidden="true" />
    }
    return (
        <>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
                className={`map-param${isDefault ? '' : ' is-changed'}${onLfo ? ' has-lfo' : ''}${lfoMoving(lfo) && canLfo ? ' is-swinging' : ''}`}
                onContextMenu={(event) => { event.preventDefault(); reset() }}
                title={`${spec.label}${isDefault ? '' : ' — right-click to reset'}`}
            >
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <span className="map-param-label" onDoubleClick={reset}>{spec.label}</span>
                {control}
                {lfoSlot}
                <button type="button" className="map-param-reset" onClick={reset} disabled={isDefault}
                    aria-label={`Reset ${spec.label}`} title="Back to how it comes">↺</button>
            </div>
            {canLfo && lfoOpen ? <LfoStrip label={spec.label} lfo={lfo} onChange={onLfo} /> : null}
        </>
    )
}

// --- the LFO on a setting (paramLfo.js) ---------------------------------------
//
// Resolume's BPM-synced animation, our way: "~" next to a setting opens a
// strip under it — on/off, the wave, how many beats a round takes, and how
// far it swings. The first "~" on a setting starts it swinging at once (sine,
// a bar, half the slider); Off keeps the settings for next time.

const beatsName = (beats) => {
    if (beats === 0.25) return '¼ beat'
    if (beats === 0.5) return '½ beat'
    if (beats === 1) return '1 beat'
    if (beats < 4) return `${beats} beats`
    if (beats === 4) return '1 bar'
    return `${beats / 4} bars`
}

const WAVE_PATHS = {
    sine: 'M1 5 C3 -1.5 5 -1.5 7 5 S11 11.5 13 5 S17 -1.5 17 2',
    tri: 'M1 8 L5 2 L9 8 L13 2 L17 8',
    saw: 'M1 2 L9 8 L9 2 L17 8',
    square: 'M1 8 V2 H9 V8 H17 V2',
    random: 'M1 6 H5 V2 H9 V8 H13 V4 H17'
}
function WaveIcon({ wave }) {
    return (
        <svg className="map-lfo-wave" viewBox="0 0 18 10" width="18" height="10" aria-hidden="true">
            <path d={WAVE_PATHS[wave] || WAVE_PATHS.sine} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
    )
}

function LfoButton({ label, lfo, open, onToggle, onLfo }) {
    const moving = lfoMoving(lfo)
    return (
        <button
            type="button"
            className={`map-param-lfo${moving ? ' is-on' : ''}${open ? ' is-open' : ''}`}
            aria-expanded={open}
            aria-label={`${label} LFO`}
            title={moving ? 'Swinging with the beat — click for its wave, length and depth' : 'Make it swing with the beat (LFO)'}
            onClick={() => {
                if (!open && !readLfo(lfo)) onLfo({ ...LFO_DEFAULT })
                onToggle(!open)
            }}
        >~</button>
    )
}

function LfoStrip({ label, lfo, onChange }) {
    const current = readLfo(lfo) || { ...LFO_DEFAULT, on: false }
    const set = (patch) => onChange({ ...current, ...patch })
    return (
        <div className={`map-lfo${current.on ? ' is-on' : ''}`} role="group" aria-label={`${label} LFO`}>
            <button type="button" role="switch" aria-checked={current.on} aria-label={`${label} LFO on`}
                className={`map-lfo-on${current.on ? ' is-on' : ''}`} onClick={() => set({ on: !current.on })}>
                {current.on ? 'On' : 'Off'}
            </button>
            <div className="map-lfo-waves" role="radiogroup" aria-label="Wave">
                {LFO_WAVES.map(([id, name]) => (
                    <button key={id} type="button" role="radio" aria-checked={current.wave === id} aria-label={name} title={name}
                        className={current.wave === id ? 'is-on' : ''} onClick={() => set({ wave: id, on: true })}>
                        <WaveIcon wave={id} />
                    </button>
                ))}
            </div>
            <label className="map-lfo-every" title="How long one swing takes">
                <span>Every</span>
                <select value={String(current.beats)} aria-label="Every" onChange={(event) => set({ beats: Number(event.target.value), on: true })}>
                    {LFO_BEATS.map((beats) => <option key={beats} value={String(beats)}>{beatsName(beats)}</option>)}
                </select>
            </label>
            <div className="map-lfo-depth" title="How far it swings, as a part of the whole slider">
                <span>Depth</span>
                <FillBar compact spec={{ key: 'depth', label: 'Depth', min: 0, max: 100, step: 1, unit: '%', default: 50 }}
                    value={Math.round(current.depth * 100)} onChange={(depth) => set({ depth: depth / 100 })} />
            </div>
        </div>
    )
}

// --- the desk's tempo (deskBeat.js) -----------------------------------------
//
// What every LFO counts in. Typed or tapped, saved with the mapping; while the
// bar show's engine runs, its tempo leads and this only shows it. Four lights
// count the bar.

const formatBpm = (bpm) => String(Math.round(bpm * 10) / 10)

export function MapTempo({ onTempo }) {
    const tempo = useSyncExternalStore(subscribeDeskTempo, deskTempo, deskTempo)
    const lightsRef = useRef([])
    const [typing, setTyping] = useState(null)
    const cancelRef = useRef(false)
    useEffect(() => {
        let frame = 0
        let last = ''
        const step = () => {
            const beat = deskBeat()
            const at = ((Math.floor(beat) % 4) + 4) % 4
            const hit = beat - Math.floor(beat) < 0.18
            const key = `${at}${hit}`
            if (key !== last) {
                last = key
                lightsRef.current.forEach((light, index) => {
                    if (light) light.className = `map-tempo-light${index === at ? (hit ? ' is-hit' : ' is-now') : ''}${index === 0 ? ' is-one' : ''}`
                })
            }
            frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frame)
    }, [])
    const fromShow = tempo.from === 'show'
    const commit = () => {
        if (cancelRef.current) { cancelRef.current = false; setTyping(null); return }
        if (typing === null) return
        const bpm = Number(String(typing).replace(',', '.'))
        if (Number.isFinite(bpm) && bpm > 0) onTempo(tempoKeepingBeat(Math.min(300, Math.max(20, Math.round(bpm * 100) / 100))))
        setTyping(null)
    }
    return (
        <div className={`map-tempo${fromShow ? ' is-show' : ''}`}
            title={fromShow ? 'The bar show sets the tempo while its engine runs' : 'The tempo every LFO swings to: type it, or tap it on the beat'}>
            <span className="map-tempo-lights" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                    <span key={index} ref={(element) => { lightsRef.current[index] = element }} className="map-tempo-light" />
                ))}
            </span>
            <label className="map-tempo-bpm">
                <input
                    value={typing ?? formatBpm(tempo.bpm)}
                    aria-label="Tempo in BPM"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={fromShow}
                    onFocus={(event) => { setTyping(formatBpm(tempo.bpm)); event.target.select() }}
                    onChange={(event) => setTyping(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
                        else if (event.key === 'Escape') { event.preventDefault(); cancelRef.current = true; event.currentTarget.blur() }
                    }}
                />
                <small>BPM</small>
            </label>
            {fromShow
                ? <span className="map-tempo-from">show</span>
                : (
                    <button type="button" className="map-mini" title="Tap on the beat: two taps or more set the tempo, and the last tap is beat one"
                        onClick={() => { const next = tapTempo(); if (next) onTempo(next) }}>Tap</button>
                )}
        </div>
    )
}

// The bar show's autopilot, from the desk (Emily, 11-12: "a loop button like
// autopilot: on, the patterns change; off, no loop"). The same switch as the
// pad's "Autopilot on/off" (the engine's state.auto), so either one shows what
// the other did. Only there while the engine runs, as its tempo is.
export function MapAutopilot({ className = 'map-toggle' }) {
    const on = useSyncExternalStore(subscribeEngineAutopilot, engineAutopilot, engineAutopilot)
    if (on === null) return null
    return (
        <button type="button" role="switch" aria-checked={on}
            className={`${className} map-autopilot${on ? ' is-on' : ''}`}
            title={on
                ? 'Autopilot on: the patterns change with the music. Click to keep the one playing.'
                : 'Autopilot off: the pattern playing stays until you pick another. Click to let the music change them.'}
            onClick={() => setEngineAutopilot(!on)}>Autopilot</button>
    )
}

// A card moved inside its own chain. Its own drag type, so only the chain it
// came from answers to it — a deck tile or a monitor never takes it for a
// new effect.
const EFFECT_MOVE_TYPE = 'application/x-di-effect-move'
const carriesMove = (event) => Array.from(event.dataTransfer?.types || []).includes(EFFECT_MOVE_TYPE)
const halfOf = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + (rect.height / 2) ? 'before' : 'after'
}

function EffectCard({ effect, index, count, cssOnly, open, dropSide, dragging, onToggleOpen, onChange, onMove, onRemove, onGrab, onRelease, dropHandlers }) {
    const cardRef = useRef(null)
    const def = effectDef(effect.type)
    const dropClass = dropSide ? ` is-drop-${dropSide}` : ''
    const grip = (
        <span
            className="map-fx-grip"
            draggable="true"
            aria-hidden="true"
            title="Drag to move it in the chain"
            onDragStart={(event) => {
                event.dataTransfer.setData(EFFECT_MOVE_TYPE, String(index))
                event.dataTransfer.effectAllowed = 'move'
                if (cardRef.current) event.dataTransfer.setDragImage(cardRef.current, 12, 12)
                // Next tick: re-rendering the card inside dragstart makes
                // Chrome drop the drag on the spot (dragend straight after).
                setTimeout(onGrab, 0)
            }}
            onDragEnd={onRelease}
        >⠿</span>
    )
    if (!def) {
        return (
            <li ref={cardRef} className={`map-fx-card is-unknown${dropClass}`} {...dropHandlers}>
                <div className="map-fx-card-head">
                    {grip}
                    <span className="map-fx-card-name">{effect.type}</span>
                    <button type="button" className="map-fx-icon" onClick={onRemove} aria-label="Remove effect">×</button>
                </div>
                <p className="map-empty">This build does not know this effect.</p>
            </li>
        )
    }
    const params = effectParams(effect)
    const skipped = cssOnly && !hasCssForm(effect.type)
    const changed = def.params.some((spec) => params[spec.key] !== spec.default) || Object.keys(effect.lfo || {}).length > 0
    const swinging = anyLfoMoving(effect.lfo)
    return (
        <li
            ref={cardRef}
            className={`map-fx-card${effect.on === false ? ' is-bypassed' : ''}${skipped ? ' is-skipped' : ''}${dragging ? ' is-dragging' : ''}${dropClass}`}
            {...dropHandlers}
        >
            <div className="map-fx-card-head">
                {grip}
                <button type="button" className="map-fx-fold" onClick={onToggleOpen} aria-expanded={open}
                    aria-label={open ? `Fold ${def.label}` : `Unfold ${def.label}`}>{open ? '▾' : '▸'}</button>
                <button type="button" className="map-fx-card-name" onClick={onToggleOpen} title={open ? 'Fold' : 'Unfold'}>{def.label}</button>
                {swinging ? <span className="map-fx-swinging" title="A setting here swings with the beat">~</span> : null}
                {changed ? (
                    <button type="button" className="map-fx-icon map-fx-reset" title="Every setting of this effect back to how it comes"
                        onClick={() => {
                            const fresh = {}
                            def.params.forEach((spec) => { fresh[spec.key] = spec.default })
                            onChange({ ...effect, params: fresh, lfo: {} })
                        }}>↺</button>
                ) : null}
                <button type="button" className="map-fx-icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${def.label} up`} title="Earlier in the chain">↑</button>
                <button type="button" className="map-fx-icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${def.label} down`} title="Later in the chain">↓</button>
                <button type="button" role="switch" aria-checked={effect.on !== false}
                    className={`map-fx-bypass${effect.on === false ? '' : ' is-on'}`}
                    onClick={() => onChange({ ...effect, on: effect.on === false })}
                    aria-label={`${def.label} on`} title="On / bypass">{effect.on === false ? 'Off' : 'On'}</button>
                <button type="button" className="map-fx-icon" onClick={onRemove} aria-label={`Remove ${def.label}`} title="Remove">×</button>
            </div>
            {skipped ? <p className="map-fx-note">Not drawn on a web link or di project: only video, image, camera, test, colour and HTML visuals take it.</p> : null}
            {open ? (
                <div className="map-fx-params">
                    {def.params.map((spec) => (
                        <ParamRow
                            key={spec.key}
                            spec={spec}
                            value={params[spec.key]}
                            onChange={(value) => onChange({ ...effect, params: { ...effect.params, [spec.key]: value } })}
                            lfo={effect.lfo?.[spec.key]}
                            onLfo={(next) => onChange({ ...effect, lfo: withLfo(effect.lfo, spec.key, next) })}
                        />
                    ))}
                </div>
            ) : null}
        </li>
    )
}

// The chain, top to bottom in the order it runs. A new effect from the list
// lands where it is dropped — between two cards, or at the end — and a card
// dragged by its grip moves to where it is let go, the blue line showing
// where (Resolume's effect chain).
function EffectStack({ effects, cssOnly, emptyText, onChange }) {
    const [closed, setClosed] = useState(() => new Set())
    const [dragIndex, setDragIndex] = useState(null)
    const [dropAt, setDropAt] = useState(null)
    const list = Array.isArray(effects) ? effects : []
    const replaceAt = (index, next) => onChange(list.map((effect, at) => (at === index ? next : effect)))
    const move = (index, step) => {
        const target = index + step
        if (target < 0 || target >= list.length) return
        const next = [...list]
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        onChange(next)
    }
    // `at` is a gap: 0 = before the first card, list.length = after the last.
    const land = (event, at) => {
        setDropAt(null)
        const type = event.dataTransfer.getData(EFFECT_DRAG_TYPE)
        const moved = event.dataTransfer.getData(EFFECT_MOVE_TYPE)
        if (!type && moved === '') return
        event.preventDefault()
        event.stopPropagation()
        if (type) {
            const effect = newEffect(type)
            if (!effect) return
            const next = [...list]
            next.splice(at, 0, effect)
            onChange(next)
            return
        }
        const from = Number(moved)
        if (!Number.isInteger(from) || from < 0 || from >= list.length) return
        const to = at > from ? at - 1 : at
        if (to === from) return
        const next = [...list]
        const [card] = next.splice(from, 1)
        next.splice(to, 0, card)
        onChange(next)
    }
    const takes = (event) => carriesEffect(event) || (carriesMove(event) && dragIndex !== null)
    // A card dropped right where it already is draws no line.
    const pointless = (index, side) => dragIndex !== null
        && (index === dragIndex || (side === 'after' && index + 1 === dragIndex) || (side === 'before' && index - 1 === dragIndex))
    return (
        <div className="map-fx-stack">
            {list.length ? (
                <ol className="map-fx-list">
                    {list.map((effect, index) => (
                        <EffectCard
                            key={effect.id}
                            effect={effect}
                            index={index}
                            count={list.length}
                            cssOnly={cssOnly}
                            open={!closed.has(effect.id)}
                            dragging={dragIndex === index}
                            dropSide={dropAt?.index === index ? dropAt.side : null}
                            onGrab={() => setDragIndex(index)}
                            onRelease={() => { setDragIndex(null); setDropAt(null) }}
                            dropHandlers={{
                                onDragOver: (event) => {
                                    if (!takes(event)) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    const side = halfOf(event)
                                    const next = pointless(index, side) ? null : { index, side }
                                    if (next?.index !== dropAt?.index || next?.side !== dropAt?.side) setDropAt(next)
                                },
                                onDragLeave: (event) => {
                                    if (event.currentTarget.contains(event.relatedTarget)) return
                                    setDropAt((value) => (value?.index === index ? null : value))
                                },
                                onDrop: (event) => land(event, index + (halfOf(event) === 'after' ? 1 : 0))
                            }}
                            onToggleOpen={() => setClosed((value) => {
                                const next = new Set(value)
                                if (next.has(effect.id)) next.delete(effect.id)
                                else next.add(effect.id)
                                return next
                            })}
                            onChange={(next) => replaceAt(index, next)}
                            onMove={(step) => move(index, step)}
                            onRemove={() => onChange(list.filter((_, at) => at !== index))}
                        />
                    ))}
                </ol>
            ) : null}
            <p
                className={`map-fx-drop${dropAt?.index === list.length ? ' is-over' : ''}`}
                onDragOver={(event) => {
                    if (!takes(event)) return
                    event.preventDefault()
                    event.stopPropagation()
                    if (dropAt?.index !== list.length) setDropAt({ index: list.length, side: 'end' })
                }}
                onDragLeave={() => setDropAt((value) => (value?.index === list.length ? null : value))}
                onDrop={(event) => land(event, list.length)}
            >{list.length ? 'Drop an effect here to add it at the end' : emptyText}</p>
        </div>
    )
}

// --- the clip's own settings (visualParams.js) ------------------------------
//
// What the clip itself says it has — an op-art loop's line thickness, square
// size, how the cubes play — shown before its effects, as Resolume shows a
// generator's or an ISF shader's parameters at the top of the clip panel.

function ClipSettings({ visual, onChange, onLfo }) {
    const spec = Array.isArray(visual.paramSpec) ? visual.paramSpec : []
    const values = visual.params || {}
    if (!spec.length) {
        return visual.source?.kind === 'html'
            ? <p className="map-fx-settings-none">This clip has no settings of its own. Open it in Preview once if it should have some — it tells the desk when it loads.</p>
            : null
    }
    const changed = spec.some((entry) => values[entry.key] !== undefined && paramValue(entry, values) !== paramValue(entry, {}))
    return (
        <section className="map-fx-settings" aria-label={`${clipName(visual)} settings`}>
            <div className="map-fx-settings-head">
                <h3>Settings</h3>
                <button type="button" className="map-mini" disabled={!changed && !spec.some((entry) => visual.lfo?.[entry.key])}
                    onClick={() => {
                        onChange({})
                        // Their LFOs go too; the opacity's stays.
                        const kept = visual.lfo?.opacity ? { opacity: visual.lfo.opacity } : {}
                        if (Object.keys(visual.lfo || {}).length !== Object.keys(kept).length) onLfo(kept)
                    }}
                    title="Put every setting back to how the clip comes">Reset</button>
            </div>
            <div className="map-fx-settings-grid">
                {spec.map((entry) => (
                    <ParamRow
                        key={entry.key}
                        spec={{ ...entry, kind: entry.type, unit: entry.unit || '' }}
                        value={paramValue(entry, values)}
                        onChange={(value) => onChange({ ...values, [entry.key]: value })}
                        lfo={visual.lfo?.[entry.key]}
                        onLfo={(next) => onLfo(withLfo(visual.lfo, entry.key, next))}
                    />
                ))}
            </div>
        </section>
    )
}

// --- the effect panel: Clip | Composition -----------------------------------
//
// One wide panel under the clips: what is open (tabs), its opacity and
// source, its effects as cards, and the list of effects to add on the right.

export function MapEffectsPanel({
    tab, onTab, visual, playing, compEffects, sourceEditor, browser,
    onVisualChange, onCompEffects, onAddEffect, onPlay, onTempo
}) {
    const cssOnly = visual ? !visualTakesShaders(visual) : false
    const [sourceOpen, setSourceOpen] = useState(false)
    // Which clip's opacity LFO strip is open (it shuts when another clip opens).
    const [opacityLfoFor, setOpacityLfoFor] = useState(null)
    const opacityLfoOpen = Boolean(visual) && opacityLfoFor === visual.id
    const setOpacityLfo = (next) => onVisualChange(visual.id, { lfo: withLfo(visual.lfo, 'opacity', next) })
    // The whole panel takes an effect from the list, not only the dashed
    // line: let go of it anywhere over the open clip (or the composition)
    // and it goes at the end of that chain. Between two cards it goes there.
    const [over, setOver] = useState(false)
    const dropTarget = tab === 'clip' ? (visual ? `“${clipName(visual)}”` : null) : 'the whole wall'
    const mainDrop = dropTarget ? {
        onDragOver: (event) => {
            if (!carriesEffect(event)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
            if (!over) setOver(true)
        },
        onDragLeave: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(false) },
        onDrop: (event) => {
            setOver(false)
            const type = event.dataTransfer.getData(EFFECT_DRAG_TYPE)
            if (!type) return
            event.preventDefault()
            onAddEffect(tab === 'clip' ? 'clip' : 'comp', type)
        }
    } : {}
    return (
        <section className="map-fx-panel" aria-label="Effects">
            <div className="map-fx-head">
                <div className="map-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'clip'} className={`map-tab${tab === 'clip' ? ' is-on' : ''}`}
                        onClick={() => onTab('clip')}>Clip{visual ? <b>{clipName(visual)}</b> : null}</button>
                    <button type="button" role="tab" aria-selected={tab === 'comp'} className={`map-tab${tab === 'comp' ? ' is-on' : ''}`}
                        onClick={() => onTab('comp')}>Composition<b>whole wall</b></button>
                </div>
                {tab === 'clip' && visual ? (
                    <div className="map-fx-clipbar">
                        <span className={`map-fx-state${visual.id === playing ? ' is-live' : ''}`}>
                            {KIND_LABEL[visual.source.kind] || visual.source.kind} · {visual.id === playing ? 'on the wall' : 'not playing'}
                        </span>
                        <div className="map-fx-opacity" title="The clip’s opacity">
                            <span>Opacity</span>
                            <FillBar compact spec={OPACITY_SPEC} value={visual.opacity ?? 1} lfo={visual.lfo?.opacity}
                                onChange={(opacity) => onVisualChange(visual.id, { opacity })} />
                            <LfoButton label="Opacity" lfo={visual.lfo?.opacity} open={opacityLfoOpen}
                                onToggle={(open) => setOpacityLfoFor(open ? visual.id : null)} onLfo={setOpacityLfo} />
                        </div>
                        <button type="button" className={`map-mini${sourceOpen ? ' is-on' : ''}`} onClick={() => setSourceOpen((value) => !value)}
                            title="Rename, change the file or address, remove">Source</button>
                        <button type="button" className="map-mini" disabled={visual.id === playing} onClick={() => onPlay(visual.id)}>
                            {visual.id === playing ? 'Playing' : 'Play ▶'}
                        </button>
                    </div>
                ) : null}
                {onTempo ? <MapTempo onTempo={onTempo} /> : null}
            </div>
            <div className={`map-fx-body${browser ? '' : ' is-single'}`}>
                <div className={`map-fx-main${over ? ' is-over' : ''}`} {...mainDrop}>
                    {over && dropTarget ? <div className="map-fx-main-drop" aria-hidden="true"><span>Let go to add it to {dropTarget}</span></div> : null}
                    {tab === 'clip' && visual && sourceOpen ? <div className="map-fx-source">{sourceEditor}</div> : null}
                    {tab === 'clip' && opacityLfoOpen ? (
                        <div className="map-fx-opacity-lfo">
                            <span className="map-param-label">Opacity</span>
                            <LfoStrip label="Opacity" lfo={visual.lfo?.opacity} onChange={setOpacityLfo} />
                        </div>
                    ) : null}
                    {tab === 'clip' && visual ? (
                        <ClipSettings visual={visual} onChange={(params) => onVisualChange(visual.id, { params })}
                            onLfo={(lfo) => onVisualChange(visual.id, { lfo })} />
                    ) : null}
                    {tab === 'clip' ? (
                        visual ? (
                            <EffectStack
                                effects={visual.effects}
                                cssOnly={cssOnly}
                                emptyText={`No effects on “${clipName(visual)}” yet. Drag one here from the list, or press + next to it.`}
                                onChange={(effects) => onVisualChange(visual.id, { effects })}
                            />
                        ) : <p className="map-empty">Click a clip to open it here.</p>
                    ) : (
                        <EffectStack
                            effects={compEffects}
                            cssOnly={false}
                            emptyText="No effects on the whole wall. They apply after each clip’s own; a screen that plays one clip alone skips them."
                            onChange={onCompEffects}
                        />
                    )}
                </div>
                {browser ? <aside className="map-fx-side" aria-label="Add an effect">{browser}</aside> : null}
            </div>
        </section>
    )
}

// --- the effects browser ----------------------------------------------------

// Which groups of the list are folded away, remembered per browser.
const FOLDED_KEY = 'di.map.fx.folded.v1'
const readFolded = () => {
    try {
        const value = JSON.parse(window.localStorage.getItem(FOLDED_KEY) || '[]')
        return new Set(Array.isArray(value) ? value : [])
    } catch {
        return new Set()
    }
}

// The effects list. Each row: drag it onto the panel, a clip, Preview or
// Output; or + (or double-click, or Enter) adds it to what the panel has
// open. Rows are plain elements, not <button>s: Firefox will not start a
// drag on a button.
export function MapEffectsBrowser({ visual, target, onAdd }) {
    const [query, setQuery] = useState('')
    const [folded, setFoldedState] = useState(readFolded)
    const setFolded = (next) => {
        setFoldedState(next)
        try { window.localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])) } catch { /* private window */ }
    }
    const cssOnly = target === 'clip' && visual ? !visualTakesShaders(visual) : false
    const searching = query.trim() !== ''
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase()
        return EFFECT_GROUPS.map((group) => ({
            ...group,
            effects: effectCatalogue().filter((def) => def.group === group.id && (!q || def.label.toLowerCase().includes(q)))
        })).filter((group) => group.effects.length)
    }, [query])
    const into = target === 'comp' ? 'the whole wall' : (visual ? `“${clipName(visual)}”` : 'the open clip')
    return (
        <div className="map-fx-browser">
            <input
                type="search"
                className="map-fx-search"
                placeholder="Find an effect"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Find an effect"
            />
            <p className="map-fx-hint">+ adds to {into}. Or drag onto the panel, a clip, Preview or Output.</p>
            {groups.map((group) => {
                const shut = !searching && folded.has(group.id)
                return (
                    <div key={group.id} className={`map-fx-group${shut ? ' is-folded' : ''}`}>
                        <button type="button" className="map-fx-group-head" aria-expanded={!shut}
                            onClick={() => {
                                const next = new Set(folded)
                                if (next.has(group.id)) next.delete(group.id)
                                else next.add(group.id)
                                setFolded(next)
                            }}>
                            <span aria-hidden="true">{shut ? '▸' : '▾'}</span>
                            <span className="map-fx-group-name">{group.label}</span>
                            <span className="map-fx-group-count">{group.effects.length}</span>
                        </button>
                        {shut ? null : (
                            <ul>
                                {group.effects.map((def) => {
                                    const dim = cssOnly && !def.css
                                    return (
                                        <li key={def.type}>
                                            <div
                                                className={`map-fx-item${dim ? ' is-dim' : ''}`}
                                                role="button"
                                                tabIndex={0}
                                                draggable="true"
                                                onDragStart={(event) => {
                                                    event.dataTransfer.setData(EFFECT_DRAG_TYPE, def.type)
                                                    event.dataTransfer.effectAllowed = 'copy'
                                                }}
                                                onDoubleClick={() => onAdd(def.type)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAdd(def.type) }
                                                }}
                                                title={dim ? 'Not drawn on a web link or di project' : `Drag ${def.label} where you want it`}
                                            >
                                                <span className="map-fx-item-grip" aria-hidden="true">⠿</span>
                                                <span className="map-fx-item-name">{def.label}</span>
                                                <button type="button" className="map-fx-item-add" draggable="false" tabIndex={-1}
                                                    onClick={(event) => { event.stopPropagation(); onAdd(def.type) }}
                                                    onDoubleClick={(event) => event.stopPropagation()}
                                                    aria-label={`Add ${def.label} to ${into}`} title={`Add to ${into}`}>+</button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// --- the monitors -------------------------------------------------------------

function MonitorScreen({ mapping, aspect, stageProps, onDragOver, onDragLeave, onDrop, overlay = null, onDoubleClick, holderRef = null }) {
    const { frameRef, stage } = useMeasuredStage(aspect)
    return (
        <div className="map-monitor-body" ref={frameRef}>
            {stage.width > 0 ? (
                <div
                    ref={holderRef}
                    role="presentation"
                    className="map-monitor-holder"
                    style={{ width: stage.width, height: stage.height }}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave ? (event) => { if (!event.currentTarget.contains(event.relatedTarget)) onDragLeave(event) } : undefined}
                    onDrop={onDrop ? (event) => onDrop(event, stage) : undefined}
                    onDoubleClick={onDoubleClick}
                >
                    <MapStage mapping={mapping} width={stage.width} height={stage.height} {...stageProps} />
                    {overlay}
                </div>
            ) : null}
        </div>
    )
}

const FULL_SCREEN = [[0, 0], [1, 0], [1, 1], [0, 1]]

// A small JPEG of what a monitor's slice canvas shows, or null while it is
// still (nearly) black — a loop that starts dark gets another look later.
const THUMB_W = 320
const THUMB_H = 180
const snapshotCanvas = (canvas) => new Promise((resolve) => {
    if (!canvas?.width || !canvas?.height) { resolve(null); return }
    const shot = document.createElement('canvas')
    shot.width = THUMB_W
    shot.height = THUMB_H
    const ctx = shot.getContext('2d')
    if (!ctx) { resolve(null); return }
    const scale = Math.max(THUMB_W / canvas.width, THUMB_H / canvas.height)
    const w = canvas.width * scale
    const h = canvas.height * scale
    try {
        ctx.drawImage(canvas, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h)
        const { data } = ctx.getImageData(0, 0, THUMB_W, THUMB_H)
        let lit = 0
        for (let i = 0; i < data.length; i += 4 * 37) if (data[i] + data[i + 1] + data[i + 2] > 90) lit += 1
        if (lit < (data.length / (4 * 37)) * 0.04) { resolve(null); return }
        shot.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82)
    } catch {
        resolve(null)
    }
})

const DEFAULT_OUTPUT = { width: 1920, height: 1080 }

export function MapPreviewMonitor({ mapping, visual, playing, enabled, onEnabled, stageProps, onPlay, onDropEffect, onThumb }) {
    const output = mapping?.output || DEFAULT_OUTPUT
    // The selected visual alone, on one full-frame screen, with its own
    // effects and none of the composition's — Resolume's clip preview.
    const previewMapping = useMemo(() => {
        if (!visual) return null
        return {
            output,
            background: '#000000',
            fade: 0,
            effects: [],
            visuals: [visual],
            playing: visual.id,
            surfaces: [{
                id: 'preview',
                name: 'Preview',
                enabled: true,
                corners: FULL_SCREEN,
                source: { kind: 'wall', ref: '' },
                input: [0, 0, 1, 1],
                resolution: [output.width, output.height],
                opacity: 1
            }]
        }
    }, [visual, output])
    const [over, setOver] = useState(false)

    // Like Resolume, a clip gets its thumbnail from what it shows: an HTML
    // clip has no picture of its own until Preview has run it. Tried every
    // 2.5 s for a while, because a loop may start on black.
    const holderRef = useRef(null)
    const visualId = visual?.id
    const needsThumb = Boolean(enabled && visual && !visual.thumb && visual.source?.kind === 'html' && onThumb)
    useEffect(() => {
        if (!needsThumb) return undefined
        let cancelled = false
        let timer = 0
        let tries = 0
        const attempt = async () => {
            if (cancelled) return
            tries += 1
            const blob = await snapshotCanvas(holderRef.current?.querySelector('.map-mesh-canvas'))
            if (cancelled) return
            if (blob) { onThumb(visualId, blob); return }
            if (tries < 12) timer = setTimeout(attempt, 2500)
        }
        timer = setTimeout(attempt, 2500)
        return () => { cancelled = true; clearTimeout(timer) }
    }, [needsThumb, visualId]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <section className={`map-dock-panel map-monitor${over ? ' is-over' : ''}`} aria-label="Preview">
            <div className="map-monitor-head">
                <h2>Preview</h2>
                <span className="map-monitor-name">{visual ? clipName(visual) : '—'}</span>
                <button type="button" className={`map-mini${enabled ? ' is-on' : ''}`} onClick={() => onEnabled(!enabled)}
                    title="Preview runs its own copy of the visual. Turn it off to give the wall every frame.">{enabled ? 'On' : 'Off'}</button>
                <button type="button" className="map-mini" disabled={!visual || visual.id === playing} onClick={() => visual && onPlay(visual.id)}
                    title="Send this visual to the wall">{visual && visual.id === playing ? 'Playing' : 'Play ▶'}</button>
            </div>
            {visual && enabled && previewMapping ? (
                <MonitorScreen
                    holderRef={holderRef}
                    mapping={previewMapping}
                    aspect={output.width / output.height}
                    stageProps={stageProps}
                    overlay={over ? (
                        <div className="map-drop-zones" aria-hidden="true">
                            <span className="map-drop-zone is-on">Add to “{clipName(visual)}”</span>
                        </div>
                    ) : null}
                    onDragOver={(event) => { if (carriesEffect(event)) { event.preventDefault(); if (!over) setOver(true) } }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(event) => {
                        setOver(false)
                        const type = event.dataTransfer.getData(EFFECT_DRAG_TYPE)
                        if (!type) return
                        event.preventDefault()
                        event.stopPropagation()
                        onDropEffect(type)
                    }}
                    onDoubleClick={() => visual && onPlay(visual.id)}
                />
            ) : (
                <div className="map-monitor-body"><p className="map-empty">{visual ? 'Preview is off.' : 'Click a visual’s name to preview it.'}</p></div>
            )}
        </section>
    )
}

// An effect let go over the Output goes on what the wall shows: the left
// half is the clip that is playing, the right half the whole wall (the
// composition). With nothing playing, all of it is the whole wall.
export function MapOutputMonitor({
    mapping, playingVisual = null, soloSurfaceId, stageProps, referenceUrl, reference,
    onPlayVisual, onDropEffect, onOpenOutput, onOpenMapping
}) {
    const output = mapping?.output || { width: 1920, height: 1080 }
    const [over, setOver] = useState(null)
    const zoneOf = (event) => {
        if (!playingVisual) return 'comp'
        const rect = event.currentTarget.getBoundingClientRect()
        return event.clientX < rect.left + (rect.width / 2) ? 'clip' : 'comp'
    }
    return (
        <section className={`map-dock-panel map-monitor${over ? ' is-over' : ''}`} aria-label="Output">
            <div className="map-monitor-head">
                <h2>Output</h2>
                <span className="map-monitor-name"><span className="map-live-dot" aria-hidden="true" /> {output.width}×{output.height}</span>
                <button type="button" className="map-mini" onClick={onOpenMapping} title="Line the screens up: slices, input, warp, soft edge">Mapping</button>
                <button type="button" className="map-mini" onClick={onOpenOutput} title="Open the wall's own window">Open output</button>
            </div>
            <MonitorScreen
                mapping={mapping}
                aspect={output.width / output.height}
                stageProps={{ ...stageProps, soloSurfaceId }}
                onDoubleClick={onOpenMapping}
                overlay={(
                    <>
                        {reference?.visible && referenceUrl
                            ? <img className="map-reference" src={referenceUrl} alt="" style={{ opacity: reference.opacity }} />
                            : null}
                        {over ? (
                            <div className="map-drop-zones" aria-hidden="true">
                                {playingVisual ? (
                                    <span className={`map-drop-zone${over === 'clip' ? ' is-on' : ''}`}>
                                        Add to “{clipName(playingVisual)}”<small>the clip that is playing</small>
                                    </span>
                                ) : null}
                                <span className={`map-drop-zone${over === 'comp' ? ' is-on' : ''}`}>
                                    Add to the whole wall<small>Composition</small>
                                </span>
                            </div>
                        ) : null}
                    </>
                )}
                onDragOver={(event) => {
                    if (carriesVisual(event)) event.preventDefault()
                    if (carriesEffect(event)) {
                        event.preventDefault()
                        const zone = zoneOf(event)
                        if (zone !== over) setOver(zone)
                    }
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(event) => {
                    setOver(null)
                    const effectType = event.dataTransfer.getData(EFFECT_DRAG_TYPE)
                    if (effectType) {
                        event.preventDefault()
                        event.stopPropagation()
                        onDropEffect(effectType, zoneOf(event))
                        return
                    }
                    // A clip dropped on the Output plays on the whole wall. Not on
                    // the screen under the pointer: on a small monitor of sixteen
                    // panes that would quietly re-source one of them. One screen
                    // alone is set in Screens → Plays.
                    const visualId = event.dataTransfer.getData(VISUAL_DRAG_TYPE)
                    if (!visualId) return
                    event.preventDefault()
                    event.stopPropagation()
                    onPlayVisual(visualId)
                }}
            />
        </section>
    )
}

export { newEffect }
