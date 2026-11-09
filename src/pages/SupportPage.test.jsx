import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SupportPage from './SupportPage.jsx'
import { SPONSORS_URL } from './supportContent.js'
import { APP_PAGE_SUPPORT, getAppLocationState, isReservedAppSegment } from '../utils/spaceRouting.js'
import { CORE_PATHS } from '../../scripts/sitemap.mjs'

describe('/support', () => {
    it('is its own page, no space can take the word, and the sitemap lists it', () => {
        expect(getAppLocationState({ pathname: '/support', search: '' }).page).toBe(APP_PAGE_SUPPORT)
        expect(isReservedAppSegment('support')).toBe(true)
        expect(CORE_PATHS).toContain('/support')
    })

    it('names the four ways, and says plainly that the Sponsors account is not open while the link is unset', () => {
        render(<SupportPage />)
        for (const name of ['Give money', 'Use it and show it', 'Tell us what breaks', 'Add code or words']) {
            expect(screen.getByRole('heading', { name })).toBeTruthy()
        }
        expect(SPONSORS_URL).toBeNull()
        expect(screen.getByTestId('sponsors-pending')).toBeTruthy()
        expect(document.querySelector('a[href*="polar"]')).toBeNull()
    })
})
