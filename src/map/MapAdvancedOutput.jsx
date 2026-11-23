import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapSliceCanvas from './MapSliceCanvas.jsx'
import { generateId } from '../shared/projectSchema.js'
import { showFromValue, showOptions, showValue } from './mapMachines.js'
import { isScreenKind, presetScreens, rectCorners, screenInput, screenPresets, boundsOfCorners } from './wallScreens.js'
import {
    frameOf, inputCorners, inputFrameOf, regularGrid, resampleWarp, rotateCorners, setBoxField, setFrameField, sliceFrame, warpPoints
} from './sliceGeometry.js'
import './mapAdvancedOutput.css'

// THE MAPPING WINDOW — di.iiii's own Advanced Output.
//
// Emily asked, 2026-10-25, for the Resolume Arena mapping window, button for
// button: two tabs (Input Selection, Output Transformation), a slice tree
// under its screen, Transform and Edit Points, zoom, hand, snap, grid, typed
// values with − and +, flip, key, black background, brightness, contrast,
// red, green, blue, soft edge, warping with point mode and subdivisions, a
// help box that explains whatever the mouse is over, presets, and
// Cancel / Save & Close.
//
// It edits the same surfaces the desk shows. Cancel puts every slice back the
// way it was when the window opened; Save & Close just closes, because every
// change was already saved as it was made — the wall followed live.

const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4]
const GRIDS = [0, 8, 16, 32, 64]
const PRESET_STORE = 'di.map.presets.v1'
const FLIPS = [
    { id: 'none', label: 'No flip' },
    { id: 'h', label: 'Flip horizontally' },
    { id: 'v', label: 'Flip vertically' },
    { id: 'hv', label: 'Flip both ways' }
]

const readPresets = () => {
    try { return JSON.parse(window.localStorage.getItem(PRESET_STORE) || '[]') || [] } catch { return [] }
}
const writePresets = (list) => {
    try { window.localStorage.setItem(PRESET_STORE, JSON.stringify(list)) } catch { /* private window */ }
}

// What geometry a slice carries, for presets, copy and Cancel.
const SLICE_KEYS = ['name', 'enabled', 'corners', 'input', 'inputRotation', 'warp', 'flip', 'isKey', 'blackBg', 'brightness', 'contrast', 'red', 'green', 'blue', 'softEdge', 'source', 'resolution', 'mask', 'opacity']
const sliceData = (surface) => Object.fromEntries(SLICE_KEYS.filter((key) => surface[key] !== undefined).map((key) => [key, JSON.parse(JSON.stringify(surface[key]))]))

// A pac-man, as Resolume draws its flip buttons.
function FlipIcon({ flip }) {
    const sx = flip === 'h' || flip === 'hv' ? -1 : 1
    const sy = flip === 'v' || flip === 'hv' ? -1 : 1
    return (
        <svg viewBox="-10 -10 20 20" width="18" height="18" aria-hidden="true">
            <g transform={`scale(${sx} ${sy})`}>
                <path d="M0 0 L8 -4.5 A9 9 0 1 0 8 4.5 Z" />
                <circle cx="-1.5" cy="-4.5" r="1.4" className="map-ao-flip-eye" />
            </g>
        </svg>
    )
}

// One typed number with − and +, the row every Resolume property is.
// Dragging the label scrubs the value.
function NumberRow({ label, value, step = 1, min = -Infinity, max = Infinity, digits = 2, onChange, help, bar = null }) {
    const [draft, setDraft] = useState(null)
    const scrub = useRef(null)
    const shown = draft ?? (Number.isFinite(value) ? Number(value.toFixed(digits)) : 0)
    const commit = (next) => {
        const clamped = Math.max(min, Math.min(max, next))
        if (Number.isFinite(clamped)) onChange(clamped)
    }
    return (
        <div className="map-ao-row" data-help={help}>
            <span
                className="map-ao-label is-scrub"
                onPointerDown={(event) => {
                    scrub.current = { x: event.clientX, value }
                    event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                    if (!scrub.current) return
                    const delta = (event.clientX - scrub.current.x) * step * (event.shiftKey ? 10 : 1)
                    commit(scrub.current.value + delta)
                }}
                onPointerUp={() => { scrub.current = null }}
            >{label}</span>
            <input
                className="map-ao-value"
                type="number"
                step={step}
                value={shown}
                onChange={(event) => {
                    setDraft(event.target.value)
                    const next = Number(event.target.value)
                    if (event.target.value !== '' && Number.isFinite(next)) commit(next)
                }}
                onBlur={() => setDraft(null)}
            />
            <button type="button" className="map-ao-step" onClick={(event) => commit(value - (step * (event.shiftKey ? 10 : 1)))} aria-label={`${label} down`}>−</button>
            <button type="button" className="map-ao-step" onClick={(event) => commit(value + (step * (event.shiftKey ? 10 : 1)))} aria-label={`${label} up`}>+</button>
            {bar ? <span className="map-ao-bar"><span style={{ left: `${((value - min) / (max - min)) * 100}%`, background: bar }} /></span> : <span className="map-ao-bar is-empty" />}
        </div>
    )
}

function CheckRow({ label, checked, onChange, help }) {
    return (
        <label className="map-ao-row map-ao-check" data-help={help}>
            <span className="map-ao-label">{label}</span>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        </label>
    )
}

export default function MapAdvancedOutput({
    mapping, surfaces, visuals, output, machines, spaceId, projectId, network, assets,
    applyOps, setOutput, undo, redo, canUndo, canRedo, play, onClose
}) {
    const W = Math.max(1, output.width)
    const H = Math.max(1, output.height)
    const [tab, setTab] = useState('output')
    const [mode, setMode] = useState('transform')
    const [zoom, setZoom] = useState('fit')
    const [fitZoom, setFitZoom] = useState(0.3)
    const [pan, setPan] = useState([0, 0])
    const [hand, setHand] = useState(false)
    const [snap, setSnap] = useState(true)
    const [grid, setGrid] = useState(0)
    const [selectedIds, setSelectedIds] = useState(() => (surfaces[0] ? [surfaces[0].id] : []))
    const [screenSelected, setScreenSelected] = useState(false)
    const [selectedPoints, setSelectedPoints] = useState([])
    const [help, setHelp] = useState('')
    const [menu, setMenu] = useState(null)
    const [addOpen, setAddOpen] = useState(false)
    const [presets, setPresets] = useState(readPresets)
    const [presetName, setPresetName] = useState('')
    const [clipboard, setClipboard] = useState(null)
    const [renaming, setRenaming] = useState(null)
    const [softOpen, setSoftOpen] = useState(false)

    // Cancel's snapshot: the slices and the output as the window found them.
    const [snapshot] = useState(() => ({ surfaces: JSON.parse(JSON.stringify(surfaces)), output: JSON.parse(JSON.stringify(output)) }))

    const byId = useMemo(() => new Map(surfaces.map((surface) => [surface.id, surface])), [surfaces])
    const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean)
    const primary = selected[selected.length - 1] || null
    const z = zoom === 'fit' ? fitZoom : zoom

    useEffect(() => { setSelectedPoints([]) }, [primary?.id, mode, tab])
    // Slices that disappear (undo, another desk) leave the selection.
    useEffect(() => {
        setSelectedIds((ids) => {
            const kept = ids.filter((id) => byId.has(id))
            return kept.length === ids.length ? ids : kept
        })
    }, [byId])

    const update = useCallback((surfaceId, patch) => applyOps([{ type: 'setMappingSurface', payload: { surfaceId, patch } }]), [applyOps])
    const updateMany = useCallback((ids, patchFor) => {
        const ops = ids.map((id) => byId.get(id)).filter(Boolean).map((surface) => ({ type: 'setMappingSurface', payload: { surfaceId: surface.id, patch: patchFor(surface) } }))
        if (ops.length) applyOps(ops)
    }, [applyOps, byId])

    // --- help: whatever the mouse is over says what it does ---------------
    const onHover = (event) => {
        const node = event.target.closest?.('[data-help]')
        const text = node?.getAttribute('data-help') || ''
        if (text !== help) setHelp(text)
    }

    // --- adding, duplicating, deleting -------------------------------------

    const addSlices = useCallback((list) => {
        const made = list.map((slice) => ({ ...slice, id: generateId('srf') }))
        applyOps(made.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })))
        setSelectedIds(made.map((surface) => surface.id))
        setScreenSelected(false)
    }, [applyOps])

    const sliceCount = surfaces.filter((surface) => isScreenKind(surface.source.kind)).length
    const addSlice = () => {
        const input = [0.3, 0.3, 0.4, 0.4]
        addSlices([{
            name: `Slice ${sliceCount + 1}`, corners: rectCorners(input), input,
            source: { kind: 'wall', ref: '' },
            resolution: [Math.round(input[2] * W), Math.round(input[3] * H)]
        }])
    }
    const addMask = () => addSlices([{
        name: `Mask ${surfaces.filter((surface) => /^Mask/.test(surface.name)).length + 1}`,
        corners: rectCorners([0.35, 0.35, 0.3, 0.3]),
        source: { kind: 'colour', ref: '#000000' },
        resolution: [Math.round(0.3 * W), Math.round(0.3 * H)]
    }])
    const duplicate = () => {
        if (!selected.length) return
        addSlices(selected.map((surface) => ({
            ...sliceData(surface),
            name: `${surface.name || 'Slice'} copy`,
            corners: surface.corners.map(([x, y]) => [x + 0.02, y + 0.02])
        })))
    }
    const remove = () => {
        if (!selected.length) return
        applyOps(selected.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })))
        setSelectedIds([])
    }
    const paste = () => {
        if (!clipboard?.length) return
        addSlices(clipboard.map((data) => ({ ...data, corners: data.corners.map(([x, y]) => [x + 0.02, y + 0.02]) })))
    }

    // --- context menu actions -------------------------------------------
    const actions = {
        duplicate,
        delete: remove,
        matchOutput: () => updateMany(selectedIds, (surface) => ({ corners: rectCorners(screenInput(surface)) })),
        matchInput: () => updateMany(selectedIds, (surface) => ({ input: boundsOfCorners(surface.corners), inputRotation: 0 })),
        fit: () => updateMany(selectedIds, () => ({ corners: rectCorners([0, 0, 1, 1]) })),
        resetWarp: () => updateMany(selectedIds, () => ({ warp: null })),
        rotateCw: () => updateMany(selectedIds, (surface) => {
            const quad = surface.corners.map(([x, y]) => [x * W, y * H])
            const frame = frameOf(quad)
            return { corners: rotateCorners(quad, 90, [frame.x, frame.y]).map(([x, y]) => [x / W, y / H]) }
        }),
        flipH: () => updateMany(selectedIds, (surface) => ({ flip: { none: 'h', h: 'none', v: 'hv', hv: 'v' }[surface.flip || 'none'] })),
        flipV: () => updateMany(selectedIds, (surface) => ({ flip: { none: 'v', v: 'none', h: 'hv', hv: 'h' }[surface.flip || 'none'] }))
    }

    // --- presets ------------------------------------------------------------
    const replaceWith = (list) => {
        applyOps([
            ...surfaces.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })),
            ...list.map((slice) => ({ type: 'createMappingSurface', payload: { surface: { ...slice, id: generateId('srf') } } }))
        ])
        setSelectedIds([])
    }
    const onPreset = (value) => {
        if (value.startsWith('layout:')) {
            const preset = screenPresets.find((entry) => `layout:${entry.id}` === value)
            if (preset) replaceWith(presetScreens(preset, output))
        } else if (value.startsWith('saved:')) {
            const preset = presets.find((entry) => `saved:${entry.name}` === value)
            if (preset) {
                replaceWith(preset.slices)
                if (preset.output) setOutput({ output: { ...output, width: preset.output.width, height: preset.output.height } })
            }
        } else if (value.startsWith('delete:')) {
            const next = presets.filter((entry) => `delete:${entry.name}` !== value)
            setPresets(next)
            writePresets(next)
        }
    }
    const savePreset = () => {
        const name = presetName.trim()
        if (!name) return
        const next = [...presets.filter((entry) => entry.name !== name), { name, output: { width: W, height: H }, slices: surfaces.map(sliceData) }]
        setPresets(next)
        writePresets(next)
        setPresetName('')
    }

    // --- Cancel / Save & Close -------------------------------------------
    const cancel = () => {
        const before = snapshot
        const beforeIds = new Set(before.surfaces.map((surface) => surface.id))
        const ops = [
            ...surfaces.filter((surface) => !beforeIds.has(surface.id)).map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })),
            ...before.surfaces.map((surface) => (byId.has(surface.id)
                ? { type: 'setMappingSurface', payload: { surfaceId: surface.id, patch: { ...sliceData(surface), warp: surface.warp || null, input: surface.input || null } } }
                : { type: 'createMappingSurface', payload: { surface } })),
            { type: 'reorderMappingSurfaces', payload: { surfaceIds: before.surfaces.map((surface) => surface.id) } }
        ]
        if (before.output.width !== output.width || before.output.height !== output.height || showValue(before.output.show) !== showValue(output.show)) {
            ops.push({ type: 'setMappingState', payload: { patch: { output: before.output } } })
        }
        applyOps(ops)
        onClose()
    }

    // --- keyboard -----------------------------------------------------------
    const nudge = useCallback((dx, dy) => {
        if (!selected.length) return
        if (tab === 'input') {
            updateMany(selectedIds, (surface) => {
                const input = screenInput(surface)
                return { input: [input[0] + (dx / W), input[1] + (dy / H), input[2], input[3]] }
            })
            return
        }
        if (mode === 'points' && primary && selectedPoints.length) {
            const { columns, rows, points } = warpPoints(primary.warp || { divisionsX: 0, divisionsY: 0 })
            const quad = primary.corners.map(([x, y]) => [x * W, y * H])
            // Grid index -> corner (TL, TR, BR, BL), or -1 for a point between.
            const cornerOf = (index) => [0, columns - 1, (columns * rows) - 1, (rows - 1) * columns].indexOf(index)
            const nextQuad = quad.map((corner) => [...corner])
            selectedPoints.forEach((index) => {
                const corner = cornerOf(index)
                if (corner !== -1) nextQuad[corner] = [nextQuad[corner][0] + dx, nextQuad[corner][1] + dy]
            })
            const patch = { corners: nextQuad.map(([x, y]) => [x / W, y / H]) }
            const interior = selectedPoints.filter((index) => cornerOf(index) === -1)
            if (interior.length) {
                // A nudge in output pixels, turned into the slice's own square.
                const sx = dx / Math.max(1, frameOf(quad).width)
                const sy = dy / Math.max(1, frameOf(quad).height)
                const next = points.map((point) => [...point])
                interior.forEach((index) => { next[index] = [next[index][0] + sx, next[index][1] + sy] })
                patch.warp = { ...(primary.warp || { mode: 'linear', divisionsX: 0, divisionsY: 0 }), points: next }
            }
            update(primary.id, patch)
            return
        }
        updateMany(selectedIds, (surface) => ({ corners: surface.corners.map(([x, y]) => [x + (dx / W), y + (dy / H)]) }))
    }, [selected, tab, mode, primary, selectedPoints, selectedIds, W, H, update, updateMany])

    useEffect(() => {
        const onKey = (event) => {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return
            const key = event.key.toLowerCase()
            if (event.ctrlKey || event.metaKey) {
                if (key === 'z' && !event.shiftKey) { undo(); event.preventDefault() }
                else if ((key === 'z' && event.shiftKey) || key === 'y') { redo(); event.preventDefault() }
                else if (key === 'a') {
                    if (mode === 'points' && primary && tab === 'output') {
                        const { columns, rows } = warpPoints(primary.warp || { divisionsX: 0, divisionsY: 0 })
                        setSelectedPoints(Array.from({ length: columns * rows }, (_, index) => index))
                    } else setSelectedIds(surfaces.map((surface) => surface.id))
                    event.preventDefault()
                } else if (key === 'd') { duplicate(); event.preventDefault() }
                else if (key === 'c') { setClipboard(selected.map(sliceData)); event.preventDefault() }
                else if (key === 'v') { paste(); event.preventDefault() }
                return
            }
            const step = event.shiftKey ? 10 : 1
            switch (event.key) {
                case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break
                case 'ArrowRight': nudge(step, 0); event.preventDefault(); break
                case 'ArrowUp': nudge(0, -step); event.preventDefault(); break
                case 'ArrowDown': nudge(0, step); event.preventDefault(); break
                case 'Delete': case 'Backspace': if (mode === 'transform' || tab === 'input') { remove(); event.preventDefault() } break
                case 'Escape': setMenu(null); setSelectedPoints([]); break
                case 't': case 'T': setMode('transform'); break
                case 'e': case 'E': if (tab === 'output') setMode('points'); break
                case 'h': case 'H': setHand((value) => !value); break
                case 's': case 'S': setSnap((value) => !value); break
                case 'f': case 'F': setZoom('fit'); setPan([0, 0]); break
                case '+': case '=': setZoom(Math.min(8, z * 1.25)); break
                case '-': setZoom(Math.max(0.02, z / 1.25)); break
                default:
                    // The visuals still play from here: 1-9, 0 for black.
                    if (/^[0-9]$/.test(event.key) && visuals.length) {
                        const index = Number(event.key) - 1
                        play(index < 0 ? '' : (visuals[index]?.id ?? ''))
                    }
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    // --- the selected slice's numbers ------------------------------------
    const quadPx = primary ? primary.corners.map(([x, y]) => [x * W, y * H]) : null
    // Read from the shape as it is drawn: a bent or keystoned slice reads as
    // the straight box round it, as in Resolume.
    const outFrame = quadPx ? sliceFrame(quadPx, primary.warp) : null
    const inFrame = primary ? inputFrameOf(screenInput(primary), primary.inputRotation || 0, W, H) : null
    const setOutField = (field, value) => {
        if (!primary) return
        if (selected.length > 1 && (field === 'x' || field === 'y' || field === 'left' || field === 'top')) {
            const delta = value - outFrame[field]
            updateMany(selectedIds, (surface) => ({ corners: surface.corners.map(([x, y]) => (field === 'x' || field === 'left' ? [x + (delta / W), y] : [x, y + (delta / H)])) }))
            return
        }
        const next = outFrame.boxed ? setBoxField(quadPx, outFrame, field, value) : setFrameField(quadPx, field, value)
        update(primary.id, { corners: next.map(([x, y]) => [x / W, y / H]) })
    }
    const setInField = (field, value) => {
        if (!primary) return
        const quad = inputCorners(screenInput(primary), primary.inputRotation || 0, W, H)
        const next = frameOf(setFrameField(quad, field, value))
        update(primary.id, {
            input: [(next.x - (next.width / 2)) / W, (next.y - (next.height / 2)) / H, Math.max(1, next.width) / W, Math.max(1, next.height) / H],
            inputRotation: Math.round(next.rotation * 1e4) / 1e4
        })
    }
    const setAll = (patchFor) => updateMany(selectedIds, patchFor)

    const warp = primary?.warp || null
    const divisionsX = warp?.divisionsX || 0
    const divisionsY = warp?.divisionsY || 0
    const setDivisions = (dx, dy) => {
        if (!primary) return
        const base = warp || { mode: 'linear', divisionsX: 0, divisionsY: 0, points: regularGrid(0, 0) }
        update(primary.id, { warp: resampleWarp(base, Math.max(0, Math.min(4, dx)), Math.max(0, Math.min(4, dy))) })
    }
    const playsValue = primary?.source.kind === 'visual' ? primary.source.ref : (primary?.source.kind === 'wall' ? 'wall' : 'other')
    const isHtmlish = (() => {
        if (!primary) return false
        const visual = primary.source.kind === 'wall'
            ? visuals.find((entry) => entry.id === mapping?.playing)
            : visuals.find((entry) => entry.id === primary.source.ref)
        const kind = visual?.source.kind || primary.source.kind
        // An uploaded HTML visual bends through the frame relay; these can't.
        return ['url', 'project', 'network', 'stream', 'ndi'].includes(kind)
    })()

    // Tree order: top of the list is drawn on top, as in Resolume.
    const tree = [...surfaces].reverse()
    const deviceLine = output.show ? (showOptions(machines, output.show).find((option) => option.value === showValue(output.show))?.label || 'a machine') : 'Virtual Output'
    const [dragRow, setDragRow] = useState(null)

    const zoomLabel = `${Math.round(z * 100)}%`

    return (
        <div className="map-ao" role="dialog" aria-label="Mapping" onMouseOver={onHover} onFocus={onHover}
            onPointerDown={() => { if (menu) setMenu(null); if (addOpen) setAddOpen(false) }}>
            <div className="map-ao-top">
                <div className="map-ao-presets" data-help="Presets: start from a ready layout, or save this whole setup by name on this machine and bring it back later.">
                    <select value="" onChange={(event) => onPreset(event.target.value)}>
                        <option value="">Presets</option>
                        <optgroup label="Layouts (replace all slices)">
                            {screenPresets.map((preset) => <option key={preset.id} value={`layout:${preset.id}`}>{preset.label}</option>)}
                        </optgroup>
                        {presets.length ? (
                            <optgroup label="Saved on this machine">
                                {presets.map((preset) => <option key={preset.name} value={`saved:${preset.name}`}>{preset.name}</option>)}
                            </optgroup>
                        ) : null}
                        {presets.length ? (
                            <optgroup label="Delete a saved preset">
                                {presets.map((preset) => <option key={`d${preset.name}`} value={`delete:${preset.name}`}>✕ {preset.name}</option>)}
                            </optgroup>
                        ) : null}
                    </select>
                </div>
                <div className="map-ao-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'input'} className={tab === 'input' ? 'is-on' : ''}
                        onClick={() => { setTab('input'); setMode('transform') }}
                        data-help="Input Selection: which part of the composition each slice takes.">Input Selection</button>
                    <button type="button" role="tab" aria-selected={tab === 'output'} className={tab === 'output' ? 'is-on' : ''}
                        onClick={() => setTab('output')}
                        data-help="Output Transformation: where each slice lands on the wall, and how it bends.">Output Transformation</button>
                </div>
                <div className="map-ao-comp" data-help="The composition: the size of the picture every slice takes its piece from — the output of this mapping.">
                    Composition {W}×{H}
                </div>
            </div>

            <div className="map-ao-body">
                <aside className="map-ao-left">
                    <div className="map-ao-addbar">
                        <button type="button" className="map-ao-add" onClick={(event) => { event.stopPropagation(); setAddOpen((value) => !value) }}
                            onPointerDown={(event) => event.stopPropagation()}
                            data-help="Add a slice, a mask, or a whole layout of slices.">＋ ▾</button>
                        {addOpen ? (
                            <div className="map-ao-menu map-ao-addmenu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
                                <button type="button" role="menuitem" onClick={() => { addSlice(); setAddOpen(false) }}>Slice</button>
                                <button type="button" role="menuitem" onClick={() => { addMask(); setAddOpen(false) }}>Mask</button>
                                <div className="map-ao-menu-sep" />
                                {screenPresets.map((preset) => (
                                    <button key={preset.id} type="button" role="menuitem" onClick={() => {
                                        addSlices(presetScreens(preset, output, sliceCount + 1))
                                        setAddOpen(false)
                                    }}>Slices: {preset.label}</button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className="map-ao-tree" role="tree">
                        <div
                            role="treeitem"
                            aria-selected={screenSelected}
                            tabIndex={0}
                            className={`map-ao-screen${screenSelected ? ' is-selected' : ''}`}
                            onClick={() => { setScreenSelected(true); setSelectedIds([]) }}
                            onKeyDown={(event) => { if (event.key === 'Enter') { setScreenSelected(true); setSelectedIds([]) } }}
                            data-help="The screen: one output of this mapping. Its device is the machine and display the wall plays on."
                        >
                            <input type="checkbox" checked={surfaces.some((surface) => surface.enabled)} aria-label="All slices on"
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => applyOps(surfaces.map((surface) => ({ type: 'setMappingSurface', payload: { surfaceId: surface.id, patch: { enabled: event.target.checked } } })))} />
                            <strong>Screen 1</strong>
                        </div>
                        <div className="map-ao-device">▾ {deviceLine} ({W}×{H})</div>
                        {tree.map((surface) => (
                            <div
                                key={surface.id}
                                role="treeitem"
                                aria-selected={selectedIds.includes(surface.id)}
                                tabIndex={0}
                                draggable
                                className={`map-ao-slicerow${selectedIds.includes(surface.id) ? ' is-selected' : ''}${dragRow === surface.id ? ' is-dragging' : ''}`}
                                onClick={(event) => {
                                    setScreenSelected(false)
                                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                                        setSelectedIds((ids) => (ids.includes(surface.id) ? ids.filter((id) => id !== surface.id) : [...ids, surface.id]))
                                    } else setSelectedIds([surface.id])
                                }}
                                onKeyDown={(event) => { if (event.key === 'Enter') setSelectedIds([surface.id]) }}
                                onDoubleClick={() => setRenaming(surface.id)}
                                onContextMenu={(event) => {
                                    event.preventDefault()
                                    if (!selectedIds.includes(surface.id)) setSelectedIds([surface.id])
                                    setMenu({ x: event.clientX, y: event.clientY })
                                }}
                                onDragStart={(event) => { setDragRow(surface.id); event.dataTransfer.effectAllowed = 'move' }}
                                onDragEnd={() => setDragRow(null)}
                                onDragOver={(event) => { if (dragRow) event.preventDefault() }}
                                onDrop={(event) => {
                                    event.preventDefault()
                                    if (!dragRow || dragRow === surface.id) return
                                    // The tree is front-first; the document is back-first.
                                    const ids = tree.map((entry) => entry.id).filter((id) => id !== dragRow)
                                    ids.splice(ids.indexOf(surface.id), 0, dragRow)
                                    applyOps([{ type: 'reorderMappingSurfaces', payload: { surfaceIds: [...ids].reverse() } }])
                                    setDragRow(null)
                                }}
                                data-help="A slice: one piece of the composition put somewhere on the wall. Click to select, shift-click for more, double-click to rename, drag to change what is in front. Right-click for more."
                            >
                                <input type="checkbox" checked={surface.enabled} aria-label={`${surface.name} on`}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => update(surface.id, { enabled: event.target.checked })} />
                                {renaming === surface.id ? (
                                    <input
                                        className="map-ao-rename"
                                        defaultValue={surface.name}
                                        // eslint-disable-next-line jsx-a11y/no-autofocus
                                        autoFocus
                                        onClick={(event) => event.stopPropagation()}
                                        onBlur={(event) => { update(surface.id, { name: event.target.value }); setRenaming(null) }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') event.currentTarget.blur()
                                            if (event.key === 'Escape') setRenaming(null)
                                        }}
                                    />
                                ) : <span className="map-ao-slicename">{surface.name || surface.id}</span>}
                                {!isScreenKind(surface.source.kind) ? <span className="map-ao-kind">{surface.source.kind === 'colour' && /^Mask/.test(surface.name) ? 'mask' : surface.source.kind}</span> : null}
                            </div>
                        ))}
                        {!surfaces.length ? <p className="map-ao-empty">No slices. Use ＋ to add one, or pick a layout from Presets.</p> : null}
                    </div>
                    <div className="map-ao-help" aria-live="polite">
                        <h3>Help</h3>
                        <p>{help || 'Move your mouse over the interface element that you would like more info about.'}</p>
                    </div>
                </aside>

                <main className="map-ao-main">
                    <div className="map-ao-toolbar">
                        <select className="map-ao-zoom" value="" onChange={(event) => {
                            const value = event.target.value
                            if (value === 'fit') { setZoom('fit'); setPan([0, 0]) } else if (value) setZoom(Number(value))
                        }} data-help="Zoom. The wheel zooms where the mouse is; F fits the whole composition.">
                            <option value="">{zoomLabel}</option>
                            <option value="fit">Fit</option>
                            {ZOOMS.map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                        </select>
                        <button type="button" className="map-ao-tool" onClick={undo} disabled={!canUndo()} aria-label="Undo" data-help="Undo (Ctrl+Z).">↶</button>
                        <button type="button" className="map-ao-tool" onClick={redo} disabled={!canRedo()} aria-label="Redo" data-help="Redo (Shift+Ctrl+Z).">↷</button>
                        <button type="button" className={`map-ao-tool${hand ? ' is-on' : ''}`} onClick={() => setHand((value) => !value)} aria-label="Hand" data-help="Hand: drag to move the view. Holding space does the same with any tool (H).">✋</button>
                        <button type="button" className={`map-ao-tool${snap ? ' is-on' : ''}`} onClick={() => setSnap((value) => !value)} aria-label="Snap" data-help="Snap: corners and points agree with other slices, the frame, its middle and the grid. Hold alt to place freely (S).">
                            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 3h4v7a2 2 0 0 0 4 0V3h4v7a6 6 0 0 1-12 0z" /><rect x="4" y="3" width="4" height="3" className="map-ao-magnet-tip" /><rect x="12" y="3" width="4" height="3" className="map-ao-magnet-tip" /></svg>
                        </button>
                        <select className={`map-ao-gridpick${grid ? ' is-on' : ''}`} value={grid} onChange={(event) => setGrid(Number(event.target.value))} aria-label="Grid" data-help="Grid: lines across the composition to line things up against; with Snap on, corners snap to them.">
                            {GRIDS.map((value) => <option key={value} value={value}>{value ? `▦ ${value}` : '▦ off'}</option>)}
                        </select>
                        <span className="map-ao-spacer" />
                        {tab === 'output' ? (
                            <>
                                <button type="button" className={`map-ao-mode${mode === 'points' ? ' is-on' : ''}`} onClick={() => setMode('points')}
                                    data-help="Edit Points: bend the picture by its warp points. Corners pin the slice; the points between bend it. Set Subdivisions to get more points (E).">＋ Edit Points</button>
                                <button type="button" className={`map-ao-mode${mode === 'transform' ? ' is-on' : ''}`} onClick={() => setMode('transform')}
                                    data-help="Transform: move, scale and rotate whole slices. Corners scale, edges stretch, drag just outside a corner to rotate, shift keeps the shape, alt scales from the middle (T).">⛶ Transform</button>
                            </>
                        ) : null}
                    </div>
                    <MapSliceCanvas
                        tab={tab}
                        mode={tab === 'input' ? 'transform' : mode}
                        mapping={mapping}
                        surfaces={surfaces}
                        W={W}
                        H={H}
                        zoom={zoom}
                        onZoom={setZoom}
                        pan={pan}
                        onPan={setPan}
                        hand={hand}
                        snap={snap}
                        grid={grid}
                        selectedIds={selectedIds}
                        onSelect={(ids) => { setSelectedIds(ids); if (ids.length) setScreenSelected(false) }}
                        selectedPoints={selectedPoints}
                        onSelectPoints={setSelectedPoints}
                        applyOps={applyOps}
                        live
                        spaceId={spaceId}
                        projectId={projectId}
                        network={network}
                        assets={assets}
                        onFit={setFitZoom}
                        onContextMenu={(surfaceId, x, y) => { if (surfaceId) setMenu({ x, y }) }}
                    />
                </main>

                <aside className="map-ao-right">
                    {screenSelected || !primary ? (
                        <div className="map-ao-props">
                            <div className="map-ao-title">Screen 1</div>
                            <div className="map-ao-row" data-help="Device: which machine and display this screen plays on. Any screen = the one output window a stage machine already runs.">
                                <span className="map-ao-label">Device</span>
                                <select className="map-ao-select" value={showValue(output.show)} onChange={(event) => {
                                    const show = showFromValue(event.target.value, machines)
                                    const { show: _dropped, ...rest } = output
                                    setOutput({ output: show ? { ...rest, show } : rest })
                                }}>
                                    {showOptions(machines, output.show).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </div>
                            <NumberRow label="Width" value={W} step={1} min={1} max={16384} digits={0} help="The composition's width in pixels — your output." onChange={(value) => setOutput({ output: { ...output, width: Math.round(value) } })} />
                            <NumberRow label="Height" value={H} step={1} min={1} max={16384} digits={0} help="The composition's height in pixels." onChange={(value) => setOutput({ output: { ...output, height: Math.round(value) } })} />
                            {!primary ? <p className="map-ao-empty">Select a slice to change it.</p> : null}
                        </div>
                    ) : (
                        <div className="map-ao-props">
                            <div className="map-ao-title">{selected.length > 1 ? `${primary.name} + ${selected.length - 1}` : (primary.name || 'Slice')}</div>
                            <div className="map-ao-row" data-help="Input Source: Composition shows this slice's piece of whatever is playing on the wall; a visual plays that one visual on this slice alone.">
                                <span className="map-ao-label">Input Source</span>
                                <select className="map-ao-select" value={playsValue} onChange={(event) => {
                                    const value = event.target.value
                                    if (value === 'other') return
                                    setAll(() => ({ source: value === 'wall' ? { kind: 'wall', ref: '' } : { kind: 'visual', ref: value } }))
                                }}>
                                    <option value="wall">Composition</option>
                                    {visuals.map((visual) => <option key={visual.id} value={visual.id}>{visual.name}</option>)}
                                    {playsValue === 'other' ? <option value="other">{primary.source.kind} (own source)</option> : null}
                                </select>
                            </div>

                            {tab === 'input' && primary.source.kind === 'wall' ? (
                                <>
                                    <NumberRow label="X" value={inFrame.x} help="Centre of the input piece, across, in composition pixels." onChange={(v) => setInField('x', v)} />
                                    <NumberRow label="Y" value={inFrame.y} help="Centre of the input piece, down." onChange={(v) => setInField('y', v)} />
                                    <NumberRow label="Left" value={inFrame.left} help="Left edge of the input piece." onChange={(v) => setInField('left', v)} />
                                    <NumberRow label="Top" value={inFrame.top} help="Top edge of the input piece." onChange={(v) => setInField('top', v)} />
                                    <NumberRow label="Width" value={inFrame.width} min={1} help="Width of the input piece." onChange={(v) => setInField('width', v)} />
                                    <NumberRow label="Height" value={inFrame.height} min={1} help="Height of the input piece." onChange={(v) => setInField('height', v)} />
                                    <NumberRow label="Rotation" value={inFrame.rotation} min={-180} max={180} help="Turn the input piece, in degrees." onChange={(v) => setInField('rotation', v)} />
                                </>
                            ) : null}
                            {tab === 'input' && primary.source.kind !== 'wall' ? (
                                <p className="map-ao-empty">This slice plays its own source, so it takes nothing from the composition. Set Input Source to Composition to choose a piece.</p>
                            ) : null}

                            {tab === 'output' && mode === 'transform' ? (
                                <>
                                    <NumberRow label="X" value={outFrame.x} help="Centre of the slice on the wall, across, in output pixels." onChange={(v) => setOutField('x', v)} />
                                    <NumberRow label="Y" value={outFrame.y} help="Centre of the slice on the wall, down." onChange={(v) => setOutField('y', v)} />
                                    <NumberRow label="Left" value={outFrame.left} help="Left edge of the slice." onChange={(v) => setOutField('left', v)} />
                                    <NumberRow label="Top" value={outFrame.top} help="Top edge of the slice." onChange={(v) => setOutField('top', v)} />
                                    <NumberRow label="Width" value={outFrame.width} min={1} help="Width of the slice. A keystoned slice keeps its keystone." onChange={(v) => setOutField('width', v)} />
                                    <NumberRow label="Height" value={outFrame.height} min={1} help="Height of the slice." onChange={(v) => setOutField('height', v)} />
                                    <NumberRow label="Rotation" value={outFrame.rotation} min={-180} max={180} help="Turn the slice about its centre, in degrees." onChange={(v) => setOutField('rotation', v)} />
                                </>
                            ) : null}

                            <div className="map-ao-row" data-help="Flip: mirror the picture inside the slice — for a projector bouncing off a mirror, or a screen hung upside down.">
                                <span className="map-ao-label">Flip</span>
                                <span className="map-ao-flips">
                                    {FLIPS.map((flip) => (
                                        <button key={flip.id} type="button" aria-label={flip.label} title={flip.label}
                                            className={`map-ao-flip${(primary.flip || 'none') === flip.id ? ' is-on' : ''}`}
                                            onClick={() => setAll(() => ({ flip: flip.id }))}>
                                            <FlipIcon flip={flip.id} />
                                        </button>
                                    ))}
                                </span>
                            </div>
                            <CheckRow label="Is Key" checked={Boolean(primary.isKey)} onChange={(value) => setAll(() => ({ isKey: value }))}
                                help="Is Key: this slice becomes a luma key — where it is dark, the slices under it disappear; where it is light, they show." />
                            <CheckRow label="Black BG" checked={primary.blackBg !== false} onChange={(value) => setAll(() => ({ blackBg: value }))}
                                help="Black BG: fill the slice with black behind its picture, so nothing under it shows through the transparent parts." />
                            <NumberRow label="Brightness" value={(primary.brightness ?? 1) - 1} step={0.01} min={-1} max={1} bar="var(--ui-accent)" help="Brightness, to match this slice against its neighbour." onChange={(v) => setAll(() => ({ brightness: Math.round((1 + v) * 1e4) / 1e4 }))} />
                            <NumberRow label="Contrast" value={(primary.contrast ?? 1) - 1} step={0.01} min={-1} max={1} bar="var(--ui-accent)" help="Contrast." onChange={(v) => setAll(() => ({ contrast: Math.round((1 + v) * 1e4) / 1e4 }))} />
                            <NumberRow label="Red" value={primary.red || 0} step={0.01} min={-1} max={1} bar="#d65a5a" help="Red: more or less red in this slice — two projectors are never the same colour." onChange={(v) => setAll(() => ({ red: v }))} />
                            <NumberRow label="Green" value={primary.green || 0} step={0.01} min={-1} max={1} bar="#5aa86a" help="Green." onChange={(v) => setAll(() => ({ green: v }))} />
                            <NumberRow label="Blue" value={primary.blue || 0} step={0.01} min={-1} max={1} bar="#5a7ad6" help="Blue." onChange={(v) => setAll(() => ({ blue: v }))} />

                            <div className="map-ao-section">
                                <label className="map-ao-row map-ao-check map-ao-sectionhead" data-help="Soft Edge: fade the slice out towards its edges, so two overlapping projectors blend into one picture without a bright seam.">
                                    <input type="checkbox" checked={Boolean(primary.softEdge?.enabled)}
                                        onChange={(event) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), enabled: event.target.checked } }))} />
                                    <span className="map-ao-label">Soft Edge</span>
                                    <button type="button" className="map-ao-fold" onClick={(event) => { event.preventDefault(); setSoftOpen((value) => !value) }}>{softOpen ? '▾' : '▸'}</button>
                                </label>
                                {softOpen ? ['left', 'right', 'top', 'bottom'].map((side) => (
                                    <NumberRow key={side} label={side[0].toUpperCase() + side.slice(1)} value={(primary.softEdge?.[side] || 0) * 100} step={0.5} min={0} max={50} digits={1}
                                        help={`How far in from the ${side} edge the fade reaches, in percent of the slice.`}
                                        onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), enabled: true, [side]: v / 100 } }))} />
                                )) : null}
                                {softOpen ? (
                                    <>
                                        <NumberRow label="Power" value={primary.softEdge?.power ?? 2} step={0.05} min={0.1} max={10} help="Power: how steep the fade's curve is." onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), power: v } }))} />
                                        <NumberRow label="Luminance" value={primary.softEdge?.luminance ?? 0.5} step={0.01} min={0} max={1} help="Luminance: how bright the fade is at its middle." onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), luminance: v } }))} />
                                        <NumberRow label="Gamma" value={primary.softEdge?.gamma ?? 1} step={0.01} min={0.1} max={4} help="Gamma: match the fade to how your projector shows dark greys." onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), gamma: v } }))} />
                                    </>
                                ) : null}
                            </div>

                            {tab === 'output' && mode === 'points' ? (
                                <div className="map-ao-section">
                                    <div className="map-ao-sectiontitle">Warping</div>
                                    <div className="map-ao-row" data-help="Point Mode: Linear bends straight between points, Bezier bends smoothly through them, Perspective uses only the four corners.">
                                        <span className="map-ao-label">Point Mode</span>
                                        <select className="map-ao-select" value={warp?.mode || 'linear'} onChange={(event) => update(primary.id, {
                                            warp: { ...(warp || { divisionsX: 0, divisionsY: 0, points: regularGrid(0, 0) }), mode: event.target.value }
                                        })}>
                                            <option value="linear">Linear</option>
                                            <option value="bezier">Bezier</option>
                                            <option value="perspective">Perspective</option>
                                        </select>
                                    </div>
                                    <NumberRow label="Subdivisions X" value={divisionsX} step={1} min={0} max={4} digits={0} help="Subdivisions X: more points across. Each step doubles them; the shape you already bent is kept." onChange={(v) => setDivisions(Math.round(v), divisionsY)} />
                                    <NumberRow label="Subdivisions Y" value={divisionsY} step={1} min={0} max={4} digits={0} help="Subdivisions Y: more points down." onChange={(v) => setDivisions(divisionsX, Math.round(v))} />
                                    {isHtmlish && warp && warp.mode !== 'perspective' ? (
                                        <p className="map-ao-note">This slice is showing a web link or a live input. Those can’t be bent between points, so on the wall it follows its four corners only. Uploaded HTML visuals, videos, images, cameras and test cards bend fully.</p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                </aside>
            </div>

            <div className="map-ao-bottom">
                <div className="map-ao-presetsave" data-help="Save this whole setup — every slice and the composition size — as a preset on this machine.">
                    <input type="text" placeholder="Preset name" value={presetName} onChange={(event) => setPresetName(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') savePreset() }} />
                    <button type="button" className="map-ao-btn" onClick={savePreset} disabled={!presetName.trim()}>Save preset</button>
                </div>
                <span className="map-ao-spacer" />
                <button type="button" className="map-ao-btn" onClick={cancel} data-help="Cancel: put every slice back the way it was when you opened this window.">Cancel</button>
                <button type="button" className="map-ao-btn is-primary" onClick={onClose} data-help="Save & Close: keep everything. The wall has been following every change already.">Save &amp; Close</button>
            </div>

            {menu ? (
                <div className="map-ao-menu map-ao-context" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
                    {[
                        ['duplicate', 'Duplicate', 'Ctrl+D'],
                        ['delete', 'Delete', 'Del'],
                        null,
                        ['matchOutput', 'Match output to input', ''],
                        ['matchInput', 'Match input to output', ''],
                        ['fit', 'Fit to composition', ''],
                        ['resetWarp', 'Reset warp points', ''],
                        null,
                        ['rotateCw', 'Rotate 90°', ''],
                        ['flipH', 'Flip horizontally', ''],
                        ['flipV', 'Flip vertically', '']
                    ].map((entry, index) => (entry ? (
                        <button key={entry[0]} type="button" role="menuitem" onClick={() => { actions[entry[0]](); setMenu(null) }}>
                            <span>{entry[1]}</span><kbd>{entry[2]}</kbd>
                        </button>
                    ) : (
                         
                        <div key={`sep${index}`} className="map-ao-menu-sep" />
                    )))}
                </div>
            ) : null}
        </div>
    )
}
