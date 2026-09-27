// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import {
    LINK_CLICK_MAX_TRAVEL_PX,
    createLinkHandlers,
    followEntityLink,
    resolveEntityLink
} from './entityLink.js'

const ORIGIN = 'https://diiii.xyz'
const entityWith = (link) => ({ id: 'slide-1', type: 'image', components: { link } })

// A stand-in for the R3F ThreeEvent the handlers receive: `delta` is R3F's own
// pointer-down → click distance, nativeEvent carries screen coordinates.
const threeEvent = (overrides = {}) => ({
    delta: 0,
    stopPropagation: vi.fn(),
    nativeEvent: { clientX: 100, clientY: 100 },
    ...overrides
})

describe('resolveEntityLink — what a link on an entity points at', () => {
    it('an enabled in-platform path is internal', () => {
        expect(resolveEntityLink(entityWith({ enabled: true, href: '/main/deck' }), { origin: ORIGIN }))
            .toEqual({ kind: 'internal', path: '/main/deck', label: '/main/deck' })
    })

    it('a url on this origin is internal, reduced to its path', () => {
        expect(resolveEntityLink(entityWith({ enabled: true, href: 'https://diiii.xyz/main/deck?x=1#s', label: 'Deck' }), { origin: ORIGIN }))
            .toEqual({ kind: 'internal', path: '/main/deck?x=1#s', label: 'Deck' })
    })

    it('an https url elsewhere is external, labelled with its host', () => {
        expect(resolveEntityLink(entityWith({ enabled: true, href: 'https://www.thedi.studio/work' }), { origin: ORIGIN }))
            .toEqual({ kind: 'external', href: 'https://www.thedi.studio/work', label: 'thedi.studio' })
    })

    it.each([
        ['disabled', { enabled: false, href: '/main' }],
        ['empty', { enabled: true, href: '' }],
        ['javascript:', { enabled: true, href: 'javascript:alert(1)' }],
        ['javascript: split by a tab', { enabled: true, href: 'java\tscript:alert(1)' }],
        ['data:', { enabled: true, href: 'data:text/html,x' }],
        ['protocol-relative', { enabled: true, href: '//evil.example/x' }],
        ['bare word', { enabled: true, href: 'deck' }],
        ['mailto:', { enabled: true, href: 'mailto:a@b.c' }]
    ])('%s → nothing to follow', (_name, link) => {
        expect(resolveEntityLink(entityWith(link), { origin: ORIGIN })).toBeNull()
    })

    it('an entity with no link component, or a portal (a door has its own click), is not a link', () => {
        expect(resolveEntityLink({ id: 'x', type: 'box', components: {} }, { origin: ORIGIN })).toBeNull()
        expect(resolveEntityLink({ id: 'p', type: 'portal', components: { link: { enabled: true, href: '/main' } } }, { origin: ORIGIN })).toBeNull()
    })
})

describe('followEntityLink — what a click does', () => {
    it('an internal path navigates inside the app, never a new tab', () => {
        const navigate = vi.fn()
        const openExternal = vi.fn()
        followEntityLink({ kind: 'internal', path: '/main/deck', label: '' }, { navigate, openExternal })
        expect(navigate).toHaveBeenCalledWith('/main/deck')
        expect(openExternal).not.toHaveBeenCalled()
    })

    it('an external url opens a new tab with rel="noopener noreferrer"', () => {
        const clicked = []
        const doc = window.document
        const listener = (e) => {
            const a = e.target
            clicked.push({ href: a.href, target: a.target, rel: a.rel })
            e.preventDefault()
        }
        doc.addEventListener('click', listener)
        const navigate = vi.fn()
        followEntityLink({ kind: 'external', href: 'https://thedi.studio/work', label: 'thedi.studio' }, { navigate, doc })
        doc.removeEventListener('click', listener)
        expect(navigate).not.toHaveBeenCalled()
        expect(clicked).toEqual([{ href: 'https://thedi.studio/work', target: '_blank', rel: 'noopener noreferrer' }])
        // The anchor is gone again — nothing is left in the page.
        expect(doc.querySelectorAll('a[target="_blank"]').length).toBe(0)
    })
})

describe('createLinkHandlers — the pointer handlers an entity with a link carries', () => {
    const setup = (link, { origin = ORIGIN } = {}) => {
        const navigate = vi.fn()
        const openExternal = vi.fn()
        const setHovered = vi.fn()
        const body = { style: { cursor: '' } }
        const target = resolveEntityLink(entityWith(link), { origin })
        const handlers = createLinkHandlers(target, {
            follow: (t) => followEntityLink(t, { navigate, openExternal }),
            setHovered,
            body
        })
        return { handlers, navigate, openExternal, setHovered, body }
    }

    it('an enabled link is clickable: pointer cursor on hover, a click navigates in-app', () => {
        const { handlers, navigate, body, setHovered } = setup({ enabled: true, href: '/main/deck' })
        expect(handlers).not.toBeNull()
        handlers.onPointerOver(threeEvent())
        expect(body.style.cursor).toBe('pointer')
        expect(setHovered).toHaveBeenLastCalledWith(true)
        handlers.onPointerDown(threeEvent())
        handlers.onClick(threeEvent())
        expect(navigate).toHaveBeenCalledWith('/main/deck')
        handlers.onPointerOut(threeEvent())
        expect(body.style.cursor).toBe('')
        expect(setHovered).toHaveBeenLastCalledWith(false)
    })

    it('an external link opens a new tab on click', () => {
        const { handlers, navigate, openExternal } = setup({ enabled: true, href: 'https://thedi.studio' })
        handlers.onPointerDown(threeEvent())
        handlers.onClick(threeEvent())
        expect(openExternal).toHaveBeenCalledWith('https://thedi.studio/')
        expect(navigate).not.toHaveBeenCalled()
    })

    it('a drag-to-look does not open the link (R3F delta over the slop)', () => {
        const { handlers, navigate } = setup({ enabled: true, href: '/main/deck' })
        handlers.onPointerDown(threeEvent())
        handlers.onClick(threeEvent({ delta: LINK_CLICK_MAX_TRAVEL_PX + 1 }))
        expect(navigate).not.toHaveBeenCalled()
    })

    it('a pointer-locked look (cursor frozen, so R3F delta is 0) does not open the link either', () => {
        const { handlers, navigate } = setup({ enabled: true, href: '/main/deck' })
        handlers.onPointerDown(threeEvent())
        handlers.onPointerTravel({ movementX: 40, movementY: 3 })
        handlers.onClick(threeEvent({ delta: 0 }))
        expect(navigate).not.toHaveBeenCalled()
        // …and the next honest click still works.
        handlers.onPointerDown(threeEvent())
        handlers.onClick(threeEvent())
        expect(navigate).toHaveBeenCalledTimes(1)
    })

    it('a finger on the object shows its nameplate until it lifts (a phone has no hover)', () => {
        const { handlers, setHovered } = setup({ enabled: true, href: '/main/deck' })
        handlers.onPointerDown(threeEvent({ pointerType: 'touch' }))
        expect(setHovered).toHaveBeenLastCalledWith(true)
        handlers.onPointerUp({ pointerType: 'touch' })
        expect(setHovered).toHaveBeenLastCalledWith(false)
    })

    it('a mouse press does not touch the hover state (the mouse already hovers)', () => {
        const { handlers, setHovered } = setup({ enabled: true, href: '/main/deck' })
        handlers.onPointerDown(threeEvent({ pointerType: 'mouse' }))
        handlers.onPointerUp({ pointerType: 'mouse' })
        expect(setHovered).not.toHaveBeenCalled()
    })

    it('a disabled link does nothing: no handlers at all', () => {
        const { handlers } = setup({ enabled: false, href: '/main/deck' })
        expect(handlers).toBeNull()
    })
})
