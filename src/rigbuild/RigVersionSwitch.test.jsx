import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RigVersionSwitch from './RigVersionSwitch.jsx'

const listSpaceContents = vi.fn()
vi.mock('../project/services/projectsApi.js', () => ({ listSpaceContents: (...a) => listSpaceContents(...a) }))

// /moxir on the owner's screen, 2026-09-30: Halo's own stored list named only itself.
const SET = 'moxir-2026-10-17'
const mark = (id, title, extra = {}) => ({ set: SET, id, title, summary: '', ...extra })
const rows = [
    { id: 'moxir-hall-minimal', rigVariant: mark('minimal', 'Minimal — simple') },
    { id: 'moxir-hall-minimal-halo', rigVariant: mark('minimal-halo', 'Minimal · halo') },
    { id: 'moxir-hall-minimal-xflat', rigVariant: mark('minimal-xflat', 'Minimal · X lying down') },
    { id: 'moxir-hall-minimal-oldhall-0929', rigVariant: mark('minimal-oldhall-0929', 'Minimal · old hall 09-29', { copyOf: { projectId: 'moxir-hall-minimal' } }) }
]
const halo = [{ id: 'rig-show', components: { rigVariant: { ...mark('minimal-halo', 'Minimal · halo'), siblings: [{ id: 'minimal-halo', projectId: 'moxir-hall-minimal-halo', title: 'Minimal · halo' }] } } }]

afterEach(() => { cleanup(); listSpaceContents.mockReset() })

describe('RigVersionSwitch in the room', () => {
    it('from Halo shows every live version and the labelled copy, current marked, each 44px', async () => {
        listSpaceContents.mockResolvedValue(rows)
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
        // the labelled copy is folded behind one entry until asked for
        fireEvent.click(screen.getByRole('button', { name: 'Old versions (1)' }))
        const links = screen.getAllByRole('link')
        expect(links).toHaveLength(4)
        expect(links.map((a) => a.textContent)).toEqual(['Minimal', 'Minimal · halo', 'Minimal · X lying down', 'Minimal · old hall 09-29'])
        expect(links.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null])
        for (const a of links) expect(a.style.minHeight).toBe('44px')
        expect(screen.getByRole('navigation', { name: 'rig versions' })).toBeTruthy()
    })

    // The row ran under Walk / Fly (top right, same line) once ten versions made it 2216 px wide.
    it('caps its width at what the viewer passes, so it stops before Walk / Fly', async () => {
        listSpaceContents.mockResolvedValue(rows)
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} maxWidth="calc(100vw - 10.5rem)" />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
        expect(screen.getByRole('navigation', { name: 'rig versions' }).style.maxWidth).toBe('calc(100vw - 10.5rem)')
    })

    it('keeps the full-width cap when the viewer passes none', async () => {
        listSpaceContents.mockResolvedValue(rows)
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
        expect(screen.getByRole('navigation', { name: 'rig versions' }).style.maxWidth).toBe('calc(100vw - 2rem)')
    })

    it('if the space list cannot be read, only the version you are in — no link', async () => {
        listSpaceContents.mockRejectedValue(new Error('offline'))
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(listSpaceContents).toHaveBeenCalled())
        expect(screen.queryByRole('link', { name: 'Minimal' })).toBeNull()
    })

    // 2026-09-30 /moxir: 10 entries, six of them copies, in the middle, 2216 px in a 1799 px area.
    const many = [
        ...['a', 'b', 'c', 'd'].map((k) => ({ id: `p-${k}`, rigVariant: mark(k, `Live ${k}`) })),
        ...['1', '2', '3'].map((k) => ({ id: `p-old-${k}`, rigVariant: mark(`old${k}`, `Old ${k}`, { copyOf: { projectId: 'p-a' } }) }))
    ]
    const entitiesFor = (id) => [{ id: 'rig-show', components: { rigVariant: { ...mark(id, id), siblings: [{ id, projectId: `p-${id}`, title: id }] } } }]

    it('folds the copies behind ONE rectangular entry, expands in place, keyboard-reachable', async () => {
        listSpaceContents.mockResolvedValue(many)
        render(<RigVersionSwitch spaceId="moxir" projectId="p-b" entities={entitiesFor('b')} />)
        const fold = await screen.findByRole('button', { name: 'Old versions (3)' })
        expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Live a', 'Live b', 'Live c', 'Live d'])
        expect(fold.getAttribute('aria-expanded')).toBe('false')
        expect(fold.tagName).toBe('BUTTON')
        expect(fold.style.minHeight).toBe('44px')
        expect(fold.style.borderRadius).toBe('2px')
        fireEvent.click(fold)
        expect(fold.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getAllByRole('link')).toHaveLength(7)
        for (const a of screen.getAllByRole('link')) { expect(a.style.minHeight).toBe('44px'); expect(a.style.borderRadius).toBe('2px') }
        fireEvent.click(fold)
        expect(screen.getAllByRole('link')).toHaveLength(4)
    })

    it('no fold when no version carries copyOf (degrades to the plain row)', async () => {
        listSpaceContents.mockResolvedValue(rows.slice(0, 3))
        render(<RigVersionSwitch spaceId="moxir" projectId="moxir-hall-minimal-halo" entities={halo} />)
        await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
        expect(screen.queryByRole('button', { name: /Old versions/ })).toBeNull()
    })

    it('keeps the current version visible even when it is a copy', async () => {
        listSpaceContents.mockResolvedValue(many)
        render(<RigVersionSwitch spaceId="moxir" projectId="p-old-2" entities={entitiesFor('old2')} />)
        await screen.findByRole('button', { name: 'Old versions (2)' })
        const cur = screen.getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'page')
        expect(cur.textContent).toBe('Old 2')
    })

    describe('overflow at phone width (jsdom widths mocked)', () => {
        const orig = {}
        const mock = (name, fn) => { orig[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name); Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: fn }) }
        afterEach(() => { for (const [k, d] of Object.entries(orig)) { if (d) Object.defineProperty(HTMLElement.prototype, k, d); else delete HTMLElement.prototype[k] } })

        it('shows a right-edge fade when the row is wider than its area', async () => {
            mock('clientWidth', () => 358)
            mock('scrollWidth', () => 900)
            listSpaceContents.mockResolvedValue(many)
            const { container } = render(<RigVersionSwitch spaceId="moxir" projectId="p-a" entities={entitiesFor('a')} />)
            await screen.findByRole('button', { name: 'Old versions (3)' })
            expect(container.querySelector('[data-cue="right"]')).toBeTruthy()
            expect(container.querySelector('[data-cue="left"]')).toBeNull()
        })

        it('no fade when the row fits', async () => {
            mock('clientWidth', () => 900)
            mock('scrollWidth', () => 900)
            listSpaceContents.mockResolvedValue(many)
            const { container } = render(<RigVersionSwitch spaceId="moxir" projectId="p-a" entities={entitiesFor('a')} />)
            await screen.findByRole('button', { name: 'Old versions (3)' })
            expect(container.querySelector('[data-cue]')).toBeNull()
        })

        it('scrolls the current version into view', async () => {
            mock('clientWidth', () => 358)
            mock('scrollWidth', () => 900)
            mock('offsetLeft', function () { return this.getAttribute('aria-current') ? 600 : 0 })
            mock('offsetWidth', function () { return this.getAttribute('aria-current') ? 100 : 0 })
            listSpaceContents.mockResolvedValue(many)
            const { container } = render(<RigVersionSwitch spaceId="moxir" projectId="p-d" entities={entitiesFor('d')} />)
            await screen.findByRole('button', { name: 'Old versions (3)' })
            // 600 - (358 - 100) / 2 = 471
            await waitFor(() => expect(container.querySelector('nav > div').scrollLeft).toBe(471))
        })
    })

    describe('wide current title (P14)', () => {
        const orig = {}
        const mock = (name, fn) => { orig[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name); Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: fn }) }
        afterEach(() => { for (const [k, d] of Object.entries(orig)) { if (d) Object.defineProperty(HTMLElement.prototype, k, d); else delete HTMLElement.prototype[k] } })

        it('aligns a title wider than the strip to its left edge, and the cue carries a chevron', async () => {
            mock('clientWidth', () => 300)
            mock('scrollWidth', () => 1200)
            mock('offsetLeft', function () { return this.getAttribute('aria-current') ? 600 : 0 })
            mock('offsetWidth', function () { return this.getAttribute('aria-current') ? 500 : 0 })
            listSpaceContents.mockResolvedValue(many)
            const { container } = render(<RigVersionSwitch spaceId="moxir" projectId="p-d" entities={entitiesFor('d')} />)
            await screen.findByRole('button', { name: 'Old versions (3)' })
            await waitFor(() => expect(container.querySelector('nav > div').scrollLeft).toBe(600))
            expect(container.querySelector('[data-cue="right"]').textContent).toBe('›')
        })
    })

    describe('walk mode', () => {
        it('one collapsed 44 px button that opens the versions and closes again', async () => {
            listSpaceContents.mockResolvedValue(many)
            render(<RigVersionSwitch spaceId="moxir" projectId="p-b" entities={entitiesFor('b')} mode="walk" top="5rem" />)
            const btn = await screen.findByRole('button', { name: 'Versions · Live b' })
            expect(btn.getAttribute('aria-expanded')).toBe('false')
            expect(btn.style.minHeight).toBe('44px')
            expect(screen.queryAllByRole('link')).toHaveLength(0)
            fireEvent.click(btn)
            expect(btn.getAttribute('aria-expanded')).toBe('true')
            expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Live a', 'Live b', 'Live c', 'Live d'])
            expect(screen.getByRole('button', { name: 'Old versions (3)' })).toBeTruthy()
        })

        it('a long title is cut with an ellipsis inside the button, not at the nav edge (review B5-2)', async () => {
            const long = 'A very long version title with no dash that goes on and on past sixty characters'
            listSpaceContents.mockResolvedValue(many.map((c) => (c.id === 'p-b' ? { ...c, rigVariant: mark('b', long) } : c)))
            render(<RigVersionSwitch spaceId="moxir" projectId="p-b" entities={entitiesFor('b')} mode="walk" top="5rem" />)
            const btn = await screen.findByRole('button', { name: /^Versions · / })
            expect(btn.style.maxWidth).toBe('100%')
            const text = btn.querySelector('span')
            expect(text.style.textOverflow).toBe('ellipsis')
            expect(text.style.overflow).toBe('hidden')
        })
    })
})
