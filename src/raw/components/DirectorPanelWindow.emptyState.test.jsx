import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The local build carries no works at all (DI_PROFILE=local stubs every work
// entry), so the registry has no descriptor to give. That is a true statement
// about the build, not a failure — but before the works registry the director
// window would have rendered against a piece that was not there.
vi.mock('../director/pieces.js', () => ({
    PIECE_IDS: [],
    loadPiece: vi.fn(async () => null)
}))
vi.mock('../director/DirectorPanel.jsx', () => ({ default: () => <div data-testid="panel" /> }))

const { default: DirectorPanelWindow } = await import('./DirectorPanelWindow.jsx')

describe('DirectorPanelWindow with no piece to load', () => {
    it('says so instead of rendering a panel over nothing', async () => {
        render(<DirectorPanelWindow node={{ values: {} }} />)
        expect(await screen.findByText(/No piece is registered in this build/)).toBeTruthy()
        expect(screen.queryByTestId('panel')).toBeNull()
    })

    it('names the piece it could not find, when one was asked for', async () => {
        render(<DirectorPanelWindow node={{ values: { piece: 'not-here' } }} />)
        expect(await screen.findByText(/No piece called .*not-here/)).toBeTruthy()
    })
})
