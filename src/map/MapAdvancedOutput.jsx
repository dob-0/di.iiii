import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapSliceCanvas, { cornerIndexOfPoint } from './MapSliceCanvas.jsx'
import { MapAutopilot, ParamRow } from './MapDeskDock.jsx'
import { resolveMapSourceRef } from './MapSourceView.jsx'
import { generateId } from '../shared/projectSchema.js'
import { showFromValue, showOptions, showValue } from './mapMachines.js'
import { isScreenKind, presetScreens, rectCorners, screenInput, screenPresets, boundsOfCorners } from './wallScreens.js'
import {
    frameOf, inputCorners, inputFrameOf, regularGrid, resampleWarp, rotateCorners, setBoxField, setFrameField, sliceFrame, warpPoints
} from './sliceGeometry.js'
import './mapAdvancedOutput.css'

// THE MAPPING WINDOW — where the pieces of the wall are lined up.
//
// 2026-11-11, Emily: the first version (10-25) copied Resolume's Advanced
// Output button for button; now she wants "comfortable to use but not like
// resolume reverse engineered". So this is di.iiii's own:
//
//   ONE view of the wall. No Input/Output tabs and no Transform/Points modes:
//   what is under the pointer decides what a drag does (MapSliceCanvas.jsx),
//   and the hint line at the bottom says it in words.
//   What a piece TAKES from the picture is a small box in the side panel you
//   drag, beside the numbers; where it LANDS is the big view.
//   Pieces listed 1→n in the order they are drawn (lower = in front).
//   Layouts are little pictures; saved setups sit under them.
//   One Done (everything saves as you go) and Revert (back to how the window
//   found it).
//
// It edits the same surfaces the desk shows; the wall follows live.

const ZOOMS = [0.25, 0.5, 1, 2]
const GRIDS = [0, 8, 16, 32, 64]
const PRESET_STORE = 'di.map.presets.v1'
const BEND_STEPS = [[0, 'off'], [1, '3'], [2, '5'], [3, '9'], [4, '17']]

const readPresets = () => {
    try { return JSON.parse(window.localStorage.getItem(PRESET_STORE) || '[]') || [] } catch { return [] }
}
const writePresets = (list) => {
    try { window.localStorage.setItem(PRESET_STORE, JSON.stringify(list)) } catch { /* private window */ }
}

// What a piece carries, for saved setups, copy and Revert.
const SLICE_KEYS = ['name', 'enabled', 'corners', 'input', 'inputRotation', 'warp', 'flip', 'isKey', 'blackBg', 'brightness', 'contrast', 'red', 'green', 'blue', 'softEdge', 'source', 'resolution', 'mask', 'opacity']
const sliceData = (surface) => Object.fromEntries(SLICE_KEYS.filter((key) => surface[key] !== undefined).map((key) => [key, JSON.parse(JSON.stringify(surface[key]))]))

// --- small parts ---------------------------------------------------------------

// A typed number. Drag its name sideways to scrub; ↑↓ step (shift ×10).
// `lazy`: the typed number is used on Enter or when the field is left, not on
// every key. For the wall size, where typing 1280 passed through a 1, 12 and
// 128 px wall on the way (audit 11-12). Esc puts the old number back.
function Field({ label, value, step = 1, min = -Infinity, max = Infinity, digits = 0, unit = '', onChange, title, lazy = false }) {
    const [draft, setDraft] = useState(null)
    const scrub = useRef(null)
    const cancelled = useRef(false)
    const shown = draft ?? (Number.isFinite(value) ? String(Number(value.toFixed(digits))) : '')
    const commit = (next) => {
        const clamped = Math.max(min, Math.min(max, next))
        if (Number.isFinite(clamped)) onChange(clamped)
    }
    const typed = (text) => {
        const next = Number(String(text).replace(',', '.'))
        return String(text).trim() !== '' && Number.isFinite(next) ? next : null
    }
    return (
        <div className="map-mo-field" title={title}>
            <span
                className="map-mo-field-name"
                onPointerDown={(event) => {
                    scrub.current = { x: event.clientX, value }
                    event.currentTarget.setPointerCapture?.(event.pointerId)
                }}
                onPointerMove={(event) => {
                    if (!scrub.current) return
                    commit(scrub.current.value + ((event.clientX - scrub.current.x) * step * (event.shiftKey ? 10 : 1)))
                }}
                onPointerUp={() => { scrub.current = null }}
            >{label}</span>
            <input
                type="text"
                inputMode="decimal"
                aria-label={label}
                value={shown}
                onChange={(event) => {
                    setDraft(event.target.value)
                    const next = typed(event.target.value)
                    if (!lazy && next !== null) commit(next)
                }}
                onBlur={() => {
                    if (lazy && !cancelled.current && draft !== null) {
                        const next = typed(draft)
                        if (next !== null) commit(next)
                    }
                    cancelled.current = false
                    setDraft(null)
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault()
                        setDraft(null)
                        commit(value + ((event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)))
                    }
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape' && lazy) { cancelled.current = true; event.currentTarget.blur() }
                }}
            />
            {unit ? <span className="map-mo-field-unit">{unit}</span> : null}
        </div>
    )
}

function Section({ title, children, aside = null }) {
    return (
        <section className="map-mo-section">
            <div className="map-mo-section-head"><h3>{title}</h3>{aside}</div>
            <div className="map-mo-section-body">{children}</div>
        </section>
    )
}

// A little drawing of a layout: its pieces as boxes.
function LayoutIcon({ preset }) {
    const { columns, rows } = preset
    const boxes = []
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            boxes.push(<rect key={`${row}-${column}`} x={1 + ((46 / columns) * column) + 0.75} y={1 + ((24 / rows) * row) + 0.75}
                width={(46 / columns) - 1.5} height={(24 / rows) - 1.5} />)
        }
    }
    return <svg viewBox="0 0 48 26" aria-hidden="true">{boxes}</svg>
}

// Mirror marks: an arrow-ish glyph turned the way the picture is mirrored.
const MIRRORS = [
    { id: 'h', label: 'Mirror left–right', glyph: '⇋' },
    { id: 'v', label: 'Mirror top–bottom', glyph: '⇵' }
]

// --- what a piece takes from the picture ------------------------------------
//
// The whole picture, small, with every piece's part outlined and the picked
// piece's part as a box: drag it to move, its corners to resize. Edges snap
// to the picture's edges and to the other parts, so a row of cubes lines up.

function TakesBox({ W, H, surfaces, primary, thumb, onChange, onPick }) {
    const svgRef = useRef(null)
    const dragRef = useRef(null)
    const parts = surfaces.filter((surface) => surface.enabled && surface.source.kind === 'wall')
    const input = screenInput(primary)
    const rotation = primary.inputRotation || 0
    const rect = [input[0] * W, input[1] * H, input[2] * W, input[3] * H]
    const handle = Math.max(W, H) * 0.014
    const toPicture = (event) => {
        const svg = svgRef.current
        const matrix = svg?.getScreenCTM?.()
        if (!svg || !matrix) return null
        const point = svg.createSVGPoint()
        point.x = event.clientX
        point.y = event.clientY
        const p = point.matrixTransform(matrix.inverse())
        return [p.x, p.y]
    }
    const edges = useMemo(() => {
        const xs = [0, W]
        const ys = [0, H]
        parts.forEach((surface) => {
            if (surface.id === primary.id) return
            const [x, y, w, h] = screenInput(surface)
            xs.push(x * W, (x + w) * W)
            ys.push(y * H, (y + h) * H)
        })
        return { xs, ys }
    }, [parts, primary.id, W, H])
    const snapTo = (value, list, alt) => {
        if (alt) return value
        const tolerance = Math.max(W, H) * 0.01
        let best = value
        let distance = tolerance
        list.forEach((entry) => { if (Math.abs(entry - value) < distance) { best = entry; distance = Math.abs(entry - value) } })
        return best
    }
    const write = ([x, y, w, h]) => onChange([x / W, y / H, Math.max(1, w) / W, Math.max(1, h) / H].map((value) => Math.round(value * 1e6) / 1e6))

    const down = (event, part) => {
        const at = toPicture(event)
        if (!at) return
        event.stopPropagation()
        event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId)
        dragRef.current = { part, start: at, rect }
    }
    const move = (event) => {
        const drag = dragRef.current
        const at = drag ? toPicture(event) : null
        if (!at) return
        const [x0, y0, w0, h0] = drag.rect
        if (drag.part === 'body') {
            let x = x0 + (at[0] - drag.start[0])
            let y = y0 + (at[1] - drag.start[1])
            // Whichever edge is nearer something agrees with it.
            const left = snapTo(x, edges.xs, event.altKey)
            const right = snapTo(x + w0, edges.xs, event.altKey)
            x = left !== x ? left : (right !== x + w0 ? right - w0 : x)
            const top = snapTo(y, edges.ys, event.altKey)
            const bottom = snapTo(y + h0, edges.ys, event.altKey)
            y = top !== y ? top : (bottom !== y + h0 ? bottom - h0 : y)
            write([x, y, w0, h0])
            return
        }
        // A corner: the opposite one stays put.
        const fixed = [[x0 + w0, y0 + h0], [x0, y0 + h0], [x0, y0], [x0 + w0, y0]][drag.part]
        const px = snapTo(at[0], edges.xs, event.altKey)
        const py = snapTo(at[1], edges.ys, event.altKey)
        write([Math.min(px, fixed[0]), Math.min(py, fixed[1]), Math.abs(px - fixed[0]), Math.abs(py - fixed[1])])
    }
    const up = () => { dragRef.current = null }

    const corners = [[rect[0], rect[1]], [rect[0] + rect[2], rect[1]], [rect[0] + rect[2], rect[1] + rect[3]], [rect[0], rect[1] + rect[3]]]
    const turned = Math.abs(rotation) > 1e-6
    return (
        <svg
            ref={svgRef}
            className="map-mo-takes"
            viewBox={`0 0 ${W} ${H}`}
            style={{ aspectRatio: `${W} / ${H}` }}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            role="img"
            aria-label={`What ${primary.name || 'this piece'} takes from the picture`}
        >
            <rect className="map-mo-takes-bg" x={0} y={0} width={W} height={H} />
            {thumb ? <image href={thumb} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" opacity="0.55" /> : null}
            {parts.filter((surface) => surface.id !== primary.id).map((surface) => {
                const quad = inputCorners(screenInput(surface), surface.inputRotation || 0, W, H)
                return (
                    <polygon key={surface.id} className="map-mo-takes-other" points={quad.map((p) => p.join(',')).join(' ')}
                        onPointerDown={(event) => { event.stopPropagation(); onPick(surface.id) }}>
                        <title>{surface.name}</title>
                    </polygon>
                )
            })}
            {turned ? (
                <polygon className="map-mo-takes-mine" points={inputCorners(input, rotation, W, H).map((p) => p.join(',')).join(' ')}
                    onPointerDown={(event) => down(event, 'body')} />
            ) : (
                <>
                    <rect className="map-mo-takes-mine" x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]}
                        onPointerDown={(event) => down(event, 'body')} />
                    {corners.map(([x, y], index) => (
                        <rect key={index} className="map-mo-takes-handle" x={x - handle} y={y - handle} width={handle * 2} height={handle * 2}
                            onPointerDown={(event) => down(event, index)} />
                    ))}
                </>
            )}
        </svg>
    )
}

// --- the window ----------------------------------------------------------------

export default function MapAdvancedOutput({
    mapping, surfaces, visuals, output, machines, spaceId, projectId, network, assets,
    applyOps, setOutput, undo, redo, canUndo, canRedo, play, onClose
}) {
    const W = Math.max(1, output.width)
    const H = Math.max(1, output.height)
    const [zoom, setZoom] = useState('fit')
    const [fitZoom, setFitZoom] = useState(0.3)
    const [pan, setPan] = useState([0, 0])
    const [snap, setSnap] = useState(true)
    const [grid, setGrid] = useState(0)
    const [selectedIds, setSelectedIds] = useState(() => (surfaces[0] ? [surfaces[0].id] : []))
    const [selectedPoints, setSelectedPoints] = useState([])
    const [hoverKind, setHoverKind] = useState(null)
    const [menu, setMenu] = useState(null)
    const [addOpen, setAddOpen] = useState(false)
    const [presets, setPresets] = useState(readPresets)
    const [presetName, setPresetName] = useState('')
    const [clipboard, setClipboard] = useState(null)
    const [renaming, setRenaming] = useState(null)
    const [takesNumbers, setTakesNumbers] = useState(false)
    const [edgeCurve, setEdgeCurve] = useState(false)
    const [dragRow, setDragRow] = useState(null)

    // Revert's snapshot: the pieces and the wall as the window found them.
    const [snapshot] = useState(() => ({ surfaces: JSON.parse(JSON.stringify(surfaces)), output: JSON.parse(JSON.stringify(output)) }))

    const byId = useMemo(() => new Map(surfaces.map((surface) => [surface.id, surface])), [surfaces])
    const selected = selectedIds.map((id) => byId.get(id)).filter(Boolean)
    const primary = selected[selected.length - 1] || null
    const z = zoom === 'fit' ? fitZoom : zoom

    useEffect(() => { setSelectedPoints([]) }, [primary?.id])
    // Pieces that disappear (undo, another desk) leave the selection.
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

    // --- adding, duplicating, deleting -------------------------------------

    const addSlices = useCallback((list) => {
        const made = list.map((slice) => ({ ...slice, id: generateId('srf') }))
        applyOps(made.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })))
        setSelectedIds(made.map((surface) => surface.id))
    }, [applyOps])

    const sliceCount = surfaces.filter((surface) => isScreenKind(surface.source.kind)).length
    const addSlice = () => {
        const input = [0.3, 0.3, 0.4, 0.4]
        addSlices([{
            name: `Piece ${sliceCount + 1}`, corners: rectCorners(input), input,
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
            name: `${surface.name || 'Piece'} copy`,
            corners: surface.corners.map(([x, y]) => [x + 0.02, y + 0.02])
        })))
    }
    const remove = () => {
        if (!selected.length) return
        applyOps(selected.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })))
        setSelectedIds([])
    }
    // Each paste lands a step further on, so pasting twice gives two pieces you
    // can see, not two on one spot (audit 11-12); a new copy starts again.
    const pastes = useRef(0)
    const copySelection = () => {
        setClipboard(selected.map(sliceData))
        pastes.current = 0
    }
    const paste = () => {
        if (!clipboard?.length) return
        pastes.current += 1
        const offset = 0.02 * pastes.current
        addSlices(clipboard.map((data) => ({ ...data, corners: data.corners.map(([x, y]) => [x + offset, y + offset]) })))
    }

    // --- bending ---------------------------------------------------------------

    const warp = primary?.warp || null
    const divisionsX = warp?.divisionsX || 0
    const divisionsY = warp?.divisionsY || 0
    const setDivisions = useCallback((surface, dx, dy) => {
        if (!surface) return
        const base = surface.warp || { mode: 'linear', divisionsX: 0, divisionsY: 0, points: regularGrid(0, 0) }
        update(surface.id, { warp: resampleWarp(base, Math.max(0, Math.min(4, dx)), Math.max(0, Math.min(4, dy))) })
    }, [update])
    // Double-click a piece: pick it, and if it is still flat give it a 3 × 3
    // of points to bend with.
    const onBend = useCallback((surfaceId) => {
        const surface = byId.get(surfaceId)
        if (!surface) return
        setSelectedIds([surfaceId])
        const { columns, rows } = warpPoints(surface.warp || { divisionsX: 0, divisionsY: 0 })
        if (columns * rows <= 4) setDivisions(surface, 1, 1)
    }, [byId, setDivisions])
    // Straighten the picked bend points (corners stay where they are pinned).
    const straightenPoints = () => {
        if (!primary?.warp || !selectedPoints.length) return
        const { columns, rows, points } = warpPoints(primary.warp)
        const flat = regularGrid(primary.warp.divisionsX || 0, primary.warp.divisionsY || 0)
        const next = points.map((point, index) => (selectedPoints.includes(index) && cornerIndexOfPoint(index, columns, rows) === -1 ? flat[index] : point))
        update(primary.id, { warp: { ...primary.warp, points: next } })
    }

    // --- right-click menu -----------------------------------------------------
    const actions = {
        duplicate,
        delete: remove,
        takesWhatItCovers: () => updateMany(selectedIds, (surface) => ({ input: boundsOfCorners(surface.corners), inputRotation: 0 })),
        landsWhereItTakes: () => updateMany(selectedIds, (surface) => ({ corners: rectCorners(screenInput(surface)) })),
        fillWall: () => updateMany(selectedIds, () => ({ corners: rectCorners([0, 0, 1, 1]) })),
        straighten: () => updateMany(selectedIds, () => ({ warp: null })),
        turn90: () => updateMany(selectedIds, (surface) => {
            const quad = surface.corners.map(([x, y]) => [x * W, y * H])
            const frame = frameOf(quad)
            return { corners: rotateCorners(quad, 90, [frame.x, frame.y]).map(([x, y]) => [x / W, y / H]) }
        }),
        mirrorH: () => updateMany(selectedIds, (surface) => ({ flip: { none: 'h', h: 'none', v: 'hv', hv: 'v' }[surface.flip || 'none'] })),
        mirrorV: () => updateMany(selectedIds, (surface) => ({ flip: { none: 'v', v: 'none', h: 'hv', hv: 'h' }[surface.flip || 'none'] }))
    }

    // --- layouts and saved setups -----------------------------------------------
    const replaceWith = (list) => {
        applyOps([
            ...surfaces.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })),
            ...list.map((slice) => ({ type: 'createMappingSurface', payload: { surface: { ...slice, id: generateId('srf') } } }))
        ])
        setSelectedIds([])
    }
    const loadSaved = (preset) => {
        replaceWith(preset.slices)
        if (preset.output) setOutput({ output: { ...output, width: preset.output.width, height: preset.output.height } })
    }
    const deleteSaved = (name) => {
        const next = presets.filter((entry) => entry.name !== name)
        setPresets(next)
        writePresets(next)
    }
    const savePreset = () => {
        const name = presetName.trim()
        if (!name) return
        const next = [...presets.filter((entry) => entry.name !== name), { name, output: { width: W, height: H }, slices: surfaces.map(sliceData) }]
        setPresets(next)
        writePresets(next)
        setPresetName('')
    }

    // --- Revert / Done ------------------------------------------------------------
    // Revert puts every piece and the wall back the way the window found
    // them, in one step (Ctrl+Z undoes the revert). The window stays open.
    const revert = () => {
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
    }

    // --- keyboard -----------------------------------------------------------
    const nudge = useCallback((dx, dy) => {
        if (!selected.length) return
        if (primary && selectedPoints.length) {
            const { columns, rows, points } = warpPoints(primary.warp || { divisionsX: 0, divisionsY: 0 })
            const quad = primary.corners.map(([x, y]) => [x * W, y * H])
            const nextQuad = quad.map((corner) => [...corner])
            selectedPoints.forEach((index) => {
                const corner = cornerIndexOfPoint(index, columns, rows)
                if (corner !== -1) nextQuad[corner] = [nextQuad[corner][0] + dx, nextQuad[corner][1] + dy]
            })
            const patch = { corners: nextQuad.map(([x, y]) => [x / W, y / H]) }
            const interior = selectedPoints.filter((index) => cornerIndexOfPoint(index, columns, rows) === -1)
            if (interior.length) {
                // A nudge in wall pixels, turned into the piece's own square.
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
    }, [selected, primary, selectedPoints, selectedIds, W, H, update, updateMany])

    useEffect(() => {
        const onKey = (event) => {
            const target = event.target
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) || target?.isContentEditable) return
            // A focused slider, switch or tab owns its plain keys: an arrow on the
            // Brightness line moved the piece too, and Delete deleted the piece
            // (audit 11-12). Ctrl/⌘ shortcuts still reach the window.
            if (!event.ctrlKey && !event.metaKey && target?.closest?.('[role="slider"],[role="switch"],[role="radio"]')) return
            const key = event.key.toLowerCase()
            if (event.ctrlKey || event.metaKey) {
                if (key === 'z' && !event.shiftKey) { undo(); event.preventDefault() }
                else if ((key === 'z' && event.shiftKey) || key === 'y') { redo(); event.preventDefault() }
                else if (key === 'a') {
                    if (selectedPoints.length && primary) {
                        const { columns, rows } = warpPoints(primary.warp || { divisionsX: 0, divisionsY: 0 })
                        setSelectedPoints(Array.from({ length: columns * rows }, (_, index) => index))
                    } else setSelectedIds(surfaces.map((surface) => surface.id))
                    event.preventDefault()
                } else if (key === 'd') { duplicate(); event.preventDefault() }
                // Copy and cut need a selection: Ctrl+C on nothing used to empty
                // the clipboard (audit 11-12).
                else if (key === 'c') { if (selected.length) { copySelection(); event.preventDefault() } }
                else if (key === 'x') { if (selected.length) { copySelection(); remove(); event.preventDefault() } }
                else if (key === 'v') { paste(); event.preventDefault() }
                return
            }
            const step = event.shiftKey ? 10 : 1
            switch (event.key) {
                case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break
                case 'ArrowRight': nudge(step, 0); event.preventDefault(); break
                case 'ArrowUp': nudge(0, -step); event.preventDefault(); break
                case 'ArrowDown': nudge(0, step); event.preventDefault(); break
                case 'Delete': case 'Backspace':
                    // With points picked, Delete straightens them; the piece stays.
                    if (selectedPoints.length) straightenPoints()
                    else remove()
                    event.preventDefault()
                    break
                case 'Escape':
                    if (menu) setMenu(null)
                    else if (selectedPoints.length) setSelectedPoints([])
                    else setSelectedIds([])
                    break
                case 's': case 'S': setSnap((value) => !value); break
                case 'f': case 'F': setZoom('fit'); setPan([0, 0]); break
                case '+': case '=': setZoom(Math.min(8, z * 1.25)); break
                case '-': setZoom(Math.max(0.02, z / 1.25)); break
                default:
                    // The clips still play from here: 1-9, 0 for black.
                    if (/^[0-9]$/.test(event.key) && visuals.length) {
                        const index = Number(event.key) - 1
                        play(index < 0 ? '' : (visuals[index]?.id ?? ''))
                    }
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    // --- the picked piece's numbers ---------------------------------------
    const quadPx = primary ? primary.corners.map(([x, y]) => [x * W, y * H]) : null
    // Read from the shape as it is drawn: a bent or keystoned piece reads as
    // the straight box round it.
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

    const showsValue = primary?.source.kind === 'visual' ? primary.source.ref : (primary?.source.kind === 'wall' ? 'wall' : 'other')
    const playingVisual = visuals.find((entry) => entry.id === mapping?.playing) || null
    const pictureThumb = (() => {
        if (!playingVisual) return null
        if (playingVisual.thumb) return resolveMapSourceRef(playingVisual.thumb)
        if (playingVisual.source?.kind === 'image' && playingVisual.source.ref) return resolveMapSourceRef(playingVisual.source.ref)
        return null
    })()
    const isHtmlish = (() => {
        if (!primary) return false
        const visual = primary.source.kind === 'wall' ? playingVisual : visuals.find((entry) => entry.id === primary.source.ref)
        const kind = visual?.source.kind || primary.source.kind
        // An uploaded HTML visual bends through the frame relay; these can't.
        return ['url', 'project', 'network', 'stream', 'ndi'].includes(kind)
    })()
    const bent = Boolean(warp) && (divisionsX > 0 || divisionsY > 0)

    // --- the hint line ------------------------------------------------------
    const name = primary ? (primary.name || 'This piece') : ''
    const hint = (() => {
        switch (hoverKind) {
            case 'knob': return 'Drag to turn · shift turns in 15° steps'
            case 'corner': return 'Drag to pin this corner where it really is on the wall · shift-click picks more · arrows nudge'
            case 'point': return 'Drag to bend the picture here · shift-click picks more · Delete straightens the picked points'
            case 'edge': return 'Drag to stretch this side · shift keeps the shape · alt from the middle'
            case 'scale': return 'Drag to resize them together · shift keeps the shape · alt from the middle'
            case 'body': return 'Drag to move · double-click to bend · right-click for more · alt ignores snapping'
            default: break
        }
        if (!selected.length) return 'Click a piece to change it · drag on empty space to pick several · wheel zooms · hold space and drag to move the view'
        if (selected.length > 1) return `${selected.length} pieces · drag to move them together · the knob turns them · arrows nudge (shift ×10)`
        if (selectedPoints.length) return `${selectedPoints.length} point${selectedPoints.length === 1 ? '' : 's'} picked · arrows nudge (shift ×10) · Delete straightens · Esc lets go`
        return `${name} · corners pin · the knob turns · double-click to bend · arrows nudge (shift ×10) · Ctrl+D duplicates`
    })()

    const zoomLabel = `${Math.round(z * 100)}%`

    return (
        <div className="map-mo" role="dialog" aria-label="Mapping"
            onPointerDown={() => { if (menu) setMenu(null); if (addOpen) setAddOpen(false) }}>
            <header className="map-mo-top">
                <h2>Mapping</h2>
                <div className="map-mo-wall">
                    <span className="map-mo-wall-label">Wall</span>
                    <Field label="Width" value={W} min={16} max={16384} lazy title="The wall picture's width in pixels (Enter to set)"
                        onChange={(value) => setOutput({ output: { ...output, width: Math.round(value) } })} />
                    <span className="map-mo-times">×</span>
                    <Field label="Height" value={H} min={16} max={16384} lazy title="The wall picture's height in pixels (Enter to set)"
                        onChange={(value) => setOutput({ output: { ...output, height: Math.round(value) } })} />
                    <label className="map-mo-device" title="Which machine and display the wall plays on">
                        <span>plays on</span>
                        <select value={showValue(output.show)} onChange={(event) => {
                            const show = showFromValue(event.target.value, machines)
                            const { show: _dropped, ...rest } = output
                            setOutput({ output: show ? { ...rest, show } : rest })
                        }}>
                            {showOptions(machines, output.show).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </label>
                </div>
                <span className="map-mo-spacer" />
                <button type="button" className="map-mo-icon" onClick={undo} disabled={!canUndo()} aria-label="Undo" title="Undo (Ctrl+Z)">↶</button>
                <button type="button" className="map-mo-icon" onClick={redo} disabled={!canRedo()} aria-label="Redo" title="Redo (Shift+Ctrl+Z)">↷</button>
                {/* The bar show's autopilot here too (Emily, 11-12): this window covers
                    the desk's top bar, and the show goes on while she lines up. */}
                <MapAutopilot className="map-mo-btn" />
                <button type="button" className="map-mo-btn" onClick={revert} title="Put every piece back the way it was when you opened this (Ctrl+Z undoes it)">Revert</button>
                <button type="button" className="map-mo-btn is-primary" onClick={onClose} title="Close. Everything is already saved and on the wall.">Done</button>
            </header>

            <div className="map-mo-body">
                <aside className="map-mo-left">
                    <div className="map-mo-panel-head">
                        <h3>Pieces</h3>
                        <span className="map-mo-count">{surfaces.length}</span>
                        <div className="map-mo-addwrap">
                            <button type="button" className="map-mo-add" aria-label="Add a piece" title="Add a piece or a black mask"
                                onClick={(event) => { event.stopPropagation(); setAddOpen((value) => !value) }}
                                onPointerDown={(event) => event.stopPropagation()}>＋</button>
                            {addOpen ? (
                                <div className="map-mo-menu map-mo-addmenu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
                                    <button type="button" role="menuitem" onClick={() => { addSlice(); setAddOpen(false) }}>Piece<small>shows part of the wall picture</small></button>
                                    <button type="button" role="menuitem" onClick={() => { addMask(); setAddOpen(false) }}>Black mask<small>covers what is under it</small></button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <ol className="map-mo-pieces" title="Lower in the list is drawn in front. Drag to change.">
                        {surfaces.map((surface, index) => {
                            const isOn = selectedIds.includes(surface.id)
                            return (
                                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                                <li
                                    key={surface.id}
                                    className={`map-mo-piece-row${isOn ? ' is-selected' : ''}${dragRow === surface.id ? ' is-dragging' : ''}${surface.enabled ? '' : ' is-off'}`}
                                    draggable
                                    onClick={(event) => {
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
                                    onDragStart={(event) => { event.dataTransfer.setData('application/x-di-piece', surface.id); event.dataTransfer.effectAllowed = 'move'; setTimeout(() => setDragRow(surface.id), 0) }}
                                    onDragEnd={() => setDragRow(null)}
                                    onDragOver={(event) => { if (dragRow) event.preventDefault() }}
                                    onDrop={(event) => {
                                        event.preventDefault()
                                        if (!dragRow || dragRow === surface.id) return
                                        const ids = surfaces.map((entry) => entry.id).filter((id) => id !== dragRow)
                                        const at = ids.indexOf(surface.id) + (index > surfaces.findIndex((entry) => entry.id === dragRow) ? 1 : 0)
                                        ids.splice(at, 0, dragRow)
                                        applyOps([{ type: 'reorderMappingSurfaces', payload: { surfaceIds: ids } }])
                                        setDragRow(null)
                                    }}
                                >
                                    <button type="button" role="switch" aria-checked={surface.enabled} className={`map-mo-dot${surface.enabled ? ' is-on' : ''}`}
                                        aria-label={`${surface.name || 'Piece'} on`} title={surface.enabled ? 'On the wall — click to hide' : 'Hidden — click to show'}
                                        onClick={(event) => { event.stopPropagation(); update(surface.id, { enabled: !surface.enabled }) }} />
                                    <span className="map-mo-num">{index + 1}</span>
                                    {renaming === surface.id ? (
                                        <input
                                            className="map-mo-rename"
                                            defaultValue={surface.name}
                                            aria-label="Name"
                                            // eslint-disable-next-line jsx-a11y/no-autofocus
                                            autoFocus
                                            // the whole name is picked, so typing replaces it (audit 11-12)
                                            onFocus={(event) => event.target.select()}
                                            onClick={(event) => event.stopPropagation()}
                                            // an emptied name keeps the old one: the list showed the raw id
                                            onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== surface.name) update(surface.id, { name }); setRenaming(null) }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') event.currentTarget.blur()
                                                if (event.key === 'Escape') setRenaming(null)
                                            }}
                                        />
                                    ) : <span className="map-mo-piece-name">{surface.name || surface.id}</span>}
                                    {surface.source.kind === 'visual' ? <span className="map-mo-tag">own clip</span> : null}
                                    {surface.source.kind === 'colour' ? <span className="map-mo-tag">mask</span> : null}
                                    {surface.warp && (surface.warp.divisionsX || surface.warp.divisionsY) ? <span className="map-mo-tag is-bent" title="Bent">≈</span> : null}
                                </li>
                            )
                        })}
                    </ol>
                    {!surfaces.length ? <p className="map-mo-empty">No pieces yet. Press ＋, or pick a layout below.</p> : null}

                    <div className="map-mo-panel-head"><h3>Layouts</h3></div>
                    <div className="map-mo-layouts">
                        {screenPresets.map((preset) => (
                            <button key={preset.id} type="button" className="map-mo-layout"
                                aria-label={`Start over with ${preset.label}`}
                                title={`${preset.label} — start over with this (Ctrl+Z brings yours back)`}
                                onClick={() => replaceWith(presetScreens(preset, output))}>
                                <LayoutIcon preset={preset} />
                                <span>{preset.rows > 1 ? `${preset.columns}×${preset.rows}` : preset.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="map-mo-panel-head"><h3>Saved</h3></div>
                    <ul className="map-mo-saved">
                        {presets.map((preset) => (
                            <li key={preset.name}>
                                <button type="button" className="map-mo-saved-load" onClick={() => loadSaved(preset)}
                                    title={`Bring back “${preset.name}” (replaces the pieces now here; Ctrl+Z undoes)`}>{preset.name}</button>
                                <button type="button" className="map-mo-icon is-small" onClick={() => deleteSaved(preset.name)} aria-label={`Forget ${preset.name}`} title="Forget this one">×</button>
                            </li>
                        ))}
                    </ul>
                    <div className="map-mo-saveas">
                        <input type="text" placeholder="Save this setup as…" value={presetName} aria-label="Name for this setup"
                            onChange={(event) => setPresetName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') savePreset() }} />
                        <button type="button" className="map-mo-btn" onClick={savePreset} disabled={!presetName.trim()}>Save</button>
                    </div>
                </aside>

                <main className="map-mo-main">
                    <MapSliceCanvas
                        mapping={mapping}
                        surfaces={surfaces}
                        W={W}
                        H={H}
                        zoom={zoom}
                        onZoom={setZoom}
                        pan={pan}
                        onPan={setPan}
                        snap={snap}
                        grid={grid}
                        selectedIds={selectedIds}
                        onSelect={setSelectedIds}
                        selectedPoints={selectedPoints}
                        onSelectPoints={setSelectedPoints}
                        applyOps={applyOps}
                        live
                        spaceId={spaceId}
                        projectId={projectId}
                        network={network}
                        assets={assets}
                        onFit={setFitZoom}
                        onBend={onBend}
                        onHover={setHoverKind}
                        onContextMenu={(surfaceId, x, y) => { if (surfaceId) setMenu({ x, y }) }}
                    />
                    <div className="map-mo-view" onPointerDown={(event) => event.stopPropagation()}>
                        <button type="button" className={zoom === 'fit' ? 'is-on' : ''} onClick={() => { setZoom('fit'); setPan([0, 0]) }} title="Fit the whole wall (F)">Fit</button>
                        <button type="button" onClick={() => setZoom(Math.max(0.02, z / 1.25))} aria-label="Zoom out" title="Zoom out (−)">−</button>
                        <select value="" onChange={(event) => { if (event.target.value) setZoom(Number(event.target.value)) }} aria-label="Zoom">
                            <option value="">{zoomLabel}</option>
                            {ZOOMS.map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                        </select>
                        <button type="button" onClick={() => setZoom(Math.min(8, z * 1.25))} aria-label="Zoom in" title="Zoom in (+)">+</button>
                        <span className="map-mo-view-sep" />
                        <select className={grid ? 'is-on' : ''} value={grid} onChange={(event) => setGrid(Number(event.target.value))} aria-label="Grid" title="Lines across the wall to line things up against">
                            {GRIDS.map((value) => <option key={value} value={value}>{value ? `grid ${value}` : 'no grid'}</option>)}
                        </select>
                        <button type="button" className={snap ? 'is-on' : ''} onClick={() => setSnap((value) => !value)} aria-pressed={snap}
                            title="Corners and edges agree with the wall's edges, its middle, the grid and the other pieces. Hold alt to place freely (S).">Snap</button>
                    </div>
                </main>

                <aside className="map-mo-right">
                    {!primary ? (
                        <div className="map-mo-insp">
                            <p className="map-mo-empty">Click a piece on the wall or in the list to change it.</p>
                        </div>
                    ) : (
                        <div className="map-mo-insp">
                            <div className="map-mo-title">
                                {selected.length > 1 ? `${selected.length} pieces` : (primary.name || 'Piece')}
                                {selected.length > 1 ? <small>changes apply to all of them</small> : null}
                            </div>

                            <Section title="Shows">
                                <select className="map-mo-select" aria-label="Shows" value={showsValue} onChange={(event) => {
                                    const value = event.target.value
                                    if (value === 'other') return
                                    setAll(() => ({ source: value === 'wall' ? { kind: 'wall', ref: '' } : { kind: 'visual', ref: value } }))
                                }}>
                                    <option value="wall">Its part of the wall picture</option>
                                    {visuals.map((visual) => <option key={visual.id} value={visual.id}>Only “{visual.name}”</option>)}
                                    {showsValue === 'other' ? <option value="other">{primary.source.kind} (its own source)</option> : null}
                                </select>
                            </Section>

                            {selected.length === 1 ? (
                                primary.source.kind === 'wall' ? (
                                    <Section title="Takes" aside={(
                                        <button type="button" className="map-mo-link" onClick={actions.takesWhatItCovers}
                                            title="Take exactly the part of the picture this piece covers on the wall">same as where it lands</button>
                                    )}>
                                        <TakesBox W={W} H={H} surfaces={surfaces} primary={primary} thumb={pictureThumb}
                                            onChange={(input) => update(primary.id, { input })}
                                            onPick={(id) => setSelectedIds([id])} />
                                        <button type="button" className="map-mo-fold" aria-expanded={takesNumbers} onClick={() => setTakesNumbers((value) => !value)}>
                                            {takesNumbers ? '▾' : '▸'} Numbers
                                        </button>
                                        {takesNumbers ? (
                                            <div className="map-mo-fields">
                                                <Field label="Left" value={inFrame.left} onChange={(v) => setInField('left', v)} />
                                                <Field label="Top" value={inFrame.top} onChange={(v) => setInField('top', v)} />
                                                <Field label="Width" value={inFrame.width} min={1} onChange={(v) => setInField('width', v)} />
                                                <Field label="Height" value={inFrame.height} min={1} onChange={(v) => setInField('height', v)} />
                                                <Field label="Turn" value={inFrame.rotation} min={-180} max={180} digits={1} unit="°" onChange={(v) => setInField('rotation', v)} />
                                            </div>
                                        ) : null}
                                    </Section>
                                ) : (
                                    <Section title="Takes">
                                        <p className="map-mo-note">This piece plays its own clip, so it takes nothing from the wall picture.</p>
                                    </Section>
                                )
                            ) : null}

                            <Section title="Place">
                                <div className="map-mo-fields map-mo-place">
                                    <Field label="X" value={outFrame.left} min={-2 * W} max={3 * W} onChange={(v) => setOutField('left', v)} title="Left edge on the wall, in pixels" />
                                    <Field label="Y" value={outFrame.top} min={-2 * H} max={3 * H} onChange={(v) => setOutField('top', v)} title="Top edge on the wall, in pixels" />
                                    <Field label="Width" value={outFrame.width} min={1} max={4 * W} onChange={(v) => setOutField('width', v)} />
                                    <Field label="Height" value={outFrame.height} min={1} max={4 * H} onChange={(v) => setOutField('height', v)} />
                                    <Field label="Turn" value={outFrame.rotation} min={-180} max={180} digits={1} unit="°" onChange={(v) => setOutField('rotation', v)} />
                                </div>
                                <div className="map-mo-actions">
                                    <button type="button" className="map-mo-btn" onClick={actions.fillWall} title="Stretch it over the whole wall">Fill the wall</button>
                                    <button type="button" className="map-mo-btn" onClick={actions.turn90} title="Turn it a quarter clockwise">Turn 90°</button>
                                    {MIRRORS.map((mirror) => {
                                        const on = (primary.flip || 'none').includes(mirror.id)
                                        return (
                                            <button key={mirror.id} type="button" className={`map-mo-btn map-mo-mirror${on ? ' is-on' : ''}`}
                                                aria-pressed={on} aria-label={mirror.label} title={mirror.label}
                                                onClick={mirror.id === 'h' ? actions.mirrorH : actions.mirrorV}>{mirror.glyph}</button>
                                        )
                                    })}
                                </div>
                            </Section>

                            {selected.length === 1 ? (
                                <Section title="Bend" aside={bent ? (
                                    <button type="button" className="map-mo-link" onClick={() => update(primary.id, { warp: null })} title="Flatten it again (the corners stay pinned)">straighten</button>
                                ) : null}>
                                    <div className="map-mo-rows">
                                        <ParamRow spec={{ kind: 'choice', label: 'Points across', default: 0, options: BEND_STEPS }} value={divisionsX}
                                            onChange={(value) => setDivisions(primary, value, divisionsY)} />
                                        <ParamRow spec={{ kind: 'choice', label: 'Points down', default: 0, options: BEND_STEPS }} value={divisionsY}
                                            onChange={(value) => setDivisions(primary, divisionsX, value)} />
                                        {bent ? (
                                            <ParamRow
                                                spec={{ kind: 'choice', label: 'Between points', default: 'linear', options: [['linear', 'Straight'], ['bezier', 'Smooth'], ['perspective', 'Corners only']] }}
                                                value={warp?.mode || 'linear'}
                                                onChange={(mode) => update(primary.id, { warp: { ...warp, mode } })}
                                            />
                                        ) : null}
                                    </div>
                                    {!bent ? <p className="map-mo-note is-quiet">Or double-click the piece on the wall.</p> : null}
                                    {isHtmlish && bent && warp.mode !== 'perspective' ? (
                                        <p className="map-mo-note">This piece shows a web link or a live input. Those can’t bend between points, so on the wall it follows its four corners only. Uploaded HTML, videos, images, cameras and test cards bend fully.</p>
                                    ) : null}
                                </Section>
                            ) : null}

                            <Section title="Colour">
                                <div className="map-mo-rows">
                                    <ParamRow spec={{ kind: 'number', label: 'Brightness', min: -1, max: 1, step: 0.01, default: 0 }}
                                        value={Math.round(((primary.brightness ?? 1) - 1) * 100) / 100}
                                        onChange={(v) => setAll(() => ({ brightness: Math.round((1 + v) * 1e4) / 1e4 }))} />
                                    <ParamRow spec={{ kind: 'number', label: 'Contrast', min: -1, max: 1, step: 0.01, default: 0 }}
                                        value={Math.round(((primary.contrast ?? 1) - 1) * 100) / 100}
                                        onChange={(v) => setAll(() => ({ contrast: Math.round((1 + v) * 1e4) / 1e4 }))} />
                                    <ParamRow spec={{ kind: 'number', label: 'Red', min: -1, max: 1, step: 0.01, default: 0 }} value={primary.red || 0}
                                        onChange={(v) => setAll(() => ({ red: v }))} />
                                    <ParamRow spec={{ kind: 'number', label: 'Green', min: -1, max: 1, step: 0.01, default: 0 }} value={primary.green || 0}
                                        onChange={(v) => setAll(() => ({ green: v }))} />
                                    <ParamRow spec={{ kind: 'number', label: 'Blue', min: -1, max: 1, step: 0.01, default: 0 }} value={primary.blue || 0}
                                        onChange={(v) => setAll(() => ({ blue: v }))} />
                                </div>
                            </Section>

                            <Section title="Edges">
                                <div className="map-mo-rows">
                                    <ParamRow spec={{ kind: 'toggle', label: 'Blend edges', default: false }} value={Boolean(primary.softEdge?.enabled)}
                                        onChange={(on) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), enabled: on } }))} />
                                    {primary.softEdge?.enabled ? ['left', 'right', 'top', 'bottom'].map((side) => (
                                        <ParamRow key={side} spec={{ kind: 'number', label: side[0].toUpperCase() + side.slice(1), min: 0, max: 50, step: 0.5, default: 0, unit: '%' }}
                                            value={Math.round((primary.softEdge?.[side] || 0) * 1000) / 10}
                                            onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), enabled: true, [side]: v / 100 } }))} />
                                    )) : null}
                                </div>
                                {primary.softEdge?.enabled ? (
                                    <>
                                        <button type="button" className="map-mo-fold" aria-expanded={edgeCurve} onClick={() => setEdgeCurve((value) => !value)}>
                                            {edgeCurve ? '▾' : '▸'} Fade shape
                                        </button>
                                        {edgeCurve ? (
                                            <div className="map-mo-rows">
                                                <ParamRow spec={{ kind: 'number', label: 'Steepness', min: 0.1, max: 10, step: 0.05, default: 2 }} value={primary.softEdge?.power ?? 2}
                                                    onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), power: v } }))} />
                                                <ParamRow spec={{ kind: 'number', label: 'Middle', min: 0, max: 1, step: 0.01, default: 0.5 }} value={primary.softEdge?.luminance ?? 0.5}
                                                    onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), luminance: v } }))} />
                                                <ParamRow spec={{ kind: 'number', label: 'Gamma', min: 0.1, max: 4, step: 0.01, default: 1 }} value={primary.softEdge?.gamma ?? 1}
                                                    onChange={(v) => setAll((surface) => ({ softEdge: { ...(surface.softEdge || {}), gamma: v } }))} />
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                            </Section>

                            <Section title="Layering">
                                <div className="map-mo-rows">
                                    <ParamRow spec={{ kind: 'toggle', label: 'Black behind', default: true }} value={primary.blackBg !== false}
                                        onChange={(on) => setAll(() => ({ blackBg: on }))} />
                                    <ParamRow spec={{ kind: 'toggle', label: 'Cut-out', default: false }} value={Boolean(primary.isKey)}
                                        onChange={(on) => setAll(() => ({ isKey: on }))} />
                                </div>
                                <p className="map-mo-note is-quiet">Black behind fills the piece’s see-through parts with black. Cut-out makes the piece a stencil: where it is dark, the pieces under it disappear.</p>
                            </Section>
                        </div>
                    )}
                </aside>
            </div>

            <footer className="map-mo-hint" aria-live="polite">{hint}</footer>

            {menu ? (
                <div className="map-mo-menu map-mo-context" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
                    {[
                        ['duplicate', 'Duplicate', 'Ctrl+D'],
                        ['delete', 'Delete', 'Del'],
                        null,
                        ['takesWhatItCovers', 'Take what it covers', ''],
                        ['landsWhereItTakes', 'Land where it takes from', ''],
                        ['fillWall', 'Fill the wall', ''],
                        ['straighten', 'Straighten', ''],
                        null,
                        ['turn90', 'Turn 90°', ''],
                        ['mirrorH', 'Mirror left–right', ''],
                        ['mirrorV', 'Mirror top–bottom', '']
                    ].map((entry, index) => (entry ? (
                        <button key={entry[0]} type="button" role="menuitem" onClick={() => { actions[entry[0]](); setMenu(null) }}>
                            <span>{entry[1]}</span><kbd>{entry[2]}</kbd>
                        </button>
                    ) : (
                        <div key={`sep${index}`} className="map-mo-menu-sep" />
                    )))}
                </div>
            ) : null}
        </div>
    )
}
