// Click an object to open its link — the decisions, with no renderer in them.
//
// An entity carries `components.link = { enabled, href, label }` (normalised,
// with unsafe schemes already dropped, in src/shared/projectSchema.js). This
// module decides what that link points at and what a click does; EntityLink.jsx
// only hangs the handlers on the object. Kept free of three/React so the whole
// decision is testable in jsdom, like portalHref.js is for doors.
import { sanitizeLinkHref } from '../../shared/projectSchema.js'
import { appNavigate } from '../../utils/appNavigate.js'

// How far the pointer may travel between press and release and still be a
// click. The same figure Studio's selection uses (CLICK_SELECTION_DELTA in
// src/SelectableObject.jsx): past it the visitor was looking around, not
// pointing at something.
export const LINK_CLICK_MAX_TRAVEL_PX = 6

const hostLabel = (hostname = '') => hostname.replace(/^www\./i, '')

// What the link points at, or null when there is nothing safe to follow.
//   { kind: 'internal', path, label }  — this app: /space/project…
//   { kind: 'external', href, label }  — another site, http(s) only
// A portal is never a link: a door already has its own click.
export const resolveEntityLink = (entity, { origin = typeof window === 'undefined' ? '' : window.location.origin } = {}) => {
    if (!entity || entity.type === 'portal') return null
    const link = entity.components?.link
    if (!link || link.enabled !== true) return null
    // Judged again here: a document reaching the viewer without passing the
    // normaliser (an old cache, a hand-written file) must not get through.
    const href = sanitizeLinkHref(link.href)
    if (!href) return null
    const label = typeof link.label === 'string' ? link.label.trim() : ''

    // An in-platform path. `//host` is a protocol-relative url to ANOTHER
    // site and `/\host` is read the same way by browsers — neither is a path.
    if (href.startsWith('/')) {
        if (href.startsWith('//') || href.startsWith('/\\')) return null
        return { kind: 'internal', path: href, label: label || href }
    }

    let url
    try {
        url = new URL(href)
    } catch {
        return null // a bare word, "deck", is not an address
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (origin && url.origin === origin) {
        const path = `${url.pathname}${url.search}${url.hash}`
        return { kind: 'internal', path, label: label || url.pathname }
    }
    return { kind: 'external', href: url.href, label: label || hostLabel(url.hostname) }
}

// A new tab, the way a plain <a target="_blank" rel="noopener noreferrer">
// opens one: the other site gets no window.opener and no Referer. Done with a
// real anchor rather than window.open so the rel is literally that, and so it
// counts as the user's own click for popup blockers (this runs inside the
// click event R3F dispatches).
export const openInNewTab = (href, doc = typeof document === 'undefined' ? null : document) => {
    if (!doc?.body) return
    const a = doc.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    doc.body.appendChild(a)
    try {
        a.click()
    } finally {
        a.remove()
    }
}

export const followEntityLink = (target, { navigate = appNavigate, openExternal, doc } = {}) => {
    if (!target) return
    if (target.kind === 'internal') {
        navigate(target.path)
        return
    }
    if (target.kind === 'external') {
        if (openExternal) openExternal(target.href)
        else openInNewTab(target.href, doc)
    }
}

// The pointer handlers an object with a link carries, or null when it has
// none (a disabled or unsafe link leaves the object exactly as it was).
//
// Two measures of "did the pointer move": R3F's own `event.delta` (screen
// distance between press and release), and `onPointerTravel`, fed with raw
// movementX/Y while the button is down. The second exists for desktop walk
// mode, where a press takes pointer lock: the cursor freezes, so R3F's delta
// stays 0 through a whole look-around and would otherwise let a turn of the
// head follow the link the cursor happened to rest on.
export const createLinkHandlers = (target, {
    follow = followEntityLink,
    setHovered = () => {},
    body = typeof document === 'undefined' ? null : document.body,
    setCursor = (value) => { if (body) body.style.cursor = value }
} = {}) => {
    if (!target) return null
    let travel = 0
    let pressed = false
    let touchShown = false
    return {
        onPointerOver(event) {
            event?.stopPropagation?.()
            setHovered(true)
            setCursor('pointer')
        },
        onPointerOut() {
            setHovered(false)
            setCursor('')
        },
        // A phone has no hover, and R3F only works hover out of pointer
        // MOVES — a finger resting on the object would show nothing. So a
        // touch (or pen) press shows the nameplate until it lifts.
        onPointerDown(event) {
            pressed = true
            travel = 0
            const type = event?.pointerType ?? event?.nativeEvent?.pointerType
            touchShown = type === 'touch' || type === 'pen'
            if (touchShown) setHovered(true)
        },
        onPointerTravel(nativeEvent) {
            if (!pressed) return
            travel += Math.abs(nativeEvent?.movementX || 0) + Math.abs(nativeEvent?.movementY || 0)
        },
        onPointerUp() {
            pressed = false
            if (touchShown) {
                touchShown = false
                setHovered(false)
            }
        },
        onClick(event) {
            event?.stopPropagation?.()
            const moved = Math.max(event?.delta ?? 0, travel)
            pressed = false
            travel = 0
            if (moved > LINK_CLICK_MAX_TRAVEL_PX) return
            follow(target)
        }
    }
}
