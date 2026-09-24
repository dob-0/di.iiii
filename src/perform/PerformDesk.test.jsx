import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeProjectDocument } from '../shared/projectSchema.js'
import { ShowClockContext } from './useShowClock.js'

vi.mock('../project/tops/useMachinePresence.js', () => ({ useMachinePresence: () => ({ machines: [], ndiScan: null }) }))
vi.mock('../project/services/projectsApi.js', () => ({ listProjects: async () => [] }))

const { default: PerformDesk } = await import('./PerformDesk.jsx')
const { default: DeskPerformSwitch } = await import('./DeskPerformSwitch.jsx')

const deckDoc = () => normalizeProjectDocument({
    projectMeta: { id: 'show', spaceId: 'lab', title: 'show' },
    nodes: [{ id: 'deck-1', typeId: 'vj.deck', label: 'VJ Deck', values: {} }]
})

// A stand-in for the layout hook: the presets slot as state.
function makeLayout() {
    const layout = { presets: [], activePreset: null }
    layout.setPresets = vi.fn((presets) => { layout.presets = presets })
    layout.setActivePreset = vi.fn((id) => { layout.activePreset = id })
    return layout
}

const clock = { leader: 'deck', timeline: { bpm: 120, epoch: 0 }, light: null, follow: true, setFollow: vi.fn(), tap: vi.fn(), reset: vi.fn(), offset: null, canTap: true }

const renderDesk = (props = {}) => {
    const applyLocalOps = vi.fn()
    const layout = props.layout || makeLayout()
    const utils = render(
        <ShowClockContext.Provider value={clock}>
            <PerformDesk
                perform={{ preset: 'vj', from: 'raw' }}
                document={deckDoc()}
                spaceId="lab"
                projectId="show"
                applyLocalOps={applyLocalOps}
                renderNode={(node, options) => <div data-testid="node-window" data-placement={options?.placement}>{node.label}</div>}
                layout={layout}
                {...props}
            />
        </ShowClockContext.Provider>
    )
    return { ...utils, applyLocalOps, layout }
}

const windowTitles = () => screen.queryAllByRole('dialog').map((dialog) => dialog.getAttribute('aria-label'))

beforeEach(() => {
    window.innerWidth = 1440
    window.innerHeight = 900
})
afterEach(() => window.localStorage.clear())

describe('the Perform desk', () => {
    it('opens the VJ preset: the deck (as its perform placement), out, clock, master — and no canvas', () => {
        renderDesk()
        expect(windowTitles()).toEqual(['VJ Deck', 'Out', 'Clock', 'Master · Blackout'])
        expect(screen.getByTestId('node-window').dataset.placement).toBe('perform')
        expect(document.querySelector('.raw-graph-surface, .raw-canvas')).toBe(null)
        // Nothing to pin against with no canvas: no pin button that would do nothing.
        expect(screen.queryByRole('button', { name: 'Pin' })).toBe(null)
    })

    it('the Wall preset opens the Projection desk’s panes as windows', () => {
        renderDesk({ perform: { preset: 'wall', from: 'map' } })
        expect(windowTitles()).toEqual(['Surfaces', 'Cues', 'Wall', 'Wall out', 'Machines'])
    })

    it('a preset with windows not built yet opens them dim, saying so', () => {
        renderDesk({ perform: { preset: 'light' } })
        const coming = document.querySelectorAll('[data-coming]')
        expect([...coming].map((el) => el.dataset.coming)).toEqual(['scenes', 'looks', 'audio'])
        expect(screen.getAllByText('Coming in phase 2')).toHaveLength(3)
        expect(document.querySelector('iframe')).toBe(null)
    })

    it('waits for the document before choosing, so a show preset in the address is found', () => {
        const doc = normalizeProjectDocument({
            projectMeta: { id: 'show', spaceId: 'lab' },
            performState: { presets: [{ id: 'show:sunday', name: 'sunday caller', windows: [{ id: 'cues', kind: 'cues' }], wide: { cues: [0, 0, 100, 100] } }] }
        })
        const { rerender } = renderDesk({ perform: { preset: 'show:sunday' }, hasLoaded: false, document: normalizeProjectDocument({}) })
        expect(windowTitles()).toEqual([])
        rerender(
            <ShowClockContext.Provider value={clock}>
                <PerformDesk perform={{ preset: 'show:sunday' }} hasLoaded document={doc} spaceId="lab" projectId="show" applyLocalOps={vi.fn()} renderNode={() => null} layout={makeLayout()} />
            </ShowClockContext.Provider>
        )
        expect(windowTitles()).toEqual(['Cues'])
        expect(screen.getByRole('button', { name: /sunday caller/ })).toBeTruthy()
    })

    it('closing a window marks the preset changed; "+ window" brings any window back, and Nodes is the last line', () => {
        renderDesk()
        const clockWindow = screen.getByRole('dialog', { name: 'Clock' })
        fireEvent.click(within(clockWindow).getByRole('button', { name: 'Close' }))
        expect(windowTitles()).toEqual(['VJ Deck', 'Out', 'Master · Blackout'])
        expect(screen.getByText('· changed')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '+ window' }))
        const menu = screen.getByRole('menu', { name: 'Add a window' })
        const items = within(menu).getAllByRole('menuitem').map((item) => item.textContent)
        expect(items.at(-1)).toBe('Nodes · the whole patch ›')
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Clock' }))
        expect(windowTitles()).toContain('Clock')
    })

    it('save as mine writes the presets slot and opens the saved preset', () => {
        const { layout } = renderDesk()
        fireEvent.click(screen.getByRole('button', { name: /VJ/ }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Save as mine…' }))
        fireEvent.change(screen.getByLabelText('Name for your preset'), { target: { value: 'friday at MOCT' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(layout.setPresets).toHaveBeenCalledTimes(1)
        const saved = layout.setPresets.mock.calls[0][0][0]
        expect(saved).toMatchObject({ name: 'friday at MOCT', source: 'mine', base: 'vj' })
        expect(saved.windows.map((item) => item.kind)).toEqual(['deck', 'out', 'clock', 'master'])
        expect(screen.getByText(/Saved as “friday at MOCT” on this device/)).toBeTruthy()
    })

    it('save to the show is one op on the document', () => {
        const { applyLocalOps } = renderDesk()
        fireEvent.click(screen.getByRole('button', { name: /VJ/ }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Save to the show…' }))
        fireEvent.change(screen.getByLabelText('Name for the show’s preset'), { target: { value: 'sunday' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        const [op] = applyLocalOps.mock.calls.at(-1)
        expect(op.type).toBe('upsertPerformPreset')
        expect(op.payload.preset).toMatchObject({ name: 'sunday', source: 'show' })
        expect(op.payload.preset.id).toMatch(/^show:/)
    })

    it('a preset kept on this device cannot be shared as a link — it says why', () => {
        const layout = makeLayout()
        layout.presets = [{ id: 'mine:fri', name: 'friday', source: 'mine', windows: [{ id: 'deck', kind: 'deck' }], wide: { deck: [0, 0, 100, 100] } }]
        renderDesk({ perform: { preset: 'mine:fri' }, layout })
        fireEvent.click(screen.getByRole('button', { name: /friday/ }))
        const copy = screen.getByRole('menuitem', { name: /Copy link/ })
        expect(copy).toBeDisabled()
        expect(copy.textContent).toMatch(/save to the show to share/)
    })

    it('the address follows the open preset', async () => {
        renderDesk({ perform: { preset: 'wall', from: 'map' } })
        await act(async () => {})
        expect(window.location.pathname + window.location.search).toBe('/lab/perform/show?preset=wall&from=map')
    })
})

describe('Desk | Perform', () => {
    it('on a desk: Desk is here, Perform goes to this project’s Perform address', () => {
        render(<DeskPerformSwitch current="desk" space="lab" project="show" from="map" />)
        expect(screen.getByRole('link', { name: 'Desk' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: 'Perform' })).toHaveAttribute('href', '/lab/perform/show?from=map')
    })

    it('on Perform: Desk goes back to the desk it came from', () => {
        const { rerender } = render(<DeskPerformSwitch current="perform" space="lab" project="show" from="map" />)
        expect(screen.getByRole('link', { name: 'Desk' })).toHaveAttribute('href', '/lab/map/show')
        rerender(<DeskPerformSwitch current="perform" space="lab" project="show" from="studio" />)
        expect(screen.getByRole('link', { name: 'Desk' }).getAttribute('href')).toMatch(/show/)
        expect(screen.getByRole('link', { name: 'Perform' })).toHaveAttribute('aria-current', 'page')
    })

    it('draws nothing outside a project', () => {
        const { container } = render(<DeskPerformSwitch current="desk" space="lab" project={null} />)
        expect(container.innerHTML).toBe('')
    })
})
