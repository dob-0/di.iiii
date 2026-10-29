// The Move block of the Scene window: how fast and how the view moves (the standard move, navigation/freeMove.js). Kept per
// device, like the rest of the view settings a person makes for himself; the viewer's own Move control writes the same two.
// Speed: empty is Auto (the space's size, shown as "Auto · 2.5 m"), a number is metres a wheel step. Turn: around a point
// ahead, or where you stand. Shift and Alt only scale the wheel, so they are a hint, not a setting.
import { MOVE_HINT, MOVE_LABEL, SPEED_LABEL, TURN_LABELS, autoLabel, metresText, useMoveSettings, useSpeedField } from '../navigation/useMoveSettings.js'
import { TURN_MODES } from '../navigation/freeMove.js'
import { MOVES, moveFor } from '../navigation/moves.js'
import { EDIT_MOUSES, EDIT_MOUSE_LABEL, normalizeEditMouse } from '../navigation/editMouse.js'

// `moves` is the list of named moves (moves.js); a test passes a second one. With one move: a heading line, no picker.
export default function MoveSettings({ moves = MOVES }) {
    const { speed, turn, move, editMouse, setSpeed, setTurn, setMove, setEditMouse, isAuto, auto } = useMoveSettings()
    const field = useSpeedField({ speed, setSpeed })
    const current = moveFor(move, moves)
    const mouse = EDIT_MOUSES.find((m) => m.id === normalizeEditMouse(editMouse))
    return (
        <>
            <div className="insp-field" data-testid="move-row">
                {moves.length < 2 ? (
                    <div className="insp-label"><strong>{current.label}</strong>{' \u00b7 '}{current.about}</div>
                ) : (
                    <>
                        <span className="insp-label">{MOVE_LABEL}</span>
                        <div className="scc-buttons" role="group" aria-label={MOVE_LABEL}>
                            {moves.map((m) => (
                                <button key={m.id} type="button" className={`scc-btn${current.id === m.id ? ' active' : ''}`} aria-pressed={current.id === m.id} onClick={() => setMove(m.id)}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                        <div className="insp-label">{current.about}</div>
                    </>
                )}
            </div>
            {/* The mouse in Edit (navigation/editMouse.js): Pull to move (default) or Like Blender (2026-10-12's map, kept as a
                mode). View is always Move 1. */}
            <div className="insp-field move-edit-mouse" data-testid="edit-mouse-row">
                <span className="insp-label">{EDIT_MOUSE_LABEL}</span>
                <div className="scc-buttons" role="group" aria-label={EDIT_MOUSE_LABEL}>
                    {EDIT_MOUSES.map((m) => (
                        <button key={m.id} type="button" className={`scc-btn${mouse.id === m.id ? ' active' : ''}`} aria-pressed={mouse.id === m.id} onClick={() => setEditMouse(m.id)}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <div className="insp-label">{mouse.about}</div>
            </div>
            <div className="insp-field">
                <label className="insp-label" htmlFor="studio-move-speed">{SPEED_LABEL}</label>
                <div className="scc-buttons">
                    <input
                        id="studio-move-speed"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        className="insp-input"
                        style={{ flex: 1, minWidth: 0 }}
                        placeholder={metresText(auto) || 'metres'}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                    />
                    <button
                        type="button"
                        className={`scc-btn${isAuto ? ' active' : ''}`}
                        aria-pressed={isAuto}
                        title="Set from the size of the space"
                        onClick={field.reset}
                    >
                        {autoLabel(auto)}
                    </button>
                </div>
            </div>
            <div className="insp-field">
                <label className="insp-label" htmlFor="studio-move-turn">Turn</label>
                <select id="studio-move-turn" className="insp-select" value={turn} onChange={(event) => setTurn(event.target.value)}>
                    {TURN_MODES.map((mode) => <option key={mode} value={mode}>{TURN_LABELS[mode]}</option>)}
                </select>
            </div>
            <div className="insp-label">{MOVE_HINT}</div>
        </>
    )
}
