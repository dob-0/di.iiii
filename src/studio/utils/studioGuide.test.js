import { beforeEach, describe, expect, it } from 'vitest'
import {
    STUDIO_COACH_DONE_KEY,
    markStudioCoachDone,
    shouldShowStudioCoach
} from './studioGuide.js'

describe('studio first-run coach', () => {
    beforeEach(() => {
        window.localStorage.removeItem(STUDIO_COACH_DONE_KEY)
    })

    it('shows once for a guest, then never again', () => {
        expect(shouldShowStudioCoach('guest')).toBe(true)
        markStudioCoachDone()
        expect(shouldShowStudioCoach('guest')).toBe(false)
    })

    it('shows once for a signed-in session, then never again', () => {
        expect(shouldShowStudioCoach('session')).toBe(true)
        markStudioCoachDone()
        expect(shouldShowStudioCoach('session')).toBe(false)
    })

    it('honors the done flag across identities — one browser sees it once', () => {
        expect(shouldShowStudioCoach('guest')).toBe(true)
        markStudioCoachDone()
        expect(shouldShowStudioCoach('session')).toBe(false)
    })

    it('never triggers while auth is unresolved', () => {
        expect(shouldShowStudioCoach(null)).toBe(false)
        expect(shouldShowStudioCoach(undefined)).toBe(false)
        expect(shouldShowStudioCoach('')).toBe(false)
    })
})
