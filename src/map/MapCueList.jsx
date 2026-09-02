import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLightScenes } from './lightingLink.js'

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

// The lighting desk's scene list, asked for when a cue editor opens and again
// whenever this window is focused: the desk is a SEPARATE tab, and the usual
// way to add a scene is to go there, make it, and come back. A picker that
// only ever asked once would be missing the scene you just saved.
function useLightScenes() {
    const [scenes, setScenes] = useState([])
    const [reachable, setReachable] = useState(true)

    useEffect(() => {
        let cancelled = false
        const load = () => {
            fetchLightScenes()
                .then((list) => { if (!cancelled) { setScenes(list); setReachable(true) } })
                // 404 from a hosted di.iiii and a refused connection are one
                // answer: there is no desk here. The cue's stored id is left
                // alone — an operator on a laptop without the rig must not
                // lose the light plot they wrote at the venue.
                .catch(() => { if (!cancelled) { setScenes([]); setReachable(false) } })
        }
        load()
        window.addEventListener('focus', load)
        return () => { cancelled = true; window.removeEventListener('focus', load) }
    }, [])

    return { scenes, reachable }
}

function MapCueEditor({ cue, surfaceCount, onUpdate, onCapture, onDelete, onMove }) {
    const { scenes, reachable } = useLightScenes()
    if (!cue) return null
    const lightScene = cue.lightScene || ''
    // A scene the desk no longer lists still gets an option of its own, or the
    // select would read as "— none —" and the next edit to the cue would make
    // that true.
    const orphan = Boolean(lightScene) && !scenes.some((scene) => scene.id === lightScene)
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
            <label className="map-field map-field-inline">
                <span>Light</span>
                {reachable ? (
                    <select
                        value={lightScene}
                        onChange={(event) => onUpdate?.(cue.id, { lightScene: event.target.value })}
                        title="Recall this scene on the lighting desk when the cue fires"
                    >
                        <option value="">— none —</option>
                        {orphan ? <option value={lightScene}>{lightScene} (not on the desk)</option> : null}
                        {scenes.map((scene) => (
                            <option key={scene.id} value={scene.id}>{scene.name || scene.id}</option>
                        ))}
                    </select>
                ) : (
                    <p className="map-empty">Lighting desk not reachable — it runs on a local di.iiii</p>
                )}
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
