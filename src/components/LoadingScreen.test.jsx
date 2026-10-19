import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoadingScreen, { LOADING_SLOW_AFTER_MS } from './LoadingScreen.jsx'

// One loading indicator for the whole platform: the ring, an optional single
// drawn line, and after 8 s a second line naming what it waits for.

afterEach(() => vi.useRealTimers())

describe('LoadingScreen', () => {
    it('draws only the ring when no text is given', () => {
        const { container } = render(<LoadingScreen />)
        const spinner = container.querySelector('.loading-screen-spinner')
        expect(spinner).not.toBeNull()
        expect(spinner).toHaveAttribute('aria-hidden', 'true')
        expect(container.querySelector('.loading-screen-text')).toBeNull()
        const hidden = container.querySelector('.loading-screen-label')
        expect(container.textContent.trim()).toBe(hidden.textContent.trim())
    })

    it('draws the one-line text slot', () => {
        const { container } = render(<LoadingScreen label="Loading" text="loading the room" />)
        expect(container.querySelector('.loading-screen-text')).toHaveTextContent('loading the room')
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

    it('says what it waits for after 8 s, not before', () => {
        vi.useFakeTimers()
        const { container } = render(<LoadingScreen label="Loading the room" waitingFor="the scene file" />)
        expect(LOADING_SLOW_AFTER_MS).toBe(8000)
        act(() => { vi.advanceTimersByTime(7999) })
        expect(container.querySelector('.loading-screen-slow')).toBeNull()
        act(() => { vi.advanceTimersByTime(2) })
        expect(container.querySelector('.loading-screen-slow')).toHaveTextContent('still waiting for the scene file')
    })

    it('derives the 8 s line from the label when waitingFor is absent', () => {
        vi.useFakeTimers()
        const { container } = render(<LoadingScreen label="Loading the show" slowAfterMs={10} />)
        act(() => { vi.advanceTimersByTime(20) })
        expect(container.querySelector('.loading-screen-slow')).toHaveTextContent('still waiting for the show')
    })

    it('supports the cover and inline variants', () => {
        const { container } = render(<><LoadingScreen variant="cover" /><LoadingScreen variant="inline" /></>)
        expect(container.querySelector('.loading-screen--cover')).not.toBeNull()
        expect(container.querySelector('.loading-screen--inline')).not.toBeNull()
    })

    it('shows slowText instead of the generic 8 s line when the cause is known', () => {
        vi.useFakeTimers()
        const { container } = render(<LoadingScreen slowText="too many tabs of this site are open — close one" />)
        act(() => { vi.advanceTimersByTime(LOADING_SLOW_AFTER_MS) })
        expect(container.querySelector('.loading-screen-slow')).toHaveTextContent('too many tabs of this site are open — close one')
    })
})
