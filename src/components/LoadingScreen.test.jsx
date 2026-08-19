import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LoadingScreen from './LoadingScreen.jsx'

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
