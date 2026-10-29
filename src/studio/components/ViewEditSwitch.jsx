// VIEW | EDIT, the Studio's one switch for what a pull does (owner 2026-10-28: "it can be the edit mode and view mode").
//   View  every pull turns the view; nothing can move by accident (Move 1, the Studio's Navigate tool).
//   Edit  a pull that starts on the selected thing slides it along the floor (navigation/pullToMove.js); a pull anywhere
//         else, Alt+pull and the middle button still move the view as in Move 1; the arrows stay for exact moves.
// It is the same state as the Tools window's Navigate / Edit and the E key (StudioShell viewportEditMode), not a second model.
import '../styles/view-edit-switch.css'
import { useNavigationPreference } from '../navigation/preference.js'
import { normalizeEditMouse } from '../navigation/editMouse.js'

export const VIEW_EDIT_MODES = Object.freeze([
    Object.freeze({ id: 'navigate', label: 'View', title: 'View: every pull turns the view, nothing moves by accident' }),
    Object.freeze({ id: 'edit', label: 'Edit', title: 'Edit: pull the selected thing to move it; pull anywhere else to turn the view' }),
])
// Edit's tip when the Edit mouse is Like Blender (editMouse.js).
export const EDIT_BLENDER_TITLE = 'Edit, like Blender: the left button picks; the middle button turns the view'

export default function ViewEditSwitch({ mode = 'navigate', onChange, className = '' }) {
    const current = mode === 'edit' ? 'edit' : 'navigate'
    const blender = normalizeEditMouse(useNavigationPreference().editMouse) === 'blender'
    // A radio group's keys (WAI-ARIA APG "Radio Group"): one Tab stop, the arrows pick the other side and move the focus to it.
    const onKeyDown = (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const next = current === 'edit' ? 'navigate' : 'edit'
        onChange?.(next)
        event.currentTarget.parentElement?.querySelector(`[data-mode="${next}"]`)?.focus()
    }
    return (
        <div className={`ves${className ? ` ${className}` : ''}`} role="radiogroup" aria-label="View or Edit">
            {VIEW_EDIT_MODES.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    role="radio"
                    data-mode={m.id}
                    onKeyDown={onKeyDown}
                    tabIndex={current === m.id ? 0 : -1}
                    aria-checked={current === m.id}
                    className={`ves-btn${current === m.id ? ' is-on' : ''}`}
                    title={m.id === 'edit' && blender ? EDIT_BLENDER_TITLE : m.title}
                    onClick={() => { if (current !== m.id) onChange?.(m.id) }}
                >
                    {m.label}
                </button>
            ))}
        </div>
    )
}
