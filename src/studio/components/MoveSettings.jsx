// The Move block of the Scene window: how fast and how the view moves (the standard move, navigation/freeMove.js). Kept per
// device, like the rest of the view settings a person makes for himself; the viewer's own Move control writes the same two.
// Speed: empty is Auto (the space's size, shown as "Auto · 2.5 m"), a number is metres a wheel step. Turn: around a point
// ahead, or where you stand. Shift and Alt only scale the wheel, so they are a hint, not a setting.
import { MOVE_HINT, SPEED_LABEL, TURN_LABELS, autoLabel, metresText, useMoveSettings, useSpeedField } from '../navigation/useMoveSettings.js'
import { TURN_MODES } from '../navigation/freeMove.js'

export default function MoveSettings() {
    const { speed, turn, setSpeed, setTurn, isAuto, auto } = useMoveSettings()
    const field = useSpeedField({ speed, setSpeed })
    return (
        <>
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
