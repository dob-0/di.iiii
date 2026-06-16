import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MobileEditorShell from './MobileEditorShell.jsx'

describe('MobileEditorShell', () => {
    it('uses a connected workbench, preserves active panels per group, and shows a friendly selected empty state', () => {
        const renderPanelContent = vi.fn((entry) => <div>Panel: {entry.label}</div>)

        const { container } = render(
            <MobileEditorShell
                mobileModel={{
                    spaceButton: { key: 'space', label: 'Play Room', onClick: vi.fn() },
                    interactionModeButton: { key: 'mode', label: 'Edit', onClick: vi.fn() },
                    presentationButtons: [
                        { key: 'scene', label: '3D', onClick: vi.fn(), isActive: true },
                        { key: 'camera', label: '2D', onClick: vi.fn() },
                        { key: 'code', label: 'Code', onClick: vi.fn() }
                    ],
                    panelEntries: [
                        { key: 'view', label: 'View', mobileGroup: 'scene', mobileOrder: 10 },
                        { key: 'world', label: 'World', mobileGroup: 'scene', mobileOrder: 20 },
                        { key: 'assets', label: 'Assets', mobileGroup: 'files', mobileOrder: 10 },
                        {
                            key: 'inspector',
                            label: 'Inspector',
                            mobileGroup: 'selected',
                            mobileOrder: 10
                        }
                    ],
                    moreSections: []
                }}
                renderPanelContent={renderPanelContent}
                selectedCount={0}
                statusSummary="All clear"
                statusItems={[]}
            />
        )

        expect(container.querySelector('.mobile-workbench.is-collapsed')).toBeTruthy()
        expect(container.querySelector('.mobile-sheet-scrim')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.getByText('Panel: View')).toBeTruthy()
        expect(container.querySelector('.mobile-workbench.is-compact-open')).toBeTruthy()

        fireEvent.click(screen.getByRole('tab', { name: 'World' }))
        expect(screen.getByText('Panel: World')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Files' }))
        expect(screen.getByText('Panel: Assets')).toBeTruthy()
        expect(screen.queryByText('Panel: View')).toBeNull()
        expect(screen.queryByText('Panel: World')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(screen.getByText('Panel: World')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(container.querySelector('.mobile-workbench.is-collapsed')).toBeTruthy()

        const callCountBeforeSelected = renderPanelContent.mock.calls.length
        fireEvent.click(screen.getByRole('button', { name: 'Selected' }))
        expect(screen.getByText('Nothing selected')).toBeTruthy()
        expect(renderPanelContent).toHaveBeenCalledTimes(callCountBeforeSelected)
    })

    it('renders status and actions inside the taller More workbench state', () => {
        const exportProject = vi.fn()

        const { container } = render(
            <MobileEditorShell
                mobileModel={{
                    spaceButton: { key: 'space', label: 'Play Room', onClick: vi.fn() },
                    interactionModeButton: null,
                    presentationButtons: [],
                    panelEntries: [],
                    moreSections: [
                        {
                            key: 'project',
                            label: 'Project',
                            items: [
                                { key: 'save', label: 'Export Project', onClick: exportProject }
                            ]
                        }
                    ]
                }}
                renderPanelContent={vi.fn()}
                selectedCount={0}
                statusSummary="2 active tasks"
                statusItems={[
                    { key: 'upload', label: 'Uploading Assets', detail: '1/2', percent: 50 }
                ]}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        expect(screen.getByText('Uploading Assets')).toBeTruthy()
        expect(container.querySelector('.mobile-workbench.is-utility-open')).toBeTruthy()
        expect(container.querySelector('.mobile-sheet-scrim')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Export Project' }))
        expect(exportProject).toHaveBeenCalledTimes(1)
    })

    it('keeps quick AR and VR launch buttons visible above the mobile navigation', () => {
        const enterAr = vi.fn()
        const enterVr = vi.fn()
        const showDebug = vi.fn()

        render(
            <MobileEditorShell
                mobileModel={{
                    spaceButton: { key: 'space', label: 'Play Room', onClick: vi.fn() },
                    interactionModeButton: null,
                    presentationButtons: [],
                    xrButtons: [
                        { key: 'enter-vr', label: 'Enter VR', onClick: enterVr },
                        { key: 'enter-ar', label: 'Enter AR', onClick: enterAr },
                        { key: 'xr-debug', label: 'XR Debug', onClick: showDebug }
                    ],
                    panelEntries: [],
                    moreSections: []
                }}
                renderPanelContent={vi.fn()}
            />
        )

        const launcher = screen.getByLabelText('XR launch controls')
        const arButton = within(launcher).getByRole('button', { name: 'AR' })
        const vrButton = within(launcher).getByRole('button', { name: 'VR' })

        expect(within(launcher).queryByRole('button', { name: 'XR Debug' })).toBeNull()
        fireEvent.click(arButton)
        fireEvent.click(vrButton)

        expect(enterAr).toHaveBeenCalledTimes(1)
        expect(enterVr).toHaveBeenCalledTimes(1)
        expect(showDebug).not.toHaveBeenCalled()
    })
})
