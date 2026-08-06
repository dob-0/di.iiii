import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LoadingScreen, { LoadingInline } from './LoadingScreen.jsx'

// One loading screen for the whole platform: black, a spinner, no drawn words.
// These guard the "no words" half — the part a future change would casually
// undo by adding a helpful caption back — and the announcement that replaced
// them, which is invisible and therefore easy to delete by accident.

describe('LoadingScreen', () => {
    it('draws nothing but the spinner', () => {
        const { container } = render(<LoadingScreen />)

        const spinner = container.querySelector('.loading-screen-spinner')
        expect(spinner).not.toBeNull()
        expect(spinner).toHaveAttribute('aria-hidden', 'true')
    })

    it('keeps every word inside the visually-hidden label', () => {
        const { container } = render(
            <LoadingScreen label="Loading Studio" detail="Preparing the workspace" />
        )

        const hidden = container.querySelector('.loading-screen-label')
        expect(hidden).not.toBeNull()
        // Text anywhere else is text that gets PAINTED — the thing removed.
        expect(container.textContent.trim()).toBe(hidden.textContent.trim())
    })

    it('still announces what is loading', () => {
        render(<LoadingScreen label="Loading" detail="Checking your session" />)

        const status = screen.getByRole('status')
        expect(status).toHaveTextContent('Loading')
        expect(status).toHaveTextContent('Checking your session')
    })

    it('does not leave a dangling separator when there is no detail', () => {
        render(<LoadingScreen label="Loading" />)
        expect(screen.getByRole('status').textContent.trim()).toBe('Loading')
    })
})

// The inline member: unlike the full screen its label IS drawn (an inline
// wait sits among other words), and with no label it must still announce.

describe('LoadingInline', () => {
    it('draws the spinner and the given label', () => {
        const { container } = render(<LoadingInline label="loading projects…" />)

        const spinner = container.querySelector('.loading-inline-spinner')
        expect(spinner).not.toBeNull()
        expect(spinner).toHaveAttribute('aria-hidden', 'true')
        expect(screen.getByRole('status')).toHaveTextContent('loading projects…')
        expect(container.querySelector('.loading-inline-text')).not.toBeNull()
    })

    it('announces without drawing when there is no label', () => {
        const { container } = render(<LoadingInline announce="Signing out" />)

        expect(screen.getByRole('status')).toHaveTextContent('Signing out')
        // The announcement rides in the visually-hidden class, not painted text.
        const hidden = container.querySelector('.loading-screen-label')
        expect(hidden).not.toBeNull()
        expect(hidden.textContent).toBe('Signing out')
        expect(container.querySelector('.loading-inline-text')).toBeNull()
    })
})
