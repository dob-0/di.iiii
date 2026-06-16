import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DesktopWorkspaceShell from './DesktopWorkspaceShell.jsx'

describe('DesktopWorkspaceShell', () => {
    it('switches dock families, keeps secondary actions in More, and uses fixed drawer sizes', () => {
        const renderPanelContent = vi.fn((entry) => <div>Panel: {entry.label}</div>)
        const hideUi = vi.fn()

        const { container } = render(
            <DesktopWorkspaceShell
                toolbarModel={{
                    identity: {
                        spaceButton: { key: 'space-label', label: 'Main Space', onClick: vi.fn() }
                    },
                    primaryActions: [
                        { key: 'save', label: 'Export Project', onClick: vi.fn() }
                    ],
                    historyActions: [],
                    modeButtons: {
                        interaction: { key: 'interaction-mode', label: 'Mode: Edit', onClick: vi.fn() },
                        presentation: [
                            { key: 'presentation-scene', label: '3D View', onClick: vi.fn(), isActive: true }
                        ]
                    },
                    drawerSections: [
                        {
                            key: 'display',
                            label: 'Display',
                            items: [
                                { key: 'hide-ui', label: 'Hide UI', onClick: hideUi }
                            ]
                        }
                    ]
                }}
                panelEntries={[
                    { key: 'view', label: 'View', workspaceGroup: 'scene', workspaceOrder: 10 },
                    { key: 'assets', label: 'Assets', workspaceGroup: 'files', workspaceOrder: 10 },
                    { key: 'inspector', label: 'Inspector', workspaceGroup: 'selected', workspaceOrder: 10 }
                ]}
                renderPanelContent={renderPanelContent}
                selectedCount={1}
                statusSummary="2 active tasks"
                statusItems={[
                    { key: 'upload', label: 'Uploading', detail: '1/2', percent: 50 }
                ]}
            />
        )

        const shell = container.querySelector('.workspace-shell')
        expect(shell?.classList.contains('is-dock-open')).toBe(true)
        expect(container.querySelector('.workspace-chrome-bridge')).toBeTruthy()
        expect(screen.getByText('Panel: View')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Wide' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
        expect(container.querySelector('.workspace-drawer')).toBeNull()
        expect(shell?.classList.contains('is-dock-collapsed')).toBe(true)

        fireEvent.click(screen.getByRole('button', { name: 'Files' }))
        expect(screen.getByText('Panel: Assets')).toBeTruthy()
        expect(container.querySelector('.workspace-drawer')?.getAttribute('data-drawer-size')).toBe('library')

        fireEvent.click(screen.getByRole('button', { name: 'Selected' }))
        expect(screen.getByText('Panel: Inspector')).toBeTruthy()
        expect(container.querySelector('.workspace-drawer')?.getAttribute('data-drawer-size')).toBe('detail')

        fireEvent.click(screen.getByRole('button', { name: 'More' }))
        const drawer = container.querySelector('.workspace-drawer')
        expect(drawer).toBeTruthy()
        expect(drawer?.getAttribute('data-drawer-size')).toBe('detail')
        expect(within(drawer).getByText('Uploading')).toBeTruthy()
        expect(within(drawer).queryByRole('button', { name: 'Export Project' })).toBeNull()
        fireEvent.click(within(drawer).getByRole('button', { name: 'Hide UI' }))
        expect(hideUi).toHaveBeenCalledTimes(1)
    })

})
