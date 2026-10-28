import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../project/hooks/useOpHistory.js'
import { useProjectStore } from '../project/state/projectStore.js'
import { generateId } from '../shared/projectSchema.js'
import { useRigAutoPatch } from '../studio/hooks/useRigAutoPatch.js'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { rigProgress } from './rigProgress.js'
import RigBar from './RigSteps.jsx'
import useLocalInstall from '../hooks/useLocalInstall.js'
import { countWords, libraryWithShow, rentalCounts, rentalOf } from './rental.js'
import { symbolTable, shapePath } from './plotSymbols.js'
import { plotData } from './sheet.js'
import { boxesOf, piecesOf, rigExtent } from './plotGeometry.js'
import { planExtent, venueOf } from './venuePlan.js'
import { fillOf, positionsOf } from './positions.js'
import { dealOps } from './deal.js'
import { deleteOps } from './plotEdits.js'
import { plotModel, titleTotals } from './plotModel.js'
import { barTitle, patchBars, UNIVERSE_SIZE } from './patchBars.js'
import { deskLookId, lookIdOfDesk, lookPoses, restOps, rigLooksOf } from './looks.js'
import { deskLooksWithValues } from './deskLookValues.js'
import { cueOps, fireCue } from '../map/cueFiring.js'
import { cueClockWords, cueListSignature, deskCues, nextCueIndex } from './cueRun.js'
import { lightingApiUrl, lightingDeskPath, probeLightingDesk } from '../map/lightingLink.js'
import { NO_DESK_SENTENCE, NO_WRITE } from './rigToolAccess.js'
import ViewOnlyLine from './ViewOnlyLine.jsx'
import './plot.css'
import './cards.css'

// THE CARDS — view C of the rig builder: the rental list dealt onto named positions,
// the patch filling in beside them, the looks on a cue list underneath.
// docs/architecture/RIG_BUILD.md §11.
//
// Everything is read from, and written to, the project document through the op log
// (the Studio's own path), so the plot, the patch sheet and the room see the same rig.
// Nothing is placed in space by hand: a card dealt onto a position becomes lamps at
// that position's slots (positions.js, deal.js), and the desk patches the card as one
// group. The look is the plot's: paper, ink, the house mono — the same classes.

const PlotRoom = lazy(() => import('./PlotRoom.jsx'))

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

const shortCode = (code) => String(code || '').replace(/^UP-/, '')

export function Symbol({ shape, letter, size = 16 }) {
    const r = size * 0.36
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="rigplot-symbol">
            <path d={shapePath(shape, size / 2, size / 2, r)} fill={shape === 'bar' ? '#111' : '#fff'} stroke="#111" strokeWidth="1.2" />
            {letter ? <text x={size / 2} y={size / 2 + r * 0.35} fontSize={r * 1.1} textAnchor="middle" dominantBaseline="central">{letter}</text> : null}
        </svg>
    )
}

/** One card: a type on the list, its count as a bar, dashed when its mode is owed. */
export function Card({ item, shape, selected, onSelect }) {
    const fill = item.ordered ? Math.min(1, item.placed / item.ordered) : 1
    const owed = item.modeOwed === true
    const cls = `rigcards-card${selected ? ' is-selected' : ''}${owed ? ' is-owed' : ''}${item.over || item.unlisted ? ' is-over' : ''}`
    return (
        <button type="button" className={cls} aria-pressed={selected} onClick={onSelect}>
            <span className="rigcards-card__head">
                {shape ? <Symbol shape={shape.shape} letter={shape.letter} /> : null}
                <span className="rigplot-mono rigcards-card__code">{item.code}</span>
                <span className="rigplot-mono rigcards-card__count">{item.placed}/{item.ordered}</span>
            </span>
            <span className="rigcards-card__meta">
                {item.label || item.category || ''}
                {' · '}
                <span className="rigplot-mono">{owed ? 'mode OWED' : item.footprint ? `${item.footprint}ch` : 'mode ?'}{item.watts ? ` · ${item.watts} W` : ''}</span>
            </span>
            <span className="rigcards-card__bar" aria-hidden="true"><span style={{ width: `${Math.round(fill * 100)}%` }} /></span>
            <span className="rigcards-card__words rigplot-mono">{countWords(item)}</span>
        </button>
    )
}

/** One universe as a bar: lamps solid, conflicts hatched, what is left to place dashed. */
function Bar({ u }) {
    const x = (a) => ((a - 1) / UNIVERSE_SIZE) * 512
    const w = (a, b) => Math.max(1, ((b - a + 1) / UNIVERSE_SIZE) * 512 - 0.6)
    return (
        <svg className="rigcards-bar" viewBox="0 0 512 20" preserveAspectRatio="none" role="img" aria-label={`${barTitle(u)} — ${u.makeup}`}>
            <defs>
                <pattern id={`hatch-${u.universe}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="5" fill="#111" /></pattern>
            </defs>
            <rect x="0.5" y="0.5" width="511" height="19" fill="#fff" stroke="#111" vectorEffect="non-scaling-stroke" />
            {u.segments.map((s) => (
                <rect key={s.id} x={x(s.from)} y="1" width={w(s.from, s.to)} height="18" fill={s.conflict ? `url(#hatch-${u.universe})` : '#111'} stroke={s.conflict ? '#111' : 'none'} vectorEffect="non-scaling-stroke" />
            ))}
            {u.toPlace.map((p) => (
                <rect key={p.code} x={x(p.from)} y="2" width={w(p.from, p.to)} height="16" fill="none" stroke="#111" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            ))}
        </svg>
    )
}

function PatchPart({ bars, totals, onMove, kept, onKeep, desk, readOnly = false }) {
    const open = bars.conflicts.filter((c) => !kept.has(c.id))
    return (
        <section className="rigcards-patch" aria-label="Patch per universe">
            <h2 className="rigcards-h">patch · per universe</h2>
            {!bars.universes.length ? <p className="rigplot-hint">{desk ? 'Nothing patched yet.' : `Nothing patched yet. ${NO_DESK_SENTENCE}`}</p> : null}
            {bars.universes.map((u) => (
                <div key={u.universe} className="rigcards-universe">
                    <div className="rigplot-mono rigcards-universe__title">{barTitle(u)}<span className="rigplot-status__dim"> · {u.free} free</span></div>
                    <Bar u={u} />
                    <div className="rigcards-universe__makeup rigplot-mono">{u.makeup}{u.toPlace.map((p) => ` · ${p.code.replace(/^UP-/, '')} ${p.n} to place`).join('')}</div>
                </div>
            ))}
            {bars.owed.map((o) => (
                <div key={o.type} className="rigcards-universe is-owed">
                    <div className="rigplot-mono rigcards-universe__title">{o.noRoom ? 'no universe has room' : 'U? · mode owed'}</div>
                    <div className="rigcards-bar rigcards-bar--owed" aria-hidden="true" />
                    <div className="rigcards-universe__makeup rigplot-mono">{o.code.replace(/^UP-/, '')} ×{o.placed} of {o.ordered} · {o.noRoom ? `${o.width} channels` : 'DMX mode owed by the rental house — no address until it comes'}</div>
                </div>
            ))}
            {open.map((c) => (
                <div key={c.id} className={`rigcards-conflict rigplot-mono${c.move ? '' : ' is-other'}`} role="alert">
                    <b>! {c.index != null ? `#${c.index} ` : ''}{c.at}</b> <span>{c.code} · {c.words}</span>
                    {c.move && !readOnly && desk ? (
                        <span className="rigcards-conflict__acts">
                            <button type="button" className="rigcards-btn is-primary" onClick={() => onMove(c.id)}>move to next free</button>
                            <button type="button" className="rigcards-btn" onClick={() => onKeep(c.id)}>keep</button>
                        </span>
                    ) : null}
                </div>
            ))}
            <p className="rigcards-power rigplot-mono">{totals.power} · {totals.circuits}<br /><span className="rigplot-status__dim">{totals.channels}</span></p>
        </section>
    )
}

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`
const WAIT_WIDTH_S = 60 // how wide a cue that waits for GO is drawn on the timeline

/**
 * THE CUE LIST — the project's own cues (document.mappingState.cues, the same list the
 * map desk, Perform and the Studio fire through fireCue), each naming a look on the
 * desk. Drawn against time by each cue's hold: a cue with a hold moves on by itself, a
 * cue with none waits for GO. A list, not a timeline editor.
 */
function CuePart({ cues, looks, current, onGo, onBack, onFire, onAddAll, onDesk, onRest, onHold, onDelete, desk, onDeskLooks, loop, onLoop, onStop, running, clock, readOnly = false }) {
    const lookOf = (cue) => looks?.looks?.find((l) => l.id === lookIdOfDesk(cue.lightLook)) || null
    // A clock time only while every cue before has a hold; after a cue that waits for
    // GO, when the next one starts is the operator's.
    let t = 0
    let timed = true
    const blocks = cues.map((cue, i) => {
        const w = cue.hold > 0 ? cue.hold : WAIT_WIDTH_S
        const b = { cue, i, at: timed ? t : null, w }
        t += w
        if (!(cue.hold > 0)) timed = false
        return b
    })
    const total = Math.max(t, 1)
    const missing = (looks?.looks || []).filter((l) => !cues.some((c) => c.lightLook === deskLookId(l.id)))
    const onDeskCount = (looks?.looks || []).filter((l) => onDesk.has(deskLookId(l.id))).length
    return (
        <section className="rigcards-cues" aria-label="Looks on the cue list">
            <header className="rigcards-cues__head">
                <h2 className="rigcards-h">looks · cue list</h2>
                <button type="button" className="rigcards-btn is-primary rigcards-go" onClick={onGo} disabled={!cues.length || nextCueIndex(current, cues.length, loop) < 0}>GO{cues.length && nextCueIndex(current, cues.length, loop) >= 0 ? ` ${nextCueIndex(current, cues.length, loop) + 1}` : ''}</button>
                {/* LOOP: after the last cue, cue 1 again — stored in the document (mappingState.loop), played by the desk when one is here */}
                <button type="button" className={`rigcards-btn rigcards-loop${loop ? ' is-on' : ''}`} aria-pressed={loop} onClick={onLoop} disabled={readOnly} title="after the last cue, go back to cue 1">loop {loop ? 'on' : 'off'}</button>
                <button type="button" className="rigcards-btn" onClick={onStop} disabled={!running}>stop</button>
                <button type="button" className="rigcards-btn" onClick={onBack} disabled={current <= 0}>back</button>
                <span className="rigplot-mono rigcards-cues__where">{current >= 0 && cues[current] ? `on: ${current + 1} ${cues[current].name}` : 'nothing fired'}{clock ? ` · ${clock}` : ''}</span>
                {readOnly ? null : <span className="rigcards-cues__acts">
                    {missing.length ? <button type="button" className="rigcards-btn" onClick={() => onAddAll(missing)}>put {missing.length} look{missing.length === 1 ? '' : 's'} on the list</button> : null}
                    {looks && desk ? <button type="button" className="rigcards-btn" onClick={onDeskLooks}>{`send looks to the desk (${onDeskCount}/${looks.looks.length} there)`}</button> : null}
                    {desk ? <a className="rigcards-btn" href={desk}>GO from /light</a> : null}
                </span>}
            </header>
            {!looks ? <p className="rigplot-hint">No designed looks in this project. They are written from the rig file by scripts/rigbuild/looks.mjs.</p> : null}
            {cues.length ? (
                <div className="rigcards-timeline" role="list">
                    {blocks.map(({ cue, i, at, w }) => {
                        const look = lookOf(cue)
                        return (
                            <div key={cue.id} role="listitem" className={`rigcards-cue${i === current ? ' is-live' : ''}${cue.hold > 0 ? '' : ' is-wait'}`} style={{ flexGrow: w / total }}>
                                <button type="button" className="rigcards-cue__fire" onClick={() => onFire(i)} title={look?.intent || ''}>
                                    <span className="rigplot-mono rigcards-cue__n">{i + 1}</span>
                                    <span className="rigcards-cue__name">{cue.name || look?.title || cue.lightLook || 'cue'}</span>
                                    <span className="rigplot-mono rigcards-cue__time">{at != null ? `${fmtTime(at)} · ` : 'after GO · '}{cue.hold > 0 ? `holds ${cue.hold} s` : 'waits for GO'} · fade {cue.fade} s</span>
                                </button>
                                {readOnly ? null : <span className="rigcards-cue__acts">
                                    <label className="rigplot-field"><span>hold</span><input inputMode="numeric" defaultValue={cue.hold || ''} placeholder="GO" aria-label={`hold of cue ${i + 1}, seconds`} onBlur={(e) => onHold(cue, Number(e.target.value) || 0)} /></label>
                                    {look ? <button type="button" className="rigcards-btn" onClick={() => onRest(look.id)} title="write this look's aims and colours into the room, so a link with no desk shows it">rest the room here</button> : null}
                                    <button type="button" className="rigcards-btn" onClick={() => onDelete(cue)} aria-label={`remove cue ${i + 1}`}>remove</button>
                                </span>}
                            </div>
                        )
                    })}
                </div>
            ) : looks ? <p className="rigplot-hint">The cue list is empty. Put the looks on it; each cue fires its look on the desk, and the room follows.</p> : null}
            {!desk ? <p className="rigplot-hint">{NO_DESK_SENTENCE} GO here plays the list in this tab{readOnly ? '' : ' and writes nothing to a desk'}.</p> : null}
            <p className="rigcards-foot rigplot-mono rigplot-status__dim">
                a cue fires its look on the desk&apos;s cue layer; the room poses every lamp by the look&apos;s rules · the desk carries each look WITH its DMX for every type that has a channel list (ASSUMED lists are marked); a type with none shows by the look&apos;s rule · their console drives it once console input lands (#599)
            </p>
        </section>
    )
}

/** A position: its name, its slots filled and free, and — with a card in hand — deal here. */
function PositionRow({ position, fill, lampById, card, n, onDeal, onSlot, onTakeBack, picked, readOnly = false }) {
    const filled = position.slots.filter((s) => fill.has(`${position.id}/${s.id}`)).length
    const free = position.slots.length - filled
    const mine = card ? position.slots.filter((s) => lampById.get(fill.get(`${position.id}/${s.id}`))?.type === card.type).length : 0
    const deal = card ? Math.min(n, free) : 0
    // Two-sided rows read as two lines, left above right; a line reads across.
    const groups = position.kind === 'rows' && position.slots.some((s) => s.side < 0) && position.slots.some((s) => s.side > 0)
        ? [['L', position.slots.filter((s) => s.side < 0)], ['R', position.slots.filter((s) => s.side > 0)]]
        : [['', [...position.slots].sort((a, b) => a.pos[0] - b.pos[0] || a.rank - b.rank)]]
    return (
        <section className="rigcards-pos" aria-label={position.name}>
            <header className="rigcards-pos__head">
                <span className="rigplot-mono rigcards-pos__name">{position.name}</span>
                <span className="rigplot-mono rigcards-pos__count">{filled}/{position.slots.length}</span>
                {card && !readOnly ? (
                    <span className="rigcards-pos__acts">
                        {deal > 0 ? <button type="button" className="rigcards-btn is-primary" onClick={() => onDeal(position, deal)}>deal {deal} here</button> : null}
                        {mine > 0 ? <button type="button" className="rigcards-btn" onClick={() => onTakeBack(position)}>take back {mine}</button> : null}
                    </span>
                ) : null}
            </header>
            <p className="rigcards-pos__note">{position.note}</p>
            {groups.map(([label, slots]) => (
                <div key={label || 'line'} className="rigcards-slots" role="group" aria-label={label ? `${position.name} ${label === 'L' ? 'left' : 'right'}` : position.name}>
                    {label ? <span className="rigcards-slots__side rigplot-mono" aria-hidden="true">{label}</span> : null}
                    {slots.map((s) => {
                        const key = `${position.id}/${s.id}`
                        const lamp = lampById.get(fill.get(key))
                        const cls = `rigcards-slot${lamp ? ' is-filled' : ''}${picked === key ? ' is-picked' : ''}${lamp?.conflict ? ' is-conflict' : ''}`
                        const label2 = lamp ? `${s.id}: ${lamp.code}${lamp.index != null ? ` #${lamp.index}` : ''}${lamp.patch ? ` ${lamp.patch}` : ''}` : `${s.id}: free${card ? ` — tap to hang one ${card.code}` : ''}`
                        return (
                            <button key={s.id} type="button" className={cls} title={label2} aria-label={label2} onClick={() => onSlot(position, s, lamp)}>
                                {lamp ? shortCode(lamp.code) : ''}
                            </button>
                        )
                    })}
                </div>
            ))}
        </section>
    )
}

export default function CardsSurface({ spaceId, projectId, readOnly = false, library: baseLibrary = TYPE_LIBRARY }) {
    const store = useProjectStore()
    const { state } = store
    const { applyLocalOps: sentOps } = useProjectDocumentSync({ projectId, store, clientIdPrefix: 'cards-client', opIdPrefix: 'cards-op' })
    // Read only (a visitor on a public space, rigToolAccess.js): every write in this file
    // goes through here, so none reaches the document.
    const syncOps = readOnly ? NO_WRITE : sentOps
    const { applyLocalOps, undo, redo, edits } = useOpHistory({ projectId, document: state.document, applyLocalOps: syncOps })
    const document_ = state.document
    const entities = useMemo(() => document_.entities || [], [document_.entities])
    // The library with the show's own types (RIG_BUILD.md §13), one object per list.
    const library = useMemo(() => libraryWithShow(baseLibrary, entities), [baseLibrary, entities])
    const patch = useRigAutoPatch({ projectId: readOnly ? null : projectId, entities: readOnly ? [] : entities, applyOps: syncOps, edits, library })
    const phone = useIsPhone()

    const { list } = useMemo(() => rentalOf(entities), [entities])
    const counts = useMemo(() => rentalCounts({ entities, library, list }), [entities, library, list])
    const table = useMemo(() => symbolTable(library.types || []), [library])
    const lamps = useMemo(() => plotData({ entities, library }).lamps, [entities, library])
    const positions = useMemo(() => positionsOf(entities, lamps), [entities, lamps])
    const fill = useMemo(() => fillOf(positions, lamps), [positions, lamps])
    const lampById = useMemo(() => {
        const byEntity = new Map(entities.map((e) => [e.id, e]))
        return new Map(lamps.map((l) => {
            const f = byEntity.get(l.id)?.components?.fixture || {}
            return [l.id, { id: l.id, code: l.code, type: f.type, index: f.index ?? null, patch: f.universe != null && f.address != null ? `U${f.universe}.${String(f.address).padStart(3, '0')}` : '' }]
        }))
    }, [entities, lamps])

    const model = useMemo(() => plotModel({ entities, library, deskFlags: patch.flags, projectId }), [entities, library, patch.flags, projectId])
    const bars = useMemo(() => patchBars({ model, rental: counts, deskFlags: patch.flags, projectId }), [model, counts, patch.flags, projectId])
    const totals = useMemo(() => titleTotals(model.sheet), [model.sheet])
    const [kept, setKept] = useState(() => new Set())
    const moveToFree = useCallback((id) => {
        // The desk lays it out again at its next free address and writes it back (§4.2).
        setStatus('moving it to the next free address…')
        patch.patchGroup([id]).then((out) => { if (!out?.ok) setStatus(out?.message === 'no desk on this machine' ? NO_DESK_SENTENCE : `the desk did not move it: ${out?.message || 'no answer'}`) })
    }, [patch])

    const [cardType, setCardType] = useState(null)
    const card = counts.items.find((i) => i.type === cardType) || null
    const [n, setN] = useState(null)
    const dealN = card ? Math.max(0, n ?? card.left) : 0
    useEffect(() => { setN(null) }, [cardType])
    const [mode, setMode] = useState('auto') // auto | spread | from-stage
    const [status, setStatus] = useState('')
    const [picked, setPicked] = useState(null) // a filled slot, `${position}/${slot}`
    const [pane, setPane] = useState('cards') // cards | room
    const [sheetOpen, setSheetOpen] = useState(false)

    const edit = useCallback((ops, message) => {
        if (!ops?.length || readOnly) return
        applyLocalOps(ops)
        if (message) setStatus(message)
    }, [applyLocalOps, readOnly])

    // --- looks on the cue list (RIG_BUILD.md §11.4) ---------------------------------
    const looks = useMemo(() => rigLooksOf(entities), [entities])
    const cues = useMemo(() => document_.mappingState?.cues || [], [document_.mappingState])
    const [current, setCurrent] = useState(-1)
    const [localLook, setLocalLook] = useState('')
    const [deskHere, setDeskHere] = useState(false)
    const [onDesk, setOnDesk] = useState(() => new Set())
    const readDesk = useCallback(async () => {
        if (readOnly) return
        const here = await probeLightingDesk()
        setDeskHere(here)
        if (!here) return
        try {
            const body = await (await fetch(lightingApiUrl('api/fireable'))).json()
            setOnDesk(new Set((body.looks || []).map((l) => l.id)))
        } catch { /* the desk went away between the two calls */ }
    }, [readOnly])
    useEffect(() => { readDesk() }, [readDesk])
    const patchRoom = patch.patchNow
    const sendLooks = useCallback(async () => {
        try {
            // A desk look is made over this room's PATCHED fixtures, so the room is patched
            // first — here, because a person asked (this button, or GO with looks missing),
            // never on opening the page (a reader never writes).
            await patchRoom()
            const rig = await (await fetch(lightingApiUrl(`api/rig?project=${encodeURIComponent(projectId)}`))).json()
            // WITH their DMX (deskLookValues.js, as show-loop.mjs sends them): the room draws every patched lamp from
            // the desk's DMX ("DMX wins", useRigLook.js), so an empty shell left each lamp at the desk's idle full white —
            // MOXIR v1.0, 2026-10-08: the glare, the flat hall, a black that was not black. A lamp whose type has no
            // channel list still gets none and shows by its look's rule.
            const list = deskLooksWithValues(looks, rig.fixtures || [], { entities, library })
            for (const look of list) {
                await fetch(lightingApiUrl('api/looks/add'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ look }) })
            }
            const valued = new Set(list.flatMap((l) => Object.keys(l.steps?.[0]?.values || {}))).size
            setStatus(`${list.length} looks on the desk, over ${(rig.fixtures || []).length} patched fixtures — DMX values for ${valued}; ${(rig.fixtures || []).length - valued} have no channel list (shown by the look's rule)`)
            readDesk()
        } catch (error) { setStatus(`the desk did not take the looks: ${error.message}`) }
    }, [looks, projectId, readDesk, patchRoom, entities, library])
    const addCues = useCallback((list) => {
        const ops = list.map((l) => ({ type: 'createMappingCue', payload: { cue: { id: `cue-${deskLookId(l.id)}`, name: l.title, fade: 2, hold: 0, lightLook: deskLookId(l.id) } } }))
        edit(ops, `${list.length} looks on the cue list`)
    }, [edit])
    // THE CUE LIST PLAYS ON THE DESK when one is here (src/rigbuild/cueRun.js,
    // serverXR/src/lighting/cuerun.js): the desk keeps the one clock, this page asks it to
    // go, stop or loop and reads back where it is (1 Hz). No desk (a hosted page): the
    // page plays the list itself as a per-tab preview — the room shows it, nothing shared
    // is fired.
    const loop = document_.mappingState?.loop === true
    const [deskRun, setDeskRun] = useState(null)
    const [localRunning, setLocalRunning] = useState(false)
    const deskRunsThis = deskHere && deskRun?.project === projectId && deskRun.n > 0
    const shownCurrent = deskRunsThis ? deskRun.index : current
    const running = deskRunsThis ? deskRun.running : (!deskHere && localRunning)
    useEffect(() => {
        if (!deskHere) return undefined
        let gone = false
        const tick = async () => { try { const c = await deskCues.read(); if (!gone) setDeskRun(c) } catch { /* the desk went away between reads */ } }
        tick()
        const timer = setInterval(tick, 1000)
        return () => { gone = true; clearInterval(timer) }
    }, [deskHere])
    const sentSig = useRef(null)
    const fire = useCallback(async (i) => {
        const cue = cues[i]
        if (!cue) return
        setCurrent(i)
        setLocalLook(lookIdOfDesk(cue.lightLook) || '')
        if (readOnly) {
            // A visitor's GO is theirs alone: the room in this tab shows the look; nothing
            // is written and no desk is asked.
            setLocalRunning(true)
            setStatus(`GO ${i + 1} · ${cue.name} — shown in this tab only`)
            return
        }
        if (deskHere) {
            // The cue's mapping side as ops, as fireCue does; its light by the desk's runner
            // (fireCue's own recall would put the look up a second time, with no fade).
            applyLocalOps(cueOps(cue))
            try {
                if (cues.some((c) => c.lightLook && !onDesk.has(c.lightLook))) await sendLooks()
                await deskCues.load(projectId, cues, loop)
                sentSig.current = cueListSignature(cues)
                setDeskRun(await deskCues.go(i))
                setStatus(`GO ${i + 1} · ${cue.name} — the desk plays the list${loop ? ' and loops it' : ''}; it keeps going with this page closed`)
            } catch (error) { setStatus(`the desk did not take the cue: ${error.message}`) }
            return
        }
        setLocalRunning(true)
        fireCue(cue, applyLocalOps)
        setStatus(`GO ${i + 1} · ${cue.name} — no desk here: the room shows it`)
    }, [cues, applyLocalOps, deskHere, onDesk, sendLooks, projectId, loop, readOnly])
    // No desk: a cue with a hold moves on by itself, as the map desk's show does — and,
    // looping, from the last cue back to cue 1.
    useEffect(() => {
        if (deskHere || !localRunning) return undefined
        const cue = cues[current]
        if (!cue || !(cue.hold > 0)) return undefined
        const next = nextCueIndex(current, cues.length, loop)
        const timer = setTimeout(() => (next < 0 ? setLocalRunning(false) : fire(next)), cue.hold * 1000)
        return () => clearTimeout(timer)
    }, [deskHere, localRunning, current, cues, loop, fire])
    // A hold edited (or a cue added or removed) while the desk plays THIS list: the desk
    // takes the new list and stays on the cue it is on.
    useEffect(() => {
        if (!deskRunsThis || !deskRun?.running) return
        const sig = cueListSignature(cues)
        if (sentSig.current === null) { sentSig.current = sig; return }
        if (sig === sentSig.current) return
        sentSig.current = sig
        deskCues.load(projectId, cues, loop, true).then(setDeskRun).catch(() => {})
    }, [cues, deskRunsThis, deskRun?.running, projectId, loop])
    const goNext = useCallback(() => {
        const next = nextCueIndex(shownCurrent, cues.length, loop)
        if (next >= 0) fire(next)
    }, [shownCurrent, cues.length, loop, fire])
    const stop = useCallback(async () => {
        setLocalRunning(false)
        if (!deskHere) { setStatus('stopped — the look stays'); return }
        try { setDeskRun(await deskCues.stop()); setStatus('stopped — the look stays') } catch (error) { setStatus(`the desk did not stop: ${error.message}`) }
    }, [deskHere])
    const toggleLoop = useCallback(async () => {
        if (readOnly) return
        const next = !loop
        edit([{ type: 'setMappingState', payload: { patch: { loop: next } } }], next ? 'loop on: after the last cue, cue 1' : 'loop off: the list stops after the last cue')
        if (deskRunsThis) {
            try { setDeskRun(await deskCues.loop(next)) } catch { /* the page's next read says where the desk is */ }
        }
    }, [loop, edit, deskRunsThis, readOnly])
    const restOn = useCallback((lookId) => {
        const ops = restOps(entities, lookPoses({ entities, library, lookId, rigLooks: looks }))
        edit(ops, `the room rests on ${lookId}: ${ops.length} writes (undo to take it back)`)
    }, [entities, library, looks, edit])


    // "Patch this group" once the dealt lamps are in the document: the card lands as one
    // contiguous block in one universe (RIG_BUILD.md §4.2, §7).
    const [pendingGroup, setPendingGroup] = useState(null)
    useEffect(() => {
        if (!pendingGroup || !deskHere) return
        const have = new Set(entities.map((e) => e.id))
        if (!pendingGroup.every((id) => have.has(id))) return
        setPendingGroup(null)
        patch.patchGroup(pendingGroup)
    }, [pendingGroup, entities, patch, deskHere])

    const filledIds = useCallback((position) => new Set(position.slots.filter((s) => fill.has(`${position.id}/${s.id}`)).map((s) => s.id)), [fill])

    const deal = useCallback((position, count, onlySlot = null) => {
        if (!card || readOnly) return
        const type = typeById(library, card.type)
        if (!type) { setStatus(`${card.code}: no fixture type in the library — cannot hang it`); return }
        const pos = onlySlot ? { ...position, slots: [onlySlot] } : position
        const { ops, ids, note } = dealOps({ entities, position: pos, filled: filledIds(pos), type, n: count, mode: mode === 'auto' ? null : mode, newId: () => generateId('entity') })
        if (!ids.length) { setStatus(note || 'nothing free there'); return }
        edit(ops, `${ids.length} × ${card.code} → ${position.name}${note ? ` · ${note}` : ''}${type.modesOwed ? ' · mode owed: not patched' : deskHere ? ' · patching as one group…' : ' · the desk on a local di.iiii patches it'}`)
        if (!type.modesOwed) setPendingGroup(ids)
        setN(null)
    }, [card, library, entities, filledIds, mode, edit, readOnly, deskHere])

    const takeBack = useCallback((position) => {
        if (!card) return
        const ids = position.slots.map((s) => fill.get(`${position.id}/${s.id}`)).filter((id) => id && lampById.get(id)?.type === card.type)
        edit(deleteOps(ids), `${ids.length} × ${card.code} taken back from ${position.name}`)
    }, [card, fill, lampById, edit])

    const onSlot = useCallback((position, s, lamp) => {
        const key = `${position.id}/${s.id}`
        if (lamp) { setPicked(picked === key ? null : key); return }
        setPicked(null)
        if (readOnly) return
        if (!card) { setStatus('pick a card first, then a free slot'); return }
        if (card.left <= 0) { setStatus(`${card.code}: all ${card.ordered} on order are placed`); return }
        deal(position, 1, s)
    }, [card, deal, picked, readOnly])

    const pickedLamp = picked ? lampById.get(fill.get(picked)) : null

    useEffect(() => {
        const onKey = (event) => {
            const tag = event.target?.tagName
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
            if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
            if (event.key === 'Escape') { setCardType(null); setPicked(null) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [undo, redo, readOnly])

    const title = document_.projectMeta?.title || projectId
    const localInstall = useLocalInstall()
    const progress = useMemo(() => rigProgress({ entities, library, deskFlags: patch.flags, projectId }), [entities, library, patch.flags, projectId])
    const rigBar = <RigBar spaceId={spaceId} projectId={projectId} projectLabel={title} here="cards" progress={progress} isLocalInstall={localInstall.isLocal} />
    useEffect(() => {
        const prev = document.title
        document.title = `Cards — ${title}`
        return () => { document.title = prev }
    }, [title])

    // --- the parts ---------------------------------------------------------------
    const cards = (
        <section className="rigcards-cards" aria-label="Rental list">
            <h2 className="rigcards-h">rental list</h2>
            {!state.hasLoaded ? <p className="rigplot-hint">Reading the rig…</p> : null}
            {state.hasLoaded && !list ? <p className="rigplot-hint">No rental list in this project. It is written from the rental house&apos;s spreadsheet by scripts/rigbuild/rental.mjs.</p> : null}
            <div className="rigcards-cardlist">
                {/* A non-DMX item (a node, a cable) is on the list but is never dealt: no card. */}
                {counts.items.filter((item) => !item.item).map((item) => (
                    <Card key={item.type} item={item} shape={table.get(item.type)} selected={cardType === item.type} onSelect={() => { setCardType(cardType === item.type ? null : item.type); setSheetOpen(cardType !== item.type) }} />
                ))}
            </div>
            {list ? (
                <p className="rigcards-foot rigplot-mono">
                    {counts.totals.placed} placed / {counts.totals.ordered} ordered{counts.totals.over ? ` · ${counts.totals.over} over` : ''}
                    <br />
                    <span className="rigplot-status__dim">{list.source}</span>
                </p>
            ) : null}
        </section>
    )

    const dealBar = readOnly ? null : card ? (
        <div className="rigcards-dealbar" role="group" aria-label="Deal">
            <span className="rigplot-mono"><b>{card.code}</b> · {card.left} left</span>
            <label className="rigplot-field">
                <span>deal</span>
                <input inputMode="numeric" value={dealN} onChange={(e) => setN(Math.max(0, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 0)))} aria-label="how many to deal" />
            </label>
            <div className="rigplot-seg" role="group" aria-label="how">
                {[['auto', 'as the row'], ['spread', 'spread'], ['from-stage', 'from the stage']].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
                ))}
            </div>
        </div>
    ) : (
        <p className="rigplot-hint">Pick a card, then deal it onto a position — or tap a free slot to hang one.</p>
    )

    const pickedBar = pickedLamp ? (
        <div className="rigcards-picked rigplot-mono" role="status">
            <span>{picked.split('/')[1]} · {pickedLamp.code}{pickedLamp.index != null ? ` #${pickedLamp.index}` : ''} {pickedLamp.patch || 'not patched'}</span>
            {readOnly ? null : <button type="button" className="rigcards-btn" onClick={() => { edit(deleteOps([pickedLamp.id]), `${pickedLamp.code} taken back`); setPicked(null) }}>take back</button>}
        </div>
    ) : null

    const positionsPart = (
        <section className="rigcards-positions" aria-label="Positions">
            <h2 className="rigcards-h">positions</h2>
            {dealBar}
            {pickedBar}
            {state.hasLoaded && !positions.length ? <p className="rigplot-hint">No positions: this project has no truss, towers, decks or venue plan to hang from. Build them on the plot, or load them (scripts/rigbuild/load-plot.mjs).</p> : null}
            {positions.map((p) => (
                <PositionRow key={p.id} position={p} fill={fill} lampById={lampById} card={card} n={dealN} onDeal={deal} onSlot={onSlot} onTakeBack={takeBack} picked={picked} readOnly={readOnly} />
            ))}
        </section>
    )

    const cuePart = (
        <CuePart
            cues={cues} looks={looks} current={shownCurrent} desk={deskHere ? lightingDeskPath({ spaceId, projectId, label: title }) : null} onDesk={onDesk}
            onGo={goNext} onBack={() => fire(Math.max(0, shownCurrent - 1))} onFire={fire}
            loop={loop} onLoop={toggleLoop} onStop={stop} running={running} clock={deskRunsThis ? cueClockWords(deskRun) : (localRunning ? (loop ? 'loop' : '') : '')}
            onAddAll={addCues} onDeskLooks={sendLooks} onRest={restOn} readOnly={readOnly}
            onHold={(cue, hold) => { if (hold !== cue.hold) edit([{ type: 'setMappingCue', payload: { cueId: cue.id, patch: { hold } } }], `cue ${cue.name}: hold ${hold || 'GO'}`) }}
            onDelete={(cue) => edit([{ type: 'deleteMappingCue', payload: { cueId: cue.id } }], `cue ${cue.name} removed`)}
        />
    )

    const patchPart = <PatchPart bars={bars} totals={totals} onMove={moveToFree} kept={kept} onKeep={(id) => setKept((k) => new Set([...k, id]))} desk={deskHere} readOnly={readOnly} />

    const statusLine = (
        <div className="rigplot-status rigplot-mono rigcards-status" role="status" aria-live="polite">
            <span>{status || `${counts.totals.placed} of ${counts.totals.ordered} placed on ${positions.length} positions`}</span>
            {patch.message ? <span className="rigplot-status__dim">desk · {patch.message}</span> : null}
        </div>
    )

    const extent = useMemo(() => {
        const plan = venueOf(entities).plan
        return rigExtent({ lamps: lamps.map((l) => ({ at: [l.mount[0], l.mount[2]] })), pieces: piecesOf(entities), boxes: boxesOf(entities) }, planExtent(plan)) || [-10, -10, 10, 10]
    }, [entities, lamps])
    const room = pane === 'room' ? (
        <Suspense fallback={<div className="rigplot-room rigplot-room--empty">room…</div>}>
            <PlotRoom document={document_} selectedIds={[]} onSelect={() => {}} extent={extent} venueExtent={planExtent(venueOf(entities).plan)} rigLook={deskHere ? undefined : localLook} />
        </Suspense>
    ) : null

    const links = (
        <nav className="rigcards-links" aria-label="Sheets">
            <div className="rigplot-toggle" role="group" aria-label="View">
                <button type="button" aria-pressed={pane === 'cards'} onClick={() => setPane('cards')}>cards</button>
                <button type="button" aria-pressed={pane === 'room'} onClick={() => setPane('room')}>room</button>
            </div>
        </nav>
    )

    const header = (
        <header className="rigplot-top rigcards-top">
            <span className="rigplot-mono rigplot-top__title">{title} · cards</span>
            {links}
            {readOnly ? <ViewOnlyLine /> : null}
        </header>
    )

    if (phone) {
        return (
            <>
            {rigBar}
            <div className={`rigplot rigcards rigcards--phone has-rigbar${pane === 'cards' && card ? ' has-sheet' : ''}`}>
                {header}
                {pane === 'room' ? <div className="rigcards-roompane">{room}</div> : (
                    <main className="rigcards-main">
                        {cards}
                        {patchPart}
                        {cuePart}
                    </main>
                )}
                {pane === 'cards' && card ? (
                    <section className={`rigplot-sheet rigcards-sheet${sheetOpen ? ' is-open' : ''}`} aria-label="Deal onto a position">
                        <button type="button" className="rigplot-sheet__handle" aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}><span aria-hidden="true" />{sheetOpen ? 'close' : `${card.code} · ${card.left} left — positions`}</button>
                        {statusLine}
                        {sheetOpen ? <div className="rigplot-sheet__body">{positionsPart}</div> : null}
                    </section>
                ) : null}
            </div>
            </>
        )
    }

    return (
        <>
        {rigBar}
        <div className="rigplot rigcards has-rigbar">
            {header}
            {pane === 'room' ? <div className="rigcards-roompane">{room}</div> : (
                <main className="rigcards-main rigcards-grid">
                    <div className="rigcards-col rigcards-col--cards">{cards}</div>
                    <div className="rigcards-col rigcards-col--positions">{positionsPart}</div>
                    <div className="rigcards-col rigcards-col--patch">{patchPart}</div>
                    <div className="rigcards-bottom">{statusLine}{cuePart}</div>
                </main>
            )}
        </div>
        </>
    )
}
