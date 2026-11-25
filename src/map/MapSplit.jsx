import { useCallback, useRef, useState } from 'react'

// THE DESK'S DIVIDERS — one desk, sized by dragging the borders between its
// parts (2026-11-10). Emily tried the desk as floating windows and said no:
// "all they be in one ecosystem, not that much separate movable". So the
// parts stay docked together, as in Resolume's composition window, and the
// lines between them move: monitors | work, Output over Preview, clips over
// effects. Double-click a line to put it back. Kept per browser.

const SPLIT_KEY = 'di.map.desk.split.v1'

export const SPLIT_DEFAULTS = { left: 42, monitors: 55, work: 45 }
const SPLIT_RANGE = { left: [22, 72], monitors: [18, 82], work: [18, 82] }

const clampSplit = (key, value) => {
    const [min, max] = SPLIT_RANGE[key]
    const number = Number(value)
    return Number.isFinite(number) ? Math.round(Math.min(max, Math.max(min, number)) * 10) / 10 : SPLIT_DEFAULTS[key]
}

const readSplits = () => {
    let stored = null
    try { stored = JSON.parse(window.localStorage.getItem(SPLIT_KEY) || 'null') } catch { stored = null }
    const out = { ...SPLIT_DEFAULTS }
    Object.keys(SPLIT_DEFAULTS).forEach((key) => { if (stored && stored[key] !== undefined) out[key] = clampSplit(key, stored[key]) })
    return out
}

export function useDeskSplits() {
    const [splits, setSplits] = useState(readSplits)
    const set = useCallback((key, value) => setSplits((current) => {
        const next = { ...current, [key]: value === null ? SPLIT_DEFAULTS[key] : clampSplit(key, value) }
        try { window.localStorage.setItem(SPLIT_KEY, JSON.stringify(next)) } catch { /* private window: kept for this visit */ }
        return next
    }), [])
    // Each docked part carries its own variable, set by React; a drag writes
    // over it on the element and React writes the kept value on release.
    const styles = {
        room: { '--map-split-left': `${splits.left}%` },
        monitors: { '--map-split-monitors': `${splits.monitors}%` },
        work: { '--map-split-work': `${splits.work}%` }
    }
    return { splits, set, styles }
}

/**
 * A draggable line between two docked parts.
 *   axis     'x' moves left/right (a column line), 'y' up/down (a row line)
 *   name     which split it sets; cssVar the variable the parent's grid reads
 * While dragging, the parent's variable is written straight onto it (no
 * re-render of the whole desk per pointer move); the value is kept on release.
 */
export function MapSplit({ axis, name, cssVar, value, onChange, label }) {
    const dragRef = useRef(null)
    const percentAt = (event, parent) => {
        const rect = parent.getBoundingClientRect()
        return axis === 'x'
            ? ((event.clientX - rect.left) / rect.width) * 100
            : ((event.clientY - rect.top) / rect.height) * 100
    }
    // A separator with a value is a focusable, operable widget (the WAI-ARIA
    // window splitter); the a11y lint does not know that role takes focus.
    /* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
    return (
        <div
            className={`map-split map-split-${axis}`}
            role="separator"
            aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
            aria-label={label}
            aria-valuenow={Math.round(value)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            title={`${label} — drag to resize, double-click to reset`}
            onPointerDown={(event) => {
                if (event.button !== 0) return
                const parent = event.currentTarget.parentElement
                if (!parent) return
                event.preventDefault()
                event.currentTarget.setPointerCapture?.(event.pointerId)
                dragRef.current = { parent, start: value, last: value }
                event.currentTarget.classList.add('is-dragging')
            }}
            onPointerMove={(event) => {
                const drag = dragRef.current
                if (!drag) return
                const next = clampSplit(name, percentAt(event, drag.parent))
                drag.last = next
                drag.parent.style.setProperty(cssVar, `${next}%`)
            }}
            onPointerUp={(event) => {
                const drag = dragRef.current
                if (!drag) return
                dragRef.current = null
                event.currentTarget.classList.remove('is-dragging')
                onChange(drag.last)
            }}
            onPointerCancel={(event) => {
                const drag = dragRef.current
                dragRef.current = null
                event.currentTarget.classList.remove('is-dragging')
                drag?.parent.style.setProperty(cssVar, `${drag.start}%`)
            }}
            onDoubleClick={() => onChange(null)}
            onKeyDown={(event) => {
                const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
                const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
                if (event.key !== back && event.key !== forward) return
                event.preventDefault()
                onChange(value + ((event.key === forward ? 1 : -1) * (event.shiftKey ? 5 : 1)))
            }}
        />
    )
    /* eslint-enable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */
}
