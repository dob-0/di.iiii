import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacyPage from './PrivacyPage.jsx'

describe('/privacy', () => {
    // Sentence case, not the lowercase the tab used to carry —
    // docs/ai/vocabulary.md's naming rule.
    it('names itself in the tab, Sentence case', () => {
        render(<PrivacyPage />)
        expect(document.title).toBe('Privacy — di.iiii')
    })
})
