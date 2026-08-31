import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioShell from './StudioShell.jsx'

vi.mock('./StudioViewportLayout.jsx', () => ({
    default: ({ shared }) => <output data-testid="gizmo-axis">{shared.gizmoAxis || 'all'}</output>
}))
vi.mock('./StudioFloatingPanel.jsx', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('./StudioControlCluster.jsx', () => ({
    default: ({ gizmoMode }) => <output data-testid="gizmo-mode">{gizmoMode}</output>
}))
vi.mock('./StudioQuickInsert.jsx', () => ({ default: () => null }))
vi.mock('./StudioInspector.jsx', () => ({ default: () => null }))
vi.mock('./StudioShellPanels.jsx', () => ({
    ActivityPanel: () => null,
    AssetsPanel: () => null,
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
