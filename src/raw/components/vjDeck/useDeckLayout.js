import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
    LAYOUT_VAR_NAMES,
    applySeam,
    clearSeam,
    hasLayout,
    layoutVars,
    readLayout,
    resolveLayout,
    seamLimits,
    seamsShown,
    writeLayout
} from './deckLayout.js'

// The deck's panel sizes for THIS viewer (deckLayout.js has the rules; DeckSeam.jsx the border).
//
// - Stored fractions live in React state and in localStorage 'di.vjDeck.layout'. Nothing here calls
//   write(), applyLocalOps or any project-document op: this is the device's choice.
// - Unset means today's CSS: no variable and no inline style is written for it.
// - A drag writes CSS variables on the deck root from requestAnimationFrame (preview) and commits once
//   on pointerup. A key commits at once and stores after 250 ms.
// - The stored value is clamped to the CURRENT deck box on every size change and is never rewritten
//   by the clamp (a bigger window gets the wish back).
const SAVE_MS = 250
const px = (value) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0)

const measureBox = (root) => {
    if (!root) return null
    const style = window.getComputedStyle(root)
    const width = root.clientWidth - px(style.paddingLeft) - px(style.paddingRight)
    const height = root.clientHeight - px(style.paddingTop) - px(style.paddingBottom)
    const top = root.querySelector('.vj-deck-top')?.getBoundingClientRect().height || 0
    const bottom = root.querySelector('.vj-deck-bottom')
    const colGap = bottom ? px(window.getComputedStyle(bottom).columnGap) : null
    return { width: Math.round(width), height: Math.round(height), top: Math.round(top), gap: px(style.rowGap) || px(style.gap), colGap }
}

const measureSizes = (root) => {
    const width = (element) => element?.getBoundingClientRect().width || 0
    const bottom = root?.querySelector('.vj-deck-bottom')
    return {
        head: width(root?.querySelector('.vj-deck-columns-head')),
        monitorW: width(root?.querySelector('.vj-deck-monitors')),
        bottomH: bottom?.getBoundingClientRect().height || 0,
        a: width(bottom?.children[0]),
        b: width(bottom?.children[1])
    }
}

const sameBox = (x, y) => x === y || (x && y && x.width === y.width && x.height === y.height && x.top === y.top && x.gap === y.gap && x.colGap === y.colGap)

export default function useDeckLayout(rootRef) {
    const uid = useId().replace(/:/g, '')
    const [layout, setLayout] = useState(() => readLayout())
    const [box, setBox] = useState(null)
    const [sizes, setSizes] = useState({})
    const layoutRef = useRef(layout)
    const boxRef = useRef(box)
    const timer = useRef(0)
    const pending = useRef(null)

    useEffect(() => { layoutRef.current = layout }, [layout])
    useEffect(() => { boxRef.current = box }, [box])

    // The box and the measured sizes: now, and whenever the deck or its bottom row changes size.
    const sync = useCallback(() => {
        const root = rootRef.current
        const next = measureBox(root)
        if (!next) return
        boxRef.current = next
        setBox((prev) => (sameBox(prev, next) ? prev : next))
        const measured = measureSizes(root)
        setSizes((prev) => (['head', 'monitorW', 'bottomH', 'a', 'b'].every((key) => Math.round(prev[key] || 0) === Math.round(measured[key])) ? prev : measured))
    }, [rootRef])

    useLayoutEffect(() => {
        sync()
        const root = rootRef.current
        if (!root || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => sync())
        observer.observe(root)
        const bottom = root.querySelector('.vj-deck-bottom')
        if (bottom) observer.observe(bottom)
        return () => observer.disconnect()
    }, [rootRef, sync])

    // The variables: every change of the stored layout or of the box. Unset writes nothing.
    const paint = useCallback((nextLayout, nextBox) => {
        const root = rootRef.current
        if (!root) return
        const resolved = nextBox ? resolveLayout(nextLayout, nextBox) : {}
        const vars = layoutVars(resolved)
        LAYOUT_VAR_NAMES.forEach((name) => { if (!(name in vars)) root.style.removeProperty(name) })
        Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value))
        if (resolved.bottomH != null) root.setAttribute('data-bottom', 'fixed')
        else root.removeAttribute('data-bottom')
        if (resolved.cols) root.setAttribute('data-cols', 'fixed')
        else root.removeAttribute('data-cols')
        if (!root.getAttribute('style')) root.removeAttribute('style')
    }, [rootRef])

    useLayoutEffect(() => { paint(layout, box); sync() }, [layout, box, paint, sync])

    const flush = useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = 0 }
        if (pending.current) { writeLayout(window.localStorage, pending.current.layout); pending.current = null }
    }, [])
    useEffect(() => flush, [flush])

    const persist = useCallback((next, immediate) => {
        pending.current = { layout: next }
        if (timer.current) clearTimeout(timer.current)
        if (immediate) flush()
        else timer.current = setTimeout(flush, SAVE_MS)
    }, [flush])

    const nowOf = useCallback(() => {
        const live = measureSizes(rootRef.current)
        const stored = resolveLayout(layoutRef.current, boxRef.current || {})
        return {
            head: stored.head ?? live.head,
            monitorW: stored.monitorW ?? live.monitorW,
            bottomH: stored.bottomH ?? live.bottomH,
            a: stored.cols?.[0] ?? live.a,
            b: stored.cols?.[1] ?? live.b
        }
    }, [rootRef])

    const valueOf = (id, now) => ({ s1: now.head, s2: now.monitorW, s4: now.bottomH, s5: now.a, s6: now.b })[id]

    // One seam's numbers right now (px): used by a drag, a key and the aria values.
    const read = useCallback((id) => {
        const current = boxRef.current
        const now = nowOf()
        const limits = seamLimits(id, current, now)
        const value = Math.min(limits.max, Math.max(limits.min, valueOf(id, now) || limits.min))
        return { value, ...limits }
    }, [nowOf])

    const preview = useCallback((id, value) => {
        const next = applySeam(layoutRef.current, id, value, boxRef.current, nowOf())
        paint(next, boxRef.current)
    }, [nowOf, paint])

    const commit = useCallback((id, value, { immediate = false } = {}) => {
        const next = applySeam(layoutRef.current, id, value, boxRef.current, nowOf())
        layoutRef.current = next
        setLayout(next)
        persist(next, immediate)
    }, [nowOf, persist])

    const cancel = useCallback(() => paint(layoutRef.current, boxRef.current), [paint])

    const resetSeam = useCallback((id) => {
        const next = clearSeam(layoutRef.current, id)
        layoutRef.current = next
        setLayout(next)
        persist(next, true)
    }, [persist])

    const resetAll = useCallback(() => {
        layoutRef.current = {}
        setLayout({})
        persist({}, true)
    }, [persist])

    // The monitor presets win over a dragged width (decision D4).
    const clearMonitorW = useCallback(() => {
        if (layoutRef.current.monitorW == null) return
        resetSeam('s2')
    }, [resetSeam])

    const shown = seamsShown(box)
    const stateOf = (id) => {
        if (!box) return { value: 0, min: 0, max: 0, dim: 1 }
        const stored = resolveLayout(layout, box)
        const live = {
            head: stored.head ?? sizes.head,
            monitorW: stored.monitorW ?? sizes.monitorW,
            bottomH: stored.bottomH ?? sizes.bottomH,
            a: stored.cols?.[0] ?? sizes.a,
            b: stored.cols?.[1] ?? sizes.b
        }
        const limits = seamLimits(id, box, live)
        return { value: Math.min(limits.max, Math.max(limits.min, valueOf(id, live) || limits.min)), ...limits }
    }

    return {
        uid,
        layout,
        custom: hasLayout(layout),
        shown,
        stateOf,
        read,
        preview,
        commit,
        cancel,
        resetSeam,
        resetAll,
        clearMonitorW
    }
}
