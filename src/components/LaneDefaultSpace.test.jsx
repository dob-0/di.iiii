import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LaneDefaultSpace from './LaneDefaultSpace.jsx'

const mockUseAuthSession = vi.fn()

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => mockUseAuthSession()
}))

vi.mock('./RouteSurfaceFallback.jsx', () => ({
    default: () => <div>loading-fallback</div>
}))

const renderSpace = (spaceId) => <div>space:{spaceId}</div>

// A bare typed /raw defaults to 'main', where a guest session has no scope —
// it used to land on AuthGate's wall. The defaulted space must bend to the
// session's own open space, and ONLY the defaulted one: a named space is a
// deliberate address.
describe('LaneDefaultSpace', () => {
    it('sends a session scoped elsewhere to its open space', () => {
        mockUseAuthSession.mockReturnValue({
            loading: false,
            spaces: ['open', 'sandbox-guestx'],
            openSpaceId: 'open'
        })
        render(<LaneDefaultSpace state={{ spaceId: 'main', isDefaultSpace: true }}>{renderSpace}</LaneDefaultSpace>)
        expect(screen.getByText('space:open')).toBeInTheDocument()
    })

    it('keeps the default for a session that can enter it', () => {
        mockUseAuthSession.mockReturnValue({
            loading: false,
            spaces: ['main', 'open'],
            openSpaceId: 'open'
        })
        render(<LaneDefaultSpace state={{ spaceId: 'main', isDefaultSpace: true }}>{renderSpace}</LaneDefaultSpace>)
        expect(screen.getByText('space:main')).toBeInTheDocument()
    })

    it('keeps the default for unrestricted sessions and local installs (spaces: null)', () => {
        mockUseAuthSession.mockReturnValue({
            loading: false,
            spaces: null,
            openSpaceId: null
        })
        render(<LaneDefaultSpace state={{ spaceId: 'main', isDefaultSpace: true }}>{renderSpace}</LaneDefaultSpace>)
        expect(screen.getByText('space:main')).toBeInTheDocument()
    })

    it('waits for the session before choosing', () => {
        mockUseAuthSession.mockReturnValue({ loading: true, spaces: null, openSpaceId: null })
        render(<LaneDefaultSpace state={{ spaceId: 'main', isDefaultSpace: true }}>{renderSpace}</LaneDefaultSpace>)
        expect(screen.getByText('loading-fallback')).toBeInTheDocument()
        expect(screen.queryByText(/space:/)).not.toBeInTheDocument()
    })
})
