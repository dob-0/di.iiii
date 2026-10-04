// The settings column: the selected node's settings sit in a fixed column on
// the right of the canvas, and the canvas gives that width up (owner,
// 2026-10-05: "when you select a node the parameter panel comes from the right
// … uncomfortable"). Pure helpers, so the numbers are testable without a
// browser.

export const COLUMN_STORAGE_KEY = 'di.raw.settingsColumnWidth'
export const COLUMN_DEFAULT_WIDTH = 320
export const COLUMN_MIN_WIDTH = 260
export const COLUMN_MAX_WIDTH = 560
// Below this viewport width the column is a bottom sheet (the phone shape).
export const PHONE_MAX_WIDTH = 699

export const clampColumnWidth = (value, viewportWidth = Infinity) => {
    const number = Number(value)
    const wanted = Number.isFinite(number) ? number : COLUMN_DEFAULT_WIDTH
    // Never more than 45 % of the window, so the canvas always keeps the most of it.
    const ceiling = Math.max(COLUMN_MIN_WIDTH, Math.min(COLUMN_MAX_WIDTH, Math.floor(viewportWidth * 0.45)))
    return Math.round(Math.min(Math.max(wanted, COLUMN_MIN_WIDTH), ceiling))
}

export const isPhoneWidth = (viewportWidth) => viewportWidth <= PHONE_MAX_WIDTH

// What the canvas is left with when the column is open.
export const canvasWidthFor = (viewportWidth, columnWidth, open = true) =>
    (open && !isPhoneWidth(viewportWidth) ? viewportWidth - columnWidth : viewportWidth)

export const readColumnWidth = () => {
    try {
        const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY)
        return raw == null ? COLUMN_DEFAULT_WIDTH : clampColumnWidth(raw)
    } catch {
        return COLUMN_DEFAULT_WIDTH
    }
}

export const writeColumnWidth = (width) => {
    try {
        window.localStorage.setItem(COLUMN_STORAGE_KEY, String(width))
    } catch {
        // Storage blocked: the width simply is not remembered.
    }
}
