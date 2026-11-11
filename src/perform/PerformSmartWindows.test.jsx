import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeProjectDocument } from '../shared/projectSchema.js'
import { ShowClockContext } from './useShowClock.js'

vi.mock('../project/tops/useMachinePresence.js', () => ({ useMachinePresence: () => ({ machines: [], ndiScan: null }) }))
vi.mock('../project/services/projectsApi.js', () => ({ listProjects: async () => [] }))

const { default: PerformDesk } = await import('./PerformDesk.jsx')

const doc = () => normalizeProjectDocument({
    projectMeta: { id: 'show', spaceId: 'lab', title: 'show' },
    nodes: [{ id: 'deck-1', typeId: 'vj.deck', label: 'VJ Deck', values: {} }]
})
const clock = { leader: 'deck', timeline: { bpm: 120, epoch: 0 }, light: null, follow: true, setFollow: vi.fn(), tap: vi.fn(), reset: vi.fn(), offset: null, canTap: true }
const layout = () => ({ presets: [], activePreset: null, setPresets: vi.fn(), setActivePreset: vi.fn() })

const mount = (preset = 'vj') => render(
    <ShowClockContext.Provider value={clock}>
        <PerformDesk perform={{ preset, from: 'raw' }} document={doc()} spaceId="lab" projectId="show" applyLocalOps={vi.fn()} renderNode={(n) => <div>{n.label}</div>} layout={layout()} />
    </ShowClockContext.Provider>
)
const titles = () => screen.queryAllByRole('dialog').map((d) => d.getAttribute('aria-label'))
const frames = () => screen.queryAllByRole('dialog').map((d) => d.getBoundingClientRect && { left: parseFloat(d.style.left), top: parseFloat(d.style.top), width: parseFloat(d.style.width), height: parseFloat(d.style.height) })
const key = (k, over = {}, target = document.body) => act(() => { fireEvent.keyDown(target, { key: k, ...over }) })

beforeEach(() => { window.innerWidth = 1440; window.innerHeight = 900 })
afterEach(cleanup)

describe('Perform smart windows', () => {
    it('right-click on a title bar opens the shared menu with the window actions', () => {
        mount()
        const bar = screen.getAllByRole('toolbar')[0]
        fireEvent.contextMenu(bar)
        const menu = screen.getByRole('menu')
        for (const name of ['(Maximize|Restore)', 'Minimize', 'Hide this window', 'Add window', 'Arrange all', 'Save as mine…', 'Save to the show…']) {
            expect(within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeTruthy()
        }
        expect(within(menu).getByRole('menuitem', { name: /Arrange all/ }).textContent).toContain('Shift+A')
    })

    it('Hide this window closes it; the menu closes', () => {
        mount()
        const before = titles().length
        fireEvent.contextMenu(screen.getAllByRole('toolbar')[0])
        fireEvent.click(screen.getByRole('menuitem', { name: /Hide this window/ }))
        expect(titles().length).toBe(before - 1)
        expect(screen.queryByRole('menu')).toBe(null)
    })

    it('Maximize from the menu fills the desk, Restore puts it back', () => {
        mount('wall')
        const bar = screen.getAllByRole('toolbar')[0]
        const first = () => screen.getAllByRole('dialog')[0]
        const w0 = parseFloat(first().style.width)
        fireEvent.contextMenu(bar)
        fireEvent.click(screen.getByRole('menuitem', { name: /^Maximize/ }))
        expect(parseFloat(first().style.width)).toBe(1440)
        fireEvent.contextMenu(screen.getAllByRole('toolbar')[0])
        fireEvent.click(screen.getByRole('menuitem', { name: /^Restore/ }))
        expect(parseFloat(first().style.width)).toBe(w0)
    })

    it('right-click on the empty desk opens the desk menu; Add window lists the kinds and adds one', () => {
        mount()
        fireEvent.contextMenu(screen.getByTestId('perform-desk'))
        expect(screen.queryByRole('menuitem', { name: /Maximize/ })).toBe(null)
        const before = titles().length
        fireEvent.click(screen.getByRole('menuitem', { name: /^Add window/ }))
        fireEvent.click(screen.getByRole('menuitem', { name: /^Clock/ }))
        expect(titles().length).toBe(before + 1)
    })

    it('Arrange all tiles every window over the desk with no overlap (menu and Shift+A)', () => {
        mount('wall')
        const check = () => {
            const f = frames()
            expect(f.length).toBeGreaterThan(1)
            const area = f.reduce((sum, r) => sum + r.width * r.height, 0)
            expect(Math.abs(area - 1440 * (900 - parseFloat(document.querySelector('.perform-desk-bg').style.top)))).toBeLessThan(f.length * 1440)
            f.forEach((a, i) => f.slice(i + 1).forEach((b) => {
                const overlap = a.left < b.left + b.width - 1 && b.left < a.left + a.width - 1 && a.top < b.top + b.height - 1 && b.top < a.top + a.height - 1
                expect(overlap).toBe(false)
            }))
        }
        fireEvent.contextMenu(screen.getAllByRole('toolbar')[0])
        fireEvent.click(screen.getByRole('menuitem', { name: /^Arrange all/ }))
        check()
        key('A', { shiftKey: true })
        check()
    })

    it('M maximizes the front window; keys are ignored while an input has focus', () => {
        mount()
        const input = document.createElement('input')
        document.body.appendChild(input)
        const widthOf = () => parseFloat(screen.getAllByRole('dialog').at(-1).style.width)
        const before = widthOf()
        key('m', {}, input)
        key('A', { shiftKey: true }, input)
        key('/', {}, input)
        expect(widthOf()).toBe(before)
        expect(screen.queryByRole('menu')).toBe(null)
        key('m')
        expect(widthOf()).toBe(1440)
        input.remove()
    })

    it('/ opens the add list; Esc hides only a window added by hand', () => {
        mount()
        const base = titles().length
        key('Escape')
        expect(titles().length).toBe(base) // a preset's own window is never lost to Esc
        key('/')
        fireEvent.click(screen.getByRole('menuitem', { name: /^Clock/ }))
        expect(titles().length).toBe(base + 1)
        key('Escape')
        expect(titles().length).toBe(base)
    })

    it('does not touch the cue digits or Blackout keys', () => {
        mount()
        const before = titles().length
        for (const k of ['1', '2', '9', 'b', ' ']) key(k)
        expect(titles().length).toBe(before)
        expect(screen.queryByRole('menu')).toBe(null)
    })
})
