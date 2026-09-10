import { beforeEach, describe, expect, it } from 'vitest'
import {
    cycleFocus,
    isMaximised,
    layoutScopeKey,
    maximiseFrame,
    mergeFrame,
    pruneLayout,
    restoreFrame
} from './workspaceLayout.js'
import { emptyLayout, readWorkspaceLayout, writeWorkspaceLayout } from './workspaceLayoutStorage.js'

describe('a person\'s own arrangement of a workspace', () => {
    // The whole point: the document says where a window opens, the person says
    // where it is. A local entry that names only zIndex must not blank the seed.
    it('lays the local arrangement over the document seed, field by field', () => {
        const seed = { x: 10, y: 20, width: 300, height: 200, title: 'Room' }
        expect(mergeFrame(seed, { zIndex: 12 })).toEqual({ ...seed, zIndex: 12 })
        expect(mergeFrame(seed, { x: 400 }).x).toBe(400)
        expect(mergeFrame(seed, { x: 400 }).width).toBe(300)
    })

    it('leaves the seed alone when nobody has arranged anything', () => {
        const seed = { x: 10, y: 20 }
        expect(mergeFrame(seed, null)).toEqual(seed)
        expect(mergeFrame(null, null)).toEqual({})
    })

    // `title` is what the thing is called; it is not where it sits, so it stays
    // in the document where everyone shares it.
    it('never lets a local entry rename a window', () => {
        expect(mergeFrame({ title: 'Room' }, { title: 'Mine' }).title).toBe('Room')
    })

    // A phone is a different arrangement of the same room. Desktop frames on a
    // 390px screen put windows off the edge.
    it('keeps a phone layout and a desktop layout apart', () => {
        const phone = layoutScopeKey({ spaceId: 'wcc', projectId: 'p1', viewportWidth: 390 })
        const desktop = layoutScopeKey({ spaceId: 'wcc', projectId: 'p1', viewportWidth: 1440 })
        expect(phone).not.toBe(desktop)
        expect(phone.endsWith('.narrow')).toBe(true)
        expect(desktop.endsWith('.wide')).toBe(true)
    })

    it('keeps two projects, and two spaces, apart', () => {
        const a = layoutScopeKey({ spaceId: 'wcc', projectId: 'p1', viewportWidth: 1440 })
        const b = layoutScopeKey({ spaceId: 'wcc', projectId: 'p2', viewportWidth: 1440 })
        const c = layoutScopeKey({ spaceId: 'kids', projectId: 'p1', viewportWidth: 1440 })
        expect(new Set([a, b, c]).size).toBe(3)
    })

    // localStorage has a ceiling and a deleted node would hold its slot forever.
    it('forgets the frames of nodes the document no longer holds', () => {
        const frames = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 } }
        expect(pruneLayout(frames, ['a', 'c'])).toEqual({ a: { x: 1 }, c: { x: 3 } })
        expect(pruneLayout(null, ['a'])).toEqual({})
    })
})

describe('maximise', () => {
    const bounds = { left: 12, top: 76, width: 1400, height: 700 }

    it('fills the workspace it is given, not the page', () => {
        const frame = maximiseFrame({ x: 40, y: 200, width: 300, height: 240 }, bounds)
        expect(frame).toMatchObject({ x: 12, y: 76, width: 1400, height: 700, maximized: true })
    })

    // In world space a pan would slide "full screen" off the screen.
    it('pins, because a full-screen window is measured in screen pixels', () => {
        expect(maximiseFrame({ pinned: false }, bounds).pinned).toBe(true)
    })

    // Restoring to the document's seed would undo the person's own arrangement
    // as the price of maximising once.
    it('puts the window back exactly where the person left it', () => {
        const before = { x: 40, y: 200, width: 300, height: 240, pinned: false, zIndex: 9 }
        const after = restoreFrame(maximiseFrame(before, bounds))
        expect(after.x).toBe(40)
        expect(after.y).toBe(200)
        expect(after.width).toBe(300)
        expect(after.height).toBe(240)
        expect(after.pinned).toBe(false)
        expect(after.zIndex).toBe(9)
        expect(isMaximised(after)).toBe(false)
    })

    it('un-minimises: a window cannot be both filling the screen and a title bar', () => {
        expect(maximiseFrame({ minimized: true }, bounds).minimized).toBe(false)
    })
})

describe('keyboard focus', () => {
    it('walks the pile and wraps, in both directions', () => {
        const order = ['a', 'b', 'c']
        expect(cycleFocus(order, 'a', 1)).toBe('b')
        expect(cycleFocus(order, 'c', 1)).toBe('a')
        expect(cycleFocus(order, 'a', -1)).toBe('c')
    })

    it('starts somewhere when nothing is focused, and stays quiet when there is nothing', () => {
        expect(cycleFocus(['a', 'b'], null, 1)).toBe('a')
        expect(cycleFocus([], null, 1)).toBe(null)
    })
})

describe('the stored layout', () => {
    beforeEach(() => window.localStorage.clear())

    it('round-trips', () => {
        const layout = { ...emptyLayout(), frames: { a: { x: 5 } } }
        writeWorkspaceLayout('dii.rawLayout.test', layout)
        expect(readWorkspaceLayout('dii.rawLayout.test').frames).toEqual({ a: { x: 5 } })
    })

    // A desk that will not open because of a preference is a worse bug than a
    // desk that opens in its default arrangement.
    it('opens on the default arrangement rather than throwing, whatever is in the slot', () => {
        window.localStorage.setItem('dii.rawLayout.broken', '{not json')
        expect(readWorkspaceLayout('dii.rawLayout.broken')).toEqual(emptyLayout())
        window.localStorage.setItem('dii.rawLayout.old', JSON.stringify({ v: 99, frames: { a: { x: 1 } } }))
        expect(readWorkspaceLayout('dii.rawLayout.old').frames).toEqual({})
    })
})
