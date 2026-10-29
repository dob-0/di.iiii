// The settings of the standard move (freeMove.js) as a person meets them, in the two places they are set: the Studio's Scene
// window (components/MoveSettings.jsx) and the public viewer's Move control (project/components/MoveControl.jsx). One hook and
// one set of words, so both read and write the same per-device preference (preference.js) and say the same thing.
// Owner, 2026-10-13: "one standard model where it will be easy to navigate ... settable in settings that you can set how you want".
import { useEffect, useState } from 'react'
import { MAX_SPEED, MIN_SPEED } from './freeMove.js'
import { useNavigationPreference } from './preference.js'
import { STANDARD_MOVE_SPEED_EVENT, getStandardMoveReading } from './useCameraNavigation.js'
import { formatNumberDisplay } from '../utils/formatNumberDisplay.js'

export const TURN_LABELS = Object.freeze({ point: 'Around a point ahead', place: 'Where you stand' })
export const MOVE_LABEL = 'Move'
export const SPEED_LABEL = 'Speed (metres a step)'
// Shown as a hint, never as a setting: Shift x5 and Alt /5 are fixed (freeMove.js SPEED_FACTOR).
// The keys are joined with no-break spaces so a line never ends inside them.
export const MOVE_HINT = 'Wheel: forward and back. Shift faster, Alt slower. Hold the right button and press W\u00a0A\u00a0S\u00a0D\u00a0Q\u00a0E to fly.'
// The Help panel's words for the default move.
export const MOVE_HELP_NOTE = 'Move 1 (default): the same speed in every direction, the speed set from the size of the place.'
// The words of the View | Edit switch (ViewEditSwitch.jsx), shown above Move 1's.
export const VIEW_EDIT_HELP_NOTE = 'View | Edit, at the top of the Studio (E switches). View: every pull turns the view, nothing moves by accident. Edit, with Pull to move (the default): pull the selected thing to slide it along the floor; pull anywhere else, hold Alt or use the middle button to move the view; the arrows still give exact moves. Edit, with Like Blender (Scene, Move, Mouse in Edit): the mouse works exactly like Blender, as in the second table. Adding something from Create switches to Edit. Locked things and the walls and floor of a place never move.'

// What typed text means as a speed: metres in range, or null when it is not a usable number (the setting then stays as it is). Pure.
export function parseSpeedText(text) {
    const s = String(text ?? '').trim().replace(',', '.')
    if (s === '') return null
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.min(Math.max(n, MIN_SPEED), MAX_SPEED)
}

// The metres of a speed, said short: "2.5", "0.925", "12.3", "1235" (three figures, whole metres from 100 up). '' when there is
// no speed to say. Pure.
export function metresText(metres) {
    const n = Number(metres)
    if (!Number.isFinite(n) || n <= 0) return ''
    return String(n >= 100 ? Math.round(n) : Number(n.toPrecision(3)))
}

// "2.5 m", or '' when there is no speed to say. Pure.
export function formatMetres(metres) {
    const text = metresText(metres)
    return text ? `${text} m` : ''
}

// The Auto button's words: "Auto · 2.5 m" once the space has a size, "Auto" before. Pure.
export function autoLabel(auto) {
    const metres = formatMetres(auto)
    return metres ? `Auto · ${metres}` : 'Auto'
}

// The page's last automatic speed (useCameraNavigation.js announces it on every first move of a visit).
export function useStandardMoveReading() {
    const [reading, setReading] = useState(getStandardMoveReading)
    useEffect(() => {
        const onReading = (event) => setReading(event?.detail ?? getStandardMoveReading())
        window.addEventListener(STANDARD_MOVE_SPEED_EVENT, onReading)
        // A move may have been made between the first render and now.
        onReading()
        return () => window.removeEventListener(STANDARD_MOVE_SPEED_EVENT, onReading)
    }, [])
    return reading
}

// The preference plus the automatic reading: { speed, turn, move, setSpeed, setTurn, setMove, isAuto, auto }.
export function useMoveSettings() {
    const { speed, turn, move, editMouse, flyKeys, setSpeed, setTurn, setMove, setEditMouse, setFlyKeys } = useNavigationPreference()
    const { auto } = useStandardMoveReading()
    return { speed, turn, move, editMouse, flyKeys, setSpeed, setTurn, setMove, setEditMouse, setFlyKeys, isAuto: speed === 'auto', auto }
}

// The speed field: empty is Auto, a number is that many metres. Typing writes at once (the house number fields do the same);
// what is typed stays on screen while the field has focus, and on leaving it shows what is stored. Not a number: nothing changes.
export function useSpeedField({ speed, setSpeed }) {
    const [draft, setDraft] = useState(null)
    const stored = speed === 'auto' ? '' : formatNumberDisplay(speed)
    return {
        value: draft ?? stored,
        onChange: (event) => {
            const text = event.target.value
            // A number field reports '' for half-typed text ("1e"), too: that is not an empty field.
            if (text === '' && event.target.validity?.badInput) { setDraft(text); return }
            setDraft(text)
            if (text.trim() === '') { setSpeed('auto'); return }
            const metres = parseSpeedText(text)
            if (metres != null) setSpeed(metres)
        },
        onBlur: () => setDraft(null),
        // The Auto button: the field goes empty with it.
        reset: () => { setDraft(null); setSpeed('auto') },
    }
}
