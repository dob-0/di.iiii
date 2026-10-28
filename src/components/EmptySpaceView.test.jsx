import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockSession = vi.hoisted(() => ({ value: { requireAuth: true, authenticated: false, spaces: [] } }))
vi.mock('../hooks/useAuthSession.js', () => ({ default: () => mockSession.value }))
vi.mock('../shared/visitorChrome.js', () => ({ canEditSession: (session) => Boolean(session?.canEdit) }))

import EmptySpaceView from './EmptySpaceView.jsx'

// Audit F070 (2026-10-28): a visitor on an empty space saw a black page with
// one bold word, no sentence and nothing to click, and could not tell empty
// from broken. The list of the space's projects said something else again.
describe('EmptySpaceView', () => {
    it('tells a visitor the space is empty and gives a way out', () => {
        mockSession.value = { canEdit: false }
        render(<EmptySpaceView spaceId="quiet" title="Quiet Room" />)
        const card = screen.getByTestId('empty-space-view')
        expect(card).toHaveTextContent('Quiet Room')
        expect(card).toHaveTextContent('Nothing here yet. The owner has not shown anything.')
        expect(screen.getByRole('link', { name: 'Go to the front page' })).toHaveAttribute('href', '/')
        expect(screen.getByRole('link', { name: 'See spaces' })).toHaveAttribute('href', '/spaces')
        expect(screen.queryByRole('link', { name: 'Make the first project in Studio' })).toBeNull()
    })

    it('keeps the way to start for someone who can edit here', () => {
        mockSession.value = { canEdit: true }
        render(<EmptySpaceView spaceId="quiet" title="Quiet Room" />)
        expect(screen.getByRole('link', { name: 'Make the first project in Studio' })).toHaveAttribute('href', '/quiet/studio')
        const card = screen.getByTestId('empty-space-view')
        expect(card).toHaveTextContent('Nothing here yet.')
        // The owner is not told that "the owner" has not shown anything.
        expect(card).not.toHaveTextContent('The owner has not shown anything.')
    })
})
