// VIEW | EDIT, the Studio's one switch for what a pull does (owner 2026-10-28: "it can be the edit mode and view mode").
//   View  every pull turns the view; nothing can move by accident (Move 1, the Studio's Navigate tool).
//   Edit  a pull that starts on the selected thing slides it along the floor (navigation/pullToMove.js); a pull anywhere
//         else, Alt+pull and the middle button still move the view as in Move 1; the arrows stay for exact moves.
// It is the same state as the Tools window's Navigate / Edit and the E key (StudioShell viewportEditMode), not a second model.
import '../styles/view-edit-switch.css'

export const VIEW_EDIT_MODES = Object.freeze([
    Object.freeze({ id: 'navigate', label: 'View', title: 'View: every pull turns the view, nothing moves by accident' }),
    Object.freeze({ id: 'edit', label: 'Edit', title: 'Edit: pull the selected thing to move it; pull anywhere else to turn the view' }),
])

export default function ViewEditSwitch({ mode = 'navigate', onChange, className = '' }) {
    const current = mode === 'edit' ? 'edit' : 'navigate'
    return (
        <div className={`ves${className ? ` ${className}` : ''}`} role="radiogroup" aria-label="View or Edit">
            {VIEW_EDIT_MODES.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={current === m.id}
                    className={`ves-btn${current === m.id ? ' is-on' : ''}`}
                    title={m.title}
                    onClick={() => { if (current !== m.id) onChange?.(m.id) }}
                >
                    {m.label}
                </button>
            ))}
        </div>
    )
}
