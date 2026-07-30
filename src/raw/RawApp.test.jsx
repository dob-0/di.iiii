import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawApp from './RawApp.jsx'
import { RAW_PAGE_HUB, RAW_PAGE_PROJECT, RAW_PAGE_PROJECTS } from './utils/rawRouting.js'

vi.mock('./components/RawHub.jsx', () => ({
    default: function MockRawHub({ spaceId }) {
        return <div>hub:{spaceId}</div>
    }
}))

vi.mock('./components/RawEditor.jsx', () => ({
    default: function MockRawEditor({ projectId, spaceId }) {
        return <div>editor:{spaceId}:{projectId}</div>
    }
}))

vi.mock('./BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank:{spaceId}</div>
    }
}))

describe('RawApp', () => {
    it('opens the blank node workspace on the seed hub route', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_HUB, spaceId: 'main' }} />)

        expect(screen.getByText('blank:main')).toBeInTheDocument()
    })

    it('keeps the projects route on the hub surface', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_PROJECTS, spaceId: 'gallery' }} />)

        expect(screen.getByText('hub:gallery')).toBeInTheDocument()
    })

    it('opens the project editor for project routes', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_PROJECT, spaceId: 'gallery', projectId: 'proj-1' }} />)

        expect(screen.getByText('editor:gallery:proj-1')).toBeInTheDocument()
    })
})