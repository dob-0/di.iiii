import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioCoachMarks from './StudioCoachMarks.jsx'
import { STUDIO_COACH_DONE_KEY, STUDIO_JAM_COACH_DONE_KEY } from '../utils/studioGuide.js'

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

    it('objects arriving (a collaborator adding) never complete the tap step by themselves', () => {
        // The shell mounts the coach only once the real document has loaded
        // (StudioShell.test.jsx); a project that holds things starts on tapping one.
        const { rerender } = render(<StudioCoachMarks {...baseProps} entityCount={3} />)
        rerender(<StudioCoachMarks {...baseProps} entityCount={12} />)
        expect(screen.getByText('Tap an object to select it')).toBeTruthy()
    })

    // The layers decision, 2026-09-23, unit 2: it asked a newcomer to "Tap an
    // object" in a room with none.
    it('an empty project starts on adding something, then asks to tap it — done by the tap, not by the selection a new thing already has', () => {
        const { rerender } = render(<StudioCoachMarks {...baseProps} entityCount={0} />)
        expect(screen.getByText('Add something')).toBeTruthy()
        expect(screen.queryByText(/Tap an object/)).toBeNull()

        // Placing the box selects it at once.
        rerender(<StudioCoachMarks {...baseProps} entityCount={1} hasSelection />)
        expect(screen.getByText('Tap it')).toBeTruthy()
        // Still there while nothing is tapped.
        rerender(<StudioCoachMarks {...baseProps} entityCount={1} hasSelection selectTicks={0} />)
        expect(screen.getByText('Tap it')).toBeTruthy()

        // The tap.
        rerender(<StudioCoachMarks {...baseProps} entityCount={1} hasSelection selectTicks={1} />)
        expect(screen.getByText('Open Share to keep what you made')).toBeTruthy()
    })

    it('waits behind a phone sheet without losing its place', () => {
        const { rerender } = render(<StudioCoachMarks {...baseProps} entityCount={0} covered />)
        expect(screen.queryByRole('status')).toBeNull()
        rerender(<StudioCoachMarks {...baseProps} entityCount={1} hasSelection covered />)
        rerender(<StudioCoachMarks {...baseProps} entityCount={1} hasSelection />)
        expect(screen.getByText('Tap it')).toBeTruthy()
    })

    it('coaches signed-in users too, but never an unresolved session', () => {
        const { unmount } = render(<StudioCoachMarks {...baseProps} authType="session" />)
        expect(screen.getByText('Tap an object to select it')).toBeTruthy()
        unmount()

        const unresolved = render(<StudioCoachMarks {...baseProps} authType={null} />)
        expect(screen.queryByRole('status')).toBeNull()
        unresolved.unmount()

        render(<StudioCoachMarks {...baseProps} />)
        screen.getByLabelText('Dismiss guide').click()
        expect(window.localStorage.getItem(STUDIO_COACH_DONE_KEY)).toBe('1')
    })

    describe('open-jam welcome', () => {
        beforeEach(() => {
            window.localStorage.removeItem(STUDIO_JAM_COACH_DONE_KEY)
        })

        it('shows a single welcome, then celebrates the first add and fades', () => {
            vi.useFakeTimers()
            try {
                // Jam welcome shows for anyone (even signed-in), unlike the guest coach.
                const { rerender } = render(
                    <StudioCoachMarks {...baseProps} authType="session" entityCount={5} isOpenJam />
                )
                expect(screen.getByText(/Open Create to add your visual/)).toBeTruthy()

                // Adding a visual (count above the arm-time baseline) completes it.
                rerender(<StudioCoachMarks {...baseProps} authType="session" entityCount={6} isOpenJam />)
                expect(screen.getByText(/Add as many as you like/)).toBeTruthy()
                expect(window.localStorage.getItem(STUDIO_JAM_COACH_DONE_KEY)).toBe('1')

                act(() => { vi.advanceTimersByTime(4500) })
                expect(screen.queryByRole('status')).toBeNull()
            } finally {
                vi.useRealTimers()
            }
        })

        it('existing jam visuals loading in do not falsely complete the welcome', () => {
            const { rerender } = render(<StudioCoachMarks {...baseProps} entityCount={2} isOpenJam />)
            // The count arms at 2; it never grows past that baseline here.
            rerender(<StudioCoachMarks {...baseProps} entityCount={2} isOpenJam />)
            expect(screen.getByText(/Open Create to add your visual/)).toBeTruthy()
        })

        it('does not show once dismissed on this device', () => {
            window.localStorage.setItem(STUDIO_JAM_COACH_DONE_KEY, '1')
            render(<StudioCoachMarks {...baseProps} entityCount={0} isOpenJam />)
            expect(screen.queryByRole('status')).toBeNull()
        })
    })
})
