import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cloneValue } from '../../../shared/projectSchema.js'
import { getTimelinePreview, getTimelinePreviewVersion, subscribeTimelinePreview, setTimelinePreview, stopTimelinePreview } from '../../utils/timelinePreview.js'
import { ToggleField, CollapsibleSection } from './fields.jsx'

const TIMELINE_KEY_EPSILON = 0.02
const TIMELINE_DEFAULTS = { duration: 5, loop: true, tracks: [] }

const timelineKeyTimes = (timeline) =>
    [...new Set((timeline?.tracks || []).flatMap((track) => (track.keys || []).map((key) => key.t)))].sort((a, b) => a - b)

// Photoshop-history's sibling: per-entity keyframe authoring. Record captures the
// current pose at the playhead; playback preview never writes ops — only key
// edits do, so every change stays a normal undo step.
export function TimelinePanel({ entity, onTimelineChange }) {
    useSyncExternalStore(subscribeTimelinePreview, getTimelinePreviewVersion)
    const preview = getTimelinePreview()
    const stripRef = useRef(null)
    const [dragKey, setDragKey] = useState(null)

    const timeline = entity.components?.timeline || null
    const duration = timeline?.duration ?? TIMELINE_DEFAULTS.duration
    const loop = timeline?.loop ?? TIMELINE_DEFAULTS.loop
    const keyTimes = timelineKeyTimes(timeline)
    const hasKeys = keyTimes.length > 0
    const isActive = preview.entityId === entity.id
    const playhead = isActive ? Math.min(preview.time, duration) : 0
    const keyAtPlayhead = keyTimes.some((t) => Math.abs(t - playhead) < TIMELINE_KEY_EPSILON)

    useEffect(() => () => stopTimelinePreview(), [entity.id])

    const base = () => (timeline ? cloneValue(timeline) : cloneValue(TIMELINE_DEFAULTS))

    const scrubTo = (time) => {
        setTimelinePreview({ entityId: entity.id, time, playing: false, hold: true, duration, loop })
    }

    const recordKey = () => {
        const t = Number(playhead.toFixed(2))
        const next = base()
        const transform = entity.components?.transform || {}
        const upsert = (property, value) => {
            let track = next.tracks.find((entry) => entry.property === property)
            if (!track) {
                track = { property, keys: [] }
                next.tracks.push(track)
            }
            const existing = track.keys.find((key) => Math.abs(key.t - t) < TIMELINE_KEY_EPSILON)
            if (existing) {
                existing.t = t
                existing.value = cloneValue(value)
            } else {
                track.keys.push({ t, value: cloneValue(value), easing: 'ease' })
            }
            track.keys.sort((a, b) => a.t - b.t)
        }
        upsert('position', transform.position || [0, 0, 0])
        upsert('rotation', transform.rotation || [0, 0, 0])
        upsert('scale', transform.scale || [1, 1, 1])
        if (typeof entity.components?.appearance?.opacity === 'number') {
            upsert('opacity', entity.components.appearance.opacity)
        }
        onTimelineChange?.(next)
        setTimelinePreview({ entityId: entity.id, time: t, duration: next.duration, loop: next.loop })
    }

    const retimeKey = (from, to) => {
        const clamped = Math.min(duration, Math.max(0, Number(to.toFixed(2))))
        const next = base()
        next.tracks.forEach((track) => {
            track.keys.forEach((key) => {
                if (Math.abs(key.t - from) < TIMELINE_KEY_EPSILON) key.t = clamped
            })
            track.keys.sort((a, b) => a.t - b.t)
        })
        onTimelineChange?.(next)
        scrubTo(clamped)
    }

    const deleteKeysAtPlayhead = () => {
        const next = base()
        next.tracks = next.tracks
            .map((track) => ({ ...track, keys: track.keys.filter((key) => Math.abs(key.t - playhead) >= TIMELINE_KEY_EPSILON) }))
            .filter((track) => track.keys.length)
        onTimelineChange?.(next)
        if (!next.tracks.length) stopTimelinePreview()
    }

    const play = () => {
        if (!hasKeys) return
        const startAt = !loop && playhead >= duration ? 0 : playhead
        setTimelinePreview({ entityId: entity.id, time: startAt, playing: true, hold: false, duration, loop })
    }
    const pause = () => setTimelinePreview({ playing: false, hold: true })

    const stripTimeAt = (clientX) => {
        const rect = stripRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0) return 0
        return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration))
    }

    return (
        <CollapsibleSection title="Timeline" defaultOpen={hasKeys}>
            <div className="tlp-controls">
                <button
                    className="scc-btn scc-btn--xs"
                    onClick={isActive && preview.playing ? pause : play}
                    disabled={!hasKeys}
                    title={isActive && preview.playing ? 'Pause preview' : 'Play the timeline in the viewport'}
                >
                    {isActive && preview.playing ? '❚❚' : '▶'}
                </button>
                <button
                    className="scc-btn scc-btn--xs"
                    onClick={stopTimelinePreview}
                    disabled={!isActive}
                    title="Stop preview and restore the authored pose"
                >
                    ■
                </button>
                <span className="tlp-time">{playhead.toFixed(2)}s / {duration}s</span>
            </div>
            <div className="insp-field">
                <input
                    type="range"
                    className="insp-slider"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={playhead}
                    onChange={(event) => scrubTo(Number(event.target.value))}
                    aria-label="Timeline playhead"
                    style={{ '--insp-slider-fill': `${(playhead / duration) * 100}%` }}
                />
            </div>
            {hasKeys && (
                <div className="tlp-strip" ref={stripRef}>
                    {keyTimes.map((t) => {
                        const shownAt = dragKey && Math.abs(dragKey.from - t) < TIMELINE_KEY_EPSILON ? dragKey.to : t
                        const active = Math.abs(t - playhead) < TIMELINE_KEY_EPSILON
                        return (
                            <button
                                key={t}
                                className={`tlp-key${active ? ' tlp-key--active' : ''}`}
                                style={{ left: `${(shownAt / duration) * 100}%` }}
                                title={`Key at ${t.toFixed(2)}s — click to jump, drag to retime`}
                                aria-label={`Key at ${t.toFixed(2)} seconds`}
                                onPointerDown={(event) => {
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                    setDragKey({ from: t, to: t })
                                }}
                                onPointerMove={(event) => {
                                    if (!dragKey || Math.abs(dragKey.from - t) >= TIMELINE_KEY_EPSILON) return
                                    setDragKey({ from: t, to: stripTimeAt(event.clientX) })
                                }}
                                onPointerUp={() => {
                                    if (!dragKey) return
                                    if (Math.abs(dragKey.to - dragKey.from) < TIMELINE_KEY_EPSILON) scrubTo(dragKey.from)
                                    else retimeKey(dragKey.from, dragKey.to)
                                    setDragKey(null)
                                }}
                            />
                        )
                    })}
                </div>
            )}
            <div className="scc-buttons">
                <button className="scc-btn scc-btn--xs" onClick={recordKey} title="Capture the current pose as a key at the playhead">
                    ● Key
                </button>
                <button className="scc-btn scc-btn--xs" onClick={deleteKeysAtPlayhead} disabled={!keyAtPlayhead} title="Delete the key at the playhead">
                    × Key
                </button>
            </div>
            <div className="insp-field">
                <label className="insp-label" htmlFor={`tlp-duration-${entity.id}`}>Duration (s)</label>
                <input
                    id={`tlp-duration-${entity.id}`}
                    type="number"
                    className="insp-input"
                    min={0.1}
                    step={0.5}
                    value={duration}
                    onChange={(event) => {
                        const next = base()
                        next.duration = Math.max(0.1, Number(event.target.value) || TIMELINE_DEFAULTS.duration)
                        onTimelineChange?.(next)
                        if (isActive) setTimelinePreview({ duration: next.duration })
                    }}
                />
            </div>
            <ToggleField
                label="Loop"
                checked={loop}
                onChange={(value) => {
                    const next = base()
                    next.loop = value
                    onTimelineChange?.(next)
                    if (isActive) setTimelinePreview({ loop: value })
                }}
            />
            {!hasKeys && (
                <p className="sfp-empty">Move the playhead, pose the object, press ● Key. Two keys make motion.</p>
            )}
        </CollapsibleSection>
    )
}
