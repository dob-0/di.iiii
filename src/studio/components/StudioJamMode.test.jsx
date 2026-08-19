import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioControlCluster from './StudioControlCluster.jsx'
import { JamEditPanel, LibraryPanel } from './StudioShellPanels.jsx'
import { JAM_PRIMITIVES, PRIMITIVES } from '../../project/entityPalette.js'
import { JAM_ALL_TOOLS_KEY, isJamProject, loadJamAllTools, saveJamAllTools } from '../utils/jamMode.js'

// Minimal jam mode: at the communal open-jam project the same floating-window
// UI shrinks to the common tools — one Create window, reduced palette, no
// power-user chrome — with an "All tools" escape hatch back to the full editor.

const clusterProps = {
    spaceName: 'Open Space',
    projectName: 'Open Jam',
    editMode: 'navigate',
    onSetEditMode: vi.fn(),
    gizmoMode: 'translate',
    onSetGizmoMode: vi.fn(),
    openPanels: new Set(['create']),
    onTogglePanel: vi.fn(),
    onFullscreen: vi.fn(),
    onHideUI: vi.fn(),
    onBackToHub: vi.fn(),
    xrState: null,
    syncState: null,
    presence: null,
    onToggleSnap: vi.fn(),
    onTileLayout: vi.fn(),
    onStackLeft: vi.fn(),
    onStackRight: vi.fn(),
    onResetLayout: vi.fn(),
    onShowHelp: vi.fn(),
}

describe('minimal jam mode', () => {
    describe('StudioControlCluster', () => {
        it('renders all six windows and the Arrange section by default', () => {
            render(<StudioControlCluster {...clusterProps} />)
            for (const label of ['Create', 'Scene', 'World', 'Share', 'Code', 'Projects']) {
                expect(screen.getByRole('button', { name: label })).toBeTruthy()
            }
            expect(screen.getByText('Arrange')).toBeTruthy()
            expect(screen.getByTitle('Back to hub')).toBeTruthy()
        })

        it('jam minimal: only the Create window, no Arrange, no Hub — but Navigate/Edit stay', () => {
            render(
                <StudioControlCluster
                    {...clusterProps}
                    panelKeys={['create']}
                    minimal
                    onToggleAllTools={vi.fn()}
                />
            )
            expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
            for (const gone of ['Scene', 'World', 'Share', 'Code', 'Projects']) {
                expect(screen.queryByRole('button', { name: gone })).toBeNull()
            }
            expect(screen.queryByText('Arrange')).toBeNull()
            expect(screen.queryByTitle('Back to hub')).toBeNull()
            expect(screen.getByRole('button', { name: 'Navigate' })).toBeTruthy()
            expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
        })

        it('offers the All tools ⇄ Simple escape hatch when a toggle handler is given', () => {
            const onToggleAllTools = vi.fn()
            const { rerender } = render(
                <StudioControlCluster {...clusterProps} panelKeys={['create']} minimal onToggleAllTools={onToggleAllTools} />
            )
            const toggle = screen.getByRole('button', { name: /All tools/ })
            fireEvent.click(toggle)
            expect(onToggleAllTools).toHaveBeenCalledTimes(1)

            // Full editor at the jam still shows the way back to Simple.
            rerender(
                <StudioControlCluster {...clusterProps} allTools onToggleAllTools={onToggleAllTools} />
            )
            expect(screen.getByRole('button', { name: /Simple/ })).toBeTruthy()
            expect(screen.getByRole('button', { name: 'Code' })).toBeTruthy()
        })
    })

    describe('LibraryPanel palette props', () => {
        it('renders the reduced jam palette and hides the Lights section when empty', () => {
            render(<LibraryPanel onCreateEntity={vi.fn()} primitives={JAM_PRIMITIVES} lights={[]} />)
            for (const { label } of JAM_PRIMITIVES) {
                expect(screen.getByRole('button', { name: label })).toBeTruthy()
            }
            expect(screen.queryByRole('button', { name: 'portal' })).toBeNull()
            expect(screen.queryByText('Lights')).toBeNull()
        })

        it('defaults to the full palette', () => {
            render(<LibraryPanel onCreateEntity={vi.fn()} />)
            expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(PRIMITIVES.length)
            expect(screen.getByText('Lights')).toBeTruthy()
        })
    })

    describe('JamEditPanel', () => {
        const textEntity = {
            id: 'e1',
            type: 'text',
            name: 'my text',
            components: {
                text: { value: 'hello' },
                appearance: { color: '#ff0000' }
            }
        }

        it('lets a first-timer change their text through the normal patch pipeline', () => {
            const onInspectorChange = vi.fn()
            render(<JamEditPanel entity={textEntity} onInspectorChange={onInspectorChange} onDeleteSelected={vi.fn()} />)
            const area = screen.getByLabelText('Your text')
            expect(area.value).toBe('hello')
            fireEvent.change(area, { target: { value: 'hi jam' } })
            expect(onInspectorChange).toHaveBeenCalledWith('text', { value: 'hi jam' })
        })

        it('changes color via the appearance component and removes via the delete handler', () => {
            const onInspectorChange = vi.fn()
            const onDeleteSelected = vi.fn()
            render(<JamEditPanel entity={textEntity} onInspectorChange={onInspectorChange} onDeleteSelected={onDeleteSelected} />)
            fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#00ff00' } })
            expect(onInspectorChange).toHaveBeenCalledWith('appearance', { color: '#00ff00' })
            fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
            expect(onDeleteSelected).toHaveBeenCalledTimes(1)
        })

        it('non-text entities get color + remove but no text field; no appearance means no color', () => {
            const box = { id: 'e2', type: 'box', components: { appearance: { color: '#123456' } } }
            const { unmount } = render(<JamEditPanel entity={box} onInspectorChange={vi.fn()} onDeleteSelected={vi.fn()} />)
            expect(screen.queryByLabelText('Your text')).toBeNull()
            expect(screen.getByLabelText('Color')).toBeTruthy()
            unmount()

            const media = { id: 'e3', type: 'image', components: { media: {} } }
            render(<JamEditPanel entity={media} onInspectorChange={vi.fn()} onDeleteSelected={vi.fn()} />)
            expect(screen.queryByLabelText('Color')).toBeNull()
            expect(screen.getByRole('button', { name: /Remove/ })).toBeTruthy()
        })

        it('shows a tap hint when nothing is selected', () => {
            render(<JamEditPanel entity={null} onInspectorChange={vi.fn()} onDeleteSelected={null} />)
            expect(screen.getByText(/Tap an object/)).toBeTruthy()
        })
    })

    describe('jamMode utils', () => {
        beforeEach(() => {
            window.localStorage.removeItem(JAM_ALL_TOOLS_KEY)
        })

        it('detects the open-jam project id only', () => {
            expect(isJamProject('open-jam')).toBe(true)
            expect(isJamProject('my-project')).toBe(false)
            expect(isJamProject(undefined)).toBe(false)
        })

        it('persists and clears the All tools opt-out', () => {
            expect(loadJamAllTools()).toBe(false)
            saveJamAllTools(true)
            expect(loadJamAllTools()).toBe(true)
            saveJamAllTools(false)
            expect(loadJamAllTools()).toBe(false)
        })
    })
})
