import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TermsPage from './TermsPage.jsx'

describe('/terms', () => {
    // Sentence case, not the lowercase the tab used to carry —
    // docs/ai/vocabulary.md's naming rule.
    it('names itself in the tab, Sentence case', () => {
        render(<TermsPage />)
        expect(document.title).toBe('Terms — di.iiii')
    })
})
