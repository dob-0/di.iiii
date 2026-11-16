// One history entry per "place" a person goes to inside a page (a window, a full screen, a drawer, a card).
// Open = one pushState; the browser Back, the phone gesture and Alt+Left run the view's own close; the view's
// own close button removes its entry (history.back) only when that entry is on top. Entries left under another
// one are marked dead and skipped when Back passes over them, so no press of Back does nothing.
// Method: History API pushState + popstate (WHATWG HTML, "Session history"); NN/g heuristic 3, user control and freedom.
// Round 1 users: AdminDesk (windows), MonitorSection (full screen, drawer, keys card, tab).

import { useEffect, useRef } from 'react'

// one id per page load: an entry from before a reload is not ours to skip
const SESSION = Math.random().toString(36).slice(2, 9)
let seqCounter = 0
const live = new Set()
const subs = new Set()
let installed = false
let lastDepth = 0

const hist = () => (typeof window !== 'undefined' ? window.history : null)
const readState = () => { try { return hist()?.state ?? null } catch { return null } }

export const depthOf = (state) => (state && Number.isFinite(state.diDepth) ? state.diDepth : 0)
export const isDead = (state) => !!(state && state.diSession === SESSION && state.diSeq && !live.has(state.diSeq))

function onPop() {
    const state = readState()
    const depth = depthOf(state)
    const dir = depth < lastDepth ? -1 : 1
    lastDepth = depth
    if (isDead(state)) { try { hist().go(dir) } catch { /* no history here */ } return }
    for (const fn of [...subs]) fn(state, depth)
}

function install() {
    if (installed || typeof window === 'undefined') return
    installed = true
    lastDepth = depthOf(readState())
    window.addEventListener('popstate', onPop)
}

// fn(state, depth) runs after every Back/Forward that lands on an entry that is not dead
export function subscribeBack(fn) {
    install()
    subs.add(fn)
    return () => { subs.delete(fn) }
}

// push one entry; returns { seq, depth } or null when there is no history. url is optional (a hash for a reload or a link).
export function pushEntry(id, extra = {}, url) {
    const h = hist()
    if (!h) return null
    install()
    const seq = ++seqCounter
    const depth = depthOf(readState()) + 1
    const state = { ...extra, diBack: id, diSession: SESSION, diSeq: seq, diDepth: depth }
    try { if (url == null) h.pushState(state, ''); else h.pushState(state, '', url) } catch { return null }
    live.add(seq)
    lastDepth = depth
    return { seq, depth }
}

// rewrite the entry we are on (same depth), e.g. the open set of the desk changed without a new place
export function replaceEntry(id, extra = {}, url) {
    const h = hist()
    if (!h) return null
    install()
    const cur = readState()
    const seq = cur?.diSeq && cur.diSession === SESSION ? cur.diSeq : ++seqCounter
    const depth = depthOf(cur)
    const state = { ...extra, diBack: id, diSession: SESSION, diSeq: seq, diDepth: depth }
    try { if (url == null) h.replaceState(state, ''); else h.replaceState(state, '', url) } catch { return null }
    live.add(seq)
    return { seq, depth }
}

export const markLive = (seq) => { if (seq) live.add(seq) }
export const markDead = (seq) => { if (seq) live.delete(seq) }
export const isTop = (seq) => { const s = readState(); return !!(s && s.diSeq === seq && s.diSession === SESSION) }
export const goBack = (steps = 1) => { try { hist().go(-steps) } catch { /* no history here */ } }

// A single view. active true = one entry exists; Back (or the phone gesture) calls onBack; setting active false
// from the view's own button removes the entry if it is on top. Deferred one tick so StrictMode's
// mount-unmount-mount (src/index.jsx) never pushes or pops twice.
export default function useBackEntry(active, onBack, { id = 'view', url } = {}) {
    const cb = useRef(onBack)
    useEffect(() => { cb.current = onBack })
    useEffect(() => {
        if (!active) return undefined
        let mine = null
        let unsub = null
        let popped = false
        const timer = setTimeout(() => {
            mine = pushEntry(id, {}, url)
            if (!mine) return
            unsub = subscribeBack((_state, depth) => {
                if (!mine || depth >= mine.depth) return
                popped = true
                markDead(mine.seq)
                cb.current?.()
            })
        }, 0)
        return () => {
            clearTimeout(timer)
            if (unsub) unsub()
            if (!mine || popped) return
            const top = isTop(mine.seq)
            markDead(mine.seq)
            if (top) goBack(1)
        }
    }, [active, id, url])
}
