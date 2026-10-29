// The Studio's keyboard choices, kept in this browser (WCAG 2.1.4 Character Key Shortcuts, level A:
// a single-character shortcut must be able to be turned off). Two choices, both on the Help > Shortcuts page:
//   letters    true  = G R S X Y Z T H E A L F B ? and "." act on a bare key press (the default; Blender's habit)
//              false = those keys do nothing; every shortcut with Ctrl / Cmd / Alt still works
//   blenderTab false  = Tab walks the focus through the buttons and windows (the browser's own way; the default)
//              true   = Tab flips Navigate / Edit as it does in Blender (opt-in for people who rely on it)
// Walking and flying keep their own keys (useWalkNavigation.js): they are modal and are not touched here.
import { useEffect, useState } from 'react'

export const KEY_PREFS_STORAGE = 'di.studio.keys'
export const KEY_PREFS_EVENT = 'studio:keys-change'
export const DEFAULT_KEY_PREFS = Object.freeze({ letters: true, blenderTab: false })

export function readKeyPrefs() {
    try {
        const raw = window.localStorage.getItem(KEY_PREFS_STORAGE)
        const parsed = raw ? JSON.parse(raw) : null
        return {
            letters: parsed && parsed.letters === false ? false : true,
            blenderTab: Boolean(parsed && parsed.blenderTab === true),
        }
    } catch {
        return { ...DEFAULT_KEY_PREFS }
    }
}

export function writeKeyPrefs(patch) {
    const next = { ...readKeyPrefs(), ...patch }
    try { window.localStorage.setItem(KEY_PREFS_STORAGE, JSON.stringify(next)) } catch { /* private window: lives until reload */ }
    try { window.dispatchEvent(new CustomEvent(KEY_PREFS_EVENT, { detail: next })) } catch { /* no window */ }
    return next
}

/** A shortcut made of one character (a letter, "?", "."): Shift counts, Ctrl / Cmd / Alt make it another kind of shortcut.
 *  The number keys (top row and numpad: cues 1-9, the numpad and Shift+1/3/7 views) are not: the help says they stay. */
export function isLetterShortcut(event) {
    if (!event || event.ctrlKey || event.metaKey || event.altKey) return false
    if (/^(Digit|Numpad)/.test(String(event.code ?? ''))) return false
    const key = String(event.key ?? '')
    if (/^[0-9]$/.test(key)) return false
    return key.length === 1 && key.trim() !== ''
}

/** True when this key press must be ignored because the person switched letter keys off. */
export function letterKeyIsOff(event, prefs = readKeyPrefs()) {
    return prefs.letters === false && isLetterShortcut(event)
}

/** True when Tab should flip Navigate / Edit (the Blender opt-in); otherwise Tab belongs to the browser's focus. */
export function tabFlipsMode(event, prefs = readKeyPrefs()) {
    return prefs.blenderTab === true && event?.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey
}

export function useKeyPrefs() {
    const [prefs, setPrefs] = useState(readKeyPrefs)
    useEffect(() => {
        const sync = () => setPrefs(readKeyPrefs())
        window.addEventListener(KEY_PREFS_EVENT, sync)
        return () => window.removeEventListener(KEY_PREFS_EVENT, sync)
    }, [])
    return prefs
}
