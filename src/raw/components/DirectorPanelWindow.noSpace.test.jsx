import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Seen by the node check (2026-10-02): on a fresh canvas the Director asked
// GET /api/spaces/algovrithm/settings (a 404 the browser logs as a console
// error) and said "editing algovrithm · the only piece registered so far" on a
// project with no such space. The settings of a space this server does not
// have must not be requested, and the window must say what is not available.
const PIECE = { id: 'algovrithm', label: 'algovrithm', savesToSpace: 'algovrithm', baseline: [] }

vi.mock('../director/pieces.js', () => ({
    PIECE_IDS: ['algovrithm'],
    loadPiece: vi.fn(async () => PIECE)
}))
vi.mock('../director/DirectorPanel.jsx', () => ({ default: () => <div data-testid="panel" /> }))
vi.mock('../../services/serverSpaces.js', () => ({ listServerSpaces: vi.fn() }))
vi.mock('../../services/spaceSettings.js', () => ({
    getSpaceSettings: vi.fn(async () => ({})),
    putSpaceSettings: vi.fn()
}))

const { default: DirectorPanelWindow } = await import('./DirectorPanelWindow.jsx')
const { listServerSpaces } = await import('../../services/serverSpaces.js')
const { getSpaceSettings } = await import('../../services/spaceSettings.js')

describe('DirectorPanelWindow on a server without the piece\'s space', () => {
    it('makes no settings request and says plainly what is missing', async () => {
        vi.clearAllMocks()
        listServerSpaces.mockResolvedValue([{ id: 'hayfilm' }])
        render(<DirectorPanelWindow node={{ values: {} }} />)
        expect(await screen.findByTestId('panel')).toBeTruthy()
        expect(getSpaceSettings).not.toHaveBeenCalled()
        expect(screen.getByText(/no space called/).textContent).toMatch(/algovrithm/)
        expect(document.body.textContent).not.toMatch(/only piece registered/)
    })

    it('still reads the saved timing when the server does have the space', async () => {
        vi.clearAllMocks()
        listServerSpaces.mockResolvedValue([{ id: 'algovrithm' }])
        render(<DirectorPanelWindow node={{ values: {} }} />)
        await waitFor(() => expect(getSpaceSettings).toHaveBeenCalledWith('algovrithm'))
        expect(await screen.findByTestId('panel')).toBeTruthy()
        expect(document.body.textContent).not.toMatch(/no space called/)
    })
})
