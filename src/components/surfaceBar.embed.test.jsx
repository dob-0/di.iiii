import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceContentsPage from '../pages/SpaceContentsPage.jsx'
import ToolsRoom from '../tools/ToolsRoom.jsx'
import WikiPage from '../wiki/WikiPage.jsx'
import BlankNodeWorkspaceApp from '../raw/BlankNodeWorkspaceApp.jsx'
import PublicProjectViewer from '../project/components/PublicProjectViewer.jsx'

vi.mock('../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    listProjects: vi.fn(async () => []),
    listSpaceContents: vi.fn(async () => [{ id: 'p', slug: null, title: 'p', mode: 'scene', updatedAt: 0 }]),
    getProjectDocument: vi.fn(async () => ({
        version: 1,
        document: {
            projectMeta: { id: 'p', title: 'A room' },
            presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
            entities: []
        }
    })),
    listProjectOps: vi.fn(async () => ({ ops: [], latestVersion: 1 })),
    buildProjectEventsUrl: vi.fn((projectId) => `/api/projects/${projectId}/events`)
}))

vi.mock('../services/serverSpaces.js', () => ({
    getServerSpace: vi.fn(async () => ({ id: 'br_id_ge', label: 'br_id_ge', publishedProjectId: null })),
    listServerSpaces: vi.fn(async () => []),
    getServerConfig: vi.fn(async () => ({}))
}))

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: vi.fn(),
    setAppNavigate: () => {}
}))

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ role: 'admin', spaces: [], openSpaceId: 'open', sandboxSpaceId: null, requireAuth: false })
}))

// The published viewer only carries the bar on an install — on the hosted site
// a room's way out is the badge. So every lane here is looked at as the local
// copy, which is the case where all seven draw one.
vi.mock('../hooks/useLocalInstall.js', () => ({
    default: () => ({ resolved: true, isLocal: true })
}))

vi.mock('../project/services/projectSyncService.js', () => ({
    createProjectSyncService: () => ({ connect: () => {}, disconnect: () => {} })
}))

vi.mock('../hooks/useXrAr.js', () => ({
    default: () => ({
        xrStore: {},
        supportedXrModes: { vr: false, ar: false },
        isXrPresenting: false,
        handleEnterXrSession: vi.fn(),
        handleExitXrSession: vi.fn()
    })
}))

vi.mock('../studio/components/StudioViewport.jsx', () => ({
    default: () => <div data-testid="lane-body">viewer-scene</div>
}))

vi.mock('../raw/PublicGraphSurface.jsx', () => ({ default: () => <div /> }))

vi.mock('../components/LiveProjectScene.jsx', () => ({ default: () => <div /> }))

vi.mock('../raw/components/RawEditor.jsx', () => ({
    default: () => <div data-testid="lane-body">node canvas</div>
}))

// Every surface that draws the bar, one row each. The row is the contract: a
// seventh lane added later does not join it by being written, it joins it by
// being added here — and until it is, nothing tells anyone that its bar still
// stands inside somebody else's window.
//
// `body` is what proves the lane actually got as far as rendering; without it
// an "absent" assertion passes on a lane that threw before drawing anything.
const LANES = [
    {
        name: '/tools',
        body: () => document.querySelector('.tr-page'),
        render: () => render(<ToolsRoom isLocalInstall />)
    },
    {
        name: '/wiki',
        body: () => document.querySelector('.wiki-header'),
        render: () => render(<WikiPage />)
    },
    {
        name: '/{space}/projects',
        body: () => document.querySelector('.sc-page'),
        render: () => render(<SpaceContentsPage spaceId="br_id_ge" />)
    },
    {
        name: 'the blank node canvas',
        body: () => screen.queryByTestId('lane-body'),
        render: () => render(<BlankNodeWorkspaceApp spaceId="main" />)
    },
    {
        name: 'the published viewer',
        body: () => screen.queryByTestId('lane-body'),
        render: () => render(<PublicProjectViewer spaceId="main" projectId="p" spaceLabel="Main Space" />)
    }
]

// StudioHub, RawHub and StudioChatSurface are deliberately NOT in the table:
// on this branch none of them renders a SurfaceBar at all. When one of them
// grows a bar it owes this table a row.

const bars = () => document.querySelectorAll('nav[aria-label="di.iiii"]')

describe('?embed=1 hides navigation chrome on every lane', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/')
    })

    for (const lane of LANES) {
        it(`${lane.name} draws the bar as a page`, async () => {
            window.history.replaceState(null, '', '/')
            lane.render()

            await waitFor(() => expect(lane.body()).toBeTruthy())
            expect(bars()).toHaveLength(1)
        })

        it(`${lane.name} draws no bar in a window`, async () => {
            window.history.replaceState(null, '', '/?embed=1')
            lane.render()

            await waitFor(() => expect(lane.body()).toBeTruthy())
            expect(bars()).toHaveLength(0)
        })
    }
})
