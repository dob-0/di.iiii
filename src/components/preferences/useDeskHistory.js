// The admin desk and the browser's Back. Opening a window is one history entry that remembers the set of open
// windows; Back (laptop, phone gesture, Alt+Left) restores the set before it, the desk home when none; the
// address carries #<front window> so a reload or a shared link opens it again. Closing the front window with its own
// button removes its entry (no orphan). Built on src/hooks/useBackEntry.js (round 1).

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { depthOf, goBack, isTop, pushEntry, replaceEntry, subscribeBack } from '../../hooks/useBackEntry.js'

const ID = 'desk'
const norm = (keys) => [...new Set(keys)].sort()
const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i])
const read = () => { try { return window.history.state } catch { return null } }
const homeUrl = () => `${window.location.pathname}${window.location.search}`
let deepFull = false  // the page was opened at #monitor-full: its first entry keeps that hash so the Monitor mounts in full screen
const urlFor = (front) => {
    if (!front) return homeUrl()
    if (front === 'monitor' && deepFull) { deepFull = false; return `${homeUrl()}#monitor-full` }
    return `${homeUrl()}#${front}`
}

// openKeys: the windows open now; front: the one on top (or null); apply(keys): make the desk show exactly these.
export default function useDeskHistory({ openKeys, front, apply }) {
    const sig = norm(openKeys)
    const sigKey = sig.join(',')
    const stack = useRef(new Map())   // depth -> set of open windows at that entry (depth 0 = the page as it was reached)
    const top = useRef({ depth: 0, seq: null })
    const last = useRef(null)         // the set the history already describes
    const lastFront = useRef(null)
    const applying = useRef(null)     // a set a Back asked for, waiting for the layout to catch up
    const stale = useRef(null)        // the entry under us must be rewritten to this set when Back reaches it
    const deepLink = useRef(false)    // the first push replaces the linked entry with the desk home first
    const applyRef = useRef(apply)
    useEffect(() => { applyRef.current = apply })

    // a link with #<window> on load: the desk home sits under it, so Back never leaves the site
    const prepareDeepLink = useCallback(() => {
        const s = read()
        if (s?.diBack || depthOf(s) > 0) return
        deepFull = window.location.hash === '#monitor-full'
        deepLink.current = true
    }, [])

    useEffect(() => subscribeBack((state, depth) => {
        if (state?.diBack && state.diBack !== ID) return          // a view on top of the desk (Monitor) handles its own
        const target = state?.diBack === ID && Array.isArray(state.open) ? norm(state.open) : (stack.current.get(0) || [])
        if (state?.diBack === ID) { top.current = { depth, seq: state.diSeq } } else top.current = { depth: 0, seq: null }
        stack.current.set(depth, target)
        if (stale.current && state?.diBack === ID) {
            const now = stale.current
            stale.current = null
            last.current = now
            replaceEntry(ID, { open: now }, urlFor(lastFront.current))
            stack.current.set(depth, now)
            return
        }
        if (same(target, last.current || [])) return
        applying.current = target
        last.current = target
        applyRef.current(target)
    }), [])

    useEffect(() => {
        if (last.current === null) {              // first run: the desk as it was reached is depth 0
            last.current = sig
            lastFront.current = front
            stack.current.set(0, sig)
            return
        }
        if (applying.current) {                   // the layout caught up with a Back
            applying.current = null
            lastFront.current = front
            return
        }
        if (same(sig, last.current)) {
            if (front !== lastFront.current && top.current.seq && isTop(top.current.seq)) {
                replaceEntry(ID, { open: sig }, urlFor(front))
            }
            lastFront.current = front
            return
        }
        const prev = last.current
        last.current = sig
        lastFront.current = front
        const onTop = top.current.seq ? isTop(top.current.seq) : depthOf(read()) === 0 && !read()?.diBack
        const added = sig.some((k) => !prev.includes(k))
        if (!added) {
            // a close: back to the entry that already describes this set, when we are on top
            for (let d = top.current.depth - 1; d >= 0; d -= 1) {
                if (same(stack.current.get(d) || [], sig) && onTop) { goBack(top.current.depth - d); return }
            }
            if (onTop && top.current.seq) {
                const r = replaceEntry(ID, { open: sig }, urlFor(front))
                if (r) stack.current.set(r.depth, sig)
            } else {
                stale.current = sig                // another view sits above; rewrite when Back reaches us
            }
            return
        }
        if (deepLink.current) {
            deepLink.current = false
            try { window.history.replaceState(null, '', homeUrl()) } catch { /* no history here */ }
        }
        const r = pushEntry(ID, { open: sig }, urlFor(front))
        if (r) { top.current = { depth: r.depth, seq: r.seq }; stack.current.set(r.depth, sig) }
    }, [sigKey, front]) // eslint-disable-line react-hooks/exhaustive-deps

    return useMemo(() => ({
        prepareDeepLink,
        canStepBack: () => !!top.current.seq && isTop(top.current.seq),
        stepBack: () => goBack(1)
    }), [prepareDeepLink])
}
