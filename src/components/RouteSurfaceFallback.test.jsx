import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RouteSurfaceFallback from './RouteSurfaceFallback.jsx'

// The loading screen is black with a spinner and no drawn words. These guard
// the "no words" half, which is the part a future change would casually undo by
// adding a helpful caption back.

describe('RouteSurfaceFallback', () => {
    it('draws nothing but the spinner', () => {
        const { container } = render(<RouteSurfaceFallback />)

        const spinner = container.querySelector('.loading-screen-spinner')
        expect(spinner).not.toBeNull()
        // Decoration, so it must not be announced on its own.
        expect(spinner).toHaveAttribute('aria-hidden', 'true')
    })

    it('keeps every word inside the visually-hidden label', () => {
        const { container } = render(
            <RouteSurfaceFallback label="Loading Studio" detail="Preparing things" />
        )

        const hidden = container.querySelector('.loading-screen-label')
        expect(hidden).not.toBeNull()

        // Any text anywhere else is text that gets PAINTED — the thing being
        // removed. Compare the whole subtree's text against the label's own.
        expect(container.textContent.trim()).toBe(hidden.textContent.trim())
    })

    it('still announces which surface is loading', () => {
        // The call sites say "Loading Studio", "Loading admin surface". Going
        // silent for a screen reader is not the same as going silent visually.
        render(<RouteSurfaceFallback label="Loading admin surface" detail="Preparing the dashboard" />)

        const status = screen.getByRole('status')
        expect(status).toHaveTextContent('Loading admin surface')
        expect(status).toHaveTextContent('Preparing the dashboard')
    })

    it('announces a sensible default with no props', () => {
        render(<RouteSurfaceFallback />)
        expect(screen.getByRole('status')).toHaveTextContent('Loading')
    })

    it('does not leave a dangling separator when there is no detail', () => {
        render(<RouteSurfaceFallback label="Loading" detail="" />)
        expect(screen.getByRole('status').textContent.trim()).toBe('Loading')
    })
})
