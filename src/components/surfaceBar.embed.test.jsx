import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceContentsPage from '../pages/SpaceContentsPage.jsx'
import ToolsRoom from '../tools/ToolsRoom.jsx'
import WikiPage from '../wiki/WikiPage.jsx'
import BlankNodeWorkspaceApp from '../raw/BlankNodeWorkspaceApp.jsx'
import PublicProjectViewer from '../project/components/PublicProjectViewer.jsx'
import StudioShell from '../studio/components/StudioShell.jsx'
import RawEditor from '../raw/components/RawEditor.jsx'
import RawOutSurface from '../raw/components/RawOutSurface.jsx'
import MapSurface from '../map/MapSurface.jsx'
import MapOutput from '../map/MapOutput.jsx'

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

// The bare canvas lane is about the bar BlankNodeWorkspaceApp draws, so its
// editor stays a stub. A project's canvas is the real editor: it draws its own.
vi.mock('../raw/components/RawEditor.jsx', async (importOriginal) => {
    const actual = await importOriginal()
    const RealRawEditor = actual.default
    return {
        ...actual,
        default: (props) => (props.projectId
            ? <RealRawEditor {...props} />
            : <div data-testid="lane-body">node canvas</div>)
    }
})

// What the three editors stand on, cut down to what decides the bar — the same
// cuts their own suites make (StudioShell.test, RawEditor.test).
vi.mock('../studio/components/StudioViewportLayout.jsx', () => ({
    default: () => <div data-testid="lane-body">studio viewport</div>
}))
vi.mock('../studio/components/StudioFloatingPanel.jsx', () => ({ default: ({ children }) => <div>{children}</div> }))
vi.mock('../studio/components/StudioControlCluster.jsx', () => ({ default: () => null }))
vi.mock('../studio/components/StudioQuickInsert.jsx', () => ({ default: () => null }))
vi.mock('../studio/components/StudioInspector.jsx', () => ({ default: () => null }))
vi.mock('../studio/components/StudioShellPanels.jsx', () => ({
    AssetsPanel: () => null,
    FilesPanel: () => null,
    HistoryPanel: () => null,
    JamEditPanel: () => null,
    LibraryPanel: () => null,
    ProjectPanel: () => null,
    PublishPanel: () => null,
    StructurePanel: () => null,
    TimelinePanel: () => null,
}))
vi.mock('../raw/components/RawViewport.jsx', () => ({ default: () => <div data-testid="lane-body">room</div> }))
vi.mock('../raw/components/RawGraphSurface.jsx', () => ({ default: () => <div data-testid="raw-graph" /> }))
vi.mock('../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: vi.fn(), replaceDocument: vi.fn(() => Promise.resolve()) })
}))
vi.mock('../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn(), messages: [], sendChatMessage: vi.fn() })
}))
vi.mock('../map/useMapDocument.js', () => {
    const mapping = { surfaces: [], cues: [], output: { width: 1920, height: 1080 } }
    const document = { projectMeta: { id: 'p', title: 'A room' }, nodes: [], mappingState: mapping }
    const noop = () => {}
    return {
        mapChannelName: (id) => `map-${id}`,
        useMapChannelListener: noop,
        useMapDocument: () => ({
            document, mapping, surfaces: [], syncState: null, store: {}, applyOps: noop,
            addSurface: noop, updateSurface: noop, deleteSurface: noop, reorderSurfaces: noop, setOutput: noop,
            upsertAsset: noop, addCue: noop, updateCue: noop, deleteCue: noop, reorderCues: noop, fireCue: noop
        })
    }
})
vi.mock('../map/MapStage.jsx', () => ({ default: () => <div data-testid="lane-body">wall</div> }))
vi.mock('../project/tops/useMachinePresence.js', () => ({
    useMachinePresence: () => ({ machines: [], machine: null })
}))
vi.mock('../map/lightingLink.js', async (importOriginal) => ({
    ...(await importOriginal()),
    probeLightingDesk: async () => false
}))
vi.mock('../rig/RigBlackout.jsx', () => ({ default: () => null }))

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
    },
    {
        name: 'the Studio editor',
        body: () => screen.queryByTestId('lane-body'),
        render: () => renderStudio()
    },
    {
        name: 'the Nodes project canvas',
        body: () => document.querySelector('.raw-topbar.is-seeded'),
        render: () => renderNodes()
    },
    {
        name: 'the Projection desk',
        body: () => document.querySelector('header.map-bar'),
        render: () => render(<MapSurface spaceId="main" projectId="p" />)
    }
]

// StudioHub (which is also the Nodes project list since 2026-09-23) and
// StudioChatSurface are deliberately NOT in the table: on this branch neither
// renders a SurfaceBar at all. When one of them
// grows a bar it owes this table a row.

function renderStudio(overrides = {}) {
    return render(
        <StudioShell
            document={{ projectMeta: { id: 'p', title: 'A room' }, assets: [] }}
            selectedEntity={null}
            selectedEntityIds={[]}
            entities={[]}
            inspectorSections={[]}
            inspectorValues={{}}
            assetOptions={[]}
            liveProjectState={{ spaceId: 'main', spaceLabel: 'Main Space' }}
            {...overrides}
        />
    )
}

// An empty project opens in zen, where the bar goes with the rest of the
// chrome; this is the project someone is working in.
function renderNodes() {
    window.localStorage.setItem('dii.raw.zen.p', 'off')
    return render(<RawEditor projectId="p" spaceId="main" />)
}

const bars = () => document.querySelectorAll('nav[aria-label="di.iiii"]')

describe('?embed=1 hides navigation chrome on every lane', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/')
        window.localStorage.removeItem('dii.raw.zen.p')
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

// A presentation shows the work, not the tool — the bar's own contract. The
// three editors each have their own ways of becoming one, and the projector
// pages never carry a bar at all.
describe('a presentation draws no bar', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/')
        window.localStorage.removeItem('dii.raw.zen.p')
    })

    it('Studio carries the project in its bar, and names Projection for it', async () => {
        renderStudio()
        await waitFor(() => expect(bars()).toHaveLength(1))
        const hrefs = [...bars()[0].querySelectorAll('.sbar-link')].map((a) => a.getAttribute('href'))
        expect(hrefs).toContain('/main/raw/projects/p')
        expect(hrefs).toContain('/main/map/p')
    })

    it('Studio in a headset draws no bar', async () => {
        renderStudio({ xrState: { isXrPresenting: true } })
        await waitFor(() => expect(screen.queryByTestId('lane-body')).toBeTruthy())
        expect(bars()).toHaveLength(0)
    })

    it('Studio with its UI hidden (H) draws no bar', async () => {
        renderStudio()
        await waitFor(() => expect(bars()).toHaveLength(1))
        fireEvent.keyDown(window, { key: 'h' })
        expect(bars()).toHaveLength(0)
    })

    it('the Nodes canvas in zen draws no bar', async () => {
        window.localStorage.setItem('dii.raw.zen.p', 'on')
        render(<RawEditor projectId="p" spaceId="main" />)
        await waitFor(() => expect(screen.queryByTestId('raw-graph')).toBeTruthy())
        expect(document.querySelector('.raw-topbar.is-seeded')).toBeNull()
        expect(bars()).toHaveLength(0)
    })

    it('the Nodes canvas opened full-screen onto its room draws no bar', async () => {
        renderNodes()
        await waitFor(() => expect(bars()).toHaveLength(1))
        fireEvent.click(screen.getByRole('button', { name: /^Scene/ }))
        await waitFor(() => expect(document.querySelector('.raw-world-fullscreen')).toBeTruthy())
        expect(bars()).toHaveLength(0)
    })

    it('the Nodes topbar makes room for the bar only while the bar is there', async () => {
        renderNodes()
        await waitFor(() => expect(bars()).toHaveLength(1))
        expect(document.querySelector('.raw-topbar').classList.contains('is-under-sbar')).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: /^Scene/ }))
        await waitFor(() => expect(bars()).toHaveLength(0))
        expect(document.querySelector('.raw-topbar').classList.contains('is-under-sbar')).toBe(false)
    })

    it('/{space}/map/{project}/out draws no bar', async () => {
        render(<MapOutput spaceId="main" projectId="p" />)
        await waitFor(() => expect(screen.queryByTestId('lane-body')).toBeTruthy())
        expect(bars()).toHaveLength(0)
    })

    it('/{space}/raw/projects/{project}/out draws no bar', async () => {
        render(<RawOutSurface projectId="p" spaceId="main" />)
        await waitFor(() => expect(screen.queryByTestId('lane-body')).toBeTruthy())
        expect(bars()).toHaveLength(0)
    })
})
