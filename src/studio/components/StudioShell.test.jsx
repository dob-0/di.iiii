import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioShell from './StudioShell.jsx'
import { ALL_TOOLS_KEY, saveAllTools } from '../utils/jamMode.js'
import { clearViewportChoices } from '../utils/viewportMode.js'

const WORKSPACE_KEY = 'dii.studio.workspace.v1'

vi.mock('./StudioViewportLayout.jsx', () => ({
    default: ({ shared }) => (
        <>
            <output data-testid="gizmo-axis" data-edit-mode={shared.editMode} data-help={shared.showHelp ? 'open' : 'closed'}>{shared.gizmoAxis || 'all'}</output>
            <output data-testid="edit-mode">{shared.editMode}</output>
            <output data-testid="viewport-page-only">{shared.pageOnly ? 'yes' : 'no'}</output>
        </>
    )
}))
vi.mock('./StudioFloatingPanel.jsx', () => ({ default: ({ title, onClose, windowKey, children }) => <div className="sfp-shell" data-window-key={windowKey} data-panel={title} data-closable={onClose ? 'yes' : 'no'}>{onClose && <button className="sfp-close" onClick={onClose}>x</button>}{children}</div> }))
vi.mock('./StudioControlCluster.jsx', () => ({
    default: ({ gizmoMode, previewUrl, pageOnly, onAddScene }) => (
        <div className="scc-wrap" data-page-only={pageOnly ? 'yes' : 'no'}>
            <button type="button" data-window-key="scene">Objects</button>
            {pageOnly && onAddScene && <button type="button" onClick={onAddScene}>Add a scene</button>}
            <output data-testid="gizmo-mode" data-preview-url={previewUrl || ''}>{gizmoMode}</output>
        </div>
    )
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
    LibraryPanel: ({ onCreateEntity }) => <button type="button" onClick={() => onCreateEntity?.('box')}>box</button>,
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
    ])('%s with a selection picks the gizmo mode AND starts the transform at once (Blender grab)', (key, mode) => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onStartTransform })

        fireEvent.keyDown(window, { key })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent(mode)
        // owner 2026-10-13: "in Select I can't move" — no handle to find, the mouse moves it from the key
        expect(onStartTransform).toHaveBeenCalledWith(mode, null)
    })

    it.each([
        ['g', 'translate'],
        ['r', 'rotate'],
        ['s', 'scale'],
    ])('%s with nothing selected only picks the gizmo mode', (key, mode) => {
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: [], onStartTransform })

        fireEvent.keyDown(window, { key })

        expect(screen.getByTestId('gizmo-mode')).toHaveTextContent(mode)
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

    it('has Undo and Redo and the save line in the top bar: a phone has no Ctrl key', () => {
        const onUndo = vi.fn()
        const onRedo = vi.fn()
        renderShell({
            isMobile: true,
            onUndo,
            onRedo,
            editHistory: { steps: [{ id: 1, label: 'Add box', applied: true }], cursor: 1 },
            syncState: { pendingOpCount: 1 }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
        // One row of its own inside the bar, so the long save text can never push a third row.
        const row = document.querySelector('.smb-topbar > .smb-status-row')
        expect(row, 'status row is a direct child of the phone bar').toBeTruthy()
        expect(row.querySelector('.smb-undo-redo')).toBeTruthy()
        expect(row.querySelector('.smb-save-line')).toBeTruthy()
        expect(onUndo).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
        expect(document.querySelector('[data-save-state]')).toHaveTextContent('Saving\u2026')
    })

    it('opens one window at a time as a bottom sheet and toggles it closed', () => {
        renderShell({ isMobile: true })
        fireEvent.click(screen.getByRole('button', { name: 'Objects' }))
        expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Objects' }))
        expect(screen.queryByLabelText('Close panel')).not.toBeInTheDocument()
    })

    it('tells floating notices how tall the bottom bar is, only while it is drawn', () => {
        const root = document.documentElement
        const { unmount } = renderShell({ isMobile: true })
        expect(root.classList.contains('has-studio-bottom-bar')).toBe(true)
        unmount()
        expect(root.classList.contains('has-studio-bottom-bar')).toBe(false)
        renderShell({ isMobile: false })
        expect(root.classList.contains('has-studio-bottom-bar')).toBe(false)
    })

    it('keeps the desktop chrome unchanged off phones', () => {
        renderShell({})
        expect(screen.queryByRole('navigation', { name: 'Studio windows' })).not.toBeInTheDocument()
        expect(screen.getByTestId('gizmo-mode')).toBeInTheDocument()
    })
})

// The Preview button (owner 2026-10-13): the editor works out the project's VIEW address, the shell carries it.
describe('StudioShell — the Preview address reaches the control cluster', () => {
    it('hands previewUrl to the cluster, and nothing when the editor has none', () => {
        const { unmount } = renderShell({ previewUrl: 'http://diiii.localhost/moxir/v2-9' })
        expect(screen.getByTestId('gizmo-mode')).toHaveAttribute('data-preview-url', 'http://diiii.localhost/moxir/v2-9')
        unmount()
        renderShell({})
        expect(screen.getByTestId('gizmo-mode')).toHaveAttribute('data-preview-url', '')
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
        window.history.replaceState(null, '', '/')
        // the shell saves the windows it had open; a later test must not inherit them
        window.localStorage.clear()
    })

    it('draws the Code window on an empty project when the address asks for it (?open=files)', () => {
        window.history.replaceState(null, '', '/?open=files')
        renderShell({ ...inProject, layers: NEW })
        expect(panels()).toContain('Code')
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

    it('on a phone, ?open=files opens the Code sheet on an empty project', () => {
        window.history.replaceState(null, '', '/?open=files')
        renderShell({ ...inProject, layers: NEW, isMobile: true })
        expect(document.querySelector('.smb-sheet-head')?.textContent).toContain('Code')
    })

    it('on a phone: Create alone until the first thing, then the full phone bar', () => {
        const { rerender } = renderShell({ ...inProject, layers: NEW, isMobile: true })
        const nav = () => [...screen.getByRole('navigation', { name: 'Studio windows' }).querySelectorAll('button')].map((b) => b.textContent)
        expect(nav()).toEqual(['Create'])
        expect(screen.queryByRole('radio', { name: 'Edit' })).toBeNull()
        expect(screen.queryByLabelText('Back to projects')).toBeNull()
        expect(screen.queryByLabelText('Open this project in the node editor')).toBeNull()
        rerender(
            <StudioShell
                {...inProject} isMobile layers={FULL}
                selectedEntity={null} selectedEntityIds={[]} entities={[]} inspectorSections={[]} inspectorValues={{}} assetOptions={[]}
            />
        )
        expect(nav()).toEqual(['Create', 'Objects', 'Scene', 'Share', 'Code'])
        expect(screen.getByRole('radio', { name: 'Edit' })).toBeInTheDocument()
    })

    // 2026-09-27: the phone header offered Projection from the first thing on, while
    // the bar held it back until the first wire. Studio's jump buttons ask the bar's
    // own rule (SurfaceBar layerReached) now.
    it('on a phone, offers Nodes and Projection only where the bar does', () => {
        const ONE_THING = { loaded: true, empty: false, held: true, open: { ...OPEN_NEW, connections: true, handover: true } }
        const WALL = { ...ONE_THING, open: { ...ONE_THING.open, wall: true } }
        const rest = { selectedEntity: null, selectedEntityIds: [], entities: [], inspectorSections: [], inspectorValues: {}, assetOptions: [] }
        const nodes = () => screen.queryByLabelText('Open this project in the node editor')
        const wall = () => screen.queryByLabelText('Put this project on a wall')

        const { rerender } = renderShell({ ...inProject, layers: ONE_THING, isMobile: true })
        expect(nodes()).not.toBeNull()
        expect(wall()).toBeNull()
        expect(barLinks()).not.toContain('Projection')

        rerender(<StudioShell {...inProject} {...rest} isMobile layers={WALL} />)
        expect(wall()).not.toBeNull()
        expect(barLinks()).toContain('Projection')

        rerender(<StudioShell {...inProject} {...rest} isMobile layers={ONE_THING} />)
        expect(wall()).toBeNull()
        act(() => saveAllTools(true))
        expect(wall()).not.toBeNull()
    })
})

// N581 (2026-10-15): X/Y/Z armed the modal for ANY selection. With a selection that cannot
// move (every object in it locked) the viewport never mounted the operator, nobody cancelled
// the op, and every editor shortcut — Escape, A, Alt+A, Delete — stayed dead until a reload.
describe('StudioShell transform shortcuts and a locked selection', () => {
    const locked = { id: 'hall', name: 'hall', components: { runtime: { locked: true } } }
    const free = { id: 'lamp', name: 'lamp', components: {} }

    it('x on a selection that is entirely locked never arms the modal; it constrains the gizmo instead', () => {
        const onStartTransform = vi.fn()
        renderShell({ entities: [locked, free], selectedEntityIds: ['hall'], onStartTransform })

        fireEvent.keyDown(window, { key: 'x' })

        expect(onStartTransform).not.toHaveBeenCalled()
        expect(screen.getByTestId('gizmo-axis')).toHaveTextContent('x')
    })

    it('x on a mixed selection arms the modal (the locked one stays where it is)', () => {
        const onStartTransform = vi.fn()
        renderShell({ entities: [locked, free], selectedEntityIds: ['hall', 'lamp'], onStartTransform })

        fireEvent.keyDown(window, { key: 'x' })

        expect(onStartTransform).toHaveBeenCalledWith('translate', 'x')
    })
})

// Owner 2026-10-28 (cinema-house): a project that is a web page opened Studio on the empty 3D grid with Create
// (primitives, lights) open on top. Studio now opens the page and leaves Create to the person.
describe('StudioShell — a code project does not open Create by itself', () => {
    const OPEN = { space: true, things: true, connections: false, wall: false, lamps: false, handover: false }
    const PAGE = { loaded: true, empty: false, held: true, open: OPEN }
    const codeDoc = { projectMeta: { id: 'code-p', title: 'Page' }, assets: [], presentationState: { mode: 'scene', entryView: 'scene', codeFiles: [{ name: 'index.html', content: '<p>hi</p>' }] } }
    const sceneDoc = { projectMeta: { id: 'scene-p', title: 'Room' }, assets: [], entities: [{ id: 'e1', type: 'box' }], presentationState: { mode: 'scene' } }
    const panels = () => [...document.querySelectorAll('[data-panel]')].map((el) => el.dataset.panel)

    afterEach(() => {
        window.history.replaceState(null, '', '/')
        window.localStorage.clear()
    })

    it('a project holding a page opens without the Create window', () => {
        renderShell({ document: codeDoc, layers: PAGE })
        expect(panels()).not.toContain('Create')
        // S16 (2026-10-29): nor the Objects window; a page project shows page tools only (next describe).
        expect(panels()).not.toContain('Objects')
    })

    it('a project holding a page still opens Create when the address asks for it (?open=create)', () => {
        window.history.replaceState(null, '', '/?open=create')
        renderShell({ document: codeDoc, layers: PAGE })
        expect(panels()).toContain('Create')
    })

    it('a scene project keeps Create open, as before', () => {
        renderShell({ document: sceneDoc, layers: PAGE })
        expect(panels()).toEqual(['Create', 'Objects'])
    })

    it('a project with a page and nothing decided yet (loading) keeps today\'s screen', () => {
        renderShell({ document: codeDoc, layers: { loaded: false, empty: null, held: false, open: null } })
        expect(panels()).toContain('Create')
    })

    it('the "Write code" door on a bare project shows the Code window and no Create', () => {
        window.history.replaceState(null, '', '/?open=files')
        renderShell({ document: { projectMeta: { id: 'fresh', title: 'first' }, assets: [] }, layers: { loaded: true, empty: true, held: false, open: OPEN } })
        expect(panels()).toEqual(['Code'])
    })

    it('the same bare project opened for a scene (no ?open=files) still shows Create alone', () => {
        renderShell({ document: { projectMeta: { id: 'fresh2', title: 'first' }, assets: [] }, layers: { loaded: true, empty: true, held: false, open: OPEN } })
        expect(panels()).toEqual(['Create'])
    })
})

describe('View | Edit (owner 2026-10-28)', () => {
    afterEach(() => { window.history.replaceState(null, '', '/') })
    const holding = { document: { projectMeta: {}, assets: [], entities: [{ id: 'cube-1' }] }, entities: [{ id: 'cube-1' }] }

    it('one View | Edit switch at the top; View is the start, Edit is the Edit tool, View the Navigate tool', () => {
        renderShell(holding)
        const group = screen.getByRole('radiogroup', { name: 'View or Edit' })
        expect(group).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: 'View' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('navigate')
        fireEvent.click(screen.getByRole('radio', { name: 'Edit' }))
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('edit')
        expect(screen.getByRole('radio', { name: 'Edit' })).toHaveAttribute('aria-checked', 'true')
        fireEvent.keyDown(window, { key: 'e' }) // the E key is the same switch
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('navigate')
        expect(screen.getByRole('radio', { name: 'View' })).toHaveAttribute('aria-checked', 'true')
    })

    it('the switch is one Tab stop and the arrow keys flip it (a radio group)', () => {
        renderShell(holding)
        const view = screen.getByRole('radio', { name: 'View' })
        expect(view).toHaveAttribute('tabindex', '0')
        expect(screen.getByRole('radio', { name: 'Edit' })).toHaveAttribute('tabindex', '-1')
        fireEvent.keyDown(view, { key: 'ArrowRight' })
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('edit')
        expect(screen.getByRole('radio', { name: 'Edit' })).toHaveFocus()
    })

    it('adding from Create puts the Studio in Edit, so the first pull moves the new thing', () => {
        const onCreateEntity = vi.fn()
        renderShell({ ...holding, onCreateEntity })
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('navigate')
        fireEvent.click(screen.getByRole('button', { name: 'box' }))
        expect(onCreateEntity).toHaveBeenCalledWith('box')
        expect(screen.getByTestId('edit-mode')).toHaveTextContent('edit')
    })
})

// S58: the Studio keyboard (WCAG 2.1.1 / 2.1.4, ux audit F002 + F127, 2026-10-28)
describe('StudioShell keyboard: Tab, letter keys, Esc', () => {
    const mode = () => screen.getByTestId('gizmo-axis').dataset.editMode
    afterEach(() => { window.localStorage.clear() })

    it('Tab is the browser\'s: it is not stopped and does not flip Navigate/Edit', () => {
        renderShell()
        expect(mode()).toBe('navigate')
        const notStopped = fireEvent.keyDown(window, { key: 'Tab' })
        expect(notStopped).toBe(true)
        expect(mode()).toBe('navigate')
    })

    it('control: with letter keys on, H hides the windows', () => {
        renderShell()
        expect(document.querySelectorAll('[data-panel]').length).toBeGreaterThan(0)
        fireEvent.keyDown(window, { key: 'h' })
        expect(document.querySelectorAll('[data-panel]').length).toBe(0)
    })

    it('E still flips Navigate and Edit', () => {
        renderShell()
        fireEvent.keyDown(window, { key: 'e' })
        expect(mode()).toBe('edit')
        fireEvent.keyDown(window, { key: 'E' })
        expect(mode()).toBe('navigate')
    })

    it('"Blender keys" keeps Tab = Navigate/Edit as an opt-in', () => {
        window.localStorage.setItem('di.studio.keys', JSON.stringify({ blenderTab: true }))
        renderShell()
        const notStopped = fireEvent.keyDown(window, { key: 'Tab' })
        expect(notStopped).toBe(false)
        expect(mode()).toBe('edit')
    })

    it('with letter keys switched off, H, E and G do nothing; Esc and Ctrl keys are not letter keys', () => {
        window.localStorage.setItem('di.studio.keys', JSON.stringify({ letters: false }))
        const onStartTransform = vi.fn()
        renderShell({ selectedEntityIds: ['cube-1'], onStartTransform })
        fireEvent.keyDown(window, { key: 'e' })
        expect(mode()).toBe('navigate')
        fireEvent.keyDown(window, { key: 'g' })
        expect(onStartTransform).not.toHaveBeenCalled()
        fireEvent.keyDown(window, { key: 'h' })
        expect(document.querySelectorAll('[data-panel]').length).toBeGreaterThan(0)
    })

    it('Esc closes the window the focus is in, but not while something is selected (that Esc deselects)', () => {
        window.localStorage.setItem(ALL_TOOLS_KEY, '1')
        const { unmount } = renderShell({ selectedEntityIds: ['cube-1'] })
        const panel = document.querySelector('.sfp-shell[data-panel="Objects"]')
        const close = panel.querySelector('.sfp-close')
        const onClick = vi.fn()
        close.addEventListener('click', onClick)
        fireEvent.keyDown(close, { key: 'Escape' })
        expect(onClick).not.toHaveBeenCalled()
        unmount()
        renderShell()
        const close2 = document.querySelector('.sfp-shell[data-panel="Objects"] .sfp-close')
        const onClick2 = vi.fn()
        close2.addEventListener('click', onClick2)
        close2.focus()
        fireEvent.keyDown(close2, { key: 'Escape' })
        expect(onClick2).toHaveBeenCalledTimes(1)
        // WCAG 2.4.3: the focus goes to the button that opens that window again, not to <body>
        expect(document.activeElement).toBe(document.querySelector('.scc-wrap [data-window-key="scene"]'))
    })

    it('Esc with the focus on the page (not in a window) closes the window opened last, one per press', () => {
        window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ open: ['scene', 'world', 'projects'] }))
        renderShell()
        const shells = () => [...document.querySelectorAll('.sfp-shell[data-window-key]')].map((el) => el.dataset.windowKey)
        expect(shells().sort()).toEqual(['projects', 'scene', 'world'])
        document.body.focus()
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(shells().sort()).toEqual(['scene', 'world'])
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(shells()).toEqual(['scene'])
    })

    it('Esc with the help open closes only the help; the windows stay (one thing per press)', () => {
        window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ open: ['scene', 'world', 'projects'] }))
        renderShell()
        const shells = () => [...document.querySelectorAll('.sfp-shell[data-window-key]')].map((el) => el.dataset.windowKey)
        const help = () => screen.getByTestId('gizmo-axis').dataset.help
        fireEvent.keyDown(document.body, { key: '?' })
        expect(help()).toBe('open')
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(help()).toBe('closed')
        expect(shells().sort()).toEqual(['projects', 'scene', 'world'])
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(shells().sort()).toEqual(['scene', 'world'])
    })
    it('Esc closes the help also with the focus on a checkbox inside it; in a text field it first leaves the field', async () => {
        renderShell()
        const help = () => screen.getByTestId('gizmo-axis').dataset.help
        fireEvent.keyDown(document.body, { key: '?' })
        expect(help()).toBe('open')
        const box = document.createElement('input')
        box.type = 'checkbox'
        document.body.appendChild(box)
        box.focus()
        fireEvent.keyDown(box, { key: 'Escape' })
        expect(help()).toBe('closed')
        // text field: Esc leaves the field and closes nothing; letters stay typing
        fireEvent.keyDown(document.body, { key: '?' })
        const text = document.createElement('input')
        text.type = 'text'
        document.body.appendChild(text)
        text.focus()
        fireEvent.keyDown(text, { key: 'h' })
        fireEvent.keyDown(text, { key: 'Escape' })
        await act(() => new Promise((r) => setTimeout(r, 0)))
        expect(help()).toBe('open')
        expect(document.activeElement).not.toBe(text)
        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(help()).toBe('closed')
        box.remove(); text.remove()
    })
    it('Esc in a rename field cancels the rename: leaving the field does not save it', async () => {
        // The Projects panel and the object list rename fields: Esc cancels, blur saves. React runs the field's
        // own Esc first; the shell must not blur the field while it is still on the page, or the cancel becomes a save.
        const saved = []
        const RenameField = () => {
            const [editing, setEditing] = useState(true)
            const [draft, setDraft] = useState('old')
            if (!editing) return null
            return (
                <input
                    aria-label="Project title"
                    value={draft}
                    ref={(el) => el?.focus()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { saved.push(draft); setEditing(false) }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
                />
            )
        }
        renderShell()
        render(<RenameField />)
        const field = screen.getByLabelText('Project title')
        fireEvent.change(field, { target: { value: 'typo' } })
        fireEvent.keyDown(field, { key: 'Escape' })
        await act(() => new Promise((r) => setTimeout(r, 0)))
        expect(screen.queryByLabelText('Project title')).toBeNull()
        expect(saved).toEqual([])
    })
})

// S16 (audit F017, F139, F001; 2026-10-29): a page project drew the 3D tools around its page — Create, Objects,
// Navigate / Edit / Select / Walk / Fly, the split buttons, the axis ball and 'Perspective'. It now shows page tools
// only; "Add a scene" brings every 3D tool back, and "All tools" keeps the full screen (nothing is lost).
describe('StudioShell — a page project shows page tools only', () => {
    const OPEN = { space: true, things: true, connections: false, wall: false, lamps: false, handover: false }
    const PAGE = { loaded: true, empty: false, held: true, open: OPEN }
    const pageDoc = (id) => ({ projectMeta: { id, title: 'Page' }, assets: [], presentationState: { mode: 'scene', entryView: 'code', codeFiles: [{ name: 'index.html', content: '<p>hi</p>' }] } })
    const sceneDoc = { projectMeta: { id: 's16-scene', title: 'Room' }, assets: [], entities: [{ id: 'e1', type: 'box' }], presentationState: { mode: 'scene' } }
    const panels = () => [...document.querySelectorAll('[data-panel]')].map((el) => el.dataset.panel)
    const threeD = () => ({
        panels: panels().filter((name) => ['Create', 'Objects', 'Scene'].includes(name)),
        switch: screen.queryByRole('radiogroup', { name: 'View or Edit' }) ? 1 : 0,
        viewport: screen.getByTestId('viewport-page-only').textContent,
        cluster: document.querySelector('.scc-wrap')?.dataset.pageOnly,
    })

    afterEach(() => {
        saveAllTools(false)
        clearViewportChoices()
        window.history.replaceState(null, '', '/')
        window.localStorage.clear()
    })

    it('a page project draws no 3D window, no View | Edit, and tells the viewport and the cluster', () => {
        renderShell({ document: pageDoc('s16-a'), layers: PAGE })
        expect(threeD()).toEqual({ panels: [], switch: 0, viewport: 'yes', cluster: 'yes' })
    })

    it('a scene project is unchanged', () => {
        renderShell({ document: sceneDoc, layers: PAGE })
        expect(threeD()).toEqual({ panels: ['Create', 'Objects'], switch: 1, viewport: 'no', cluster: 'no' })
    })

    it('a page that also holds a scene keeps its 3D tools', () => {
        renderShell({ document: { ...pageDoc('s16-b'), entities: [{ id: 'e1', type: 'box' }] }, layers: PAGE })
        expect(threeD().viewport).toBe('no')
        expect(threeD().switch).toBe(1)
    })

    it('"Add a scene" brings every 3D tool back, with Create open', () => {
        renderShell({ document: pageDoc('s16-c'), layers: PAGE })
        fireEvent.click(screen.getByRole('button', { name: 'Add a scene' }))
        expect(threeD()).toEqual({ panels: ['Create', 'Objects'], switch: 1, viewport: 'no', cluster: 'no' })
    })

    it('on a phone: Share and Code in the bar, no View | Edit, and "Add a scene" opens Create', () => {
        renderShell({ document: pageDoc('s16-e'), layers: PAGE, isMobile: true })
        const bar = () => [...screen.getByRole('navigation', { name: 'Studio windows' }).querySelectorAll('button')].map((b) => b.textContent)
        expect(bar()).toEqual(['Share', 'Code', 'Add a scene'])
        expect(screen.queryByRole('radiogroup', { name: 'View or Edit' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Add a scene' }))
        expect(bar()).toEqual(['Create', 'Objects', 'Scene', 'Share', 'Code'])
        expect(document.querySelector('.smb-sheet-head')?.textContent).toContain('Create')
    })

    it('"All tools" keeps the full screen on a page project', () => {
        saveAllTools(true)
        renderShell({ document: pageDoc('s16-d'), layers: PAGE })
        expect(threeD().viewport).toBe('no')
        expect(threeD().cluster).toBe('no')
        expect(threeD().switch).toBe(1)
    })
})
