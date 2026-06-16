import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BetaApp from './BetaApp.jsx'
import { BETA_PAGE_HUB, BETA_PAGE_PROJECT, BETA_PAGE_PROJECTS } from './utils/betaRouting.js'

vi.mock('./components/BetaHub.jsx', () => ({
    default: function MockBetaHub({ spaceId }) {
        return <div>hub:{spaceId}</div>
    }
}))

vi.mock('./components/BetaEditor.jsx', () => ({
    default: function MockBetaEditor({ projectId, spaceId }) {
        return <div>editor:{spaceId}:{projectId}</div>
    }
}))

vi.mock('./BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank:{spaceId}</div>
    }
}))

describe('BetaApp', () => {
    it('opens the blank node workspace on the beta hub route', () => {
        render(<BetaApp initialRoute={{ page: BETA_PAGE_HUB, spaceId: 'main' }} />)

        expect(screen.getByText('blank:main')).toBeInTheDocument()
    })

    it('keeps the projects route on the hub surface', () => {
        render(<BetaApp initialRoute={{ page: BETA_PAGE_PROJECTS, spaceId: 'gallery' }} />)

        expect(screen.getByText('hub:gallery')).toBeInTheDocument()
    })

    it('opens the project editor for project routes', () => {
        render(<BetaApp initialRoute={{ page: BETA_PAGE_PROJECT, spaceId: 'gallery', projectId: 'proj-1' }} />)

        expect(screen.getByText('editor:gallery:proj-1')).toBeInTheDocument()
    })
})