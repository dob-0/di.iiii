import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioShell from './StudioShell.jsx'
import { ALL_TOOLS_KEY, saveAllTools } from '../utils/jamMode.js'

vi.mock('./StudioViewportLayout.jsx', () => ({
    default: ({ shared }) => <output data-testid="gizmo-axis">{shared.gizmoAxis || 'all'}</output>
}))
vi.mock('./StudioFloatingPanel.jsx', () => ({ default: ({ title, onClose, children }) => <div data-panel={title} data-closable={onClose ? 'yes' : 'no'}>{children}</div> }))
vi.mock('./StudioControlCluster.jsx', () => ({
    default: ({ gizmoMode }) => <output data-testid="gizmo-mode">{gizmoMode}</output>
}))
vi.mock('./StudioQuickInsert.jsx', () => ({ default: () => null }))
vi.mock('./StudioInspector.jsx', () => ({ default: () => null }))
vi.mock('./StudioShellPanels.jsx', () => ({
    ActivityPanel: () => null,
    AssetsPanel: ({ onDriveImportUrl, onCommonsImport, filesWaitForFirst }) => (
        <output data-testid="assets">{JSON.stringify({ drive: Boolean(onDriveImportUrl), commons: Boolean(onCommonsImport), wait: Boolean(filesWaitForFirst) })}</output>
    ),
    FilesPanel: () => null,
    HistoryPanel: () => null,
    JamEditPanel: () => null,
    LibraryPanel: () => null,
    PresentPanel: () => null,
    ProjectPanel: () => null,
    PublishPanel: () => null,
    StructurePanel: () => null,
}))

const renderShell = (overrides = {}) => render(
    <StudioShell
        document={{ projectMeta: {}, assets: [] }}
        selectedEntity={null}
        selectedEntityIds={[]}
        entities={[]}
        inspectorSections={[]}
        inspectorValues={{}}
        assetOptions={[]}
        {...overrides}
    />
)

describe('StudioShell transform shortcuts', () => {
    it.each([
        ['g', 'translate'],
        ['r', 'rotate'],
        ['s', 'scale'],
    ])('%s shows the drag-handle gizmo in the matching mode without arming the modal', (key, mode) => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onStartTransform })

        fireEvent.keyDown(window, { key })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent(mode)
        // G/R/S only switch the gizmo mode — X/Y/Z arms the modal
        expect(onStartTransform).not.toHaveBeenCalled()
    })

    it.each(['x', 'y', 'z'])('%s with a selection arms the modal with current gizmo mode + axis', (axis) => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onStartTransform })

        fireEvent.keyDown(window, { key: 'r' })        // set mode to rotate
        fireEvent.keyDown(window, { key: axis })        // arm modal

        expect(onStartTransform).toHaveBeenCalledWith('rotate', axis)
    })

    it('does not arm the modal when nothing is selected; constrains gizmo axis instead', () => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: [], onStartTransform })

        fireEvent.keyDown(window, { key: 'g' })
        fireEvent.keyDown(window, { key: 'x' })

        expect(onStartTransform).not.toHaveBeenCalled()
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('x')
    })

    it.each(['x', 'y', 'z'])('%s without selection constrains the active gizmo and toggles back', (axis) => {
        renderShell({ selectedEntityIds: [] })

        fireEvent.keyDown(window, { key: 'r' })
        fireEvent.keyDown(window, { key: axis })
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent(axis)

        fireEvent.keyDown(window, { key: axis })
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('all')
    })

    // Regression guard: Shift+D and Delete/Backspace are owned by StudioEditor's
    // keydown handler alone. When StudioShell also bound them, one keypress fired
    // the same duplicate/delete handler twice (two overlapping clones per Shift+D).
    it.each([
        ['Shift+D', { key: 'd', shiftKey: true }],
        ['Delete', { key: 'Delete' }],
        ['Backspace', { key: 'Backspace' }],
    ])('%s does not fire duplicate/delete from the shell (StudioEditor owns those keys)', (_label, event) => {
        const onDuplicateSelected = vi.fn()
        const onDeleteSelected = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onDuplicateSelected, onDeleteSelected })

        fireEvent.keyDown(window, event)

        expect(onDuplicateSelected).not.toHaveBeenCalled()
        expect(onDeleteSelected).not.toHaveBeenCalled()
    })

    it('clears the axis constraint when a different gizmo mode is selected', () => {
        renderShell({ selectedEntityIds: ['cube-1'] })

        fireEvent.keyDown(window, { key: 'r' })
        fireEvent.keyDown(window, { key: 'x' })
        fireEvent.keyDown(window, { key: 's' })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent('scale')
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('all')
    })
})

// Regression guard: Studio computed isMobile and ignored it — phones got the
// desktop drag-panel UI (UX audit 2026-07-10, mobile finding #1).
describe('StudioShell mobile chrome', () => {
    it('replaces floating panels and the control cluster with a bottom nav on phones', () => {
        renderShell({ isMobile: true })
        expect(screen.getByRole('navigation', { name: 'Studio windows' })).toBeInTheDocument()
        expect(screen.queryByTestId('gizmo-mode')).not.toBeInTheDocument()
    })

    it('opens one window at a time as a bottom sheet and toggles it closed', () => {
        renderShell({ isMobile: true })
        fireEvent.click(screen.getByRole('button', { name: 'Objects' }))
        expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Objects' }))
        expect(screen.queryByLabelText('Close panel')).not.toBeInTheDocument()
    })

    it('keeps the desktop chrome unchanged off phones', () => {
        renderShell({})
        expect(screen.queryByRole('navigation', { name: 'Studio windows' })).not.toBeInTheDocument()
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
    })
})

// The layers decision, 2026-09-23, unit 2: a new project opens bare — the bar,
// the room, Create and the hint — and everything returns with the first thing.
describe('StudioShell — a new project opens bare', () => {
    const OPEN_NEW = { space: true, things: true, connections: false, wall: false, lamps: false, handover: false }
    const OPEN_FULL = { space: true, things: true, connections: true, wall: true, lamps: true, handover: true }
    const NEW = { loaded: true, empty: true, held: false, open: OPEN_NEW }
    const FULL = { loaded: true, empty: false, held: true, open: OPEN_FULL }
    const LOADING = { loaded: false, empty: null, held: false, open: null }
    const inProject = {
        document: { projectMeta: { id: 'p1', title: 'first piece' }, assets: [] },
        liveProjectState: { spaceId: 'lab', spaceLabel: 'Lab' },
        onDriveImportUrl: () => {},
        onCommonsImport: () => {},
        onOpenNodeEditor: () => {},
        onOpenProjection: () => {},
    }
    const panels = () => [...document.querySelectorAll('[data-panel]')].map((el) => el.dataset.panel)
    // The bar's destinations — not the Desk | Perform switch in its slot, which is asserted on its own.
    const barLinks = () => [...document.querySelectorAll('.sbar-links > .sbar-link')].map((a) => a.textContent)
    const hasPerformSwitch = () => Boolean(document.querySelector('.sbar-switch'))
    const assets = () => JSON.parse(screen.getByTestId('assets').textContent)

    afterEach(() => {
        window.localStorage.removeItem(ALL_TOOLS_KEY)
    })

    it('shows the bar, the room and Create alone — no cluster, no other window, no Drive or Commons, no empty Files list', () => {
        renderShell({ ...inProject, layers: NEW })
        expect(screen.queryByTestId('gizmo-mode')).toBeNull()
        expect(panels()).toEqual(['Create'])
        // The one window cannot be closed into an empty screen.
        expect(document.querySelector('[data-panel="Create"]').dataset.closable).toBe('no')
        expect(assets()).toEqual({ drive: false, commons: false, wait: true })
        // Unit 3: the bar grows with the project.
        expect(barLinks()).toEqual(['Spaces', 'Studio', 'Tools', 'Wiki'])
        // Nothing to perform yet, so no Desk | Perform either.
        expect(hasPerformSwitch()).toBe(false)
    })

    it('decides nothing before the project has loaded — the screen is today\'s', () => {
        renderShell({ ...inProject, layers: LOADING })
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
        expect(panels()).toEqual(['Create', 'Objects'])
        expect(barLinks()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
    })

    it('a project that holds something opens exactly as before', () => {
        renderShell({ ...inProject, layers: FULL })
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
        expect(panels()).toEqual(['Create', 'Objects'])
        expect(document.querySelector('[data-panel="Create"]').dataset.closable).toBe('yes')
        expect(assets()).toEqual({ drive: true, commons: true, wait: false })
    })

    it('everything returns the moment the first thing is placed, with no reload', () => {
        const { rerender } = renderShell({ ...inProject, layers: NEW })
        expect(screen.queryByTestId('gizmo-mode')).toBeNull()
        rerender(
            <StudioShell
                {...inProject}
                layers={{ loaded: true, empty: false, held: true, open: { ...OPEN_NEW, connections: true, handover: true } }}
                selectedEntity={null} selectedEntityIds={[]} entities={[]} inspectorSections={[]} inspectorValues={{}} assetOptions={[]}
            />
        )
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
        expect(panels()).toEqual(['Create', 'Objects'])
        expect(barLinks()).toEqual(['Spaces', 'Studio', 'Nodes', 'Tools', 'Wiki'])
        // A connection is something to perform: the switch is in the bar's slot.
        expect(hasPerformSwitch()).toBe(true)
        expect([...document.querySelectorAll('.sbar-switch .sbar-link')].map((a) => a.textContent)).toEqual(['Desk', 'Perform'])
    })

    it('"All tools" gives a new project everything, bar included', () => {
        saveAllTools(true)
        renderShell({ ...inProject, layers: NEW })
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
        expect(panels()).toEqual(['Create', 'Objects'])
        expect(barLinks()).toEqual(['Spaces', 'Studio', 'Nodes', 'Projection', 'Tools', 'Light', 'Wiki'])
    })

    it('turning "All tools" on elsewhere reaches an open page at once', () => {
        renderShell({ ...inProject, layers: NEW })
        expect(screen.queryByTestId('gizmo-mode')).toBeNull()
        act(() => saveAllTools(true))
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
    })

    it('never touches the open jam', () => {
        renderShell({ ...inProject, document: { projectMeta: { id: 'open-jam', title: 'Open Jam' }, assets: [] }, layers: NEW })
        // The jam's own simple mode: its cluster, its Create, no bar.
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
        expect(panels()).toEqual(['Create'])
        expect(document.querySelector('.sbar')).toBeNull()
    })

    it('on a phone: Create alone until the first thing, then the full phone bar', () => {
        const { rerender } = renderShell({ ...inProject, layers: NEW, isMobile: true })
        const nav = () => [...screen.getByRole('navigation', { name: 'Studio windows' }).querySelectorAll('button')].map((b) => b.textContent)
        expect(nav()).toEqual(['Create'])
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
        expect(screen.queryByLabelText('Back to projects')).toBeNull()
        expect(screen.queryByLabelText('Open this project in the node editor')).toBeNull()
        rerender(
            <StudioShell
                {...inProject} isMobile layers={FULL}
                selectedEntity={null} selectedEntityIds={[]} entities={[]} inspectorSections={[]} inspectorValues={{}} assetOptions={[]}
            />
        )
        expect(nav()).toEqual(['Create', 'Objects', 'Scene', 'Share', 'Code'])
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
})
