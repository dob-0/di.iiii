import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from './AppErrorBoundary.jsx'

function Bomb() {
    throw new Error('panel exploded')
}

function Shell() {
    return (
        <MemoryRouter initialEntries={['/bad']}>
            <header data-testid="shell">
                <Link to="/good">go good</Link>
            </header>
            <RouteErrorBoundary>
                <Routes>
                    <Route path="/bad" element={<Bomb />} />
                    <Route path="/good" element={<div>good view</div>} />
                </Routes>
            </RouteErrorBoundary>
        </MemoryRouter>
    )
}

describe('RouteErrorBoundary (audit H12)', () => {
    it('shows a plain fallback, keeps the shell, logs, and offers a reload', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const reload = vi.fn()
        Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })
        render(<Shell />)
        expect(screen.getByTestId('view-failed')).toHaveTextContent('This view stopped working')
        expect(screen.getByTestId('view-failed')).toHaveTextContent('panel exploded')
        expect(screen.getByTestId('shell')).toBeInTheDocument()
        expect(err.mock.calls.some((c) => String(c[0]).includes('[RouteErrorBoundary]'))).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Reload this view' }))
        expect(reload).toHaveBeenCalled()
        err.mockRestore()
    })

    it('clears the failure when the address changes', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<Shell />)
        expect(screen.queryByText('good view')).toBeNull()
        fireEvent.click(screen.getByText('go good'))
        expect(screen.getByText('good view')).toBeInTheDocument()
        expect(screen.queryByTestId('view-failed')).toBeNull()
        err.mockRestore()
    })
})
