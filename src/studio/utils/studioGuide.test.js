import { beforeEach, describe, expect, it } from 'vitest'
import {
    STUDIO_WELCOME_SEEN_KEY,
    markStudioWelcomeSeen,
    shouldShowStudioWelcome
} from './studioGuide.js'

describe('studio guest welcome', () => {
    beforeEach(() => {
        window.localStorage.removeItem(STUDIO_WELCOME_SEEN_KEY)
    })

    it('shows once for a guest, then never again', () => {
        expect(shouldShowStudioWelcome('guest')).toBe(true)
        markStudioWelcomeSeen()
        expect(shouldShowStudioWelcome('guest')).toBe(false)
    })

    it('never triggers for signed-in or unresolved sessions', () => {
        expect(shouldShowStudioWelcome('session')).toBe(false)
        expect(shouldShowStudioWelcome(null)).toBe(false)
        expect(shouldShowStudioWelcome(undefined)).toBe(false)
    })
})
