import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSiteStats = vi.fn()
vi.mock('../../services/statsApi.js', () => ({ getSiteStats: (...args) => getSiteStats(...args) }))

// AdminManageSection pulls in a lot; the section under test is exported on its own.
const { TrafficSection } = await import('./AdminManageSection.jsx')

// 2026-09-28: the server has counted page views (first-party, one per load) since the
// counter was built, and GET /api/stats had no caller — an admin could not see a number.
describe('TrafficSection', () => {
    beforeEach(() => getSiteStats.mockReset())

    it('shows the 30-day counts, the busiest day, and where visits came from', async () => {
        getSiteStats.mockResolvedValue({
            windowDays: 30,
            totals: { view: 12, signup: 2 },
            byDay: [
                { day: '2026-09-26', event_type: 'view', count: 4 },
                { day: '2026-09-27', event_type: 'view', count: 8 },
                { day: '2026-09-27', event_type: 'signup', count: 2 }
            ],
            topPaths: [{ path: '/wiki', count: 5 }, { path: '/spaces', count: 3 }],
            topReferrers: [{ referrer_host: 'example.org', count: 2 }]
        })
        render(<TrafficSection />)
        await waitFor(() => expect(screen.getByText('12')).toBeTruthy())
        expect(screen.getByText('Page views')).toBeTruthy()
        expect(screen.getByText('2026-09-27 · 8')).toBeTruthy()
        expect(screen.getByText('/wiki')).toBeTruthy()
        expect(screen.getByText('example.org')).toBeTruthy()
    })

    it('says so when nothing was counted, and when the counts cannot be read', async () => {
        getSiteStats.mockResolvedValueOnce({ windowDays: 30, totals: {}, byDay: [], topPaths: [], topReferrers: [] })
        const { unmount } = render(<TrafficSection />)
        await waitFor(() => expect(screen.getByText('No page views counted in this window yet.')).toBeTruthy())
        unmount()

        getSiteStats.mockRejectedValueOnce(new Error('Admins only.'))
        render(<TrafficSection />)
        await waitFor(() => expect(screen.getByText('Admins only.')).toBeTruthy())
    })
})
