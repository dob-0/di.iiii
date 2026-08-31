import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const navigate = vi.fn()
vi.mock('../../utils/appNavigate.js', () => ({ appNavigate: (...args) => navigate(...args) }))

// The experience pulls three.js and warms ~190 MB of footage on mount. This
// suite is about the page AROUND it — the chrome, the two props, the fallback
// for a space that has no surface — so it is stubbed, and the stub records the
// props, because those two props are the entire integration.
const mounted = []
vi.mock('../../algoVrithm/AlgoVrithmExperience.jsx', () => ({
    default: (props) => {
        mounted.push(props)
        return <div data-testid="experience" />
    }
}))

const { default: StudioCodeSpaceDirector } = await import('./StudioCodeSpaceDirector.jsx')

describe('StudioCodeSpaceDirector', () => {
    beforeEach(() => {
        navigate.mockClear()
        mounted.length = 0
    })

    it('names the space it is editing', async () => {
        render(<StudioCodeSpaceDirector spaceId="algovrithm" />)
        expect(await screen.findByText('Space: algovrithm')).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Director' })).toBeTruthy()
    })

    // The two props ARE the integration. `embedded` swaps the root off
    // `position: fixed` — without it the piece covers the header naming the
    // space — and `director` forces the panel on, because a route called
    // director that opens on plain playback behind a keyboard shortcut is a
    // door that looks like a wall.
    it('mounts the piece embedded, with the director on', async () => {
        render(<StudioCodeSpaceDirector spaceId="algovrithm" />)
        await screen.findByTestId('experience')
        expect(mounted).toHaveLength(1)
        expect(mounted[0].embedded).toBe(true)
        expect(mounted[0].director).toBe(true)
    })

    it('can get back to Spaces and to Projects', async () => {
        render(<StudioCodeSpaceDirector spaceId="algovrithm" />)
        fireEvent.click(await screen.findByRole('button', { name: '← Spaces' }))
        expect(navigate).toHaveBeenCalledWith('/spaces')
        navigate.mockClear()
        fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
        expect(navigate).toHaveBeenCalledWith('/algovrithm/studio')
    })

    // Judging timing means watching the piece at the size and aspect an
    // audience gets, and XR entry from under a header is meaningless — so the
    // bare route has to stay reachable from here.
    it('keeps a way out to the bare piece', async () => {
        render(<StudioCodeSpaceDirector spaceId="algovrithm" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Open the piece' }))
        expect(navigate).toHaveBeenCalledWith('/algovrithm')
    })

    it('says so rather than rendering blank for a space with no surface', () => {
        render(<StudioCodeSpaceDirector spaceId="main" />)
        expect(screen.getByRole('heading', { name: 'No director here' })).toBeTruthy()
        expect(screen.queryByTestId('experience')).toBeNull()
        expect(screen.getByText(/keeps its work as projects/i)).toBeTruthy()
    })
})
