import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RawApp from './RawApp.jsx'
import { RAW_PAGE_CANVAS, RAW_PAGE_OUT, RAW_PAGE_PROJECT, RAW_PAGE_PROJECTS } from './utils/rawRouting.js'

// The space's one project list, Studio's hub, opened with Nodes as the editor
// its cards lead to. Rendered here so the assertion reads the props it got.
vi.mock('../studio/components/StudioHub.jsx', () => ({
    default: function MockStudioHub({ spaceId, openIn, children }) {
        return <div>hub:{spaceId}:{openIn}{children}</div>
    }
}))

vi.mock('../components/SpaceSyncPanel.jsx', () => ({
    default: function MockSpaceSyncPanel({ spaceId }) {
        return <span>:sync:{spaceId}</span>
    }
}))

vi.mock('./components/RawEditor.jsx', () => ({
    default: function MockRawEditor({ projectId, spaceId }) {
        return <div>editor:{spaceId}:{projectId}</div>
    }
}))

vi.mock('./components/RawOutSurface.jsx', () => ({
    default: function MockRawOutSurface({ projectId, localStorageKey, scopeId }) {
        return <div>out:{projectId || 'canvas'}:{localStorageKey || 'sync'}:{scopeId || 'root'}</div>
    }
}))

vi.mock('./BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank:{spaceId}</div>
    }
}))

describe('RawApp', () => {
    it('opens the blank node workspace on the seed hub route', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_CANVAS, spaceId: 'main' }} />)

        expect(screen.getByText('blank:main')).toBeInTheDocument()
    })

    // /{space}/raw/projects keeps its address and shows the space's one list —
    // the same hub /{space}/studio shows — with cards opening in Nodes. The
    // live-sync row rides along because this page was its only home.
    it("keeps the projects address and shows the space's one list, opening in Nodes", () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_PROJECTS, spaceId: 'gallery' }} />)

        expect(screen.getByText('hub:gallery:nodes', { exact: false })).toBeInTheDocument()
        expect(screen.getByText(':sync:gallery')).toBeInTheDocument()
    })

    it('opens the project editor for project routes', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_PROJECT, spaceId: 'gallery', projectId: 'proj-1' }} />)

        expect(screen.getByText('editor:gallery:proj-1')).toBeInTheDocument()
    })

    it('routes /out to the output surface — a project rides the live sync', () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_OUT, spaceId: 'gallery', projectId: 'proj-1', scopeId: 'geo-1' }} />)

        expect(screen.getByText('out:proj-1:sync:geo-1')).toBeInTheDocument()
    })

    it("routes a space-canvas /out to the same surface on the space's local key", () => {
        render(<RawApp initialRoute={{ page: RAW_PAGE_OUT, spaceId: 'open', projectId: null }} />)

        expect(screen.getByText('out:canvas:dii.localNodeWorkspace.open:root')).toBeInTheDocument()
    })
})
