import { useEffect, useState } from 'react'
import { JAM_PRIMITIVES } from '../entityPalette.js'

// The sheet that comes up from the bottom of the jam.
//
// Presentational only — it holds a text draft and nothing else, so every write
// decision stays in JamSurface where the ops are. Three faces: what you can
// add, what you added, and one object of yours.
//
// The edit face is JamEditPanel's content (StudioShellPanels.jsx) rehoused: the
// same two edits a first-timer actually wants — their words and their colour —
// plus Remove, plus the one thing a floating desktop window never needed and a
// person standing in a scene always does, which is to push the thing further
// away or pull it closer.

// A small set, not a colour picker. Six swatches you can hit with a thumb beat
// an eyedropper you cannot, and at an event nobody is matching a brand palette.
export const JAM_COLOURS = [
    '#ffffff',
    '#5fa8ff',
    '#4ade80',
    '#facc15',
    '#fb7185',
    '#c084fc'
]

function AddFace({ onAddShape, onPickFile, busy }) {
    return (
        <>
            <div className="jam-sheet-head">
                <span className="jam-sheet-title">What are you adding?</span>
            </div>
            <div className="jam-shapes">
                {JAM_PRIMITIVES.map(({ key, label, icon }) => (
                    <button
                        key={key}
                        type="button"
                        className="jam-shape"
                        onClick={() => onAddShape(key)}
                        disabled={busy}
                    >
                        <span className="jam-shape-icon" aria-hidden="true">{icon}</span>
                        <span>{label}</span>
                    </button>
                ))}
                <label className="jam-file">
                    <span className="jam-shape-icon" aria-hidden="true">▣</span>
                    <span>{busy ? 'sending…' : 'photo'}</span>
                    <input
                        type="file"
                        accept="image/*,video/*"
                        disabled={busy}
                        onChange={(event) => {
                            const file = event.target.files?.[0] || null
                            event.target.value = ''
                            if (file) onPickFile(file)
                        }}
                    />
                </label>
            </div>
            <p className="jam-note">It lands on the ground in front of you, where you are looking.</p>
        </>
    )
}

function EditFace({ object, onText, onColour, onNudge, onRemove }) {
    const [draft, setDraft] = useState(object?.components?.text?.value ?? '')
    const objectId = object?.id

    // Reseed when the sheet swings to a different object; not on every remote
    // change, or somebody else's edit would yank the words out from under a
    // person who is mid-sentence.
    useEffect(() => {
        setDraft(object?.components?.text?.value ?? '')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectId])

    if (!object) {
        return <p className="jam-note">That one is gone.</p>
    }

    const colour = object.components?.appearance?.color || '#ffffff'

    return (
        <>
            <div className="jam-sheet-head">
                <span className="jam-sheet-title">Yours to change</span>
            </div>

            {object.type === 'text' ? (
                <div className="jam-field">
                    <label className="jam-label" htmlFor={`jam-text-${object.id}`}>Your text</label>
                    <textarea
                        id={`jam-text-${object.id}`}
                        className="jam-input"
                        rows={2}
                        value={draft}
                        onChange={(event) => {
                            setDraft(event.target.value)
                            onText(event.target.value)
                        }}
                    />
                </div>
            ) : null}

            {object.components?.appearance ? (
                <div className="jam-field">
                    <span className="jam-label">Colour</span>
                    <div className="jam-colours">
                        {JAM_COLOURS.map((swatch) => (
                            <button
                                key={swatch}
                                type="button"
                                aria-label={swatch}
                                className={`jam-colour${swatch.toLowerCase() === colour.toLowerCase() ? ' is-on' : ''}`}
                                style={{ background: swatch }}
                                onClick={() => onColour(swatch)}
                            />
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="jam-field jam-row">
                <button type="button" className="jam-btn" onClick={() => onNudge(-1)}>Nearer</button>
                <button type="button" className="jam-btn" onClick={() => onNudge(1)}>Further</button>
            </div>

            <div className="jam-row">
                <button type="button" className="jam-btn is-danger" onClick={onRemove}>Remove</button>
            </div>
        </>
    )
}

function MineFace({ objects, onPick }) {
    if (!objects.length) {
        return (
            <>
                <div className="jam-sheet-head">
                    <span className="jam-sheet-title">Nothing of yours yet</span>
                </div>
                <p className="jam-note">
                    Add something and it turns up here, so you can find it again.
                </p>
            </>
        )
    }
    return (
        <>
            <div className="jam-sheet-head">
                <span className="jam-sheet-title">What you added</span>
            </div>
            <div className="jam-mine-list">
                {objects.map((object) => (
                    <button
                        key={object.id}
                        type="button"
                        className="jam-mine-item"
                        onClick={() => onPick(object.id)}
                    >
                        <span
                            className="jam-mine-swatch"
                            style={{ background: object.components?.appearance?.color || '#94a3b8' }}
                        />
                        <span>{object.components?.text?.value?.trim() || object.name || object.type}</span>
                    </button>
                ))}
            </div>
        </>
    )
}

export default function JamSheet({
    face,
    object = null,
    mineObjects = [],
    busy = false,
    onClose,
    onAddShape,
    onPickFile,
    onText,
    onColour,
    onNudge,
    onRemove,
    onPickMine
}) {
    return (
        <div className="jam-sheet" role="dialog" aria-label="Jam controls">
            <div className="jam-sheet-grip" aria-hidden="true" />
            <button type="button" className="jam-sheet-close" onClick={onClose} style={{ float: 'right' }}>
                Done
            </button>
            {face === 'add' ? (
                <AddFace onAddShape={onAddShape} onPickFile={onPickFile} busy={busy} />
            ) : null}
            {face === 'edit' ? (
                <EditFace
                    object={object}
                    onText={onText}
                    onColour={onColour}
                    onNudge={onNudge}
                    onRemove={onRemove}
                />
            ) : null}
            {face === 'mine' ? (
                <MineFace objects={mineObjects} onPick={onPickMine} />
            ) : null}
        </div>
    )
}
