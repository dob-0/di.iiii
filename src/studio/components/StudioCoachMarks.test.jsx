import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioCoachMarks from './StudioCoachMarks.jsx'
import { STUDIO_COACH_DONE_KEY } from '../utils/studioGuide.js'

const baseProps = {
    authType: 'guest',
    entityCount: 3,
    hasSelection: false,
    shareOpen: false
}

describe('StudioCoachMarks', () => {
    beforeEach(() => {
        window.localStorage.removeItem(STUDIO_COACH_DONE_KEY)
    })

    it('walks a guest through touch → add → share, completing on actions', () => {
        vi.useFakeTimers()
        try {
            const { rerender } = render(<StudioCoachMarks {...baseProps} />)
            expect(screen.getByText('Tap an object to select it')).toBeTruthy()

            // Selecting completes step 1 and baselines the entity count.
            rerender(<StudioCoachMarks {...baseProps} hasSelection />)
            expect(screen.getByText('Open Create and add something')).toBeTruthy()

            // Adding an entity (count above the baseline) completes step 2.
            rerender(<StudioCoachMarks {...baseProps} hasSelection entityCount={4} />)
            expect(screen.getByText('Open Share to keep what you made')).toBeTruthy()

            // Opening Share finishes the coach and persists completion.
            rerender(<StudioCoachMarks {...baseProps} hasSelection entityCount={4} shareOpen />)
            expect(screen.getByText(/press \? anytime for help/)).toBeTruthy()
            expect(window.localStorage.getItem(STUDIO_COACH_DONE_KEY)).toBe('1')

            act(() => { vi.advanceTimersByTime(4500) })
            expect(screen.queryByRole('status')).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it('loading the document (entity count growing) never completes the add step by itself', () => {
        const { rerender } = render(<StudioCoachMarks {...baseProps} entityCount={0} />)
        // Document objects stream in before the guest touches anything.
        rerender(<StudioCoachMarks {...baseProps} entityCount={12} />)
        expect(screen.getByText('Tap an object to select it')).toBeTruthy()
    })

    it('renders nothing for signed-in users or once dismissed', () => {
        const { unmount } = render(<StudioCoachMarks {...baseProps} authType="session" />)
        expect(screen.queryByRole('status')).toBeNull()
        unmount()

        render(<StudioCoachMarks {...baseProps} />)
        screen.getByLabelText('Dismiss guide').click()
        expect(window.localStorage.getItem(STUDIO_COACH_DONE_KEY)).toBe('1')
    })
})
