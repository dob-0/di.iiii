// How the authoring window divides between the piece and the editor.
//
// The number is the EDITOR's share of the window height, not the stage's,
// because that is the number the CSS wants: `.algo-vrithm-stage` is anchored to
// the bottom and `.algo-vrithm-stagearea` stops short of it. One value, one
// meaning, used in both places.
//
// WHY THIS IS DRAGGABLE WHEN THE OLD 45% WAS DELIBERATELY FIXED.
//
// The fixed share exists for a good reason (see the note on
// .algo-vrithm-stagearea): a panel that sized itself to its own content would
// resize the stage every time a clip was added, moving the framing the author
// was in the middle of judging. That rule is about AUTOMATIC resizing and it
// still holds — nothing here sizes to content.
//
// A divider the author drags is the opposite case. The picture only ever
// changes size because they asked it to, and the two jobs genuinely want
// different splits: dragging a lamp into place in the outside view needs
// picture, trimming a clip needs timeline. Making them share one compromise
// height was the actual complaint.

export const SPLIT_STORAGE_KEY = 'di.studio.algoVrithmSplit'

// What the split was before it could be moved, so nothing jumps for an author
// who never touches the divider.
export const DEFAULT_SPLIT = 0.45

// Neither half may be dragged out of existence. The floor is about the least
// the editor can show and still be one (transport row plus one clip's
// controls); the ceiling leaves the stage a band that can still be framed in
// rather than a letterbox.
export const MIN_SPLIT = 0.2
export const MAX_SPLIT = 0.7

export const clampSplit = (fraction) => {
    // NaN survives Math.min/Math.max, so a bad parse would otherwise reach the
    // CSS as `NaN%` and collapse the layout rather than fail loudly.
    if (!Number.isFinite(fraction)) return DEFAULT_SPLIT
    return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, fraction))
}

/**
 * Editor share from a pointer position.
 *
 * The divider sits at the TOP of the editor, so everything below the pointer
 * belongs to the editor — hence the inversion. Pure, and taking the viewport
 * height as an argument rather than reading `window`, so the arithmetic that
 * decides whether a drag feels right is testable without a browser.
 */
export const splitFromPointer = (clientY, viewportHeight) => {
    if (!viewportHeight) return DEFAULT_SPLIT
    return clampSplit((viewportHeight - clientY) / viewportHeight)
}

/** For the CSS custom property. Percent because the halves are proportions. */
export const formatSplit = (fraction) => `${(clampSplit(fraction) * 100).toFixed(3)}%`

/**
 * Storage is passed in rather than reached for, both so this is testable and
 * because it must not touch `window` during a module import.
 *
 * Every access is guarded: Safari private mode and blocked third-party storage
 * THROW on getItem/setItem rather than returning null. A remembered panel
 * height is not worth taking the piece down for.
 */
export const readSplit = (storage) => {
    try {
        const raw = storage?.getItem(SPLIT_STORAGE_KEY)
        if (raw === null || raw === undefined) return DEFAULT_SPLIT
        return clampSplit(Number.parseFloat(raw))
    } catch {
        return DEFAULT_SPLIT
    }
}

export const writeSplit = (storage, fraction) => {
    try {
        storage?.setItem(SPLIT_STORAGE_KEY, String(clampSplit(fraction)))
    } catch {
        // Nothing to do and nothing worth reporting — see readSplit.
    }
}
