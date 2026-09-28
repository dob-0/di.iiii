import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../project/hooks/useOpHistory.js'
import { useProjectStore } from '../project/state/projectStore.js'
import { applyProjectOps, generateId } from '../shared/projectSchema.js'
import { useRigAutoPatch } from '../studio/hooks/useRigAutoPatch.js'
import { useDeskState } from './deskState.js'
import { TYPE_LIBRARY } from './types/index.js'
import { modeOf, typeById } from './fixtureTypes.js'
import { PIECES, pieceOf } from './pieces.js'
import { snap, wrapYaw } from './snap.js'
import { buildPatchSheetPath } from './patchRouting.js'
import { plotModel, titleTotals } from './plotModel.js'
import { planExtent } from './venuePlan.js'
import {
    SHEETS, chooseScale, fitView, formatMetres, hitTest, inMarquee, layRun, nextUnit, rigExtent,
    sheetLayout, snapToGrid, zoomView
} from './plotGeometry.js'
import {
    createOps, deleteOps, fixtureOps, heightOps, lampEntity, moveOps, pieceEntity, placeOps,
    renamePositionOps, ridersOfIds, rotateOps, runLengthOps
} from './plotEdits.js'
import { isEffectType, shapePath } from './plotSymbols.js'
import { FLAG_WORDS } from './sheet.js'
import { countWords, libraryWithShow } from './rental.js'
import { buildEquipmentPath } from './equipmentRouting.js'
import PlotDrawing, { SCREEN_SIZES } from './PlotDrawing.jsx'
import { usePieceAssets } from './usePieceAssets.js'
import './plot.css'

// THE PLOT — view B of the rig builder: the rig drawn from above like a lighting
// plot, the room beside it. docs/architecture/RIG_BUILD.md §10.
//
// Everything is read from, and written to, the project document through the op log
// (useProjectDocumentSync, the Studio's own path), so the Studio, the patch sheet and
// the room see the same rig. Auto-patch runs as in the Studio. Pieces snap with the
// base's snap() measured on the plan; lamps take their type's symbol; the title
// block's totals are the patch sheet's.

const PlotRoom = lazy(() => import('./PlotRoom.jsx'))
const PlotPrint = lazy(() => import('./PlotPrint.jsx'))

export const TOOLS = [
    { id: 'select', label: 'select', key: 'v' },
    { id: 'truss', label: 'truss', key: 't' },
    { id: 'tower', label: 'tower', key: 'w' },
    { id: 'deck', label: 'deck', key: 'd' },
    { id: 'fixture', label: 'fixture', key: 'f' },
    { id: 'fx', label: 'fx', key: 'x' },
    { id: 'measure', label: 'measure', key: 'm' }
]

const r2 = (v) => Math.round(v * 100) / 100
const PHONE_QUERY = '(max-width: 760px), (max-height: 500px)'

const useIsPhone = () => {
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches)
    useEffect(() => {
        const mq = window.matchMedia?.(PHONE_QUERY)
        if (!mq) return undefined
        const on = () => setPhone(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [])
    return phone
}


// ---- small inputs, the house's field style ---------------------------------------

function NumField({ label, value, onCommit, step = 0.1, unit = 'm', min, max, width }) {
    const [text, setText] = useState(value == null ? '' : String(value))
    useEffect(() => { setText(value == null ? '' : String(value)) }, [value])
    const commit = () => {
        if (text.trim() === '') { if (value != null) onCommit(null); return }
        const n = Number(text.replace(',', '.'))
        if (!Number.isFinite(n) || (min != null && n < min) || (max != null && n > max)) { setText(value == null ? '' : String(value)); return }
        if (n !== value) onCommit(n)
    }
    return (
        <label className="rigplot-field" style={width ? { width } : undefined}>
            <span>{label}</span>
            <input
                inputMode="decimal" value={text} step={step}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } if (e.key === 'Escape') { setText(value == null ? '' : String(value)); e.currentTarget.blur() } }}
            />
            {unit ? <em>{unit}</em> : null}
        </label>
    )
}

function TextField({ label, value, onCommit, placeholder }) {
    const [text, setText] = useState(value || '')
    useEffect(() => { setText(value || '') }, [value])
    return (
        <label className="rigplot-field rigplot-field--text">
            <span>{label}</span>
            <input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text.trim() !== (value || '')) onCommit(text.trim()) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </label>
    )
}

function Symbol({ shape, letter, size = 16 }) {
    const r = size * 0.36
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="rigplot-symbol">
            <path d={shapePath(shape, size / 2, size / 2, r)} fill={shape === 'bar' ? '#111' : '#fff'} stroke="#111" strokeWidth="1.2" />
            {letter ? <text x={size / 2} y={size / 2 + r * 0.35} fontSize={r * 1.1} textAnchor="middle" dominantBaseline="central">{letter}</text> : null}
        </svg>
    )
}

// ---- the panels ------------------------------------------------------------------

function KeyBlock({ model }) {
    if (!model.key.length) return null
    return (
        <section className="rigplot-block rigplot-key" aria-label="Key">
            <h2>key</h2>
            <ul>
                {model.key.map((k) => (
                    <li key={k.type}><Symbol shape={k.shape} letter={k.letter} /><span className="rigplot-mono">{k.code} ×{k.n} · {k.mode}{k.rental ? ` · ${countWords(k.rental)}` : ''}</span></li>
                ))}
                <li><svg width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="#111" strokeDasharray="3 2" /></svg><span className="rigplot-mono">! conflict — see the inspector</span></li>
            </ul>
        </section>
    )
}

function TitleBlock({ title, model, desk, scale, spaceId, projectId, onPrint }) {
    const t = titleTotals(model.sheet)
    const patch = buildPatchSheetPath(spaceId, projectId)
    return (
        <section className="rigplot-block rigplot-title" aria-label="Title block">
            <div className="rigplot-title__head rigplot-mono">{title} · lighting plot</div>
            <div className="rigplot-title__row">{model.venue?.name || 'no venue plan in this project'}</div>
            <div className="rigplot-title__grid rigplot-mono">
                <span>print 1:{scale} · A3</span><span>sheet 1 / 3</span>
                <span>{t.channels}</span><span>{t.power}</span>
                <span>{t.fixtures}</span><span>{t.circuits}</span>
                <span>desk {desk.here == null ? '…' : desk.here ? `here · ${desk.output || 'output ?'}` : 'none here'}</span>
                <span>console in: {desk.consoleIn}</span>
            </div>
            <div className="rigplot-title__links">
                <a href={patch}>sheet 2 · patch</a>
                <a href={`${patch}#power`}>sheet 3 · power</a>
                <a href={buildEquipmentPath(spaceId, projectId)}>equipment</a>
                <button type="button" onClick={onPrint}>print sheet 1</button>
            </div>
        </section>
    )
}

function ToolOptions({ tool, options, setOptions, library }) {
    const lampTypes = library.types.filter((t) => !isEffectType(t))
    const fxTypes = library.types.filter((t) => isEffectType(t))
    if (tool === 'truss') {
        return (
            <div className="rigplot-options">
                <p className="rigplot-hint">Drag on the plan to draw a run: it lays 3, 2 and 1 m segments end to end, and starts on a truss end or a tower top when you begin near one. A click drops one segment.</p>
                <div className="rigplot-seg" role="group" aria-label="segment">
                    {['truss-3m', 'truss-2m', 'truss-1m'].map((k) => (
                        <button key={k} type="button" aria-pressed={options.truss === k} onClick={() => setOptions({ ...options, truss: k })}>{PIECES[k].length} m</button>
                    ))}
                </div>
                <NumField label="height" value={options.trussHeight} min={0.5} max={30} onCommit={(v) => setOptions({ ...options, trussHeight: v ?? 6 })} />
            </div>
        )
    }
    if (tool === 'tower') return <div className="rigplot-options"><p className="rigplot-hint">Click to stand a tower. Near a truss end it stands under it, built to the truss&apos;s height.</p><NumField label="height" value={options.towerHeight} min={1} max={20} onCommit={(v) => setOptions({ ...options, towerHeight: v ?? 6 })} /></div>
    if (tool === 'deck') return <div className="rigplot-options"><p className="rigplot-hint">Click to lay a 2 × 1 m deck. Next to a deck it joins edge to edge. R turns it.</p><NumField label="height" value={options.deckHeight} min={0.2} max={3} onCommit={(v) => setOptions({ ...options, deckHeight: v ?? 1 })} /></div>
    if (tool === 'fixture' || tool === 'fx') {
        const list = tool === 'fixture' ? lampTypes : fxTypes
        const key = tool === 'fixture' ? 'lampType' : 'fxType'
        return (
            <div className="rigplot-options">
                <p className="rigplot-hint">{tool === 'fixture' ? 'Click near a truss to hang it at the nearest slot; on a deck it stands on the deck; elsewhere on the floor.' : 'Click to stand an effect on the floor or a deck.'}</p>
                <div className="rigplot-typelist" role="listbox" aria-label="type">
                    {list.map((t) => (
                        <button key={t.id} type="button" role="option" aria-selected={options[key] === t.id} onClick={() => setOptions({ ...options, [key]: t.id })}>
                            <span className="rigplot-mono">{t.code}</span><em>{t.modes?.length ? `${t.defaultMode || t.modes[0].name}` : 'mode owed'}</em>
                        </button>
                    ))}
                </div>
            </div>
        )
    }
    if (tool === 'measure') return <div className="rigplot-options"><p className="rigplot-hint">Drag between two points; the distance stays until Esc. Points snap to the 0.5 m grid (hold Alt for free).</p></div>
    return <div className="rigplot-options"><p className="rigplot-hint">Click a lamp or a truss; Shift adds to the selection; drag on empty floor to box-select. Drag to move — it snaps. R turns 90° (Shift+R 15°), Delete removes, arrows nudge 0.5 m.</p></div>
}

export function Inspector({ model, selectedIds, entities, library, edit, patchGroup, runOf }) {
    const lamps = model.lamps.filter((l) => selectedIds.includes(l.id))
    const pieces = model.pieces.filter((p) => selectedIds.includes(p.id))
    if (!lamps.length && !pieces.length) return null
    const byId = new Map(entities.map((e) => [e.id, e]))

    if (lamps.length === 1 && !pieces.length) {
        const l = lamps[0]
        const e = byId.get(l.id)
        const f = e.components.fixture
        const type = typeById(library, f.type)
        const mode = type ? modeOf(type, f.mode || type.defaultMode) : null
        const addr = f.universe != null && f.address != null ? `U${f.universe}.${String(f.address).padStart(3, '0')}${mode?.footprint > 1 ? `–${String(f.address + mode.footprint - 1).padStart(3, '0')}` : ''}` : 'not patched'
        const mount = l.mount
        return (
            <section className="rigplot-block rigplot-inspector" aria-label="Inspector">
                <h2 className="rigplot-mono">{f.index != null ? `#${f.index} ` : ''}{type?.code || f.type}</h2>
                <p className="rigplot-sub">{type?.maker ? `${type.maker}` : type?.modelledOn ? `not identified — modelled on ${type.modelledOn}` : ''}</p>
                <dl className="rigplot-dl rigplot-mono">
                    <dt>mode</dt><dd>{mode ? `${mode.name} · ${mode.footprint} ch` : 'mode owed (rental house)'}</dd>
                    <dt>patch</dt><dd>{addr}</dd>
                    <dt>power</dt><dd>{l.watts != null ? `${l.watts} W` : '?'}{f.circuit ? ` · ${f.circuit}` : ''}</dd>
                    <dt>mount</dt><dd>{f.hung ? 'hung' : 'standing'} · x {r2(mount[0])} · z {r2(mount[2])} · h {r2(mount[1])}</dd>
                </dl>
                {type?.modes?.length > 1 ? (
                    <label className="rigplot-field rigplot-field--text"><span>mode</span>
                        <select value={f.mode || type.defaultMode} onChange={(ev) => edit(fixtureOps([l.id], { mode: ev.target.value }), 'mode changed')}>
                            {type.modes.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                        </select>
                    </label>
                ) : null}
                <div className="rigplot-fields">
                    <NumField label="univ" unit="" value={f.universe ?? null} min={1} max={63999} onCommit={(v) => edit(fixtureOps([l.id], { universe: v }), 'universe typed')} />
                    <NumField label="addr" unit="" value={f.address ?? null} min={1} max={512} onCommit={(v) => edit(fixtureOps([l.id], { address: v }), 'address typed')} />
                    <NumField label="unit" unit="" value={f.unit ?? null} min={1} max={9999} onCommit={(v) => edit(fixtureOps([l.id], { unit: v }), 'unit')} />
                </div>
                <TextField label="position" value={f.position} onCommit={(v) => edit(fixtureOps([l.id], { position: v || null }), 'position')} />
                <TextField label="circuit" value={f.circuit} placeholder="C1" onCommit={(v) => edit(fixtureOps([l.id], { circuit: v || null }), 'circuit')} />
                <div className="rigplot-fields">
                    <NumField label="x" value={r2(mount[0])} onCommit={(v) => edit(moveOps(entities, [l.id], [v - mount[0], 0, 0]), 'moved')} />
                    <NumField label="z" value={r2(mount[2])} onCommit={(v) => edit(moveOps(entities, [l.id], [0, 0, v - mount[2]]), 'moved')} />
                    <NumField label="h" value={r2(mount[1])} onCommit={(v) => edit(moveOps(entities, [l.id], [0, v - mount[1], 0]), 'moved')} />
                </div>
                {l.flags.length ? (
                    <ul className="rigplot-flags">
                        {l.flags.map((c) => <li key={c} className={l.conflicts.includes(c) ? 'is-conflict' : ''}>{l.conflicts.includes(c) ? '! ' : '· '}{FLAG_WORDS[c] || c}</li>)}
                        {l.notes.map((n, i) => <li key={`n${i}`}>{n}</li>)}
                    </ul>
                ) : null}
                <div className="rigplot-actions">
                    <button type="button" onClick={() => edit(deleteOps([l.id]), 'deleted 1 lamp')}>delete</button>
                </div>
            </section>
        )
    }

    const run = pieces.length ? runOf(pieces[0].id) : null
    const onlyRun = run && pieces.every((p) => run.ids.includes(p.id)) && !lamps.length
    if (onlyRun || (pieces.length === 1 && !lamps.length)) {
        const p = pieces[0]
        const truss = pieceOf(p.kind).category === 'truss'
        return (
            <section className="rigplot-block rigplot-inspector" aria-label="Inspector">
                <h2 className="rigplot-mono">{truss ? `truss · ${run.ids.length} segment${run.ids.length === 1 ? '' : 's'}` : pieceOf(p.kind).label}</h2>
                <p className="rigplot-sub">{truss ? run.ids.map((id) => model.pieces.find((x) => x.id === id)?.kind.replace('truss-', '')).join(' + ') : p.name}</p>
                <TextField label="name" value={p.name} onCommit={(v) => edit(renamePositionOps(entities, { pieceIds: truss ? run.ids : [p.id], from: p.name, to: v }), 'renamed')} />
                <div className="rigplot-fields">
                    {truss ? <NumField label="length" value={run.length} min={1} max={60} step={1} onCommit={(v) => edit(runLengthOps({ entities, run, length: Math.round(v), newId: () => generateId('entity'), assetFor: (k) => edit.assetId(k) }), `truss run ${Math.round(v)} m`)} /> : null}
                    <NumField label="height" value={truss ? run.height : p.height} min={0.2} max={30} onCommit={(v) => edit(truss ? run.ids.flatMap((id) => heightOps(entities, id, v, library)) : heightOps(entities, p.id, v, library), 'height')} />
                </div>
                <div className="rigplot-fields">
                    <NumField label="x" value={r2(truss ? run.from[0] : p.position[0])} onCommit={(v) => { const ids = truss ? run.ids : [p.id]; const dx = v - (truss ? run.from[0] : p.position[0]); edit(moveOps(entities, [...ids, ...ridersOfIds(entities, ids, library)], [dx, 0, 0]), 'moved') }} />
                    <NumField label="z" value={r2(truss ? run.from[1] : p.position[2])} onCommit={(v) => { const ids = truss ? run.ids : [p.id]; const dz = v - (truss ? run.from[1] : p.position[2]); edit(moveOps(entities, [...ids, ...ridersOfIds(entities, ids, library)], [0, 0, dz]), 'moved') }} />
                    <NumField label="turn" unit="°" value={Math.round((wrapYaw(p.yaw) * 180) / Math.PI)} onCommit={(v) => {
                        const ids = truss ? run.ids : [p.id]
                        const centre = truss ? [(run.from[0] + run.to[0]) / 2, (run.from[1] + run.to[1]) / 2] : [p.position[0], p.position[2]]
                        edit(rotateOps(entities, [...ids, ...ridersOfIds(entities, ids, library)], (v * Math.PI) / 180 - p.yaw, centre), 'turned')
                    }} />
                </div>
                <p className="rigplot-sub">{truss ? `${ridersOfIds(entities, run.ids, library).length} lamps hang on it · ` : ''}no load or rigging calculation is made — a sign-off is owed for a real hang</p>
                <div className="rigplot-actions">
                    <button type="button" onClick={() => { const ids = truss ? run.ids : [p.id]; const riders = ridersOfIds(entities, ids, library); edit(deleteOps([...ids, ...riders]), `deleted ${ids.length} piece${ids.length === 1 ? '' : 's'}${riders.length ? ` and ${riders.length} lamps on it` : ''}`) }}>delete</button>
                </div>
            </section>
        )
    }

    // Many.
    const lampIds = lamps.map((l) => l.id)
    const positions = [...new Set(lamps.map((l) => l.position).filter(Boolean))]
    return (
        <section className="rigplot-block rigplot-inspector" aria-label="Inspector">
            <h2 className="rigplot-mono">{lamps.length} lamps{pieces.length ? ` · ${pieces.length} pieces` : ''}</h2>
            <p className="rigplot-sub">{positions.length ? positions.join(', ') : ''}</p>
            {lamps.length ? (
                <>
                    <div className="rigplot-actions">
                        <button type="button" className="is-primary" onClick={() => patchGroup(lampIds)}>patch this group</button>
                    </div>
                    <p className="rigplot-sub">lays these {lamps.length} out again as one block in one universe (the desk decides where)</p>
                    <TextField label="position" value={positions.length === 1 ? positions[0] : ''} placeholder="name them all" onCommit={(v) => v && edit(fixtureOps(lampIds, { position: v }), 'position')} />
                    <TextField label="circuit" value="" placeholder="C1" onCommit={(v) => v && edit(fixtureOps(lampIds, { circuit: v }), 'circuit')} />
                </>
            ) : null}
            <div className="rigplot-actions">
                <button type="button" onClick={() => edit(deleteOps(selectedIds), `deleted ${selectedIds.length}`)}>delete</button>
            </div>
        </section>
    )
}

// ---- the surface -----------------------------------------------------------------

export default function PlotSurface({ spaceId, projectId, library: baseLibrary = TYPE_LIBRARY }) {
    const store = useProjectStore()
    const { state, dispatch } = store
    const { applyLocalOps: syncOps } = useProjectDocumentSync({ projectId, store, clientIdPrefix: 'plot-client', opIdPrefix: 'plot-op' })
    const { applyLocalOps, undo, redo } = useOpHistory({ projectId, document: state.document, applyLocalOps: syncOps })
    const document_ = state.document
    const entities = useMemo(() => document_.entities || [], [document_.entities])
    // The library with the show's own types (RIG_BUILD.md §13), one object per list.
    const library = useMemo(() => libraryWithShow(baseLibrary, entities), [baseLibrary, entities])
    const patch = useRigAutoPatch({ projectId, entities, applyOps: syncOps, library })
    const desk = useDeskState()
    const phone = useIsPhone()

    const selectedIds = useMemo(() => state.selectedEntityIds || [], [state.selectedEntityIds])
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
    const select = useCallback((ids) => dispatch({ type: 'select-entities', entityIds: ids }), [dispatch])

    const [tool, setTool] = useState('select')
    const [options, setOptions] = useState({ truss: 'truss-3m', trussHeight: 6, towerHeight: 6, deckHeight: 1, lampType: 'up-250bsw', fxType: 'up-yz31p' })
    const [status, setStatus] = useState('')
    const [preview, setPreview] = useState(null) // { ops } — a drag not yet let go
    const [ghost, setGhost] = useState(null)
    const [measure, setMeasure] = useState(null)
    const [marquee, setMarquee] = useState(null)
    const [pane, setPane] = useState('plan') // phone: plan | room
    const [sheetOpen, setSheetOpen] = useState(false)
    const [printing, setPrinting] = useState(false)

    const shown = useMemo(() => (preview?.ops?.length ? applyProjectOps(document_, preview.ops).entities : entities), [preview, document_, entities])
    const model = useMemo(() => plotModel({ entities: shown, library, deskFlags: patch.flags, projectId }), [shown, library, patch.flags, projectId])
    const runOf = useCallback((id) => model.runs.find((r) => r.ids.includes(id)) || null, [model.runs])

    // --- the asset for a piece's body: uploaded once per project, content-hashed ---
    const { assetIdFor, ensureAsset } = usePieceAssets({ projectId, document: document_, applyOps: applyLocalOps })

    const edit = useCallback((ops, message) => {
        if (!ops?.length) return
        applyLocalOps(ops)
        if (message) setStatus(message)
    }, [applyLocalOps])
    edit.assetId = assetIdFor

    // --- the view --------------------------------------------------------------
    const svgRef = useRef(null)
    const [box, setBox] = useState([900, 700])
    const [view, setView] = useState(null)
    useEffect(() => {
        const el = svgRef.current
        if (!el || typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            if (width > 0 && height > 0) setBox([width, height])
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [pane, phone])
    const extent = useMemo(() => rigExtent({ lamps: model.lamps, pieces: model.pieces, boxes: model.boxes }, planExtent(model.venue)) || [-10, -10, 10, 10], [model.lamps, model.pieces, model.boxes, model.venue])
    const fitted = useRef(false)
    useEffect(() => {
        if (!state.hasLoaded || fitted.current) return
        fitted.current = true
        setView(fitView(extent, box))
    }, [state.hasLoaded, extent, box])
    // Keep the view's aspect the box's, so a metre is square and `u` is exact.
    const v = useMemo(() => {
        const base = view || fitView(extent, box)
        const h = base[2] * (box[1] / box[0])
        return [base[0], base[1] + (base[3] - h) / 2, base[2], h]
    }, [view, extent, box])
    const u = v[2] / box[0]

    const printScale = useMemo(() => {
        const { drawing } = sheetLayout(SHEETS.A3)
        return chooseScale([extent[2] - extent[0], extent[3] - extent[1]], [drawing.w, drawing.h])
    }, [extent])

    const toPlan = useCallback((event) => {
        const svg = svgRef.current
        const ctm = svg?.getScreenCTM?.()
        if (!ctm) return [0, 0]
        const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
        return [p.x, p.y]
    }, [])

    // --- snapping --------------------------------------------------------------
    const others = useMemo(() => model.pieces.map((p) => ({ id: p.id, kind: p.kind, position: p.position, yaw: p.yaw, height: p.height })), [model.pieces])
    const [yaw, setYaw] = useState(0)

    const snapWords = (res) => {
        if (!res?.to) return ''
        if (res.to.grid) return `grid ${res.to.grid} m`
        const target = model.pieces.find((p) => p.id === res.to.id)
        const what = { face: target?.category === 'deck' ? 'deck edge' : 'truss end', sit: 'tower top', under: 'under the truss end', hang: `truss slot ${res.to.point.replace('slot-', '')}`, stand: 'on the deck' }[res.to.join] || res.to.join
        return `snaps: ${what}`
    }

    const placementPose = useCallback((at, kindOverride = null) => {
        const t = kindOverride || tool
        if (t === 'truss') {
            const res = snap({ kind: options.truss, position: [at[0], options.trussHeight, at[1]], yaw, others, metric: 'plan' })
            return { kind: options.truss, res, height: null }
        }
        if (t === 'tower') {
            const res = snap({ kind: 'tower', position: [at[0], 0, at[1]], yaw, others, metric: 'plan', height: options.towerHeight })
            if (res.to.join === 'under') return { kind: 'tower', res: { ...res, position: [res.position[0], 0, res.position[2]] }, height: Math.round((res.position[1] + options.towerHeight) * 1000) / 1000 }
            return { kind: 'tower', res, height: options.towerHeight }
        }
        if (t === 'deck') {
            const res = snap({ kind: 'deck-2x1', position: [at[0], 0, at[1]], yaw, others, metric: 'plan', height: options.deckHeight })
            return { kind: 'deck-2x1', res, height: options.deckHeight }
        }
        if (t === 'fixture' || t === 'fx') {
            const res = snap({ kind: 'lamp', position: [at[0], 0, at[1]], yaw: 0, others, metric: 'plan' })
            return { kind: 'lamp', type: t === 'fixture' ? options.lampType : options.fxType, res }
        }
        return null
    }, [tool, options, yaw, others])

    const place = useCallback(async (pose) => {
        if (!pose) return
        if (pose.kind === 'lamp') {
            const type = typeById(library, pose.type)
            if (!type) return
            const target = pose.res.to.id ? entities.find((e) => e.id === pose.res.to.id) : null
            const position = target?.name || (pose.res.hung ? 'truss' : 'floor')
            const lamp = lampEntity({ id: generateId('entity'), type, mount: pose.res.position, hung: pose.res.hung, position, unit: nextUnit(entities, position), entities })
            edit(createOps([lamp]), `${type.code} placed · ${snapWords(pose.res)} · auto-patch follows`)
            select([lamp.id])
            return
        }
        const assetId = await ensureAsset(pose.kind)
        const piece = pieceEntity({ id: generateId('entity'), kind: pose.kind, position: pose.res.position, yaw: pose.res.yaw, height: pose.height, assetId })
        edit(createOps([piece]), `${pieceOf(pose.kind).label} placed · ${snapWords(pose.res)}`)
        select([piece.id])
    }, [library, entities, edit, ensureAsset, select]) // eslint-disable-line react-hooks/exhaustive-deps

    // --- pointer ---------------------------------------------------------------
    const drag = useRef(null)
    const pointers = useRef(new Map())

    const onPointerDown = (event) => {
        const at = toPlan(event)
        pointers.current.set(event.pointerId, [event.clientX, event.clientY])
        event.currentTarget.setPointerCapture?.(event.pointerId)
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            drag.current = { mode: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]), view: v }
            setPreview(null)
            return
        }
        const panButton = event.button === 1 || event.button === 2
        if (panButton) { drag.current = { mode: 'pan', start: [event.clientX, event.clientY], view: v }; return }
        const hitId = hitTest({ lamps: model.lamps.map((l) => ({ id: l.id, at: l.at, r: SCREEN_SIZES.symbol * u })), pieces: model.pieces }, at, 4 * u)
        if (tool === 'select') {
            if (hitId) {
                const run = !event.altKey ? runOf(hitId) : null
                const ids = run ? run.ids : [hitId]
                let next = selectedIds
                if (event.shiftKey) next = ids.every((id) => selectedSet.has(id)) ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]
                else if (!ids.every((id) => selectedSet.has(id))) next = ids
                select(next)
                drag.current = { mode: 'move', start: at, primary: hitId, ids: next, moved: false }
                return
            }
            if (event.pointerType === 'touch' || event.pointerType === 'pen') { drag.current = { mode: 'pan', start: [event.clientX, event.clientY], view: v, tap: at }; return }
            drag.current = { mode: 'marquee', start: at, shift: event.shiftKey }
            setMarquee([at[0], at[1], at[0], at[1]])
            return
        }
        if (tool === 'truss') {
            const start = snap({ kind: 'truss-1m', position: [at[0], options.trussHeight, at[1]], others, metric: 'plan' })
            // Begin on a truss end or a tower top when near one: the run continues it at its height.
            let from = [snapToGrid(at[0]), snapToGrid(at[1])]
            let y = options.trussHeight
            if (start.to.id) {
                const p = others.find((o) => o.id === start.to.id)
                const pieceRec = p && (p.kind === 'tower' ? { top: [p.position[0], p.position[1] + (p.height || 6), p.position[2]] } : null)
                if (pieceRec) { from = [pieceRec.top[0], pieceRec.top[2]]; y = Math.round((pieceRec.top[1] + 0.145) * 1000) / 1000 } else if (p) {
                    const half = PIECES[p.kind].length / 2
                    const ends = [-half, half].map((x) => [p.position[0] + Math.cos(p.yaw) * x, p.position[2] - Math.sin(p.yaw) * x])
                    from = ends.sort((a, b) => Math.hypot(a[0] - at[0], a[1] - at[1]) - Math.hypot(b[0] - at[0], b[1] - at[1]))[0]
                    y = p.position[1]
                }
            }
            drag.current = { mode: 'run', start: at, from, y }
            return
        }
        if (tool === 'measure') {
            const p = event.altKey ? at : [snapToGrid(at[0]), snapToGrid(at[1])]
            drag.current = { mode: 'measure', from: p }
            setMeasure({ a: p, b: p })
            return
        }
        drag.current = { mode: 'place', start: at }
    }

    const onPointerMove = (event) => {
        const at = toPlan(event)
        if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, [event.clientX, event.clientY])
        const d = drag.current
        if (!d) {
            if (['truss', 'tower', 'deck', 'fixture', 'fx'].includes(tool) && event.pointerType !== 'touch') setGhost(placementPose(at))
            return
        }
        if (d.mode === 'pinch' && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
            const mid = toPlan({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 })
            setView(zoomView(d.view, dist / d.dist, mid))
            return
        }
        if (d.mode === 'pan') {
            const k = v[2] / box[0]
            setView([d.view[0] - (event.clientX - d.start[0]) * k, d.view[1] - (event.clientY - d.start[1]) * k, d.view[2], d.view[3]])
            if (Math.hypot(event.clientX - d.start[0], event.clientY - d.start[1]) > 6) d.moved = true
            return
        }
        if (d.mode === 'marquee') { setMarquee([d.start[0], d.start[1], at[0], at[1]]); return }
        if (d.mode === 'measure') { setMeasure({ a: d.from, b: event.altKey ? at : [snapToGrid(at[0]), snapToGrid(at[1])] }); return }
        if (d.mode === 'run') {
            const segs = layRun({ from: d.from, to: at, y: d.y })
            setGhost({ run: segs, length: segs.reduce((s, x) => s + PIECES[x.kind].length, 0) })
            return
        }
        if (d.mode === 'move') {
            const dx = at[0] - d.start[0]
            const dz = at[1] - d.start[1]
            if (!d.moved && Math.hypot(dx, dz) < 3 * u) return
            d.moved = true
            const primary = model.pieces.find((p) => p.id === d.primary)
            const lamp = model.lamps.find((l) => l.id === d.primary)
            const riders = ridersOfIds(entities, d.ids, library).filter((id) => !d.ids.includes(id))
            const moving = new Set([...d.ids, ...riders])
            const rest = others.filter((o) => !moving.has(o.id))
            let delta = [snapToGrid(dx), 0, snapToGrid(dz)]
            let extra = []
            let words = `grid 0.5 m · Δ ${r2(delta[0])}, ${r2(delta[2])}`
            const original = entities.find((e) => e.id === d.primary)
            if (primary && original) {
                const o = original.components.transform.position
                const res = snap({ kind: primary.kind, id: primary.id, position: [o[0] + dx, o[1], o[2] + dz], yaw: primary.yaw, others: rest, metric: 'plan', height: primary.height })
                if (res.to.join === 'under') {
                    // A tower keeps its feet on the floor and is built to the truss's height.
                    delta = [res.position[0] - o[0], 0, res.position[2] - o[2]]
                    extra = heightOps(entities, primary.id, Math.round((res.position[1] + primary.height) * 1000) / 1000, library)
                } else if (d.ids.length === 1 || res.to.id) {
                    delta = [res.position[0] - o[0], res.position[1] - o[1], res.position[2] - o[2]]
                    if (res.yaw !== primary.yaw && d.ids.length === 1) extra = placeOps(original, { position: res.position, yaw: res.yaw })
                }
                words = snapWords(res)
            } else if (lamp && original) {
                const res = snap({ kind: 'lamp', position: [lamp.mount[0] + dx, 0, lamp.mount[2] + dz], others: rest, metric: 'plan' })
                delta = [res.position[0] - lamp.mount[0], res.position[1] - lamp.mount[1], res.position[2] - lamp.mount[2]]
                if (d.ids.length === 1 && (res.hung === true) !== (lamp.hung === true)) extra = fixtureOps([lamp.id], { hung: res.hung === true ? true : null })
                words = snapWords(res)
            }
            const ops = [...moveOps(entities, [...moving], delta), ...extra.filter((op) => op.payload.component !== 'transform' || op.payload.patch.scale || op.payload.patch.rotation)]
            setPreview({ ops, words })
            setStatus(words)
        }
    }

    const onPointerUp = (event) => {
        pointers.current.delete(event.pointerId)
        const d = drag.current
        drag.current = null
        if (!d) return
        const at = toPlan(event)
        if (d.mode === 'pinch') return
        if (d.mode === 'pan') {
            if (!d.moved && d.tap) select([])
            return
        }
        if (d.mode === 'marquee') {
            setMarquee(null)
            const ids = inMarquee({ lamps: model.lamps, pieces: model.pieces }, [d.start[0], d.start[1], at[0], at[1]])
            if (Math.hypot(at[0] - d.start[0], at[1] - d.start[1]) < 3 * u) { if (!d.shift) select([]); return }
            select(d.shift ? [...new Set([...selectedIds, ...ids])] : ids)
            setStatus(`${ids.length} selected`)
            return
        }
        if (d.mode === 'measure') return
        if (d.mode === 'run') {
            setGhost(null)
            const length = Math.hypot(at[0] - d.from[0], at[1] - d.from[1])
            if (length < 0.5) { place(placementPose(at)); return }
            const segs = layRun({ from: d.from, to: at, y: d.y })
            Promise.all([...new Set(segs.map((s) => s.kind))].map(async (k) => [k, await ensureAsset(k)])).then((pairs) => {
                const assets = Object.fromEntries(pairs)
                const pieces = segs.map((s) => pieceEntity({ id: generateId('entity'), kind: s.kind, position: s.position, yaw: s.yaw, assetId: assets[s.kind], name: 'truss' }))
                edit(createOps(pieces), `truss run ${segs.reduce((s, x) => s + PIECES[x.kind].length, 0)} m at h ${d.y} m · ${segs.map((s) => PIECES[s.kind].length).join(' + ')}`)
                select(pieces.map((p) => p.id))
            })
            return
        }
        if (d.mode === 'move') {
            if (d.moved && preview?.ops?.length) edit(preview.ops, `moved · ${preview.words || ''}`)
            setPreview(null)
            return
        }
        if (d.mode === 'place') place(placementPose(at))
    }

    const onWheel = (event) => {
        const at = toPlan(event)
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015))
        setView(zoomView(v, factor, at))
    }
    useEffect(() => {
        const el = svgRef.current
        if (!el) return undefined
        const stop = (e) => e.preventDefault()
        el.addEventListener('wheel', stop, { passive: false })
        return () => el.removeEventListener('wheel', stop)
    }, [pane, phone])

    // --- keys ------------------------------------------------------------------
    useEffect(() => {
        const onKey = (event) => {
            const tag = event.target?.tagName
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
            if (event.key === 'Escape') { setMeasure(null); setGhost(null); setPreview(null); drag.current = null; if (tool !== 'select') setTool('select'); else select([]); return }
            if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
                const riders = ridersOfIds(entities, selectedIds, library).filter((id) => !selectedSet.has(id))
                edit(deleteOps([...selectedIds, ...riders]), `deleted ${selectedIds.length}${riders.length ? ` and ${riders.length} lamps hanging on it` : ''}`)
                select([])
                return
            }
            if (event.key === 'r' || event.key === 'R') {
                const step = event.shiftKey ? Math.PI / 12 : Math.PI / 2
                if (selectedIds.length && tool === 'select') {
                    const riders = ridersOfIds(entities, selectedIds, library).filter((id) => !selectedSet.has(id))
                    const chosen = model.pieces.filter((p) => selectedSet.has(p.id))
                    const pts = [...chosen.map((p) => [p.position[0], p.position[2]]), ...model.lamps.filter((l) => selectedSet.has(l.id)).map((l) => l.at)]
                    const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
                    edit(rotateOps(entities, [...selectedIds, ...riders], step, c), `turned ${Math.round((step * 180) / Math.PI)}°`)
                } else setYaw((y) => wrapYaw(y + step))
                return
            }
            if (event.key.startsWith('Arrow') && selectedIds.length) {
                event.preventDefault()
                const s = event.shiftKey ? 0.1 : 0.5
                const dxz = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[event.key]
                const riders = ridersOfIds(entities, selectedIds, library).filter((id) => !selectedSet.has(id))
                edit(moveOps(entities, [...selectedIds, ...riders], [dxz[0], 0, dxz[1]]), `nudged ${s} m`)
                return
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return
            const t = TOOLS.find((x) => x.key === event.key)
            if (t) setTool(t.id)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selectedIds, selectedSet, entities, library, model, tool, edit, select, undo, redo])

    useEffect(() => { setGhost(null); setMeasure((m) => (tool === 'measure' ? m : null)) }, [tool])
    useEffect(() => {
        const prev = document.title
        document.title = `Plot — ${document_.projectMeta?.title || projectId}`
        return () => { document.title = prev }
    }, [document_.projectMeta?.title, projectId])
    useEffect(() => { if (patch.message) setStatus(`auto-patch · ${patch.message}`) }, [patch.message, patch.at])

    const title = document_.projectMeta?.title || projectId
    // How many labels the drawing left out where they would collide (it reports it).
    const [hidden, setHidden] = useState(0)
    const dragTool = useRef(null)

    if (printing) {
        return (
            <Suspense fallback={<p className="rigplot-loading">Preparing the sheet…</p>}>
                <PlotPrint model={model} title={title} spaceId={spaceId} projectId={projectId} extent={extent} viewExtent={[v[0], v[1], v[0] + v[2], v[1] + v[3]]} desk={desk} onClose={() => setPrinting(false)} version={state.version} />
            </Suspense>
        )
    }

    const ghostModel = ghost?.res || ghost?.run ? ghost : null
    const plan = (
        <div className={`rigplot-plan${tool !== 'select' ? ' is-placing' : ''}`}>
            <svg
                ref={svgRef}
                className="rigplot-svg"
                viewBox={v.join(' ')}
                role="application"
                aria-label={`Lighting plot of ${title}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={(e) => { pointers.current.delete(e.pointerId); drag.current = null; setPreview(null) }}
                onPointerLeave={() => { if (!drag.current) setGhost(null) }}
                onWheel={onWheel}
                onContextMenu={(e) => e.preventDefault()}
                onDragOver={(e) => { e.preventDefault(); if (dragTool.current) setGhost(placementPose(toPlan(e), dragTool.current)) }}
                onDrop={(e) => { e.preventDefault(); const t = dragTool.current; dragTool.current = null; setGhost(null); if (t) place(placementPose(toPlan(e), t)) }}
            >
                <rect x={v[0]} y={v[1]} width={v[2]} height={v[3]} fill="#fff" />
                {state.hasLoaded ? (
                    <PlotDrawing model={model} u={u} view={v} selected={selectedSet} onHidden={setHidden}>
                        {ghostModel?.res ? <Ghost ghost={ghost} u={u} model={model} options={options} /> : null}
                        {ghostModel?.run ? <RunGhost run={ghost.run} u={u} /> : null}
                        {marquee ? <rect x={Math.min(marquee[0], marquee[2])} y={Math.min(marquee[1], marquee[3])} width={Math.abs(marquee[2] - marquee[0])} height={Math.abs(marquee[3] - marquee[1])} fill="rgba(0,0,0,0.04)" stroke="#111" strokeWidth={u} strokeDasharray={`${4 * u} ${3 * u}`} /> : null}
                        {measure ? <MeasureLine m={measure} u={u} /> : null}
                    </PlotDrawing>
                ) : null}
            </svg>
            {!state.hasLoaded ? <p className="rigplot-loading">Reading the rig…</p> : null}
            {state.hasLoaded && !model.venue ? <p className="rigplot-banner">No venue plan in this project: the hall is not drawn. It comes from the hall the model was built from (scripts/rigbuild/load-plot.mjs).</p> : null}
            <ScaleBar u={u} />
        </div>
    )

    const rail = (
        <nav className="rigplot-rail" aria-label="Tools">
            {TOOLS.map((t) => (
                <button
                    key={t.id} type="button" aria-pressed={tool === t.id} title={`${t.label} (${t.key.toUpperCase()})`}
                    draggable={['truss', 'tower', 'deck', 'fixture', 'fx'].includes(t.id)}
                    onDragStart={(e) => { dragTool.current = t.id; e.dataTransfer.setData('text/rigplot-tool', t.id); e.dataTransfer.effectAllowed = 'copy' }}
                    onDragEnd={() => { dragTool.current = null; setGhost(null) }}
                    onClick={() => setTool(t.id)}
                >{t.label}</button>
            ))}
        </nav>
    )

    const side = (
        <>
            <ToolOptions tool={tool} options={options} setOptions={setOptions} library={library} />
            <Inspector model={model} selectedIds={selectedIds} entities={entities} library={library} edit={edit} patchGroup={(ids) => { setStatus(`patching ${ids.length} as a group…`); patch.patchGroup(ids) }} runOf={runOf} />
            <KeyBlock model={model} />
            <TitleBlock title={title} model={model} desk={desk} scale={printScale} spaceId={spaceId} projectId={projectId} onPrint={() => setPrinting(true)} />
        </>
    )

    const statusLine = (
        <div className="rigplot-status rigplot-mono" role="status" aria-live="polite">
            <span>{status || (tool === 'select' ? 'select' : `${tool} · ${snapHint(tool)}`)}</span>
            {hidden ? <span className="rigplot-status__dim">{hidden} labels hidden where they collide — zoom in, or sheet 2 lists every one</span> : null}
            {model.conflicts.length ? <span>! {model.conflicts.length} conflict{model.conflicts.length === 1 ? '' : 's'}</span> : null}
        </div>
    )

    const room = (
        <Suspense fallback={<div className="rigplot-room rigplot-room--empty">room…</div>}>
            <PlotRoom document={shownDocument(document_, shown)} selectedIds={selectedIds} onSelect={(id, add) => (id ? (add ? select([...new Set([...selectedIds, id])]) : select([id])) : select([]))} extent={extent} venueExtent={planExtent(model.venue)} />
        </Suspense>
    )

    if (phone) {
        return (
            <div className="rigplot rigplot--phone">
                <header className="rigplot-top">
                    <span className="rigplot-mono rigplot-top__title">{title}</span>
                    <div className="rigplot-toggle" role="group" aria-label="View">
                        <button type="button" aria-pressed={pane === 'plan'} onClick={() => setPane('plan')}>plan</button>
                        <button type="button" aria-pressed={pane === 'room'} onClick={() => setPane('room')}>room</button>
                    </div>
                </header>
                <div className="rigplot-stage">{pane === 'plan' ? plan : room}</div>
                <section className={`rigplot-sheet${sheetOpen ? ' is-open' : ''}`} aria-label="Pieces and inspector">
                    <button type="button" className="rigplot-sheet__handle" aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}><span aria-hidden="true" />{sheetOpen ? 'close' : 'place · inspect'}</button>
                    <div className="rigplot-sheet__tools">
                        {TOOLS.map((t) => <button key={t.id} type="button" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</button>)}
                    </div>
                    {statusLine}
                    {sheetOpen ? <div className="rigplot-sheet__body">{side}</div> : null}
                </section>
            </div>
        )
    }

    return (
        <div className="rigplot">
            {rail}
            <main className="rigplot-main">
                {plan}
                {statusLine}
            </main>
            <aside className="rigplot-side">
                <div className="rigplot-roombox">{room}</div>
                {side}
            </aside>
        </div>
    )
}

const snapHint = (tool) => ({ truss: 'drag a run; ends snap', tower: 'click; under a truss end it builds to its height', deck: 'click; edges join', fixture: 'click near a truss to hang', fx: 'click to stand', measure: 'drag to measure' }[tool] || '')

// The room pane shows the same entities the plan shows — a drag's preview included —
// so the room follows while the hand is still moving.
const shownDocument = (doc, entities) => (entities === doc.entities ? doc : { ...doc, entities })

function Ghost({ ghost, u, model, options }) {
    const { res } = ghost
    const dash = `${4 * u} ${3 * u}`
    if (ghost.kind === 'lamp') {
        const shape = model.table.get(ghost.type) || { shape: 'circle' }
        return (
            <g pointerEvents="none">
                <path d={shapePath(shape.shape, res.position[0], res.position[2], SCREEN_SIZES.symbol * u)} fill="none" stroke="#111" strokeWidth={u} strokeDasharray={dash} />
                <text x={res.position[0] + 10 * u} y={res.position[2] - 8 * u} fontSize={9 * u} className="rigplot-mono">{res.to.grid ? 'floor · grid' : res.hung ? `hang · ${res.to.point}` : 'on the deck'}</text>
            </g>
        )
    }
    const piece = pieceOf(ghost.kind)
    const w = piece.category === 'truss' ? piece.length : piece.category === 'tower' ? 0.8 : piece.size[0]
    const d = piece.category === 'truss' ? 0.29 : piece.category === 'tower' ? 0.8 : piece.size[2]
    return (
        <g pointerEvents="none" transform={`translate(${res.position[0]} ${res.position[2]}) rotate(${(-res.yaw * 180) / Math.PI})`}>
            <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="rgba(0,0,0,0.05)" stroke="#111" strokeWidth={u * 1.2} strokeDasharray={dash} />
            <text x={0} y={-d / 2 - 6 * u} fontSize={9 * u} textAnchor="middle" className="rigplot-mono">{`${piece.label}${ghost.height ? ` · h ${ghost.height}` : piece.category === 'truss' ? ` · h ${options.trussHeight}` : ''}`}</text>
        </g>
    )
}

function RunGhost({ run, u }) {
    const total = run.reduce((s, x) => s + PIECES[x.kind].length, 0)
    return (
        <g pointerEvents="none">
            {run.map((s, i) => {
                const l = PIECES[s.kind].length
                return <rect key={i} x={-l / 2} y={-0.145} width={l} height={0.29} fill="rgba(0,0,0,0.06)" stroke="#111" strokeWidth={u * 1.2} strokeDasharray={`${4 * u} ${3 * u}`} transform={`translate(${s.position[0]} ${s.position[2]}) rotate(${(-s.yaw * 180) / Math.PI})`} />
            })}
            <text x={run.at(-1).position[0]} y={run.at(-1).position[2] - 12 * u} fontSize={10 * u} className="rigplot-mono">{`${formatMetres(total)} · h ${run[0].position[1]} · ${run.map((s) => PIECES[s.kind].length).join('+')}`}</text>
        </g>
    )
}

function MeasureLine({ m, u }) {
    const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1])
    const mid = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
    return (
        <g pointerEvents="none" stroke="#111" strokeWidth={u * 1.2}>
            <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} strokeDasharray={`${6 * u} ${3 * u}`} />
            {[m.a, m.b].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3 * u} fill="#fff" />)}
            <rect x={mid[0] - 30 * u} y={mid[1] - 20 * u} width={60 * u} height={14 * u} fill="#fff" stroke="none" />
            <text x={mid[0]} y={mid[1] - 9.5 * u} fontSize={10.5 * u} textAnchor="middle" stroke="none" fill="#111" className="rigplot-mono">{formatMetres(len)}</text>
        </g>
    )
}

function ScaleBar({ u }) {
    // A screen scale bar: a round length that is 60–150 px long.
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100]
    const m = steps.find((s) => s / u >= 60) || 100
    const px = m / u
    return (
        <div className="rigplot-scalebar rigplot-mono" aria-hidden="true">
            <span style={{ width: `${px}px` }} />{m} m
        </div>
    )
}
