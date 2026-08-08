import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    analyseTimeline,
    canSplitClip,
    clipEnd,
    clipSpeed,
    formatFrames,
    MIN_CLIP_FRAMES,
    moveClip,
    removeClip,
    rippleFrom,
    setClipSpeed,
    sortByStart,
    splitClip,
    totalDuration,
    trimClip
} from '../../project/timeline/timelineCore.js'

// A clip is only ever as wide as its own duration, so an empty timeline still
// needs a scale to draw against — otherwise the first clip dropped in fills
// the whole lane and every later one shrinks it, which reads as the timeline
// jumping rather than the clip arriving.
const MIN_SPAN_FRAMES = 600

const laneSpan = (clips, fps) =>
    Math.max(MIN_SPAN_FRAMES, Math.ceil(totalDuration(clips) / fps) * fps)

const pct = (value, span) => `${(value / span) * 100}%`

export default function TimelinePanelWindow({ node, values = null, onChange = null }) {
    const resolved = values ? { ...node.values, ...values } : node.values || {}
    const fps = Number(resolved.fps) || 60
    const clips = useMemo(() => sortByStart(resolved.clips || []), [resolved.clips])

    const [selectedId, setSelectedId] = useState(null)
    const [playhead, setPlayhead] = useState(0)
    const [drag, setDrag] = useState(null)
    const laneRef = useRef(null)

    const span = laneSpan(clips, fps)
    const analysis = useMemo(() => analyseTimeline(clips), [clips])
    const selected = clips.find((clip) => clip.id === selectedId) || null
    const editable = typeof onChange === 'function'

    // A clip can be split, deleted or retimed out from under the selection —
    // holding a stale id would leave the toolbar acting on nothing.
    useEffect(() => {
        if (selectedId && !clips.some((clip) => clip.id === selectedId)) setSelectedId(null)
    }, [clips, selectedId])

    const frameAtPointer = useCallback((event) => {
        const lane = laneRef.current
        if (!lane) return 0
        const box = lane.getBoundingClientRect()
        const through = (event.clientX - box.left) / box.width
        return Math.round(Math.min(1, Math.max(0, through)) * span)
    }, [span])

    useEffect(() => {
        if (!drag) return undefined

        const move = (event) => {
            const frame = frameAtPointer(event)
            if (drag.mode === 'scrub') {
                setPlayhead(frame)
                return
            }
            if (!editable) return
            if (drag.mode === 'move') {
                onChange(moveClip(clips, drag.id, frame - drag.grip))
            } else {
                onChange(trimClip(clips, drag.id, drag.mode, frame))
            }
        }
        const up = () => setDrag(null)

        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [drag, clips, editable, onChange, frameAtPointer])

    const startDrag = (event, mode, clip) => {
        event.stopPropagation()
        event.preventDefault()
        if (clip) setSelectedId(clip.id)
        setDrag({
            mode,
            id: clip?.id ?? null,
            // Where inside the clip the pointer grabbed, so dragging the body
            // moves it rather than snapping its head to the cursor.
            grip: clip ? frameAtPointer(event) - clip.at : 0
        })
    }

    const apply = (next) => { if (editable) onChange(next) }

    const ticks = useMemo(() => {
        // One tick a second until that would crowd the ruler, then one every
        // five. Past a couple of minutes even that is noise, so it thins again.
        const seconds = Math.ceil(span / fps)
        const step = seconds <= 20 ? 1 : seconds <= 90 ? 5 : 30
        return Array.from({ length: Math.floor(seconds / step) + 1 }, (_, i) => i * step)
            // A label centred on the very last tick hangs off the right edge and
            // gets clipped to a half-number, which reads as a rendering fault.
            .filter((second) => second * fps <= span * 0.97)
    }, [span, fps])

    return (
        <div className="raw-timeline-panel">
            <header className="raw-timeline-bar">
                <span className="raw-timeline-title">{resolved.title || node.label || 'Timeline'}</span>
                <span className="raw-timeline-readout">{formatFrames(playhead, fps)}</span>
                <span className="raw-timeline-meta">
                    {clips.length} clips · {formatFrames(analysis.total, fps)} · {fps}fps
                </span>
            </header>

            <div className="raw-timeline-ruler">
                {ticks.map((second) => (
                    <span
                        key={second}
                        className="raw-timeline-tick"
                        style={{ left: pct(second * fps, span) }}
                    >
                        {second}s
                    </span>
                ))}
            </div>

            <div
                className="raw-timeline-lane"
                ref={laneRef}
                onPointerDown={(event) => {
                    setSelectedId(null)
                    setPlayhead(frameAtPointer(event))
                    startDrag(event, 'scrub', null)
                }}
            >
                {analysis.gaps.map((gap) => (
                    <div
                        key={`gap-${gap.at}`}
                        className="raw-timeline-gap"
                        title={`gap — nothing on screen for ${((gap.until - gap.at) / fps).toFixed(2)}s`}
                        style={{ left: pct(gap.at, span), width: pct(gap.until - gap.at, span) }}
                    />
                ))}

                {clips.map((clip) => {
                    const speed = clipSpeed(clip)
                    const isSelected = clip.id === selectedId
                    return (
                        <div
                            key={clip.id}
                            className={`raw-timeline-clip${isSelected ? ' raw-timeline-clip--selected' : ''}`}
                            style={{ left: pct(clip.at, span), width: pct(clip.dur, span) }}
                            onPointerDown={(event) => startDrag(event, 'move', clip)}
                        >
                            <span
                                className="raw-timeline-handle raw-timeline-handle--start"
                                onPointerDown={(event) => startDrag(event, 'start', clip)}
                            />
                            <span className="raw-timeline-clip-label">
                                {clip.label || clip.source || clip.id}
                                {speed !== 1 ? ` ·${speed.toFixed(2)}x` : ''}
                            </span>
                            <span
                                className="raw-timeline-handle raw-timeline-handle--end"
                                onPointerDown={(event) => startDrag(event, 'end', clip)}
                            />
                        </div>
                    )
                })}

                {analysis.overlaps.map((overlap) => (
                    <div
                        key={`ovl-${overlap.at}`}
                        className="raw-timeline-overlap"
                        title={`cross-fade — ${((overlap.until - overlap.at) / fps).toFixed(2)}s`}
                        style={{ left: pct(overlap.at, span), width: pct(overlap.until - overlap.at, span) }}
                    />
                ))}

                <div className="raw-timeline-playhead" style={{ left: pct(playhead, span) }} />
            </div>

            <footer className="raw-timeline-tools">
                <button
                    type="button"
                    className="raw-timeline-tool"
                    disabled={!editable || !selected || !canSplitClip(clips, selectedId, playhead)}
                    onClick={() => apply(splitClip(clips, selectedId, playhead))}
                >razor</button>
                <button
                    type="button"
                    className="raw-timeline-tool"
                    disabled={!editable || !selected}
                    onClick={() => apply(rippleFrom(clips, selectedId, fps))}
                >ripple +1s</button>
                <button
                    type="button"
                    className="raw-timeline-tool"
                    disabled={!editable || !selected}
                    onClick={() => apply(rippleFrom(clips, selectedId, -fps))}
                >ripple −1s</button>
                <label className="raw-timeline-speed">
                    speed
                    <input
                        type="range"
                        min="0.1"
                        max="4"
                        step="0.1"
                        disabled={!editable || !selected}
                        value={selected ? clipSpeed(selected) : 1}
                        onChange={(event) => apply(setClipSpeed(clips, selectedId, Number(event.target.value)))}
                    />
                    <span className="raw-timeline-speed-value">
                        {selected ? `${clipSpeed(selected).toFixed(2)}x` : '—'}
                    </span>
                </label>
                <button
                    type="button"
                    className="raw-timeline-tool raw-timeline-tool--danger"
                    disabled={!editable || !selected}
                    onClick={() => apply(removeClip(clips, selectedId))}
                >delete</button>
                <span className="raw-timeline-status">
                    {analysis.gaps.length ? `${analysis.gaps.length} gap${analysis.gaps.length > 1 ? 's' : ''}` : 'no gaps'}
                    {' · '}
                    {analysis.overlaps.length} cross-fade{analysis.overlaps.length === 1 ? '' : 's'}
                    {' · '}
                    {analysis.cuts.length} hard cut{analysis.cuts.length === 1 ? '' : 's'}
                    {selected ? ` · ${selected.id} ${formatFrames(selected.dur, fps)}` : ''}
                </span>
            </footer>
        </div>
    )
}

export { MIN_CLIP_FRAMES, clipEnd }
