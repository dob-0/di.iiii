import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PreferencesPage from './PreferencesPage.jsx'

// UX audit 2026-10-28 (F045, F108, F109, F110, F150): the admin console was
// titled "Ops Graph", its nav said "Estate" and "Inspect" with glyphs for
// icons, a metric said "Socket", the quick actions were buttons whose label was
// the state ("Editing Locked"), the exit said "Back to Editor", and Refresh
// reloaded the whole page.

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ requireAuth: true, loading: false, role: 'admin' })
}))

// Each section fetches on mount; counting mounts is how a list refresh shows.
const manageMounts = vi.fn()
vi.mock('./preferences/AdminManageSection.jsx', () => ({
    default: () => { manageMounts(); return <div>manage list</div> }
}))

vi.mock('./preferences/EstateSection.jsx', () => ({ default: () => <div>machines map</div> }))

const toggleEditLock = vi.fn()
vi.mock('../hooks/usePreferencesData.js', () => ({
    usePreferencesData: () => ({
        sync: { spaceId: 'main', isSocketConnected: true },
        objects: [],
        entries: [],
        runtimePreviewEntries: [],
        signalNodes: [],
        activityPreviewItems: [],
        managementButtons: [
            { key: 'edit-lock', kind: 'switch', label: 'Lock editing', checked: false, detail: 'When on, nobody can change this space. Turn it off to undo.', onClick: toggleEditLock },
            { key: 'publish', label: 'Publish to the server now', onClick: vi.fn() }
        ]
    })
}))

const renderAdmin = () => render(<PreferencesPage onNavigateToEditor={vi.fn()} />)

describe('admin console in plain words', () => {
    it('names the page by its job, not "Ops Graph", "Socket", "Estate" or "Inspect"', () => {
        renderAdmin()
        expect(screen.getByRole('heading', { level: 1, name: 'Spaces and who can see them' })).toBeInTheDocument()
        const text = document.body.textContent
        for (const word of ['Ops Graph', 'Admin Management', 'Socket', 'Estate', 'Inspect', 'Back to Editor']) {
            expect(text).not.toContain(word)
        }
        expect(screen.getByRole('button', { name: 'Back to the space' })).toBeInTheDocument()
    })

    it('the nav is plain labels in two named groups, no glyph icons', () => {
        const { container } = renderAdmin()
        const nav = screen.getByRole('navigation', { name: 'Admin sections' })
        expect(within(nav).getByText('Spaces and people')).toBeInTheDocument()
        expect(within(nav).getByText('Operator tools (staff)')).toBeInTheDocument()
        expect(within(nav).getByRole('button', { name: 'Machines' })).toBeInTheDocument()
        expect(container.querySelectorAll('.preferences-nav-glyph')).toHaveLength(0)
    })

    it('a quick action that is on or off is a switch with its state, who it touches, and the same click to undo', () => {
        renderAdmin()
        fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
        expect(screen.getByRole('heading', { level: 1, name: 'Operator tools' })).toBeInTheDocument()
        const lock = screen.getByRole('switch', { name: 'Lock editing' })
        expect(lock).toHaveAttribute('aria-checked', 'false')
        expect(lock).toHaveTextContent('Off')
        expect(lock).toHaveAccessibleDescription('When on, nobody can change this space. Turn it off to undo.')
        fireEvent.click(lock)
        expect(toggleEditLock).toHaveBeenCalledTimes(1)
        // Publish is an action, so it stays a button named as one.
        expect(screen.getByRole('button', { name: 'Publish to the server now' })).toBeInTheDocument()
    })

    it('Refresh loads the list again and keeps the open section, without reloading the page', () => {
        renderAdmin()
        fireEvent.click(screen.getByRole('button', { name: 'Machines' }))
        fireEvent.click(screen.getByRole('button', { name: 'Spaces and users' }))
        const before = manageMounts.mock.calls.length
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
        expect(manageMounts.mock.calls.length).toBe(before + 1)
        expect(screen.getByText('manage list')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Spaces and users' })).toHaveAttribute('aria-current', 'page')
    })
})
