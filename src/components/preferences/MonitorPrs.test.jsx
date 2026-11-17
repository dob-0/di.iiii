// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MonitorPrs from './MonitorPrs.jsx'

const pr = { number: 12, title: 'admin: titles', branch: 'feat/a', base: 'dev', author: 'dob-0', draft: false, updatedAt: new Date().toISOString(), url: 'https://github.com/dob-0/di.iiii/pull/12' }

describe('MonitorPrs', () => {
    it('lists open pull requests with a link each', async () => {
        render(<MonitorPrs fetcher={vi.fn().mockResolvedValue({ ok: true, prs: [pr, { ...pr, number: 13, title: 'wip', draft: true }] })} refreshMs={1e9} />)
        const link = await screen.findByRole('link', { name: /#12 admin: titles/ })
        expect(link.getAttribute('href')).toBe(pr.url)
        expect(screen.getByText(/draft · feat\/a → dev/)).toBeTruthy()
    })
    it('says plainly when the list is empty', async () => {
        render(<MonitorPrs fetcher={vi.fn().mockResolvedValue({ ok: true, prs: [] })} refreshMs={1e9} />)
        expect(await screen.findByText('No open pull requests.')).toBeTruthy()
    })
    it('shows the server reason when the App cannot read pull requests', async () => {
        render(<MonitorPrs fetcher={vi.fn().mockResolvedValue({ ok: false, reason: 'no-permission', message: 'The GitHub App cannot read pull requests yet (it needs "Pull requests: read").' })} refreshMs={1e9} />)
        expect(await screen.findByText(/Pull requests: read/)).toBeTruthy()
    })
    it('shows the error when the request fails', async () => {
        render(<MonitorPrs fetcher={vi.fn().mockRejectedValue(new Error('offline'))} refreshMs={1e9} />)
        await waitFor(() => expect(screen.getByText(/Unavailable here: offline/)).toBeTruthy())
    })
})
