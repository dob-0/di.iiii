import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/appVisitorsApi.js', () => ({
    getAppVisitors: vi.fn(),
    setAppVisitorBlocked: vi.fn()
}))

import { getAppVisitors, setAppVisitorBlocked } from '../../services/appVisitorsApi.js'
import AppVisitorsSection, { contactHref } from './AppVisitorsSection.jsx'

const guestBook = {
    enabled: true,
    retentionDays: 90,
    totals: { app: { today: 3, week: 12, agents: 1 }, anonymous: { today: 40, week: 90, agents: 1 } },
    agents: [
        { agent: 'spacemirror', kind: 'app', contact: 'ops@example.org', today: 3, week: 12, total: 20, firstSeen: 1, lastSeen: 2, blocked: false },
        { agent: 'python-requests', kind: 'anonymous', contact: null, today: 40, week: 90, total: 90, firstSeen: 1, lastSeen: 2, blocked: false },
        { agent: 'browser', kind: 'browser', contact: null, today: 500, week: 3000, total: 3000, firstSeen: null, lastSeen: null, blocked: false }
    ]
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('AppVisitorsSection', () => {
    it('lists who called — kind, name, contact and counts — and never lists browsers as a row', async () => {
        getAppVisitors.mockResolvedValue(guestBook)
        render(<AppVisitorsSection />)
        await waitFor(() => expect(screen.getByText('spacemirror')).toBeTruthy())
        expect(screen.getByText('python-requests')).toBeTruthy()
        expect(screen.getByText('ops@example.org').getAttribute('href')).toBe('mailto:ops@example.org')
        expect(screen.getByText(/3 today · 12 in 7 days/)).toBeTruthy()
        expect(screen.queryByText('browser')).toBeNull()
        expect(screen.getByText('Browsers · today')).toBeTruthy()
    })

    it('blocks a program after confirming, and shows it blocked', async () => {
        getAppVisitors.mockResolvedValue(guestBook)
        setAppVisitorBlocked.mockResolvedValue({ agent: 'python-requests', blocked: true })
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        render(<AppVisitorsSection />)
        await waitFor(() => expect(screen.getByText('python-requests')).toBeTruthy())
        fireEvent.click(screen.getAllByText('Block')[1])
        await waitFor(() => expect(setAppVisitorBlocked).toHaveBeenCalledWith('python-requests', true))
        await waitFor(() => expect(screen.getByText('Unblock')).toBeTruthy())
    })

    it('says a local install keeps no guest book', async () => {
        getAppVisitors.mockResolvedValue({ enabled: false, agents: [], totals: {} })
        render(<AppVisitorsSection />)
        await waitFor(() => expect(screen.getByText(/A local install keeps no guest book/)).toBeTruthy())
    })

    // The contact is text a stranger typed into a header.
    it('links a contact only when it is plainly a web address or an email', () => {
        expect(contactHref('https://example.org/bot')).toBe('https://example.org/bot')
        expect(contactHref('me@example.org')).toBe('mailto:me@example.org')
        expect(contactHref('javascript:alert(1)')).toBeNull()
        expect(contactHref('')).toBeNull()
    })
})
