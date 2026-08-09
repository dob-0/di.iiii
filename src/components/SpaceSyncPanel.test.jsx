import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SpaceSyncPanel from './SpaceSyncPanel.jsx'

vi.mock('../services/apiClient.js', () => ({ apiFetch: vi.fn() }))
const { apiFetch } = await import('../services/apiClient.js')

// Two scenes with the same number of objects are not the same scene, and this
// panel used to say they were: it compared local.objects to live.objects and
// printed "in sync" when the counts matched. That claim is the one that stops
// a person checking, so it is the one that has to be wrong the least.
describe('SpaceSyncPanel', () => {
    beforeEach(() => {
        apiFetch.mockReset()
    })

    it('does not claim two different scenes are in sync because their object counts match', async () => {
        apiFetch.mockResolvedValue({
            configured: true,
            canPush: true,
            relation: 'unknown',
            local: { exists: true, objects: 3, assets: 0, version: 41 },
            live: { objects: 3, assets: 0, version: 13 }
        })

        render(<SpaceSyncPanel spaceId="npak" />)

        await waitFor(() => expect(screen.getByRole('region', { name: 'Live sync' })).toBeInTheDocument())
        const row = screen.getByRole('region', { name: 'Live sync' })

        expect(row.textContent).not.toMatch(/in sync/i)
        // It shows both sides instead, versions included, so the difference is
        // visible rather than asserted away.
        expect(row.textContent).toMatch(/v41/)
        expect(row.textContent).toMatch(/v13/)
    })

    it('reports an unreachable live server as unreachable', async () => {
        apiFetch.mockResolvedValue({
            configured: true,
            canPush: false,
            local: { exists: true, objects: 2, assets: 0, version: 4 },
            live: { error: 'live server unreachable' }
        })

        render(<SpaceSyncPanel spaceId="npak" />)

        await waitFor(() => expect(screen.getByText(/live unreachable/i)).toBeInTheDocument())
    })

    it('renders nothing when sync is not configured', async () => {
        apiFetch.mockResolvedValue({ configured: false })

        const { container } = render(<SpaceSyncPanel spaceId="npak" />)

        await waitFor(() => expect(apiFetch).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })
})
