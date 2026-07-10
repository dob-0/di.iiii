import { beforeEach, describe, expect, it } from 'vitest'
import {
    STUDIO_COACH_DONE_KEY,
    markStudioCoachDone,
    shouldShowStudioCoach
} from './studioGuide.js'

describe('studio guest coach', () => {
    beforeEach(() => {
        window.localStorage.removeItem(STUDIO_COACH_DONE_KEY)
    })

    it('shows once for a guest, then never again', () => {
        expect(shouldShowStudioCoach('guest')).toBe(true)
        markStudioCoachDone()
        expect(shouldShowStudioCoach('guest')).toBe(false)
    })

    it('never triggers for signed-in or unresolved sessions', () => {
        expect(shouldShowStudioCoach('session')).toBe(false)
        expect(shouldShowStudioCoach(null)).toBe(false)
        expect(shouldShowStudioCoach(undefined)).toBe(false)
    })
})
