import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveProjectScene from '../components/LiveProjectScene.jsx'
import { isTypingTarget } from '../components/walkKeyboard.js'
import { useProjectDocumentSync } from '../project/hooks/useProjectDocumentSync.js'
import { useOpHistory } from '../project/hooks/useOpHistory.js'
import { useProjectStore } from '../project/state/projectStore.js'
import { generateId } from '../shared/projectSchema.js'
import { useRigAutoPatch } from '../studio/hooks/useRigAutoPatch.js'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceOf } from './pieces.js'
import { plotModel, titleTotals } from './plotModel.js'
import { nextUnit, trussRuns } from './plotGeometry.js'
import { createOps, deleteOps, lampEntity, pieceEntity, ridersOfIds } from './plotEdits.js'
import { HEIGHT_STEPS, snapWords, stepHeight, turn } from './buildAim.js'
import { cycleSlot, fullWords, hotbarSlots, slotOfKey } from './hotbar.js'
import { TAG_MAX, TAG_MAX_PHONE, flagLines, patchLines, tagOf } from './tags.js'
import { usePieceAssets } from './usePieceAssets.js'
import { useRigLookEntities } from './useRigLook.js'
import { buildPatchSheetPath } from './patchRouting.js'
import { buildCrewPath } from './buildRouting.js'
import { Inspector } from './PlotSurface.jsx'
import BuildScene from './BuildScene.jsx'
import './plot.css'
import './build.css'

// VIEW A — the room in first person, built by hand (docs/architecture/RIG_BUILD.md §12).
// Sketch A: "You stand in the hall. A hotbar holds the pieces. You aim, click, and the
// piece snaps where the outline shows. Every fixture carries its own small address tag
// in the air. The room is the place you build, and it is also what you hand over."
//
// Nothing here is a second copy of the rig. The room is the walker's own
// (LiveProjectScene, the walk mode every space has) on the project document, synced
// through the op log like the Studio, the plot and the cards; every placement is the
// base's snap(), every write the plot's own ops (plotEdits.js), every count the rental
// list's (rental.js), every address the desk's (auto-patch, §4), every tag the plot's
// rows (plotModel). The room follows the desk's look like the Studio does.
//
// `crew`: the same room for the light engineers — read only, tags on, the patch one
// tap away. It writes nothing and asks the desk nothing.

const PHONE_QUERY = '(pointer: coarse)'
const r2 = (v) => Math.round(v * 100) / 100

const useIsPhone = () => {
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE_QUERY).matches))
    useEffect(() => {
        const mq = window.matchMedia?.(PHONE_QUERY)
        if (!mq) return undefined
        const on = () => setPhone(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [])
    return phone
}

const heightCategory = (slot) => (slot?.kind === 'lamp' ? null : pieceOf(slot?.kind)?.category || null)

function PatchSheet({ lamp, crew, onClose, patchHref, children }) {
    if (!lamp) return null
    const tag = tagOf(lamp)
    const flags = flagLines(lamp)
    return (
        <aside className="rigbuild-sheet rigplot" aria-label="The patch of this lamp">
            <div className="rigplot-block">
                <div className="rigbuild-sheet__head">
                    <h2 className="rigplot-mono">{tag.text}</h2>
                    <button type="button" className="rigbuild-sheet__close" onClick={onClose} aria-label="Close the patch">×</button>
                </div>
                <p className="rigplot-sub">{lamp.name}</p>
                <dl className="rigplot-dl rigplot-mono">
                    {patchLines(lamp).map(([k, v]) => <FragmentRow key={k} k={k} v={v} />)}
                </dl>
                {flags.length ? (
                    <ul className="rigplot-flags">
                        {flags.map((f, i) => <li key={i} className={f.conflict ? 'is-conflict' : ''}>{f.conflict ? '! ' : '· '}{f.text}</li>)}
                    </ul>
                ) : null}
                <div className="rigplot-actions">
                    <a className="rigbuild-link" href={patchHref}>the whole patch sheet</a>
                </div>
                {crew ? <p className="rigplot-sub">crew view — read only</p> : null}
            </div>
            {children}
        </aside>
    )
}

// The room is WebGL. A browser that gives no WebGL context must still get a page that
// says so — and the crew still gets its patch sheet — rather than a blank screen.
class RoomBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: null }
    }

    static getDerivedStateFromError(error) {
        return { failed: String(error?.message || error || 'no WebGL') }
    }

    render() {
        if (this.state.failed) {
            return (
                <div className="rigbuild-loading" role="alert">
                    <p>This room needs WebGL, which this browser did not give ({this.state.failed}).<br />
                        <a href={this.props.patchHref}>The patch sheet</a> works without it.</p>
                </div>
            )
        }
        return this.props.children
    }
}

function FragmentRow({ k, v }) {
    return (<><dt>{k}</dt><dd>{v}</dd></>)
}

export default function BuildSurface({ spaceId, projectId, crew = false, library = TYPE_LIBRARY }) {
    const store = useProjectStore()
    const { state, dispatch } = store
    const { applyLocalOps: syncOps } = useProjectDocumentSync({ projectId, store, clientIdPrefix: crew ? 'crew-client' : 'build-client', opIdPrefix: crew ? 'crew-op' : 'build-op' })
    const { applyLocalOps, undo, redo } = useOpHistory({ projectId, document: state.document, applyLocalOps: syncOps })
    const projectDocument = state.document
    const entities = useMemo(() => projectDocument?.entities || [], [projectDocument?.entities])
    // Crew view asks the desk nothing and writes nothing: no auto-patch.
    const patch = useRigAutoPatch({ projectId: crew ? null : projectId, entities: crew ? [] : entities, applyOps: syncOps, library })
    const phone = useIsPhone()
    const { assetIdFor, ensureAsset } = usePieceAssets({ projectId, document: projectDocument, applyOps: applyLocalOps })

    // The room as the desk's look poses it (a view; the document is not touched).
    const look = useRigLookEntities(projectDocument, { library })
    const shownDocument = useMemo(() => (projectDocument ? { ...projectDocument, entities: look.entities } : null), [projectDocument, look.entities])
    const model = useMemo(() => {
        const m = plotModel({ entities: look.entities, library, deskFlags: crew ? [] : patch.flags, projectId })
        m.lampById = new Map(m.lamps.map((l) => [l.id, l]))
        return m
    }, [look.entities, library, patch.flags, projectId, crew])
    const totals = useMemo(() => titleTotals(model.sheet), [model.sheet])

    // --- the hand ---------------------------------------------------------------
    const [building, setBuilding] = useState(false)
    const { slots } = useMemo(() => hotbarSlots({ entities, library }), [entities, library])
    const [slotIndex, setSlotIndex] = useState(0)
    const slot = building && !crew ? slots[Math.min(slotIndex, slots.length - 1)] || null : null
    const [yaw, setYaw] = useState(0)
    const [heights, setHeights] = useState(() => Object.fromEntries(Object.entries(HEIGHT_STEPS).map(([k, v]) => [k, v.start])))
    const category = heightCategory(slot)
    const height = category ? heights[category] : null
    const [status, setStatus] = useState('')
    const [aim, setAim] = useState({ place: null, lampId: null, pieceId: null })
    const aimRef = useRef({})
    const pointerRef = useRef(null)
    const [chosenId, setChosenId] = useState(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [tagIds, setTagIds] = useState([])
    const tagEls = useRef(new Map())
    const selectedIds = useMemo(() => state.selectedEntityIds || [], [state.selectedEntityIds])
    const selectedIdsRef = useRef(selectedIds)
    useEffect(() => { selectedIdsRef.current = selectedIds }, [selectedIds])
    const select = useCallback((ids) => dispatch({ type: 'select-entities', entityIds: ids }), [dispatch])

    const edit = useCallback((ops, message) => {
        if (!ops?.length) return
        applyLocalOps(ops)
        if (message) setStatus(message)
    }, [applyLocalOps])
    edit.assetId = assetIdFor

    const choose = useCallback((id, { open = true } = {}) => {
        setChosenId(id)
        select(id ? [id] : [])
        if (open) setSheetOpen(Boolean(id))
    }, [select])

    // --- placing and removing (every write an op; plotEdits.js) -------------------
    const place = useCallback(async () => {
        if (!slot) return
        const p = aimRef.current.place
        if (!p?.ok) { setStatus(p?.reason || 'aim at the floor, a truss, a tower or a deck'); return }
        if (slot.full) { setStatus(fullWords(slot)); return }
        if (slot.kind === 'lamp') {
            const type = typeById(library, slot.type)
            if (!type) return
            const target = p.to?.id ? entities.find((e) => e.id === p.to.id) : null
            const position = target?.name || (p.hung ? 'truss' : 'floor')
            const lamp = lampEntity({ id: generateId('entity'), type, mount: p.position, hung: p.hung, position, unit: nextUnit(entities, position), entities })
            edit(createOps([lamp]), `${type.code} placed · ${snapWords(p, model.pieces)}${type.modesOwed ? ' · mode owed, not patched' : ' · auto-patch follows'}`)
            choose(lamp.id, { open: false })
            return
        }
        // A truss that continues another takes its name — the same run, the same position.
        const target = p.to?.id ? entities.find((e) => e.id === p.to.id) : null
        const name = pieceOf(slot.kind).category === 'truss' && target && pieceOf(target.components?.piece?.kind)?.category === 'truss' ? target.name : ''
        try {
            const assetId = await ensureAsset(p.kind)
            const piece = pieceEntity({ id: generateId('entity'), kind: p.kind, position: p.position, yaw: p.yaw, height: p.height, assetId, name })
            edit(createOps([piece]), `${pieceOf(p.kind).label} placed · ${snapWords(p, model.pieces)}`)
            choose(piece.id, { open: false })
        } catch (err) {
            setStatus(`could not place: ${err?.message || err}`)
        }
    }, [slot, library, entities, edit, ensureAsset, model.pieces, choose])

    const remove = useCallback(() => {
        const { lampId, pieceId } = aimRef.current
        if (lampId) {
            const lamp = model.lampById.get(lampId)
            edit(deleteOps([lampId]), `removed ${lamp?.code || 'a lamp'}${lamp?.index ? ` #${lamp.index}` : ''}`)
            if (chosenId === lampId) choose(null)
            return
        }
        if (pieceId) {
            const riders = ridersOfIds(entities, [pieceId], library)
            const piece = model.pieces.find((x) => x.id === pieceId)
            edit(deleteOps([pieceId, ...riders]), `removed ${piece ? pieceOf(piece.kind).label : 'a piece'}${riders.length ? ` and the ${riders.length} lamps on it` : ''}`)
            return
        }
        setStatus('aim at a piece or a lamp to remove it')
    }, [model, entities, library, edit, chosenId, choose])

    const inspectAimed = useCallback(() => {
        const { lampId, pieceId } = aimRef.current
        if (lampId) choose(lampId)
        else if (pieceId && !crew) { setChosenId(null); select([pieceId]); setSheetOpen(true) }
    }, [choose, select, crew])

    const raise = useCallback((dir) => {
        if (!category) return
        const next = stepHeight(category, heights[category], dir)
        setHeights((h) => ({ ...h, [category]: next }))
        setStatus(`${category === 'truss' ? 'hangs at' : 'built to'} ${next.toFixed(2)} m`)
    }, [category, heights])

    const rotate = useCallback((opts = {}) => setYaw((y) => turn(y, opts)), [])

    // --- keys and the mouse ---------------------------------------------------------
    const wrapRef = useRef(null)
    useEffect(() => {
        const onKey = (e) => {
            if (isTypingTarget(e.target)) return
            const k = e.key.toLowerCase()
            if ((e.ctrlKey || e.metaKey) && k === 'z' && !crew) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
            if ((e.ctrlKey || e.metaKey) && k === 'y' && !crew) { e.preventDefault(); redo(); return }
            if (e.ctrlKey || e.metaKey || e.altKey) return
            if (k === 'b' && !crew) { setBuilding((b) => !b); return }
            if (k === 'i') { inspectAimed(); return }
            if (k === 'escape' && sheetOpen && !document.pointerLockElement) { setSheetOpen(false); return }
            if (!building || crew) return
            const i = slotOfKey(e.key, slots.length)
            if (i >= 0) { setSlotIndex(i); return }
            if (k === 'r') { rotate({ fine: e.shiftKey }); return }
            if (k === 'q') { raise(1); return }
            if (k === 'e') { raise(-1) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [building, crew, slots.length, rotate, raise, undo, redo, inspectAimed, sheetOpen])

    useEffect(() => {
        const el = wrapRef.current
        if (!el) return undefined
        let down = null
        const canvasOf = (target) => target?.tagName === 'CANVAS'
        const aimByCursor = (e) => {
            const r = el.getBoundingClientRect()
            pointerRef.current = [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]
        }
        // Aim by the cursor, let the scene answer (two frames), act, give the aim back
        // to the crosshair.
        const atCursor = (at, act) => {
            aimByCursor(at)
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                act()
                pointerRef.current = null
            }))
        }
        const onDown = (e) => {
            // A finger drives the joystick and the look; the phone's own buttons place.
            if (e.pointerType === 'touch') return
            const locked = document.pointerLockElement != null
            if (!locked && !canvasOf(e.target)) return
            if (e.button === 2) {
                if (!building || crew) return
                e.preventDefault()
                if (locked) remove()
                else atCursor({ clientX: e.clientX, clientY: e.clientY }, remove)
                return
            }
            if (e.button !== 0) return
            if (locked) {
                if (building && !crew) place()
                else inspectAimed()
                return
            }
            down = { x: e.clientX, y: e.clientY }
        }
        // Not locked (the first click asks for the lock; a Wayland compositor may refuse
        // it and the walker falls back to drag-look): a click that did not drag, and did
        // not take the lock, acts where the cursor is.
        const onUp = (e) => {
            if (!down || e.button !== 0 || e.pointerType === 'touch') return
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
            down = null
            if (moved > 5) return
            const at = { clientX: e.clientX, clientY: e.clientY }
            window.setTimeout(() => {
                if (document.pointerLockElement) return
                atCursor(at, () => { if (building && !crew) place(); else inspectAimed() })
            }, 80)
        }
        const onMenu = (e) => { if (building && !crew) e.preventDefault() }
        const onWheel = (e) => {
            if (!building || crew || !slots.length) return
            if (Math.abs(e.deltaY) < 1) return
            setSlotIndex((i) => cycleSlot(i, slots.length, e.deltaY > 0 ? 1 : -1))
        }
        // Esc gives the mouse back: that is when a number can be typed, so the
        // inspector opens on what was just placed (sketch A: typing 6.00 m in first
        // person is awkward — the inspector takes it after).
        const onLock = () => {
            if (!document.pointerLockElement && building && !crew && selectedIdsRef.current.length) setSheetOpen(true)
        }
        el.addEventListener('pointerdown', onDown, true)
        el.addEventListener('pointerup', onUp, true)
        el.addEventListener('contextmenu', onMenu)
        el.addEventListener('wheel', onWheel, { passive: true })
        document.addEventListener('pointerlockchange', onLock)
        return () => {
            el.removeEventListener('pointerdown', onDown, true)
            el.removeEventListener('pointerup', onUp, true)
            el.removeEventListener('contextmenu', onMenu)
            el.removeEventListener('wheel', onWheel)
            document.removeEventListener('pointerlockchange', onLock)
        }
    }, [building, crew, place, remove, inspectAimed, slots.length])

    // --- tags -------------------------------------------------------------------------
    // A lamp whose mode is owed has nothing to say yet (§10.2): only the aimed or the
    // chosen one carries a tag. A conflict is tagged at any distance in crew view — the
    // crew's first question is what is wrong.
    const taggable = useMemo(() => model.lamps.filter((l) => !(l.flags || []).includes('mode-unknown') || l.conflicts.length).map((l) => ({ id: l.id, lens: l.lens })), [model.lamps])
    const alwaysTag = useMemo(() => (crew ? new Set(model.conflicts.map((l) => l.id)) : null), [crew, model.conflicts])
    const onTags = useCallback((ids) => setTagIds((prev) => (prev.join(',') === ids.join(',') ? prev : ids)), [])
    const tagRef = useCallback((id) => (el) => { if (el) tagEls.current.set(id, el); else tagEls.current.delete(id) }, [])

    const sceneExtras = useMemo(() => (
        <BuildScene
            model={model} library={library} slot={slot} yaw={yaw} height={height}
            aimRef={aimRef} pointerRef={pointerRef} onAim={setAim}
            tagEls={tagEls} onTags={onTags} chosenId={chosenId} tagMax={phone ? TAG_MAX_PHONE : TAG_MAX}
            alwaysTag={alwaysTag} taggable={taggable}
        />
    ), [model, library, slot, yaw, height, onTags, chosenId, phone, alwaysTag, taggable])

    const runs = useMemo(() => trussRuns(model.pieces), [model.pieces])
    const runOf = useCallback((id) => runs.find((r) => r.ids.includes(id)) || null, [runs])
    const chosenLamp = chosenId ? model.lampById.get(chosenId) : null
    const aimedLamp = aim.lampId ? model.lampById.get(aim.lampId) : null
    const title = `${projectDocument?.projectMeta?.title || projectId} · ${crew ? 'crew' : building ? 'build' : 'walk'}`
    const hint = building && !crew
        ? <>WASD · move &nbsp;·&nbsp; mouse · aim &nbsp;·&nbsp; click · place &nbsp;·&nbsp; right-click · remove &nbsp;·&nbsp; 1–0 / wheel · pieces &nbsp;·&nbsp; R · turn &nbsp;·&nbsp; Q/E · up/down &nbsp;·&nbsp; B · walk &nbsp;·&nbsp; ESC · release</>
        : <>WASD · move &nbsp;·&nbsp; mouse · look &nbsp;·&nbsp; click / I · the patch of a lamp &nbsp;·&nbsp; {crew ? '' : <>B · build &nbsp;·&nbsp; </>}F · fly &nbsp;·&nbsp; ESC · release</>

    return (
        <main className={`rigbuild${phone ? ' is-phone' : ''}${building ? ' is-building' : ''}${crew ? ' is-crew' : ''}`} ref={wrapRef} data-space-id={spaceId || ''}>
            {shownDocument ? (
                <RoomBoundary patchHref={buildPatchSheetPath(spaceId, projectId)}>
                <LiveProjectScene
                    projectId={projectId}
                    spaceId={spaceId}
                    document={shownDocument}
                    sceneExtras={sceneExtras}
                    interactive
                    showChrome
                    showModeControls={!(phone && building)}
                    title={title}
                    exitLabel="← Space"
                    onExit={() => { window.location.href = `/${spaceId}` }}
                    altitudeKeys={{ up: [' '], down: ['c'] }}
                    wheelDolly={!building}
                    walkHint={hint}
                />
                </RoomBoundary>
            ) : (
                <div className="rigbuild-loading" role="status">{state.error ? `could not open this room: ${state.error}` : 'opening the room…'}</div>
            )}

            {/* the crosshair: what the hand is on */}
            <div className={`rigbuild-cross${aim.lampId ? ' is-lamp' : ''}`} aria-hidden="true" />

            {/* the tags in the air — DOM, placed by BuildScene every frame */}
            <div className="rigbuild-tags" aria-label="Address tags">
                {tagIds.map((id) => {
                    const l = model.lampById.get(id)
                    if (!l) return null
                    const t = tagOf(l)
                    return (
                        <button
                            key={id}
                            type="button"
                            ref={tagRef(id)}
                            className={`rigbuild-tag rigplot-mono${t.conflict ? ' is-conflict' : ''}${id === aim.lampId ? ' is-aimed' : ''}${id === chosenId ? ' is-chosen' : ''}`}
                            onClick={() => choose(id)}
                            style={{ visibility: 'hidden' }}
                        >
                            {t.text}
                        </button>
                    )
                })}
            </div>

            <section className="rigbuild-totals rigplot-mono" aria-label="Rig totals">
                <div>patch · {totals.fixtures}</div>
                <div className="rigbuild-dim">{totals.channels}</div>
                <div>power · {totals.power}</div>
                <div className="rigbuild-dim">{totals.circuits}</div>
                <div className="rigbuild-dim">console in · not on this build</div>
                {look.lookId ? <div>look · {look.lookId}{look.fromDesk ? ' (desk)' : ''}</div> : null}
                {model.conflicts.length ? <div className="rigbuild-warn">! {model.conflicts.length} conflict{model.conflicts.length === 1 ? '' : 's'}</div> : null}
                {crew ? (
                    <div className="rigbuild-links"><a href={buildPatchSheetPath(spaceId, projectId)}>patch sheet</a></div>
                ) : (
                    <div className="rigbuild-links"><a href={buildCrewPath(spaceId, projectId)}>crew link</a></div>
                )}
            </section>

            {building && !crew ? (
                <section className="rigbuild-hand" aria-label="The hand">
                    <p className="rigbuild-status rigplot-mono" role="status">
                        <b>BUILD</b>{aim.place ? snapWords(aim.place, model.pieces) : 'aim at the floor, a truss, a tower or a deck'}
                        {category ? ` · ${category === 'truss' ? 'hangs at' : 'h'} ${heights[category].toFixed(2)} m` : ''}
                        {slot && slot.kind !== 'lamp' ? ` · turn ${Math.round((yaw * 180) / Math.PI)}°` : ''}
                        {slot?.full ? ` · ${slot.words}` : ''}
                    </p>
                    {status ? (
                        <p className="rigbuild-said rigplot-mono">
                            {status}
                            {selectedIds.length && !sheetOpen ? <button type="button" className="rigbuild-exact" onClick={() => setSheetOpen(true)}>exact values</button> : null}
                        </p>
                    ) : null}
                    <ol className="rigbuild-hotbar" aria-label="Hotbar">
                        {slots.map((s, i) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    className={`rigbuild-slot${i === slotIndex ? ' is-on' : ''}${s.full ? ' is-full' : ''}${s.modeOwed ? ' is-owed' : ''}`}
                                    aria-pressed={i === slotIndex}
                                    onClick={() => setSlotIndex(i)}
                                >
                                    {s.key ? <span className="rigbuild-slot__key">{s.key}</span> : null}
                                    <span className="rigbuild-slot__label rigplot-mono">{s.label}</span>
                                    <span className="rigbuild-slot__count rigplot-mono">{s.ordered != null ? `${s.placed} / ${s.ordered}` : s.words}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            {!crew ? (
                <button type="button" className={`rigbuild-mode${building ? ' is-on' : ''}`} onClick={() => setBuilding((b) => !b)} aria-pressed={building}>
                    {building ? 'walk' : 'build'}
                </button>
            ) : null}

            {!building && aimedLamp && !sheetOpen ? (
                <p className="rigbuild-aimed rigplot-mono">{tagOf(aimedLamp).text} · {aimedLamp.code} · I · the patch</p>
            ) : null}

            {sheetOpen && crew && chosenLamp ? (
                <PatchSheet lamp={chosenLamp} crew onClose={() => setSheetOpen(false)} patchHref={buildPatchSheetPath(spaceId, projectId)} />
            ) : null}
            {sheetOpen && !crew && selectedIds.length ? (
                <aside className="rigbuild-sheet rigplot" aria-label="Inspector">
                    <button type="button" className="rigbuild-sheet__close rigbuild-sheet__close--float" onClick={() => setSheetOpen(false)} aria-label="Close the inspector">×</button>
                    <Inspector
                        model={model} selectedIds={selectedIds} entities={entities} library={library} edit={edit}
                        patchGroup={(ids) => patch.patchGroup(ids)} runOf={runOf}
                    />
                    <div className="rigbuild-sheet__foot rigplot-mono"><a href={buildPatchSheetPath(spaceId, projectId)}>the whole patch sheet</a></div>
                </aside>
            ) : null}
            <span className="rigbuild-sr" aria-live="polite">{aimedLamp ? `${tagOf(aimedLamp).text} ${r2(aimedLamp.mount[1])} m` : ''}</span>
        </main>
    )
}
