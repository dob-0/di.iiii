import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyProjectOps } from '../shared/projectSchema.js'
import { SceneDeckError } from './sceneDeck/errors.js'
import { LOOP_RANGE_S, applyControl, guardSceneChange, intensityOf, isBlinderKey, readScenes } from './sceneDeck/model.js'
import { createHistory, historyReducer } from './sceneDeck/history.js'
import { compareScenes, planSync, sceneOps } from './sceneDeck/sync.js'
import { BUNDLE_LIMITS, exportBundle, parseBundle } from './sceneDeck/bundle.js'
import { readLedger, writeBases } from './sceneDeck/ledger.js'
import { MAX_PREVIEW_FLASHES_PER_S, playingAt, previewColour, previewOf, timelineOf } from './sceneDeck/preview.js'

// THE SCENE DECK — layer 2: the two screens over ONE scene list (docs/architecture/RIG_BUILD.md §22).
// A = the deck (tiles, play / loop / next, the four controls, a small 2D preview); B = the loop as a
// timeline (read only: retime is not a layer-1 control). Every write is layer 1's: applyControl for the
// controls, planSync + sceneOps for the sync, the history reducer for undo and "restore last good". A write
// layer 1 refuses is shown in words and nothing is sent. Owner, 2026-09-30: "A and B is ok, without names and
// things — imagine there is also the other organizer where we need to sync things there": so no people here,
// only "here" (this copy) and "there" (the other organizer's copy), carried by a file.
// Pure of the network: the page hands in `applyOps` (the project document's op path) and `storage`.

export const MARK_WORDS = Object.freeze({
    same: 'SAME',
    changedHere: 'CHANGED HERE',
    onlyHere: 'CHANGED HERE',
    changedThere: 'CHANGED THERE',
    onlyThere: 'CHANGED THERE',
    changedBoth: 'CHANGED ON BOTH'
})
const MARK_CLASS = { same: 'same', changedHere: 'here', onlyHere: 'here', changedThere: 'there', onlyThere: 'there', changedBoth: 'both' }
export const OFFLINE_SENTENCE = 'Offline. Changes are kept here and will sync when the other copy is reachable.'
export const COLOUR_PRESETS = Object.freeze(['#ffffff', '#ffd8a8', '#ff8c1a', '#ff0000', '#ff00aa', '#0044ff', '#00c8ff', '#00ff66'])
const NOTHING = 'Nothing was written.'

const hhmm = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.toTimeString().slice(0, 5) : '')
const whenOf = (iso) => (iso ? hhmm(new Date(iso)) : '')

/** A layer-1 refusal in plain words. Always ends by saying nothing was written. */
export const refusalWords = (error) => {
    if (!(error instanceof SceneDeckError)) return `Something went wrong: ${error?.message || error}. ${NOTHING}`
    switch (error.code) {
        case 'laser-sign-off':
            return `Refused: this would light a laser without the laser safety sign-off. A Class 4 laser needs a certified laser safety officer first. ${NOTHING}`
        case 'mover-policy':
            return `Refused: this would move a lamp's aim. A scene never changes an aim; the moving-light plan is checked on the aims as they are. ${NOTHING}`
        case 'loop-length':
            return `Refused: the loop would be ${error.detail?.after} s, outside ${LOOP_RANGE_S.min}-${LOOP_RANGE_S.max} s. ${NOTHING}`
        default:
            return `Refused: ${error.message}. ${NOTHING}`
    }
}

const readText = (file) => (typeof file.text === 'function' ? file.text() : new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
}))

const downloadJson = (name, text) => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return true
}

const useReducedMotion = (forced) => {
    const [reduced, setReduced] = useState(() => forced ?? (typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)))
    useEffect(() => {
        if (forced !== undefined) return undefined
        const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null
        if (!mq?.addEventListener) return undefined
        const on = () => setReduced(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [forced])
    return forced ?? reduced
}

/** A range that writes once, when it is let go (pointer up, key up, blur) — one undo step, one op. */
function CommitRange({ value, onCommit, ...props }) {
    const [draft, setDraft] = useState(null)
    const commit = () => {
        if (draft === null) return
        const next = draft
        setDraft(null)
        if (next !== value) onCommit(next)
    }
    return (
        <input
            type="range"
            {...props}
            value={draft ?? value}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
        />
    )
}

/** The small 2D preview: beams in the scene's colour at its intensity; strobe capped, off with reduced motion. */
function Preview({ scene, reducedMotion }) {
    const ref = useRef(null)
    useEffect(() => {
        const canvas = ref.current
        if (!canvas || !scene) return undefined
        let ctx = null
        try {
            ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
        } catch {
            ctx = null
        }
        if (!ctx) return undefined
        let frame = 0
        const draw = (time) => {
            const { colour, brightness, flash } = previewOf(scene, time, { reducedMotion })
            const w = canvas.width
            const h = canvas.height
            ctx.globalAlpha = 1
            ctx.fillStyle = '#050505'
            ctx.fillRect(0, 0, w, h)
            ctx.strokeStyle = '#2a2a2a'
            ctx.strokeRect(w * 0.1, h * 0.08, w * 0.8, 3)
            ctx.fillStyle = colour
            for (let i = 0; i < 7; i += 1) {
                const ox = w * (0.14 + (0.72 * i) / 6)
                const tx = w * (0.2 + (0.6 * i) / 6)
                ctx.globalAlpha = 0.45 * brightness
                ctx.beginPath()
                ctx.moveTo(ox - 2, h * 0.1)
                ctx.lineTo(ox + 2, h * 0.1)
                ctx.lineTo(tx + w * 0.05, h * 0.9)
                ctx.lineTo(tx - w * 0.05, h * 0.9)
                ctx.closePath()
                ctx.fill()
            }
            if (flash) {
                ctx.globalAlpha = 0.55
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, w, h)
            }
            if (scene.flags?.strobe && !reducedMotion) frame = requestAnimationFrame(draw)
        }
        draw(typeof performance !== 'undefined' ? performance.now() : 0)
        return () => cancelAnimationFrame(frame)
    }, [scene, reducedMotion])
    if (!scene) return null
    const strobe = scene.flags?.strobe ? (reducedMotion ? 'strobe on (not shown: reduced motion)' : `strobe on (shown at ${MAX_PREVIEW_FLASHES_PER_S} flashes a second)`) : 'strobe off'
    return (
        <canvas
            ref={ref}
            className="rigscenes-preview"
            width="320"
            height="200"
            role="img"
            aria-label={`Preview of ${scene.name}: intensity ${Math.round(intensityOf(scene) * 100)} %, colour ${previewColour(scene)}, ${strobe}`}
        />
    )
}

function Controls({ scene, onControl, readOnly }) {
    const intensity = Math.round(intensityOf(scene) * 100)
    const colour = previewColour(scene)
    const hasBlinder = Object.keys(scene.levels).some(isBlinderKey)
    const fadeMax = Math.min(60, scene.hold > 0 ? scene.hold : 60)
    const colourInput = useRef(null)
    useEffect(() => {
        // The native `change` (the picker closed), not React's onChange (every move of the picker): one write.
        const input = colourInput.current
        if (!input) return undefined
        const on = () => onControl('colour', input.value, `colour ${input.value}`)
        input.addEventListener('change', on)
        return () => input.removeEventListener('change', on)
    }, [onControl, colour])
    return (
        <div className="rigscenes-controls" role="group" aria-label={`${scene.name} controls`}>
            <div className="rigscenes-ctl">
                <label htmlFor={`sc-int-${scene.id}`}>intensity</label>
                <CommitRange
                    id={`sc-int-${scene.id}`}
                    min="0" max="100" step="1"
                    value={intensity}
                    disabled={readOnly || intensity === 0}
                    aria-label={`${scene.name} intensity`}
                    onCommit={(to) => onControl('intensity', to / 100 / intensityOf(scene), `intensity ${intensity} -> ${to} %`)}
                />
                <output>{intensity} %</output>
            </div>
            {intensity === 0 ? <p className="rigscenes-dim">Dark scene: no lit group to scale.</p> : null}
            <div className="rigscenes-ctl rigscenes-ctl--colour">
                <span id={`sc-col-${scene.id}`}>colour</span>
                <div className="rigscenes-swatches" role="group" aria-labelledby={`sc-col-${scene.id}`}>
                    {COLOUR_PRESETS.map((hex) => (
                        <button
                            key={hex}
                            type="button"
                            className="rigscenes-swatch"
                            style={{ background: hex }}
                            aria-pressed={colour === hex}
                            aria-label={`${scene.name} colour ${hex}`}
                            disabled={readOnly || intensity === 0}
                            onClick={() => onControl('colour', hex, `colour ${colour} -> ${hex}`)}
                        />
                    ))}
                    <input ref={colourInput} type="color" className="rigscenes-colour" defaultValue={colour} key={colour} aria-label={`${scene.name} colour, any`} disabled={readOnly || intensity === 0} />
                </div>
            </div>
            <div className="rigscenes-ctl">
                <label htmlFor={`sc-spd-${scene.id}`}>speed</label>
                <CommitRange
                    id={`sc-spd-${scene.id}`}
                    min="0" max={fadeMax} step="0.5"
                    value={scene.inLoop ? scene.fade : 0}
                    disabled={readOnly || !scene.inLoop}
                    aria-label={`${scene.name} speed, fade in seconds`}
                    onCommit={(to) => onControl('speed', to, `fade ${scene.fade} -> ${to} s`)}
                />
                <output>{scene.inLoop ? `${scene.fade} s fade` : 'no fade'}</output>
            </div>
            {!scene.inLoop ? <p className="rigscenes-dim">Outside the loop: no cue, so no fade.</p> : null}
            <div className="rigscenes-ctl">
                <span>strobe</span>
                <button
                    type="button"
                    aria-pressed={scene.flags.strobe}
                    aria-label={`${scene.name} strobe`}
                    disabled={readOnly || !hasBlinder}
                    onClick={() => onControl('strobe', !scene.flags.strobe, `strobe ${scene.flags.strobe ? 'off' : 'on'}`)}
                >
                    STROBE: {scene.flags.strobe ? 'ON' : 'OFF'}
                </button>
            </div>
            {!hasBlinder ? <p className="rigscenes-dim">No blinder in this scene, so no strobe.</p> : null}
        </div>
    )
}

function SyncStrip({ ledger, compared, readOnly, onFile, onExport, onChoose, fileRef, fileNote, decided }) {
    const counts = { same: 0, here: 0, there: 0, both: 0 }
    for (const s of compared || []) counts[MARK_CLASS[s.state]] += 1
    const open = (compared || []).filter((s) => s.state !== 'same')
    const last = whenOf(ledger.at)
    return (
        <section className="rigscenes-sync is-off" aria-label="Sync with the other copy" aria-live="polite">
            <div className="rigscenes-row">
                <b>SYNC: OFFLINE</b>
                <span className="rigscenes-dim">{last ? `last synced ${last}` : 'never synced'}</span>
            </div>
            <p>{OFFLINE_SENTENCE}</p>
            {compared ? (
                <p>{counts.same} same, {counts.here} changed here (waiting to send), {counts.there} changed there (as last seen), {counts.both} changed on both</p>
            ) : null}
            {fileNote ? <p className="rigscenes-note">{fileNote}</p> : null}
            <div className="rigscenes-row">
                <button type="button" onClick={() => fileRef.current?.click()}>SYNC FROM A FILE</button>
                <input ref={fileRef} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-label="scenes file" data-testid="scenes-file" onChange={onFile} />
                <button type="button" onClick={onExport}>EXPORT</button>
            </div>
            {open.length ? (
                <ul className="rigscenes-syncrows" aria-label="Scenes that differ">
                    {open.map((s) => {
                        const name = s.here?.name || s.there?.name || s.id
                        const kept = decided[s.id]
                        return (
                            <li key={s.id} className={`rigscenes-syncrow is-${MARK_CLASS[s.state]}`}>
                                <span className="rigscenes-syncrow__name">{name}</span>
                                <span className="rigscenes-mark">{MARK_WORDS[s.state]}</span>
                                {kept ? <span className="rigscenes-dim">{kept}</span> : (
                                    <span className="rigscenes-row">
                                        {s.state === 'changedThere' || s.state === 'onlyThere' || s.state === 'changedBoth'
                                            ? <button type="button" className="is-primary" disabled={readOnly} onClick={() => onChoose(s, 'takeTheirs')}>TAKE THEIRS</button> : null}
                                        {s.state !== 'same'
                                            ? <button type="button" disabled={readOnly} onClick={() => onChoose(s, 'keepMine')}>KEEP MINE</button> : null}
                                        {s.state === 'changedBoth' && s.there
                                            ? <button type="button" disabled={readOnly} onClick={() => onChoose(s, 'keepBoth')}>KEEP BOTH</button> : null}
                                    </span>
                                )}
                            </li>
                        )
                    })}
                </ul>
            ) : null}
            {open.some((s) => s.state === 'changedBoth') ? (
                <p className="rigscenes-dim">Take theirs: their scene replaces mine (a restore point first). Keep mine: nothing here changes; the other copy takes mine from this copy&apos;s export. Keep both: mine stays, theirs becomes a labelled copy outside the loop.</p>
            ) : null}
        </section>
    )
}

/**
 * doc       the project document (as the store holds it)
 * applyOps  the project document's op path (useProjectDocumentSync's applyLocalOps); never called read only
 * syncError the store's pending-sync error (null when none); shown on this page
 * syncVersion the store's document version; it moves when the server takes a write (undefined = no store: bases are written at once)
 * storage   localStorage-like, for the sync ledger (tests pass their own)
 * download  (fileName, text) => void, for EXPORT (tests pass their own)
 */
export default function ScenesDeck({ doc, applyOps, projectId, readOnly = false, syncError = null, syncVersion, storage, download = downloadJson, now = () => new Date(), reducedMotion: forcedReduced }) {
    const read = useMemo(() => readScenes(doc), [doc])
    const { scenes, loopSeconds } = read
    const [tab, setTab] = useState('A')
    const [selectedId, setSelectedId] = useState(null)
    const selected = scenes.find((s) => s.id === selectedId) || scenes[0] || null
    const [message, setMessage] = useState('')
    const reducedMotion = useReducedMotion(forcedReduced)

    // --- history: undo, restore last good (layer 1's reducer; its `out` is what we send) ---
    const [history, setHistory] = useState(createHistory)
    const historyRef = useRef(history)
    const [goodAt, setGoodAt] = useState('')
    const step = useCallback((action) => {
        const next = historyReducer(historyRef.current, action)
        historyRef.current = next
        setHistory(next)
        return next.out
    }, [])
    // Undo and restore send the whole old list, so they are checked first: the history refuses when the looks or
    // cues changed elsewhere since this page last wrote them, and layer 1's guard runs over EVERY scene. A refusal
    // says why and changes nothing (the history is left as it was).
    const tryStep = useCallback((action) => {
        const next = historyReducer(historyRef.current, action)
        if (next.refused) {
            setMessage(`Not done: ${next.refused}. Nothing was changed; use the preview's scenes as they are now.`)
            return null
        }
        if (next.out.length) {
            try {
                guardSceneChange(doc, next.out, null)
            } catch (error) {
                setMessage(refusalWords(error))
                return null
            }
        }
        historyRef.current = next
        setHistory(next)
        return next.out
    }, [doc])
    useEffect(() => {
        if (historyRef.current.good || !scenes.length) return
        step({ type: 'markGood', document: doc })
        setGoodAt('as opened')
    }, [doc, scenes.length, step])

    const write = useCallback((ops, words) => {
        if (readOnly || !ops.length) return false
        step({ type: 'record', document: doc, ops })
        applyOps(ops)
        if (words) setMessage(words)
        return true
    }, [readOnly, step, doc, applyOps])

    const onControl = useCallback((control, value, words) => {
        if (readOnly || !selected) return
        let ops
        try {
            ops = applyControl(doc, selected.id, control, value)
        } catch (error) {
            setMessage(refusalWords(error))
            return
        }
        if (!ops.length) return
        write(ops, `${selected.name}: ${words}.`)
    }, [readOnly, selected, doc, write])

    const undo = () => {
        const ops = tryStep({ type: 'undo', document: doc })
        if (!ops || !ops.length) return
        applyOps(ops)
        setMessage('Undid the last change.')
    }
    const restoreGood = () => {
        const ops = tryStep({ type: 'restoreGood', document: doc })
        if (!ops) return
        if (!ops.length) {
            setMessage('Already at the last good state.')
            return
        }
        applyOps(ops)
        setMessage(`Restored the last good state (${goodAt}).`)
    }
    const markGood = () => {
        step({ type: 'markGood', document: doc })
        const at = hhmm(now())
        setGoodAt(at)
        setMessage(`Marked good ${at}.`)
    }

    // --- sync by file: ledger, compare, the three actions ---
    const [ledger, setLedger] = useState(() => readLedger(projectId, storage))
    useEffect(() => { setLedger(readLedger(projectId, storage)) }, [projectId, storage])
    const [bundle, setBundle] = useState(null)
    const [fileNote, setFileNote] = useState('')
    const [decided, setDecided] = useState({})
    const fileRef = useRef(null)
    const compared = useMemo(() => {
        if (!bundle) return null
        try {
            return compareScenes(scenes, bundle.scenes, ledger.lastSync)
        } catch {
            return null
        }
    }, [bundle, scenes, ledger])
    const markOf = useMemo(() => new Map((compared || []).map((s) => [s.id, s.state])), [compared])

    const setBases = useCallback((bases) => {
        if (!Object.keys(bases).length) return
        const { ledger: next, ok } = writeBases(projectId, bases, { storage, now: now() })
        setLedger(next)
        if (!ok) setFileNote('This browser would not keep the sync record; the marks will not remember this sync.')
    }, [projectId, storage, now])

    // The store has no acknowledgement of a write, and applyOps is optimistic (the queue is in memory). The ledger
    // must not say "synced" before the server has taken the ops: the bases wait until the store's version moves
    // past the one the write was made on with no sync error; while an error stands they stay held and the page says so.
    const [held, setHeld] = useState(null)
    const setBasesWhenSent = (bases) => {
        if (!Object.keys(bases).length) return
        if (syncVersion === undefined) {
            setBases(bases)
            return
        }
        setHeld((h) => ({ bases: { ...(h?.bases || {}), ...bases }, version: h ? Math.min(h.version, syncVersion) : syncVersion }))
    }
    useEffect(() => {
        if (!held || syncError || !(syncVersion > held.version)) return
        setHeld(null)
        setBases(held.bases)
    }, [held, syncError, syncVersion, setBases])

    const onFile = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        setDecided({})
        if (file.size > BUNDLE_LIMITS.bytes) {
            setBundle(null)
            setFileNote(`Not read: "${file.name}" is larger than a scenes file can be (${BUNDLE_LIMITS.bytes / 1024} KiB). Nothing was changed.`)
            return
        }
        let parsed
        try {
            parsed = parseBundle(await readText(file))
        } catch (error) {
            setBundle(null)
            setFileNote(`Not read: ${error instanceof SceneDeckError ? error.message : 'the file could not be read'}. Nothing was changed.`)
            return
        }
        if (parsed.project !== projectId) {
            setBundle(null)
            setFileNote(`Not read: this file holds the scenes of ${parsed.project ? `"${parsed.project}"` : 'no named show'}, and this page is "${projectId}". Nothing was changed.`)
            return
        }
        let statuses
        try {
            statuses = compareScenes(scenes, parsed.scenes, ledger.lastSync)
        } catch (error) {
            setBundle(null)
            setFileNote(`Not read: ${error.message}. Nothing was changed.`)
            return
        }
        setBundle(parsed)
        // One restore point per file read, before anything of theirs can be written: every take after it is
        // undone by RESTORE LAST GOOD (it replaces an earlier MARK THIS AS GOOD).
        step({ type: 'markGood', document: doc })
        setGoodAt(`file read ${hhmm(now())}`)
        // Same on both copies: that hash is now the last common one (it changes no scene).
        setBases(Object.fromEntries(statuses.filter((s) => s.state === 'same' && s.hereHash).map((s) => [s.id, s.hereHash])))
        const made = parsed.exportedAt ? ` made ${whenOf(parsed.exportedAt) || parsed.exportedAt}` : ''
        setFileNote(`Read "${file.name}"${made}. Marks now compare with it. A restore point was kept (it replaces an earlier one). Nothing was changed; use the buttons below.`)
    }

    const onChoose = (status, choice) => {
        if (readOnly) return
        const name = status.here?.name || status.there?.name || status.id
        let actions
        try {
            actions = planSync(status, choice, { label: `there ${hhmm(now())}` })
        } catch (error) {
            setMessage(refusalWords(error))
            return
        }
        // Every write of theirs is checked by layer 1's guard BEFORE anything happens; a refusal writes nothing.
        let working = doc
        const ops = []
        try {
            for (const action of actions) {
                const some = sceneOps(working, action)
                if (!some.length) continue
                const before = new Set(readScenes(working).scenes.map((s) => s.id))
                const after = readScenes(applyProjectOps(working, some)).scenes.map((s) => s.id)
                const guardId = action.kind === 'addCopy' ? after.find((id) => !before.has(id)) ?? action.id : action.id
                working = guardSceneChange(working, some, guardId)
                ops.push(...some)
            }
        } catch (error) {
            setMessage(refusalWords(error))
            return
        }
        if (ops.length) {
            step({ type: 'record', document: doc, ops })
            applyOps(ops)
        }
        setBasesWhenSent(Object.fromEntries(actions.filter((a) => a.kind === 'setBase' && a.hash).map((a) => [a.id, a.hash])))
        if (choice === 'takeTheirs') {
            setDecided((d) => ({ ...d, [status.id]: 'took theirs' }))
            setMessage(`Took "${name}" from there. A restore point was kept first: RESTORE LAST GOOD goes back to before it.`)
        } else if (choice === 'keepBoth' && status.there) {
            setDecided((d) => ({ ...d, [status.id]: 'kept both' }))
            setMessage(`Kept both: "${name}" is mine; theirs is now a labelled copy outside the loop.`)
        } else {
            setDecided((d) => ({ ...d, [status.id]: 'kept mine' }))
            setMessage(`Kept mine for "${name}". Nothing here changed; the other copy takes it from this copy's export.`)
        }
    }

    const onExport = () => {
        const text = JSON.stringify(exportBundle(doc, { project: projectId, exportedAt: now().toISOString(), lastSync: ledger.lastSync }), null, 2)
        download(`${projectId}.scenes.json`, text)
        setMessage(`Exported ${scenes.length} scenes as ${projectId}.scenes.json.`)
    }

    // --- play / loop / next (this preview only; the hall runs the show clock) ---
    const [playing, setPlaying] = useState(null) // Date.now() when PLAY was pressed
    const [loop, setLoop] = useState(true)
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
        if (playing === null) return undefined
        const on = () => setElapsed(Date.now() - playing)
        on()
        const id = setInterval(on, 250)
        return () => clearInterval(id)
    }, [playing])
    const playingId = playing === null ? null : playingAt(scenes, elapsed, { loop })
    const shown = scenes.find((s) => s.id === playingId) || selected
    const next = () => {
        if (!scenes.length) return
        const i = scenes.findIndex((s) => s.id === selected?.id)
        setSelectedId(scenes[(i + 1) % scenes.length].id)
        setPlaying(null)
    }

    // --- tabs: arrow keys move between the two ---
    const tabRefs = { A: useRef(null), B: useRef(null) }
    const onTabKey = (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        event.preventDefault()
        const to = tab === 'A' ? 'B' : 'A'
        setTab(to)
        tabRefs[to].current?.focus()
    }

    const timeline = useMemo(() => timelineOf(scenes), [scenes])
    const inRange = loopSeconds >= LOOP_RANGE_S.min && loopSeconds <= LOOP_RANGE_S.max
    const markSpan = (id) => (markOf.has(id) ? <span className="rigscenes-mark">{MARK_WORDS[markOf.get(id)]}</span> : null)

    if (!scenes.length) {
        return (
            <div className="rigscenes rigscenes-body">
                <p>No scenes in this project yet. Looks are written by scripts/rigbuild/looks.mjs and the cue list by show-cues.mjs; the cards page adds cues too.</p>
            </div>
        )
    }

    let n = 0
    const deck = (
        <div>
            <h2>Scenes: tap one to edit</h2>
            <div className="rigscenes-tiles">
                {scenes.map((s) => {
                    if (s.inLoop) n += 1
                    return (
                        <button key={s.id} type="button" className={`rigscenes-tile is-${MARK_CLASS[markOf.get(s.id)] || 'none'}`} aria-pressed={selected?.id === s.id} onClick={() => { setSelectedId(s.id); setPlaying(null) }}>
                            <b>{s.inLoop ? `${n}  ${s.name}` : `spare  ${s.name}`}</b>
                            <span className="rigscenes-dim">{s.inLoop ? `${s.hold} s hold, ${s.fade} s fade` : 'not in the loop'}</span>
                            <span className="rigscenes-sw" style={{ background: previewColour(s), opacity: 0.15 + 0.85 * intensityOf(s) }} aria-hidden="true" />
                            {markSpan(s.id)}
                        </button>
                    )
                })}
            </div>
            <div className="rigscenes-row">
                <button type="button" aria-pressed={playing !== null} onClick={() => setPlaying(playing === null ? Date.now() : null)}>{playing === null ? 'PLAY THE LOOP' : 'STOP'}</button>
                <button type="button" onClick={next}>NEXT SCENE</button>
                <button type="button" aria-pressed={loop} onClick={() => setLoop((l) => !l)}>LOOP: {loop ? 'ON' : 'OFF'}</button>
            </div>
            <p className="rigscenes-dim">Play runs the loop in this preview only. The hall plays the show clock.</p>
        </div>
    )

    const cueTimeline = (
        <div>
            <h2>Loop, {loopSeconds} s: tap a cue to edit its look</h2>
            <div className="rigscenes-tl" role="group" aria-label={`The loop, ${loopSeconds} s`}>
                {timeline.cues.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        className={`rigscenes-cue is-${MARK_CLASS[markOf.get(c.id)] || 'none'}`}
                        style={{ flexGrow: c.hold || 0.0001, borderBottomColor: previewColour(scenes.find((s) => s.id === c.id)) }}
                        aria-pressed={selected?.id === c.id}
                        aria-label={`${c.n} ${c.name}, ${c.hold} s${markOf.has(c.id) ? `, ${MARK_WORDS[markOf.get(c.id)]}` : ''}`}
                        onClick={() => { setSelectedId(c.id); setPlaying(null) }}
                    >
                        {c.n}
                    </button>
                ))}
            </div>
            <p className="rigscenes-dim">Widths follow the holds; a short cue is kept at least 44 px wide to be tapped.</p>
            {!inRange ? <p role="alert">! The loop is {loopSeconds} s, outside {LOOP_RANGE_S.min}-{LOOP_RANGE_S.max} s.</p> : null}
            <p className="rigscenes-note">Read only: retime is not a control yet. A change of hold could take the loop outside {LOOP_RANGE_S.min}-{LOOP_RANGE_S.max} s (it is {loopSeconds} s now), so the timeline shows the holds and does not move them.</p>
            <div className="rigscenes-rows">
                {scenes.map((s, i) => (
                    <button key={s.id} type="button" className="rigscenes-rowbtn" aria-pressed={selected?.id === s.id} onClick={() => { setSelectedId(s.id); setPlaying(null) }}>
                        <span>{s.inLoop ? `${timeline.cues.findIndex((c) => c.id === s.id) + 1}  ${s.name} - ${s.hold} s` : `spare  ${s.name}`}</span>
                        {markSpan(s.id) || <span />}
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className="rigscenes rigscenes-body">
            <div className="rigscenes-tabs" role="tablist" aria-label="Scene views">
                {['A', 'B'].map((key) => (
                    <button
                        key={key}
                        ref={tabRefs[key]}
                        type="button"
                        role="tab"
                        id={`rigscenes-tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`rigscenes-panel-${key}`}
                        tabIndex={tab === key ? 0 : -1}
                        onClick={() => setTab(key)}
                        onKeyDown={onTabKey}
                    >
                        {key === 'A' ? 'A · SCENE DECK' : 'B · CUE TIMELINE'}
                    </button>
                ))}
            </div>
            <SyncStrip ledger={ledger} compared={compared} readOnly={readOnly} onFile={onFile} onExport={onExport} onChoose={onChoose} fileRef={fileRef} fileNote={fileNote} decided={decided} />
            <p className="rigscenes-msg" role="status" aria-label="what happened">{message}</p>
            {syncError ? <p className="rigscenes-note" role="alert">Not saved to the server yet: {syncError} What you see here is only on this screen until it is.{held ? ' The sync record is not updated until the server has it.' : ''}</p> : null}
            {!syncError && held ? <p className="rigscenes-note">Waiting for the server to take the change before it is marked synced.</p> : null}
            <div className="rigscenes-layout">
                <div>
                    <h2>Preview</h2>
                    <Preview scene={shown} reducedMotion={reducedMotion} />
                    <p className="rigscenes-dim">{playingId ? `playing: ${shown?.name}` : `this scene: ${shown?.name}`}</p>
                    <p className="rigscenes-note">Strobe here is capped at {MAX_PREVIEW_FLASHES_PER_S} flashes a second and is off with reduced motion. A 2D sketch of the scene, not the room.</p>
                </div>
                <div role="tabpanel" id={`rigscenes-panel-${tab}`} aria-labelledby={`rigscenes-tab-${tab}`}>
                    {tab === 'A' ? deck : cueTimeline}
                    {selected ? (
                        <div className="rigscenes-box">
                            <h2>{selected.name} {markSpan(selected.id)}</h2>
                            <Controls key={selected.id} scene={selected} onControl={onControl} readOnly={readOnly} />
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="rigscenes-foot rigscenes-row">
                <button type="button" onClick={undo} disabled={readOnly || !history.past.length}>UNDO</button>
                <button type="button" onClick={restoreGood} disabled={readOnly || !history.good}>RESTORE LAST GOOD{goodAt ? ` (${goodAt})` : ''}</button>
                <button type="button" onClick={markGood} disabled={readOnly}>MARK THIS AS GOOD</button>
            </div>
        </div>
    )
}
