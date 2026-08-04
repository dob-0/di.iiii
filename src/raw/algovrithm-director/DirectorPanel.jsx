import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    addAssetClip,
    analyseEditList,
    canSplitClip,
    clipDuration,
    clipSpeed,
    formatEditListSource,
    formatTimecode,
    isAssetClip,
    MIN_CLIP_SPEED,
    moveClip,
    removeClip,
    rippleFrom,
    roundSec,
    setClipDurationRipple,
    setClipSpeed,
    setPlacement,
    sortByStart,
    splitClip,
    timelinePosition,
    trimClip
} from '../../algoVrithm/editList.js'
import { ASSET_FOLDER, ASSET_LIBRARY } from '../../algoVrithm/assetLibrary.js'
import AssetClip, { resolvePlacement } from '../../algoVrithm/sequences/AssetClip.jsx'
import { SEQUENCES } from '../../algoVrithm/sequences/index.js'
import { PLAYBACK_RATES } from '../../algoVrithm/ritualClock.js'
import {
    LIGHT_INTENSITIES,
    LIGHT_KINDS,
    LIGHT_SWATCHES,
    WORLD_SWATCHES,
    paletteWarning
} from '../../algoVrithm/palette.js'
import {
    DEFAULT_AMBIENT,
    addLight,
    lightObjectName,
    parseLightName,
    removeLight,
    resolveLight,
    rowLights,
    setLightValue,
    setWorldValue
} from '../../algoVrithm/worldLights.js'

// The director panel — a video-editor timeline for the piece, for the author
// only (see directorFlag.js). Nothing here ships to an audience.
//
// It exists because building sequence by sequence otherwise means watching
// thirty seconds of tunnel to reach the beat you are actually working on. The
// panel makes the edit list directly manipulable: drag a clip to move it, drag
// an edge to trim, click to jump the playhead there.
//
// Edits are live on a draft. The piece renders from that draft, and
// sequences/index.js stays the source of truth — git-tracked, reviewable, and
// what deploys. "Save to source" writes the draft into that file in place;
// "Copy edit list" regenerates the array to paste by hand. See the note above
// handleSave for which to reach for and why.

// Empty timeline past the last clip, so a clip can be dragged beyond the
// current end to make the piece longer.
const TRACK_HEADROOM = 0.18
const RULER_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60]

const chooseRulerStep = (viewSec) =>
    RULER_STEPS.find((step) => viewSec / step <= 12) ?? RULER_STEPS[RULER_STEPS.length - 1]

/**
 * A seconds field that commits on blur or Enter rather than on every keystroke.
 * Committing per keystroke makes the field impossible to clear and retype —
 * deleting "7.2" to type "12" briefly reads as empty, which a live parse turns
 * into NaN or 0 and the clip collapses under the cursor.
 */
function SecondsField({ value, onCommit, label, min = 0 }) {
    const [draft, setDraft] = useState(String(value))
    const [editing, setEditing] = useState(false)

    useEffect(() => {
        if (!editing) setDraft(String(roundSec(value)))
    }, [value, editing])

    const commit = () => {
        setEditing(false)
        const parsed = Number.parseFloat(draft)
        if (!Number.isFinite(parsed)) {
            setDraft(String(roundSec(value)))
            return
        }
        onCommit(Math.max(min, parsed))
    }

    return (
        <input
            className="algo-vrithm-director-field"
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={draft}
            onFocus={() => setEditing(true)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                    setDraft(String(roundSec(value)))
                    setEditing(false)
                    event.currentTarget.blur()
                }
            }}
        />
    )
}

const sameHex = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()

/**
 * Swatches first, picker second.
 *
 * The palette is the piece — four rules, measured bands, no purple (see
 * palette.js). A free colour input wired straight to the scene quietly repeals
 * all of it over an afternoon of tuning, so the offered set is what the panel
 * leads with and the picker is a deliberate second click.
 *
 * The picker is never blocked and the warning never gates anything: an artist
 * overruling their own rule is a legitimate thing to do, and a control that
 * refuses a colour teaches people to work around the tool. It reports what the
 * choice breaks and gets out of the way — the rule holds by default and is
 * broken on purpose, never by accident.
 */
function ColorChoice({ label, value, swatches, onChange }) {
    const [custom, setCustom] = useState(false)
    const offered = swatches.some((swatch) => sameHex(swatch.color, value))
    const warning = paletteWarning(value)

    return (
        <span className="algo-vrithm-director-color-choice">
            <span className="algo-vrithm-director-swatches" role="group" aria-label={label}>
                {/* NAMED, not just shown. Four of the five world swatches are
                    near-black by design (#0D1114 through #2A3742) and read as
                    four identical empty boxes at chip size — the difference is
                    obvious in the room, where fog fills the frame, and invisible
                    in a 17px square. The light swatches have the same problem
                    one step up: ice blue and sky blue are a guess side by side.
                    So the name sits in normal flow beside the chip rather than
                    in a tooltip you have to hover four times to read, which also
                    puts the palette's own vocabulary in front of the author. */}
                {swatches.map((swatch) => (
                    <span className="algo-vrithm-director-swatch-item" key={swatch.color}>
                        <button
                            type="button"
                            className={`algo-vrithm-director-swatch${sameHex(swatch.color, value) ? ' is-selected' : ''}`}
                            // Inline because it IS the data: the swatch's job is
                            // to show its own colour, and no stylesheet can know
                            // what the palette holds. Same reason the clip
                            // borders above carry their backdrop colour inline.
                            style={{ background: swatch.color }}
                            title={swatch.name}
                            aria-label={swatch.name}
                            onClick={() => {
                                setCustom(false)
                                onChange(swatch.color)
                            }}
                        />
                        {/* A name, not emphasis — the same way the asset chips
                            above carry their kind. The button keeps the
                            aria-label, so this is not read twice. */}
                        <em className="algo-vrithm-director-swatch-name">{swatch.name}</em>
                    </span>
                ))}
                <button
                    type="button"
                    className={`algo-vrithm-director-custom-toggle${custom ? ' is-active' : ''}`}
                    aria-expanded={custom || !offered}
                    onClick={() => setCustom((open) => !open)}
                >
                    custom
                </button>
            </span>
            {/* Stays open on its own for a colour that is not in the offered
                set — a value pasted back from source has no swatch to light up,
                and hiding the only control that can show it reads as the panel
                having lost it. */}
            {(custom || !offered) && (
                <span className="algo-vrithm-director-custom">
                    <input
                        className="algo-vrithm-director-color"
                        type="color"
                        aria-label={`${label} — custom colour`}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                    />
                    {warning && (
                        <em className="algo-vrithm-director-warning">{warning.message}</em>
                    )}
                </span>
            )}
        </span>
    )
}

/** A disclosure. Both new sections are closed by default — the panel already
 *  covers the bottom of the frame, and lighting is not what an author is doing
 *  every time they open it. */
function Section({ title, open, onToggle, children }) {
    return (
        <div className={`algo-vrithm-director-section${open ? ' is-open' : ''}`}>
            <button
                type="button"
                className="algo-vrithm-director-section-toggle"
                aria-expanded={open}
                onClick={onToggle}
            >
                {open ? '▾' : '▸'} {title}
            </button>
            {open && <div className="algo-vrithm-director-section-body">{children}</div>}
        </div>
    )
}

export default function DirectorPanel({ sequences, onChange, clock, selectedId, onSelect, onPlace, onSaveTiming = null }) {
    const trackRef = useRef(null)
    const dragRef = useRef(null)
    const [trackWidth, setTrackWidth] = useState(0)
    const [source, setSource] = useState(null)
    const [copied, setCopied] = useState(false)
    // The panel sits over the bottom of the frame, and an asset placed straight
    // ahead lands dead centre — behind it. Collapsing leaves the timecode and
    // transport in a single strip so you can watch the thing you just placed.
    const [collapsed, setCollapsed] = useState(false)
    // Which per-row disclosures are open, keyed `${rowId}:world` / `${rowId}:lights`.
    // Per row rather than one shared "show world" switch: an author works on
    // one beat at a time, and opening every row's lighting at once buries the
    // timeline the panel exists for.
    const [openSections, setOpenSections] = useState({})

    const toggleSection = useCallback((key) => {
        setOpenSections((previous) => ({ ...previous, [key]: !previous[key] }))
    }, [])

    // Aim the drag handles at a light. The handles attach to a MOUNTED object
    // and a row's lights only exist while its window is open, so this jumps the
    // playhead into the row first — to the middle of it, not the head, because
    // a light fades in with its row and at t=start it is at zero intensity:
    // the author would be dragging something they cannot see.
    const placeLight = useCallback((sequence, lightId) => {
        const inside = clock.playheadSec >= sequence.startSec && clock.playheadSec <= sequence.endSec
        if (!inside) clock.seek((sequence.startSec + sequence.endSec) / 2)
        onPlace?.(lightObjectName(sequence.id, lightId))
    }, [clock, onPlace])

    const ordered = useMemo(() => sortByStart(sequences), [sequences])
    const analysis = useMemo(() => analyseEditList(sequences), [sequences])
    const position = useMemo(
        () => timelinePosition(sequences, clock.playheadSec),
        [sequences, clock.playheadSec]
    )

    const viewSec = Math.max(5, analysis.totalSec * (1 + TRACK_HEADROOM))
    const pxPerSec = trackWidth > 0 ? trackWidth / viewSec : 0
    const toPercent = useCallback((seconds) => `${(seconds / viewSec) * 100}%`, [viewSec])

    useEffect(() => {
        const element = trackRef.current
        if (!element || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => {
            setTrackWidth(entry.contentRect.width)
        })
        observer.observe(element)
        setTrackWidth(element.getBoundingClientRect().width)
        return () => observer.disconnect()
    }, [])

    // ---- scrubbing -------------------------------------------------------

    const seekFromClientX = useCallback((clientX) => {
        const element = trackRef.current
        if (!element) return
        const rect = element.getBoundingClientRect()
        const ratio = (clientX - rect.left) / rect.width
        clock.seek(Math.min(viewSec, Math.max(0, ratio * viewSec)))
    }, [clock, viewSec])

    const onScrubDown = (event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { mode: 'scrub' }
        seekFromClientX(event.clientX)
    }

    // ---- clip drag -------------------------------------------------------

    const onClipDown = (event, sequence, mode) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
            mode,
            id: sequence.id,
            originX: event.clientX,
            startSec: sequence.startSec,
            endSec: sequence.endSec,
            moved: false
        }
    }

    const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) return
        if (drag.mode === 'scrub') {
            seekFromClientX(event.clientX)
            return
        }
        if (!pxPerSec) return

        const deltaSec = (event.clientX - drag.originX) / pxPerSec
        if (Math.abs(event.clientX - drag.originX) > 2) drag.moved = true

        if (drag.mode === 'move') {
            onChange(moveClip(sequences, drag.id, drag.startSec + deltaSec))
        } else if (drag.mode === 'start') {
            onChange(trimClip(sequences, drag.id, 'start', drag.startSec + deltaSec))
        } else {
            onChange(trimClip(sequences, drag.id, 'end', drag.endSec + deltaSec))
        }
    }

    const onPointerUp = (event) => {
        const drag = dragRef.current
        dragRef.current = null
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        // A click that never moved is a "show me this beat", not an edit: it
        // jumps the playhead AND loads that clip into the inspector below, the
        // way clicking a clip in a video editor does. Selecting on pointer UP
        // rather than DOWN means dragging a clip to retime it never disturbs
        // whatever the author already had loaded.
        if (drag && drag.mode === 'move' && !drag.moved) {
            const sequence = sequences.find((item) => item.id === drag.id)
            if (sequence) {
                clock.seek(sequence.startSec)
                onSelect?.(sequence.id)
            }
        }
    }

    // ---- transport keys --------------------------------------------------

    useEffect(() => {
        const onKey = (event) => {
            const tag = event.target?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
            if (event.metaKey || event.ctrlKey || event.altKey) return

            if (event.code === 'Space') {
                event.preventDefault()
                clock.toggle()
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                clock.seek(clock.playheadSec - (event.shiftKey ? 1 : 0.1))
            } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                clock.seek(clock.playheadSec + (event.shiftKey ? 1 : 0.1))
            } else if (event.key === 'Home') {
                event.preventDefault()
                clock.restart()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [clock])

    // ---- save back to code -----------------------------------------------
    //
    // "Copy edit list" regenerates the whole SEQUENCES array, which is correct
    // and lossy in the two ways that matter: it drops fields it was never
    // taught about (`veil: false`, on the two rows whose arrival IS their own
    // transition) and it replaces every comment in the file. Save goes the
    // other way — the dev server patches the changed fields in place and
    // leaves the rest of the file alone. Copy stays for the cases save cannot
    // do: rows added in the panel, and any machine that is not this one.
    //
    // SEQUENCES imported directly, not from props, on purpose: this is the
    // pristine edit list as the FILE currently declares it, and the patcher
    // needs it to tell an edited field from an untouched one. `sequences` is
    // the draft and would report everything as unchanged.
    const [saveState, setSaveState] = useState(null)

    const handleSave = async () => {
        setSaveState({ kind: 'saving' })
        try {
            const response = await fetch('/__algovrithm/edit-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Component is a function and JSON drops it — which is what we
                // want, since the patcher never touches that field.
                body: JSON.stringify({ sequences, baseline: SEQUENCES })
            })
            const result = await response.json()

            if (!result.ok) {
                setSaveState({ kind: 'error', reason: result.reason ?? 'refused' })
                return
            }
            setSaveState({ kind: 'saved', where: 'source', changed: result.changed })
            window.setTimeout(() => setSaveState(null), 2400)
        } catch (error) {
            // No endpoint — a production build, or the dev server has died.
            // This used to be the end of the road, and it is the whole reason
            // the piece could be retimed only on the machine running `npm run
            // dev`: the timeline opened perfectly well on di-studio.xyz and had
            // nowhere to put an edit. Fall through to the live space, which
            // keeps a timing overlay in its settings — the file stays the
            // source of truth and the overlay says how this space differs.
            if (!onSaveTiming) {
                setSaveState({ kind: 'error', reason: `no dev server (${error?.message ?? 'unreachable'}) — use Copy` })
                return
            }
            try {
                const { changed } = await onSaveTiming(sequences)
                setSaveState({ kind: 'saved', where: 'space', changed })
                window.setTimeout(() => setSaveState(null), 2400)
            } catch (spaceError) {
                setSaveState({
                    kind: 'error',
                    reason: `could not save to this space (${spaceError?.message ?? 'unreachable'}) — use Copy`
                })
            }
        }
    }

    // ---- copy back to code ----------------------------------------------

    const handleCopy = async () => {
        // Component.name is readable in dev, which is where the edit list gets
        // pasted back. A minified ?director build may mangle it — the fallback
        // in formatEditListSource keeps the output pasteable either way.
        const text = formatEditListSource(sequences)
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setSource(null)
            window.setTimeout(() => setCopied(false), 1800)
        } catch {
            // No clipboard permission (common over plain http on a phone) —
            // show the source instead of failing silently.
            setSource(text)
        }
    }

    const rulerStep = chooseRulerStep(viewSec)
    const ticks = []
    for (let seconds = 0; seconds <= viewSec; seconds += rulerStep) {
        ticks.push(roundSec(seconds))
    }

    // ---- inspector -------------------------------------------------------
    //
    // The editing model every video editor uses: the TRACK says when, the
    // INSPECTOR says what, and the inspector only ever shows the one clip you
    // have selected.
    //
    // This panel used to stack EVERY row's editor in the 34vh scroller below —
    // so four clips meant four complete editors (timing, placement, world,
    // lights, remove) competing for a third of the screen, and the author
    // scrolling to find the one they were actually looking at. Showing one at a
    // time is the entire fix: same controls, same scroller, a quarter of the
    // content. Nothing about the height calibration in stageView.js changes,
    // because the panel can only get shorter.
    //
    // A selected LIGHT resolves to the row that owns it — otherwise picking a
    // lamp up to drag it would empty the panel holding its own controls.
    const selectedRowId = parseLightName(selectedId)?.rowId ?? selectedId

    // With nothing selected, fall back to whatever the playhead is sitting on:
    // the panel opens on something useful instead of blank, and scrubbing to a
    // beat puts that beat's controls under your hand. An explicit selection
    // PINS, so playback running on does not pull the editor out from under you
    // mid-edit.
    const inspectedId = useMemo(() => {
        if (selectedRowId && sequences.some((item) => item.id === selectedRowId)) {
            return selectedRowId
        }
        const live = ordered.find(
            (item) => clock.playheadSec >= item.startSec && clock.playheadSec < item.endSec
        )
        return live?.id ?? ordered[0]?.id ?? null
    }, [selectedRowId, sequences, ordered, clock.playheadSec])

    const inspected = ordered.filter((item) => item.id === inspectedId)

    // ---- the razor -------------------------------------------------------

    const cutAtPlayhead = useCallback(() => {
        if (!inspectedId) return
        onChange(splitClip(sequences, inspectedId, clock.playheadSec))
    }, [clock.playheadSec, inspectedId, onChange, sequences])

    // splitClip returns the array unchanged when the cut is impossible, so the
    // button's enabled state and the edit itself can never disagree about what
    // is allowed — there is one rule, in one place.
    const canCut = inspectedId ? canSplitClip(sequences, inspectedId, clock.playheadSec) : false

    // B for blade, the key every NLE uses. Its own listener rather than another
    // branch in the transport handler further up, because it needs inspector
    // state that is computed down here: a keydown effect reaching forward for a
    // value defined below it is a temporal-dead-zone crash waiting for someone
    // to trip over.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== 'b' && event.key !== 'B') return
            const tag = event.target?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            event.preventDefault()
            cutAtPlayhead()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [cutAtPlayhead])

    return (
        <section
            className={`algo-vrithm-director${collapsed ? ' is-collapsed' : ''}`}
            aria-label="Director panel"
        >
            <header className="algo-vrithm-director-head">
                <button
                    type="button"
                    className="algo-vrithm-director-collapse"
                    aria-expanded={!collapsed}
                    title={collapsed ? 'Show the timeline' : 'Collapse to watch the piece'}
                    onClick={() => setCollapsed((value) => !value)}
                >
                    {collapsed ? '▴' : '▾'}
                </button>
                <span className="algo-vrithm-director-tag">director</span>
                <span className="algo-vrithm-director-time">
                    {formatTimecode(clock.playheadSec)} / {formatTimecode(analysis.totalSec)}
                </span>
                <span className="algo-vrithm-director-now">
                    {position.live.length
                        ? position.live.map((sequence) => sequence.title).join(' + ')
                        : 'nothing on screen'}
                    {position.next
                        ? ` → next: ${position.next.title} in ${position.secondsToNext.toFixed(1)}s`
                        : ' → end of piece'}
                </span>
            </header>

            <div className="algo-vrithm-director-transport">
                <button type="button" onClick={clock.toggle} aria-label={clock.isPlaying ? 'Pause' : 'Play'}>
                    {clock.isPlaying ? '❙❙' : '▶'}
                </button>
                <button type="button" onClick={clock.restart} aria-label="Restart">↺</button>
                {/* Cuts the clip in the inspector, at the playhead. Disabled
                    rather than hidden when the playhead is outside it: a blade
                    that vanishes is a blade you go looking for. */}
                <button
                    type="button"
                    onClick={cutAtPlayhead}
                    disabled={!canCut}
                    aria-label="Cut at playhead"
                    title={canCut
                        ? `Cut ${inspected[0]?.title ?? 'clip'} at the playhead  (B)`
                        : 'Put the playhead inside the clip you want to cut  (B)'}
                >
                    ✂
                </button>
                <span className="algo-vrithm-director-rates">
                    {PLAYBACK_RATES.map((rate) => (
                        <button
                            type="button"
                            key={rate}
                            className={rate === clock.rate ? 'is-active' : ''}
                            onClick={() => clock.setRate(rate)}
                        >
                            ×{rate}
                        </button>
                    ))}
                </span>
                <span className="algo-vrithm-director-hint">
                    space play · ← → nudge · B cut at playhead · drag clip to move · drag edge to trim · click clip to edit it below
                </span>
            </div>

            <div
                className="algo-vrithm-director-track"
                ref={trackRef}
                onPointerDown={onScrubDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <div className="algo-vrithm-director-ruler">
                    {ticks.map((seconds) => (
                        <span
                            key={seconds}
                            className="algo-vrithm-director-tick"
                            style={{ left: toPercent(seconds) }}
                        >
                            {seconds}s
                        </span>
                    ))}
                </div>

                {/* Stretches with nothing on screen. Invisible in the numbers,
                    obvious as a red band — and the reason the edit-list test
                    asserts no dead frames. */}
                {analysis.gaps.map((gap) => (
                    <div
                        key={`gap-${gap.startSec}`}
                        className="algo-vrithm-director-gap"
                        title={`Dead frame ${gap.startSec}s – ${gap.endSec}s: the piece plays to an empty room`}
                        style={{
                            left: toPercent(gap.startSec),
                            width: toPercent(gap.endSec - gap.startSec)
                        }}
                    />
                ))}

                {ordered.map((sequence) => (
                    <div className="algo-vrithm-director-row" key={sequence.id}>
                        <div
                            className={[
                                'algo-vrithm-director-clip',
                                isAssetClip(sequence) ? 'is-asset' : '',
                                sequence.id === inspectedId ? 'is-inspected' : ''
                            ].filter(Boolean).join(' ')}
                            style={{
                                left: toPercent(sequence.startSec),
                                width: toPercent(clipDuration(sequence)),
                                borderColor: sequence.backdrop?.color ?? '#4df9ff'
                            }}
                            title={sequence.note}
                            onPointerDown={(event) => onClipDown(event, sequence, 'move')}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                        >
                            <span
                                className="algo-vrithm-director-handle is-start"
                                onPointerDown={(event) => onClipDown(event, sequence, 'start')}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                            />
                            <span className="algo-vrithm-director-clip-label">
                                {sequence.title}
                                <em>{clipDuration(sequence).toFixed(2)}s</em>
                            </span>
                            <span
                                className="algo-vrithm-director-handle is-end"
                                onPointerDown={(event) => onClipDown(event, sequence, 'end')}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                            />
                        </div>
                    </div>
                ))}

                <div className="algo-vrithm-director-cursor" style={{ left: toPercent(clock.playheadSec) }} />
            </div>

            {/* Which clip the controls below belong to. Without this the panel
                looks like it has silently lost the other rows, rather than
                like it is focused on one. The suffix says WHY this clip:
                "selected" is a choice the author made, "at playhead" is the
                fallback, and telling them apart is the difference between
                trusting the panel and fighting it. */}
            {inspected.length > 0 && (
                <div className="algo-vrithm-director-inspector-head">
                    <span>{inspected[0].title}</span>
                    <em>{selectedRowId === inspectedId ? 'selected' : 'at playhead'}</em>
                </div>
            )}

            <ul className="algo-vrithm-director-rows">
                {inspected.map((sequence) => (
                    <li key={sequence.id}>
                        <button
                            type="button"
                            className="algo-vrithm-director-jump"
                            onClick={() => clock.seek(sequence.startSec)}
                        >
                            {sequence.title}
                        </button>
                        {/* <span> rather than <label>: the field carries its
                            own aria-label, and a <label> wrapping a component
                            reads as unassociated to the a11y lint. */}
                        <span className="algo-vrithm-director-pair">
                            starts
                            <SecondsField
                                label={`${sequence.title} start in seconds`}
                                value={sequence.startSec}
                                onCommit={(next) => onChange(moveClip(sequences, sequence.id, next))}
                            />
                            s
                        </span>
                        {/* Typing a duration RIPPLES: everything after this
                            beat slides with it, so the piece gets longer
                            instead of this clip eating the next one. That is
                            what a duration box does in an editing program.

                            Dragging the clip's edge on the track above still
                            trims only that clip — so the two gestures cover
                            both jobs without a mode switch to remember: type to
                            retime the piece, drag to shape one handover. */}
                        <span className="algo-vrithm-director-pair">
                            lasts
                            <SecondsField
                                label={`${sequence.title} length in seconds — later clips move with it`}
                                value={clipDuration(sequence)}
                                onCommit={(next) =>
                                    onChange(setClipDurationRipple(sequences, sequence.id, next))}
                            />
                            s
                        </span>
                        {/* Speed is a different question from length. `for`
                            says how long this beat occupies the piece; this
                            says how fast it runs through its own material
                            while it is there. They used to be the same dial —
                            the only way to slow a sequence was to lengthen it,
                            which shoved everything after it down the timeline. */}
                        <span className="algo-vrithm-director-pair">
                            speed ×
                            <SecondsField
                                label={`${sequence.title} speed — 1 plays the whole sequence across its window`}
                                value={clipSpeed(sequence)}
                                min={MIN_CLIP_SPEED}
                                onCommit={(next) => onChange(setClipSpeed(sequences, sequence.id, next))}
                            />
                        </span>
                        {/* Says what the three boxes above actually do, in the
                            row itself. A tooltip is no use to someone who does
                            not already suspect there is something to hover, and
                            "in / for / speed" told an author who had not built
                            the panel nothing at all. */}
                        <span className="algo-vrithm-director-rowhint">
                            <b>starts</b> when this beat begins ·
                            {' '}<b>lasts</b> how long it runs — later clips move with it, so the piece gets longer ·
                            {' '}<b>speed ×</b> how fast it plays inside that time, moving nothing
                        </span>

                        {/* Ripple: insert or remove time here and push every
                            later clip with it, instead of retyping them all. */}
                        <span className="algo-vrithm-director-ripple">
                            <button
                                type="button"
                                title="Pull this and everything after it 1s earlier"
                                onClick={() => onChange(rippleFrom(sequences, sequence.id, -1))}
                            >
                                −1s ⇤
                            </button>
                            <button
                                type="button"
                                title="Push this and everything after it 1s later"
                                onClick={() => onChange(rippleFrom(sequences, sequence.id, 1))}
                            >
                                ⇥ +1s
                            </button>
                        </span>

                        {/* Placement, asset clips only. Polar rather than XYZ
                            because the viewer never moves: how far in front,
                            how tall, how high, how far round. A hand-written
                            sequence has no placement — it IS the room. */}
                        {isAssetClip(sequence) && (
                            <>
                                {[
                                    ['distance', 'at', 'metres in front'],
                                    ['size', 'size', 'height in metres'],
                                    ['height', 'y', 'metres above eye line'],
                                    ['bearing', '°', 'degrees round from straight ahead']
                                ].map(([key, short, description]) => (
                                    <span className="algo-vrithm-director-pair" key={key}>
                                        {short}
                                        <SecondsField
                                            label={`${sequence.title} ${description}`}
                                            value={resolvePlacement(sequence.asset)[key]}
                                            min={key === 'bearing' ? -180 : 0}
                                            onCommit={(next) =>
                                                onChange(setPlacement(sequences, sequence.id, key, next))}
                                        />
                                    </span>
                                ))}
                            </>
                        )}

                        {/* Remove — every row, not just asset clips.

                            Taking a hand-written sequence out does NOT delete
                            its file. It drops the row from the draft edit list,
                            which is the same draft every other control here
                            edits: reload and it is back, and "Copy edit list"
                            simply stops emitting it. That makes "what does the
                            piece feel like without this beat" a click instead
                            of a commented-out import.

                            The last remaining sequence cannot be removed. An
                            empty edit list is a zero-length piece playing to an
                            empty room, with no clip left to click to get back. */}
                        <button
                            type="button"
                            className="algo-vrithm-director-remove"
                            disabled={ordered.length < 2}
                            title={ordered.length < 2
                                ? 'The piece needs at least one sequence'
                                : isAssetClip(sequence)
                                    ? `Remove ${sequence.title} from the edit list`
                                    : `Take ${sequence.title} out of the edit list (reload restores it — the file is untouched)`}
                            onClick={() => onChange(removeClip(sequences, sequence.id))}
                        >
                            ×
                        </button>

                        {/* The room this beat happens in, and the lamps in it.
                            Both are edit-list data (see worldLights.js), so
                            everything here is written back by Save and by Copy
                            alike. */}
                        <div className="algo-vrithm-director-sections">
                            <Section
                                title="world"
                                open={Boolean(openSections[`${sequence.id}:world`])}
                                onToggle={() => toggleSection(`${sequence.id}:world`)}
                            >
                                {sequence.backdrop ? (
                                    <>
                                        {/* All dark on purpose — see
                                            WORLD_SWATCHES. A lit room comes
                                            from a dark world plus a lamp; a
                                            tinted background is a coloured
                                            photograph of one. */}
                                        <ColorChoice
                                            label={`${sequence.title} world colour`}
                                            value={sequence.backdrop.color}
                                            swatches={WORLD_SWATCHES}
                                            onChange={(color) => onChange(
                                                setWorldValue(sequences, sequence.id, 'color', color)
                                            )}
                                        />
                                        {[
                                            ['fogNear', 'fog from', 'metres before the air starts to close'],
                                            ['fogFar', 'to', 'metres where it is solid'],
                                            ['ambient', 'fill', 'how much unlit air you can see, 0–1']
                                        ].map(([key, short, description]) => (
                                            <span className="algo-vrithm-director-pair" key={key}>
                                                {short}
                                                <SecondsField
                                                    label={`${sequence.title} ${description}`}
                                                    value={key === 'ambient'
                                                        ? sequence.backdrop.ambient ?? DEFAULT_AMBIENT
                                                        : sequence.backdrop[key]}
                                                    onCommit={(next) => onChange(
                                                        setWorldValue(sequences, sequence.id, key, next)
                                                    )}
                                                />
                                            </span>
                                        ))}
                                    </>
                                ) : (
                                    // Deliberate: an asset clip has no opinion
                                    // about the room, and giving it one would
                                    // dim the piece for as long as it is up.
                                    <span className="algo-vrithm-director-note">
                                        no world of its own — this clip sits in whatever room the
                                        sequences around it make
                                    </span>
                                )}
                            </Section>

                            <Section
                                title={`lights${rowLights(sequence).length ? ` · ${rowLights(sequence).length}` : ''}`}
                                open={Boolean(openSections[`${sequence.id}:lights`])}
                                onToggle={() => toggleSection(`${sequence.id}:lights`)}
                            >
                                <button
                                    type="button"
                                    className="algo-vrithm-director-add-light"
                                    onClick={() => onChange(addLight(sequences, sequence.id))}
                                >
                                    ＋ add light
                                </button>
                                {rowLights(sequence).length === 0 && (
                                    <span className="algo-vrithm-director-note">
                                        none — this beat is lit by the room and by whatever the
                                        sequence draws
                                    </span>
                                )}
                                {rowLights(sequence).map((raw) => {
                                    const light = resolveLight(raw)
                                    const name = lightObjectName(sequence.id, light.id)
                                    const patch = (key, value) => onChange(
                                        setLightValue(sequences, sequence.id, light.id, key, value)
                                    )

                                    return (
                                        <div className="algo-vrithm-director-light" key={light.id}>
                                            <span className="algo-vrithm-director-light-head">
                                                {/* Two kinds, not eight: a lamp
                                                    you see the effect of, and a
                                                    glow you can also see. */}
                                                <span
                                                    className="algo-vrithm-director-kinds"
                                                    role="group"
                                                    aria-label={`${light.id} kind`}
                                                >
                                                    {LIGHT_KINDS.map((kind) => (
                                                        <button
                                                            type="button"
                                                            key={kind}
                                                            className={`algo-vrithm-director-kind${kind === light.kind ? ' is-active' : ''}`}
                                                            onClick={() => patch('kind', kind)}
                                                        >
                                                            {kind}
                                                        </button>
                                                    ))}
                                                </span>
                                                <button
                                                    type="button"
                                                    className={`algo-vrithm-director-place${selectedId === name ? ' is-selected' : ''}`}
                                                    title="Drag this light where you want it (steps outside the piece to show the handles)"
                                                    onClick={() => placeLight(sequence, light.id)}
                                                >
                                                    place
                                                </button>
                                                <button
                                                    type="button"
                                                    className="algo-vrithm-director-light-remove"
                                                    title={`Remove ${light.id}`}
                                                    onClick={() => onChange(
                                                        removeLight(sequences, sequence.id, light.id)
                                                    )}
                                                >
                                                    ×
                                                </button>
                                            </span>

                                            {/* Every hue in the piece is
                                                available HERE and none of it is
                                                available as a world — colour is
                                                light, not surface. */}
                                            <ColorChoice
                                                label={`${sequence.title} ${light.id} colour`}
                                                value={light.color}
                                                swatches={LIGHT_SWATCHES}
                                                onChange={(color) => patch('color', color)}
                                            />

                                            {/* Named stops rather than a bare
                                                number: lighting is physically
                                                based since three r155, so 1 is
                                                not "half of 2" at three metres
                                                and the numbers cannot be judged
                                                by eye. The field stays for
                                                anyone who wants a value between
                                                two stops. */}
                                            <span
                                                className="algo-vrithm-director-stops"
                                                role="group"
                                                aria-label={`${light.id} intensity`}
                                            >
                                                {Object.entries(LIGHT_INTENSITIES).map(([stop, value]) => (
                                                    <button
                                                        type="button"
                                                        key={stop}
                                                        className={`algo-vrithm-director-stop${value === light.intensity ? ' is-active' : ''}`}
                                                        onClick={() => patch('intensity', value)}
                                                    >
                                                        {stop}
                                                    </button>
                                                ))}
                                            </span>

                                            {[
                                                ['intensity', 'lit', 'intensity in candela'],
                                                ['distance', 'reach', 'metres the light carries'],
                                                ['decay', 'falloff', 'how fast it drops off with distance'],
                                                // `radius` is read only by a
                                                // glow. Offering it on a lamp
                                                // would imply a lamp has a
                                                // visible size, which is the
                                                // same lie as putting a scale
                                                // handle on one.
                                                ...(light.kind === 'glow'
                                                    ? [['radius', 'size', 'metres across the visible glow']]
                                                    : [])
                                            ].map(([key, short, description]) => (
                                                <span className="algo-vrithm-director-pair" key={key}>
                                                    {short}
                                                    <SecondsField
                                                        label={`${sequence.title} ${light.id} ${description}`}
                                                        value={light[key]}
                                                        onCommit={(next) => patch(key, next)}
                                                    />
                                                </span>
                                            ))}
                                        </div>
                                    )
                                })}
                            </Section>
                        </div>
                    </li>
                ))}
            </ul>

            {/* The bin. Whatever is in the assets folder, nothing else — there
                is no upload step because the folder IS the library. Adding
                drops the clip at the playhead, which is where you are looking. */}
            <div className="algo-vrithm-director-bin">
                <span className="algo-vrithm-director-tag">assets</span>
                {ASSET_LIBRARY.length === 0 ? (
                    <span className="algo-vrithm-director-note">
                        empty — drop images, video or .glb into {ASSET_FOLDER} and they appear here
                    </span>
                ) : (
                    ASSET_LIBRARY.map((asset) => (
                        <button
                            type="button"
                            key={asset.id}
                            className={`algo-vrithm-director-chip is-${asset.kind}`}
                            title={`Add ${asset.fileName} at ${formatTimecode(clock.playheadSec)}`}
                            onClick={() => onChange(
                                addAssetClip(sequences, asset, clock.playheadSec, AssetClip)
                            )}
                        >
                            ＋ {asset.title}
                            <em>{asset.kind}</em>
                        </button>
                    ))
                )}
            </div>

            <footer className="algo-vrithm-director-foot">
                {analysis.gaps.length > 0 && (
                    <span className="algo-vrithm-director-warn">
                        ⚠ dead frame{analysis.gaps.length > 1 ? 's' : ''}:{' '}
                        {analysis.gaps.map((gap) => `${gap.startSec}–${gap.endSec}s`).join(', ')}
                    </span>
                )}
                {analysis.cuts.length > 0 && (
                    <span className="algo-vrithm-director-note">
                        hard cut at {analysis.cuts.map((cut) => `${cut.atSec}s`).join(', ')} — overlap the
                        clips to cross-fade instead
                    </span>
                )}
                <button
                    type="button"
                    className="algo-vrithm-director-save"
                    onClick={handleSave}
                    disabled={saveState?.kind === 'saving'}
                >
                    {saveState?.kind === 'saving' ? 'saving…' : null}
                    {/* Which of the two places it landed in matters: the source
                        file travels with the repo, the space's overlay does not
                        leave this tier. Saying "saved ✓" for both would hide
                        the difference at exactly the moment it decides whether
                        the work survives a deploy. */}
                    {saveState?.kind === 'saved'
                        ? (saveState.changed
                            ? (saveState.where === 'space' ? 'saved to this space ✓' : 'saved ✓')
                            : 'no changes')
                        : null}
                    {!saveState || saveState.kind === 'error' ? 'Save' : null}
                </button>
                <button type="button" className="algo-vrithm-director-copy" onClick={handleCopy}>
                    {copied ? 'copied ✓' : 'Copy edit list'}
                </button>
                <span className="algo-vrithm-director-note">
                    {saveState?.kind === 'error'
                        ? saveState.reason
                        : saveState?.where === 'space'
                            ? 'Timing saved to this space — it plays here for everyone. It does not reach the repo: send it on with Copy when it should become the piece everywhere.'
                            : onSaveTiming
                                ? 'Save writes src/algoVrithm/sequences/index.js in place when the dev server is there, and this space\'s timing when it is not. Copy regenerates the array instead — use it for rows added here.'
                                : 'Save writes src/algoVrithm/sequences/index.js in place, comments intact. Copy regenerates the array instead — use it for rows added here.'}
                </span>
            </footer>

            {source && (
                <textarea
                    className="algo-vrithm-director-source"
                    readOnly
                    value={source}
                    onFocus={(event) => event.target.select()}
                />
            )}
        </section>
    )
}
