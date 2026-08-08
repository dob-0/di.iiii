import { useCallback, useEffect, useState } from 'react'
import { isTypingInto } from '../../algoVrithm/useAutoHideChrome.js'

// One key hides or reveals every piece of authoring furniture at once.
//
// WHY CLOSED IS THE DEFAULT.
//
// The director panel covers the bottom ~45% of the window, and the flag that
// mounts it is on for the whole dev server — so the piece could never be SEEN
// while it was being made, only inspected around the edges. That is backwards
// for a work whose whole subject is being inside something.
//
// Closed is therefore the resting state and H is the way back in. It also
// solves the phone case for free, without sniffing at hardware: a phone has no
// keyboard, so it can never open the panel, and what is left on screen is
// exactly Enter AR and Full screen. No user-agent test, no viewport guess — the
// absence of a keyboard IS the device check, and it cannot be wrong about a
// tablet with a case keyboard or a headset with a paired one.
//
// H rather than a corner button: a visible "open the panel" control is itself
// chrome, and it would sit in shot at an exhibition. A key is invisible until
// used, and an audience never presses it.

export const PANEL_TOGGLE_KEY = 'h'

/**
 * Whether a keydown should toggle the panels.
 *
 * Pure so the guards are testable without a DOM. Modifiers are excluded because
 * Ctrl/Cmd-H is the browser's own (hide window on macOS, history on Windows) —
 * stealing it would be both rude and useless, since the browser gets there
 * first.
 */
export const shouldTogglePanels = (event) => {
    if (!event) return false
    if (event.key !== PANEL_TOGGLE_KEY && event.key !== PANEL_TOGGLE_KEY.toUpperCase()) return false
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    // Typing a sequence title or a duration into the panel must not close the
    // panel out from under the cursor — the same trap the `f` shortcut has.
    if (isTypingInto(event.target)) return false
    return true
}

/**
 * @param enabled      false for the audience build, where there is nothing to
 *                     toggle and the listener should not exist at all
 * @param initialOpen  true where the panel IS the page. Closed-by-default is
 *                     right when the piece is the thing on screen and the panel
 *                     is furniture you summon; it is wrong on a route called
 *                     "director", where arriving to an apparently ordinary
 *                     playback and a hint about a keyboard shortcut is just a
 *                     door that looks like a wall.
 */
export const usePanelToggle = ({ enabled = true, initialOpen = false } = {}) => {
    const [open, setOpen] = useState(initialOpen)

    const toggle = useCallback(() => setOpen((previous) => !previous), [])

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return undefined

        const onKey = (event) => {
            if (!shouldTogglePanels(event)) return
            event.preventDefault()
            toggle()
        }

        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enabled, toggle])

    // Never report open when there is nothing to open. Without this a stale
    // `true` would survive the flag being turned off and show an audience the
    // panel.
    return { open: enabled && open, toggle }
}

export default usePanelToggle
