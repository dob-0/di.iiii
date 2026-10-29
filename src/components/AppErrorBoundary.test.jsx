import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary, RouteErrorBoundary } from './AppErrorBoundary.jsx'

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
        expect(screen.getByRole('link', { name: 'Spaces' })).toHaveAttribute('href', '/spaces')
        expect(screen.getByRole('link', { name: 'di.iiii' })).toHaveAttribute('href', '/')
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

// The crash page is inline-styled so it still reads when CSS failed; its
// fallbacks must be the house values, not a second grey palette.
describe('the crash page in the house type (brand-plain-pages)', () => {
    it('a forced crash renders square corners, house fallbacks and mono for the message', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<AppErrorBoundary><Bomb /></AppErrorBoundary>)
        const box = screen.getByTestId('view-failed')
        const html = box.outerHTML.toLowerCase()
        for (const old of ['#eee', '#111', '#444', '#aaa']) expect(html).not.toContain(old)
        expect(html).toContain('#fff')
        expect(html).toContain('#000')
        expect(html).toContain('rgba(255, 255, 255, 0.12)')
        expect(html).toContain('rgba(255, 255, 255, 0.5)')
        expect(box.style.fontFamily).toMatch(/Inter, system-ui/)
        expect(box.style.borderRadius).toMatch(/^0(px)?$/)
        const button = screen.getByRole('button', { name: 'Reload this view' })
        expect(button.style.borderRadius).toMatch(/^0(px)?$/)
        expect(box.querySelector('code').style.fontFamily).toMatch(/mono/i)
        expect(box).not.toHaveTextContent('di home')
        err.mockRestore()
    })
})

// Audit F142 (2026-10-28): the page said "Work saved, nothing changed" on every
// failure, whatever the state of the save, and printed the raw error in code
// type as the second thing a visitor read.
describe('the crash page says only what is known', () => {
    it('makes no claim about the save, and folds the raw error under Details for helpers', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(<AppErrorBoundary><Bomb /></AppErrorBoundary>)
        const box = screen.getByTestId('view-failed')
        expect(box).not.toHaveTextContent(/Work saved/i)
        expect(box).not.toHaveTextContent(/nothing changed/i)
        expect(box).toHaveTextContent('Something went wrong while drawing this page.')
        const details = screen.getByTestId('view-failed-details')
        expect(details.tagName).toBe('DETAILS')
        expect(details.open).toBe(false)
        expect(details.querySelector('summary')).toHaveTextContent('Details for helpers')
        expect(details).toHaveTextContent('panel exploded')
        err.mockRestore()
    })
})
