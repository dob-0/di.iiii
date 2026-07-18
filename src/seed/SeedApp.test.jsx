import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SeedApp from './SeedApp.jsx'
import { SEED_PAGE_HUB, SEED_PAGE_PROJECT, SEED_PAGE_PROJECTS } from './utils/seedRouting.js'

vi.mock('./components/SeedHub.jsx', () => ({
    default: function MockSeedHub({ spaceId }) {
        return <div>hub:{spaceId}</div>
    }
}))

vi.mock('./components/SeedEditor.jsx', () => ({
    default: function MockSeedEditor({ projectId, spaceId }) {
        return <div>editor:{spaceId}:{projectId}</div>
    }
}))

vi.mock('./BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank:{spaceId}</div>
    }
}))

describe('SeedApp', () => {
    it('opens the blank node workspace on the seed hub route', () => {
        render(<SeedApp initialRoute={{ page: SEED_PAGE_HUB, spaceId: 'main' }} />)

        expect(screen.getByText('blank:main')).toBeInTheDocument()
    })

    it('keeps the projects route on the hub surface', () => {
        render(<SeedApp initialRoute={{ page: SEED_PAGE_PROJECTS, spaceId: 'gallery' }} />)

        expect(screen.getByText('hub:gallery')).toBeInTheDocument()
    })

    it('opens the project editor for project routes', () => {
        render(<SeedApp initialRoute={{ page: SEED_PAGE_PROJECT, spaceId: 'gallery', projectId: 'proj-1' }} />)

        expect(screen.getByText('editor:gallery:proj-1')).toBeInTheDocument()
    })
})