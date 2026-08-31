import { useCallback, useEffect, useRef, useState } from 'react'

// THE CUE LIST.
//
// A wall that is being dragged during a showing is a wall being repaired in
// public. A cue is a named state of the show — which surfaces are up, how
// bright, showing what — that a number key fires.
//
// A cue holds NO GEOMETRY. Corners and masks are the wall, not the show; a cue
// that could move an alignment would let one keystroke undo an afternoon spent
// on a ladder. Capturing a cue captures what each surface is showing and how
// much of it, and nothing about where it is.
//
// Playback advances on each cue's own hold time. A hold of zero means "wait
// for a person" and playback stops there, which is what a stage manager's
// standby is: not an error, a decision.
export default function MapCueList({
    cues,
    surfaces,
    liveCueId,
    onFire,
    onCapture,
    onAdd,
    onUpdate,
    onDelete,
    onReorder
}) {
    const [playing, setPlaying] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const timerRef = useRef(null)

    const stop = useCallback(() => {
        setPlaying(false)
        clearTimeout(timerRef.current)
        timerRef.current = null
    }, [])

    // Playback lives here and NOT in the document. Two windows watching one
    // mapping must not each believe they are the one running the show — the
    // desk advances, and the wall follows the same way it follows a keypress.
    useEffect(() => {
        clearTimeout(timerRef.current)
        if (!playing || !cues.length) return undefined

        const index = cues.findIndex((cue) => cue.id === liveCueId)
        const current = index === -1 ? null : cues[index]
        if (!current || !(current.hold > 0)) {
            // Standby: hold 0 waits for a person.
            if (current) setPlaying(false)
            return undefined
        }
        const next = cues[(index + 1) % cues.length]
        timerRef.current = setTimeout(() => onFire?.(next), current.hold * 1000)
        return () => clearTimeout(timerRef.current)
    }, [playing, liveCueId, cues, onFire])

    useEffect(() => () => clearTimeout(timerRef.current), [])

    const move = (cueId, direction) => {
        const index = cues.findIndex((cue) => cue.id === cueId)
        const target = index + direction
        if (index === -1 || target < 0 || target >= cues.length) return
        const ids = cues.map((cue) => cue.id)
        ids.splice(target, 0, ids.splice(index, 1)[0])
        onReorder?.(ids)
    }

    return (
        <div className="map-section">
            <div className="map-panel-head">
                <h2>Cues</h2>
                <div className="map-row">
                    <button
                        type="button"
                        className={`map-mini${playing ? ' is-on' : ''}`}
                        onClick={() => (playing ? stop() : setPlaying(true))}
                        disabled={!cues.length}
                        title="Advance through the cues on their hold times"
                    >
                        {playing ? 'Stop' : 'Play'}
                    </button>
                    <button type="button" className="map-mini" onClick={() => onAdd?.()}>Add</button>
                </div>
            </div>

            {!cues.length ? (
                <p className="map-empty">
                    No cues. Set the wall the way you want it, add a cue, and it keeps that state under a number key.
                </p>
            ) : null}

            <ul className="map-cue-list">
                {cues.map((cue, index) => (
                    <li key={cue.id} className={`map-cue-row${cue.id === liveCueId ? ' is-live' : ''}`}>
                        <span className="map-cue-key">{cue.key || '·'}</span>
                        <button type="button" className="map-cue-fire" onClick={() => onFire?.(cue)}>
                            {cue.name || `Cue ${index + 1}`}
                        </button>
                        <span className="map-cue-hold">
                            {Object.keys(cue.surfaces).length} · {cue.hold ? `${cue.hold}s` : 'stand by'}
                        </span>
                        <button
                            type="button"
                            className={`map-mini${editingId === cue.id ? ' is-on' : ''}`}
                            onClick={() => setEditingId(editingId === cue.id ? null : cue.id)}
                        >
                            Edit
                        </button>
                    </li>
                ))}
            </ul>

            {editingId ? (
                <MapCueEditor
                    cue={cues.find((cue) => cue.id === editingId)}
                    surfaceCount={surfaces.length}
                    onUpdate={onUpdate}
                    onCapture={onCapture}
                    onDelete={(cueId) => { setEditingId(null); onDelete?.(cueId) }}
                    onMove={move}
                />
            ) : null}
        </div>
    )
}

function MapCueEditor({ cue, surfaceCount, onUpdate, onCapture, onDelete, onMove }) {
    if (!cue) return null
    return (
        <div className="map-section">
            <label className="map-field">
                <span>Cue name</span>
                <input type="text" value={cue.name} onChange={(event) => onUpdate?.(cue.id, { name: event.target.value })} />
            </label>
            <label className="map-field map-field-inline">
                <span>Key</span>
                <select value={cue.key} onChange={(event) => onUpdate?.(cue.id, { key: event.target.value })}>
                    <option value="">none</option>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
                        <option key={key} value={key}>{key}</option>
                    ))}
                </select>
            </label>
            <label className="map-field map-field-inline">
                <span>Fade</span>
                <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={cue.fade}
                    onChange={(event) => onUpdate?.(cue.id, { fade: Number(event.target.value) || 0 })}
                />
                <span>Hold</span>
                <input
                    type="number"
                    min="0"
                    step="1"
                    value={cue.hold}
                    onChange={(event) => onUpdate?.(cue.id, { hold: Number(event.target.value) || 0 })}
                />
            </label>
            <div className="map-row">
                <button
                    type="button"
                    className="map-mini"
                    onClick={() => onCapture?.(cue.id)}
                    title="Store what every surface is showing right now"
                >
                    Capture {surfaceCount}
                </button>
                <button type="button" className="map-mini" onClick={() => onMove?.(cue.id, -1)}>Up</button>
                <button type="button" className="map-mini" onClick={() => onMove?.(cue.id, 1)}>Down</button>
                <button type="button" className="map-mini is-danger" onClick={() => onDelete?.(cue.id)}>Delete</button>
            </div>
        </div>
    )
}
