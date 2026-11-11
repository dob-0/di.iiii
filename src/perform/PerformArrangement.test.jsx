import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeProjectDocument } from '../shared/projectSchema.js'
import { ShowClockContext } from './useShowClock.js'
import { arrangementKey, writeArrangement } from './arrangementStore.js'

vi.mock('../project/tops/useMachinePresence.js', () => ({ useMachinePresence: () => ({ machines: [], ndiScan: null }) }))
vi.mock('../project/services/projectsApi.js', () => ({ listProjects: async () => [] }))

const { default: PerformDesk } = await import('./PerformDesk.jsx')

const doc = () => normalizeProjectDocument({
    projectMeta: { id: 'show', spaceId: 'lab', title: 'show' },
    nodes: [{ id: 'deck-1', typeId: 'vj.deck', label: 'VJ Deck', values: {} }]
})
const clock = { leader: 'deck', timeline: { bpm: 120, epoch: 0 }, light: null, follow: true, setFollow: vi.fn(), tap: vi.fn(), reset: vi.fn(), offset: null, canTap: true }
const layout = () => ({ presets: [], activePreset: null, setPresets: vi.fn(), setActivePreset: vi.fn() })

const desk = (props = {}) => (
    <ShowClockContext.Provider value={clock}>
        <PerformDesk perform={{ preset: 'vj-windows', from: 'raw' }} document={doc()} spaceId="lab" projectId="show" applyLocalOps={vi.fn()} renderNode={(n) => <div>{n.label}</div>} layout={layout()} {...props} />
    </ShowClockContext.Provider>
)
const titles = () => screen.queryAllByRole('dialog').map((d) => d.getAttribute('aria-label'))
const key = arrangementKey('lab', 'show')

beforeEach(() => { window.innerWidth = 1440; window.innerHeight = 900 })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('the Arrange all button', () => {
    it('is in the strip, names its key in the title, and runs the same action as the menu item', () => {
        render(desk())
        const button = screen.getByRole('button', { name: 'Arrange all' })
        expect(button.getAttribute('title')).toContain('Shift+A')
        expect(button.disabled).toBe(false)
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Clock' })).getByRole('button', { name: 'Close' }))
        expect(titles()).toHaveLength(3)
        fireEvent.click(button)
        expect(titles()).toHaveLength(3)
        const stored = JSON.parse(window.localStorage.getItem(key))
        const rects = Object.values(stored.rects)
        const hit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]
        rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(hit(a, b)).toBe(false)))
    })

    it('is disabled when there is no window, like the menu item', () => {
        render(desk({ hasLoaded: false, document: normalizeProjectDocument({}) }))
        expect(screen.getByRole('button', { name: 'Arrange all' }).disabled).toBe(true)
    })
})

describe('the remembered arrangement on the desk', () => {
    it('stores a change under the project key, restores it after a remount, and Reset layout is the way back', () => {
        const first = render(desk())
        expect(window.localStorage.getItem(key)).toBe(null)
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Clock' })).getByRole('button', { name: 'Close' }))
        expect(JSON.parse(window.localStorage.getItem(key)).windows.map((w) => w.kind)).toEqual(['deck', 'out', 'master'])
        first.unmount()
        render(desk())
        expect(titles()).toEqual(['VJ Deck', 'Out', 'Master · Blackout'])
        fireEvent.click(screen.getByRole('button', { name: 'Windows' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }))
        expect(titles()).toEqual(['VJ Deck', 'Out', 'Clock', 'Master · Blackout'])
        expect(window.localStorage.getItem(key)).toBe(null)
    })

    it('puts a window stored far off the desk back inside it, and ignores a corrupt value', () => {
        writeArrangement('lab', 'show', {
            presetId: 'vj-windows', widthClass: 'wide',
            windows: [{ id: 'deck', kind: 'deck' }, { id: 'out', kind: 'out' }],
            rects: { deck: [0, 0, 60, 100], out: [900, 800, 50, 50] }, order: ['deck', 'out'], minimized: {}, restore: {}
        })
        render(desk())
        expect(titles()).toEqual(['VJ Deck', 'Out'])
        const out = screen.getByRole('dialog', { name: 'Out' })
        expect(parseFloat(out.style.left) + parseFloat(out.style.width)).toBeLessThanOrEqual(1440)
        expect(parseFloat(out.style.top) + parseFloat(out.style.height)).toBeLessThanOrEqual(900)
        cleanup()
        window.localStorage.setItem(key, '{broken')
        render(desk())
        expect(titles()).toEqual(['VJ Deck', 'Out', 'Clock', 'Master · Blackout'])
    })

    it('a stored arrangement of another preset or width is not used', () => {
        writeArrangement('lab', 'show', { presetId: 'wall', widthClass: 'wide', windows: [{ id: 'cues', kind: 'cues' }], rects: { cues: [0, 0, 100, 100] }, order: ['cues'], minimized: {}, restore: {} })
        render(desk())
        expect(titles()).toEqual(['VJ Deck', 'Out', 'Clock', 'Master · Blackout'])
    })
})
