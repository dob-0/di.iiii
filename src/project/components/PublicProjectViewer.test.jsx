import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PublicProjectViewer from './PublicProjectViewer.jsx'
import { PREVIEW_ENTER_EXHIBITION_KIND, PREVIEW_HOST_MESSAGE_TYPE } from '../../utils/presentationPreviewDocument.js'

const {
    syncState,
    getProjectDocumentMock,
    listProjectOpsMock,
    buildProjectEventsUrlMock
} = vi.hoisted(() => ({
    syncState: {
        connectArgs: null,
        disconnect: vi.fn()
    },
    getProjectDocumentMock: vi.fn(),
    listProjectOpsMock: vi.fn(),
    buildProjectEventsUrlMock: vi.fn((projectId) => `/api/projects/${projectId}/events`)
}))

vi.mock('../services/projectSyncService.js', () => ({
    createProjectSyncService: () => ({
        connect: (args) => {
            syncState.connectArgs = args
        },
        disconnect: (...args) => syncState.disconnect(...args)
    })
}))

vi.mock('../services/projectsApi.js', () => ({
    getProjectDocument: (...args) => getProjectDocumentMock(...args),
    listProjectOps: (...args) => listProjectOpsMock(...args),
    buildProjectEventsUrl: (...args) => buildProjectEventsUrlMock(...args)
}))

vi.mock('../../hooks/useXrAr.js', () => ({
    default: () => ({
        xrStore: {},
        supportedXrModes: { vr: false, ar: false },
        isXrPresenting: false,
        handleEnterXrSession: vi.fn(),
        handleExitXrSession: vi.fn()
    })
}))

vi.mock('../../raw/PublicGraphSurface.jsx', () => ({
    default: function MockPublicGraphSurface({ interactive }) {
        return (
            <div>
                <div>viewer-graph</div>
                <div>graph-interactive:{String(Boolean(interactive))}</div>
            </div>
        )
    }
}))

vi.mock('../../studio/components/StudioViewport.jsx', () => ({
    default: function MockStudioViewport({ document, enableNavigation, showChrome, lowPower, playTimelines }) {
        return (
            <div>
                <div>viewer-scene:{document.presentationState?.entryView || 'scene'}</div>
                <div data-testid="viewport-flags">{`nav:${enableNavigation} chrome:${showChrome} low:${lowPower}`}</div>
                <div data-testid="viewport-timelines">{`play:${Boolean(playTimelines)}`}</div>
            </div>
        )
    }
}))

vi.mock('../../components/LiveProjectScene.jsx', () => ({
    default: function MockLiveProjectScene({ onExit, exitLabel }) {
        return (
            <div>
                <button type="button" onClick={onExit}>{exitLabel}</button>
            </div>
        )
    }
}))

describe('PublicProjectViewer', () => {
    afterEach(() => {
        syncState.connectArgs = null
        syncState.disconnect.mockReset()
        getProjectDocumentMock.mockReset()
        listProjectOpsMock.mockReset()
        buildProjectEventsUrlMock.mockClear()
    })

    it('updates the public surface live when Studio changes the presentation entry view', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: {
                    id: 'live-project',
                    title: 'Live Project'
                },
                presentationState: {
                    mode: 'scene',
                    entryView: 'scene',
                    codeHtml: ''
                },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({
            ops: [],
            latestVersion: 1
        })

        const { container } = render(
            <PublicProjectViewer
                spaceId="main"
                projectId="live-project"
                spaceLabel="Main Space"
            />
        )

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        await waitFor(() => {
            expect(syncState.connectArgs?.onProjectOp).toEqual(expect.any(Function))
        })

        await act(async () => {
            syncState.connectArgs?.onProjectOp?.({
                version: 2,
                ops: [{
                    type: 'setPresentationState',
                    payload: {
                        patch: {
                            mode: 'code',
                            entryView: 'code',
                            codeHtml: '<main>Live code</main>'
                        }
                    }
                }]
            })
        })

        await waitFor(() => {
            const iframe = container.querySelector('iframe')
            expect(iframe).not.toBeNull()
            expect(iframe?.getAttribute('srcdoc')).toContain('Live code')
            expect(iframe?.getAttribute('srcdoc')).toContain(PREVIEW_HOST_MESSAGE_TYPE)
            // published pages run getUserMedia (e.g. br_id_ge rite); without
            // delegation the sandboxed iframe hard-denies camera on mobile
            expect(iframe?.getAttribute('allow')).toContain('camera')
            // no deviceAccess opt-in → the page must stay origin-isolated
            expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')
        })
    })

    it('renders the code-mode page without ever mounting a scene renderer', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'code-only', title: 'Code Only' },
                presentationState: { mode: 'code', entryView: 'code', codeHtml: '<main>page</main>' },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        const { container } = render(
            <PublicProjectViewer spaceId="main" projectId="code-only" spaceLabel="Main Space" />
        )

        await waitFor(() => {
            expect(container.querySelector('iframe')).not.toBeNull()
        })
        expect(screen.queryByText(/^viewer-scene:/)).toBeNull()
    })

    it('grants a real origin (allow-same-origin) only when the owner opts into deviceAccess', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'rite', title: 'the rite' },
                presentationState: {
                    mode: 'code',
                    entryView: 'code',
                    codeHtml: '<main>the lamp</main>',
                    deviceAccess: true
                },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        const { container } = render(
            <PublicProjectViewer spaceId="br-id-ge" projectId="rite" spaceLabel="br_id_ge" />
        )

        await waitFor(() => {
            const iframe = container.querySelector('iframe')
            expect(iframe).not.toBeNull()
            // getUserMedia is impossible in an opaque origin: opted-in pages need both
            // the permission delegation and a real origin
            expect(iframe?.getAttribute('allow')).toContain('camera')
            expect(iframe?.getAttribute('sandbox')).toContain('allow-same-origin')
        })
    })

    it('swaps the code view for the 3D scene when the embedded page posts an enter-exhibition message', async () => {
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: {
                    id: 'wcc-project',
                    title: 'WCC'
                },
                presentationState: {
                    mode: 'code',
                    entryView: 'code',
                    codeHtml: '<button onclick="diiEnterExhibition()">Enter</button>'
                },
                entities: []
            }
        })
        listProjectOpsMock.mockResolvedValue({
            ops: [],
            latestVersion: 1
        })

        const { container } = render(
            <PublicProjectViewer
                spaceId="wcc"
                projectId="wcc-project"
                spaceLabel="WCC"
            />
        )

        const iframe = await waitFor(() => {
            const node = container.querySelector('iframe')
            expect(node).not.toBeNull()
            return node
        })
        Object.defineProperty(iframe, 'contentWindow', {
            configurable: true,
            value: window
        })
        await act(async () => {})

        await act(async () => {
            const event = new MessageEvent('message', {
                data: { type: PREVIEW_HOST_MESSAGE_TYPE, kind: PREVIEW_ENTER_EXHIBITION_KIND }
            })
            Object.defineProperty(event, 'source', {
                configurable: true,
                value: window
            })
            window.dispatchEvent(event)
        })

        expect(await screen.findByText('viewer-scene:code')).toBeInTheDocument()
        expect(container.querySelector('iframe')).toBeNull()
    })

    const sceneDocumentResponse = {
        version: 1,
        document: {
            projectMeta: { id: 'live-project', title: 'Live Project' },
            presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
            entities: []
        }
    }

    it('renders a static scene without navigation or chrome in ?preview=1 mode', async () => {
        window.history.replaceState(null, '', '/main?preview=1')
        try {
            getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

            expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
            expect(screen.getByTestId('viewport-flags').textContent).toBe('nav:false chrome:false low:true')
            expect(screen.queryByRole('button', { name: 'Walk / Fly' })).toBeNull()
            // hub-card preview thumbnails must not carry the view→create badge
            expect(screen.queryByText('Made with di.iiii')).toBeNull()
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })

    // ?embed=1 is what br_id_ge's ending has been asking for since it started
    // opening the field inside itself. Without it the viewer paints #05070a and
    // the embedded page can only answer with opaque paper of its own, which is
    // how a window became a rectangle pasted across the closing words.
    it('is glass, not paper, in ?embed=1 mode — no shell, no badge, no Walk / Fly', async () => {
        window.history.replaceState(null, '', '/main?embed=1')
        try {
            getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            const { container } = render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

            expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
            expect(container.querySelector('main').style.background).toBe('transparent')
            expect(screen.queryByRole('button', { name: 'Walk / Fly' })).toBeNull()
            expect(screen.queryByText('Made with di.iiii')).toBeNull()
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })

    // A code page is the case that actually matters here: br_id_ge's field is
    // an HTML project, so the srcdoc iframe is the surface that was opaque.
    it('leaves a code page its own ground in ?embed=1 mode', async () => {
        window.history.replaceState(null, '', '/main?embed=1')
        try {
            getProjectDocumentMock.mockResolvedValue({
                version: 1,
                document: {
                    projectMeta: { id: 'live-project', title: 'Live Project' },
                    presentationState: { mode: 'code', entryView: 'code', codeHtml: '<p>the field</p>' },
                    entities: []
                }
            })
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            const { container } = render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

            const frame = await screen.findByTitle('Live Project')
            expect(frame.style.background).toBe('transparent')
            expect(container.querySelector('main').style.background).toBe('transparent')
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })

    // The viewer's own shell going transparent was never enough: html/body/#root
    // carry --di-black, so an embedded page viewed on its own was still a black
    // box on both tiers after the mode shipped. Guards the class AND the shadow
    // trap — `document` is rebound inside this component, so a bare reference
    // would resolve to a project document and quietly do nothing.
    it('clears the document background in ?embed=1 mode, and gives it back on unmount', async () => {
        window.history.replaceState(null, '', '/main?embed=1')
        try {
            getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            const { unmount } = render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)
            expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
            expect(window.document.documentElement.classList.contains('dii-embed')).toBe(true)
            unmount()
            expect(window.document.documentElement.classList.contains('dii-embed')).toBe(false)
        } finally {
            window.history.replaceState(null, '', '/')
        }
    })

    it('keeps the dark shell and the badge when nothing asks to be embedded', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        // A visitor space, not `main`: the badge is deliberately absent on
        // di.iiii's own front room, where its href would lead back into the
        // room the visitor is standing in (madeWithBadge.test.jsx).
        const { container } = render(<PublicProjectViewer spaceId="wcc" projectId="live-project" spaceLabel="WCC" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        expect(container.querySelector('main').style.background).toBe('rgb(5, 7, 10)')
        expect(await screen.findByText('Made with di.iiii')).toBeInTheDocument()
    })

    it('keeps navigation and Walk / Fly outside preview mode', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        expect(screen.getByTestId('viewport-flags').textContent).toBe('nav:true chrome:true low:false')
        expect(await screen.findByRole('button', { name: 'Walk / Fly' })).toBeInTheDocument()
    })

    // Regression guard: the published viewer's default (orbit) view is
    // StudioViewport, where authored keyframes used to play ONLY while the
    // editor's Timeline scrubber was being dragged. Published scenes therefore
    // sat frozen on their authored pose forever, and the failure was invisible
    // -- the scene rendered perfectly, it just never moved. Walk mode animated
    // fine, which made it read as a data problem rather than a viewer one.
    it('tells the scene viewport to play authored timelines when published', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        expect(screen.getByTestId('viewport-timelines').textContent).toBe('play:true')
    })

    // Regression guard: walking/flying then clicking the scene's own exit
    // button used to say "← Exit" -- indistinguishable from actually leaving
    // the page, when it really just swaps back to the orbit viewer in place.
    // Confirmed live: the button worked correctly all along (round-trips back
    // to Walk / Fly), the bug was purely the misleading label.
    it('labels the walk-mode exit button "View mode", not a generic "Exit", and it returns to Walk / Fly', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

        const walkButton = await screen.findByRole('button', { name: 'Walk / Fly' })
        fireEvent.click(walkButton)

        const viewModeButton = await screen.findByRole('button', { name: '← View mode' })
        expect(screen.queryByRole('button', { name: '← Exit' })).toBeNull()

        fireEvent.click(viewModeButton)
        expect(await screen.findByRole('button', { name: 'Walk / Fly' })).toBeInTheDocument()
    })

    // Regression guard: the public viewer is the platform's widest audience and
    // used to offer no path from viewing into creating (UX audit 2026-07-10).
    it('offers the Made with di.iiii affordance to public visitors', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="wcc" projectId="live-project" spaceLabel="WCC" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        const badge = screen.getByRole('link', { name: /build your own space/i })
        expect(badge).toHaveAttribute('href', '/')
    })

    // A project made in the node lane used to publish here as an EMPTY ROOM:
    // this viewer rendered `entities` only. It now renders the graph too — the
    // node editor's own viewport shows spatial nodes AND root-scope entities in
    // one room, and the published page had simply never been pointed at it.
    describe('a project whose work is a node graph', () => {
        const graphDocument = {
            version: 1,
            document: {
                projectMeta: { id: 'live-project', title: 'Live Project' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                nodes: [{ id: 'n1', typeId: 'geom.cube' }],
                entities: []
            }
        }

        it('renders the graph instead of an empty entity room', async () => {
            getProjectDocumentMock.mockResolvedValue(graphDocument)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="dilijan" projectId="live-project" spaceLabel="Dilijan" />)

            expect(await screen.findByText('viewer-graph')).toBeInTheDocument()
            expect(screen.queryByText(/^viewer-scene:/)).toBeNull()
            // A visitor may look around; an author's affordances stay behind.
            expect(screen.getByText('graph-interactive:true')).toBeInTheDocument()
        })

        // DO NOT relax this into "a graph may be walked". Walk mode enters
        // LiveProjectScene, which reads `entities` and nothing else. With a
        // graph and no entity beside it there is literally nothing for it to
        // put in front of the visitor, so the button would swap the work they
        // are looking at for an empty room they would read as the room rather
        // than as the mode. It stays hidden until walk mode can render a graph;
        // the mixed case below is offered because its entities are real, not
        // because the graph became walkable.
        it('does not offer Walk / Fly, which would render the room without its work', async () => {
            getProjectDocumentMock.mockResolvedValue(graphDocument)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="dilijan" projectId="live-project" spaceLabel="Dilijan" />)

            // the visitor IS looking at work — that is what makes the swap a loss
            expect(await screen.findByText('viewer-graph')).toBeInTheDocument()
            expect(graphDocument.document.entities).toHaveLength(0)
            expect(screen.queryByRole('button', { name: /Walk \/ Fly/i })).toBeNull()
        })

        // The owner's settled model: ONE document carries both lanes. Wires,
        // scene and light live in the node editor; anything that must survive
        // for a visitor is made as an entity. Such a room used to be refused
        // walk mode purely because a graph sat beside it — which also meant no
        // headset entry at all, since Enter VR / Enter AR live inside
        // LiveProjectScene and walk mode is the only way in.
        it('offers Walk / Fly on a mixed room, where the entities are real', async () => {
            getProjectDocumentMock.mockResolvedValue({
                version: 1,
                document: {
                    projectMeta: { id: 'live-project', title: 'Live Project' },
                    presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                    nodes: [{ id: 'n1', typeId: 'geom.cube' }],
                    entities: [{ id: 'e1', type: 'box', components: { transform: { position: [0, 0, 0] } } }]
                }
            })
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="dilijan" projectId="live-project" spaceLabel="Dilijan" />)

            // orbit still shows the renderer that can hold both lanes
            expect(await screen.findByText('viewer-graph')).toBeInTheDocument()
            const walkButton = await screen.findByRole('button', { name: 'Walk / Fly' })

            // and it really reaches LiveProjectScene — the only door to XR
            fireEvent.click(walkButton)
            expect(await screen.findByRole('button', { name: '← View mode' })).toBeInTheDocument()
        })

        // Hidden entities are dropped with their whole subtree by
        // LiveProjectScene, so a graph room whose only entities are hidden is
        // the empty-room case wearing an entity array.
        it('does not count hidden entities as something to walk into', async () => {
            getProjectDocumentMock.mockResolvedValue({
                version: 1,
                document: {
                    projectMeta: { id: 'live-project', title: 'Live Project' },
                    presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                    nodes: [{ id: 'n1', typeId: 'geom.cube' }],
                    entities: [{ id: 'e1', type: 'box', components: { runtime: { visible: false } } }]
                }
            })
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="dilijan" projectId="live-project" spaceLabel="Dilijan" />)

            expect(await screen.findByText('viewer-graph')).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /Walk \/ Fly/i })).toBeNull()
        })

        it('leaves an entities-only project on the entity renderer', async () => {
            // The overwhelming majority of published pages. Nothing about them
            // may change.
            getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

            expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
            expect(screen.queryByText('viewer-graph')).toBeNull()
        })
    })

    // A composed opening shot and a room the visitor may walk are two unrelated
    // things, but the gate used to require entryView === 'scene', so choosing
    // 'fixed-camera' silently cost the room its Walk / Fly button — and with it
    // headset entry, which is only reachable through walk mode.
    describe('which entry views open onto a room', () => {
        const roomEntities = [{ id: 'e1', type: 'box', components: { transform: { position: [0, 0, 0] } } }]

        it('offers Walk / Fly on a fixed-camera room — the shot is where the visit starts, not a cage', async () => {
            getProjectDocumentMock.mockResolvedValue({
                version: 1,
                document: {
                    projectMeta: { id: 'live-project', title: 'Live Project' },
                    presentationState: {
                        mode: 'scene',
                        entryView: 'fixed-camera',
                        codeHtml: '',
                        fixedCamera: { locked: true, position: [0, 2, 6], target: [0, 1, 0] }
                    },
                    entities: roomEntities
                }
            })
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

            expect(await screen.findByText('viewer-scene:fixed-camera')).toBeInTheDocument()
            // the authored shot still holds the orbit view still
            expect(screen.getByTestId('viewport-flags').textContent).toBe('nav:false chrome:true low:false')

            const walkButton = await screen.findByRole('button', { name: 'Walk / Fly' })
            fireEvent.click(walkButton)
            expect(await screen.findByRole('button', { name: '← View mode' })).toBeInTheDocument()
        })

        it('offers nothing to walk into on a code page, which has no room at all', async () => {
            getProjectDocumentMock.mockResolvedValue({
                version: 1,
                document: {
                    projectMeta: { id: 'code-only', title: 'Code Only' },
                    presentationState: { mode: 'code', entryView: 'code', codeHtml: '<main>page</main>' },
                    entities: roomEntities
                }
            })
            listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

            const { container } = render(<PublicProjectViewer spaceId="main" projectId="code-only" spaceLabel="Main Space" />)

            await waitFor(() => {
                expect(container.querySelector('iframe')).not.toBeNull()
            })
            // entities present and walkable — the entry view is the whole reason
            expect(screen.queryByRole('button', { name: /Walk \/ Fly/i })).toBeNull()
        })
    })
    it('catches up from the version it just loaded, not from 0, when the stream is ready first', async () => {
        // The ordering that caused the bug: SSE onReady fires while the
        // snapshot GET is still in flight. versionRef is 0 until it resolves,
        // and ?since=0 replays the whole retained log -- every replaceDocument
        // op in it another full copy of the document (measured 2026-08-27 on
        // staging: 3.97 MB of ops behind a 1.98 MB document, 67% discarded).
        let resolveDocument
        getProjectDocumentMock.mockReturnValue(new Promise((resolve) => {
            resolveDocument = resolve
        }))
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 7 })

        render(<PublicProjectViewer spaceId="dilijan" projectId="the-yard" spaceLabel="dilijan" />)

        await waitFor(() => {
            expect(syncState.connectArgs?.onReady).toEqual(expect.any(Function))
        })
        // Stream ready while the snapshot is still pending: nothing may be
        // asked for yet, because the version to ask from is not known yet.
        let readyPromise
        act(() => {
            readyPromise = syncState.connectArgs.onReady()
        })
        expect(listProjectOpsMock).not.toHaveBeenCalled()

        await act(async () => {
            resolveDocument({
                version: 7,
                document: {
                    projectMeta: { id: 'the-yard', title: 'The Yard' },
                    presentationState: { mode: 'code', entryView: 'code', codeHtml: '<main>yard</main>' },
                    entities: []
                }
            })
            await readyPromise
        })

        expect(listProjectOpsMock).toHaveBeenCalledTimes(1)
        expect(listProjectOpsMock).toHaveBeenCalledWith('the-yard', 7)
    })

    it('retries the snapshot instead of replaying the whole log when the document load failed', async () => {
        getProjectDocumentMock.mockRejectedValue(new Error('offline'))
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 7 })

        render(<PublicProjectViewer spaceId="dilijan" projectId="the-yard" spaceLabel="dilijan" />)

        await waitFor(() => {
            expect(syncState.connectArgs?.onReady).toEqual(expect.any(Function))
        })
        await waitFor(() => {
            expect(getProjectDocumentMock.mock.calls.length).toBeGreaterThan(0)
        })
        const loadsBefore = getProjectDocumentMock.mock.calls.length

        await act(async () => {
            await syncState.connectArgs.onReady()
        })

        // No document to apply ops onto -- the log would be fetched and thrown
        // away, which on the-yard is 3.97 MB.
        expect(listProjectOpsMock).not.toHaveBeenCalled()
        expect(getProjectDocumentMock.mock.calls.length).toBeGreaterThan(loadsBefore)
    })

})

describe('arrive walking', () => {
    it('enters walk mode when the arrive-walking flag is set and the room is walkable', async () => {
        window.sessionStorage.setItem('dii:arrive-walking', '1')
        getProjectDocumentMock.mockResolvedValue({
            version: 1,
            document: {
                projectMeta: { id: 'room-3', title: 'Room 3' },
                presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' },
                entities: [{
                    id: 'e-floor',
                    type: 'box',
                    name: 'Floor',
                    components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }
                }]
            }
        })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="dilijan" projectId="room-3" spaceLabel="dilijan" />)

        await waitFor(() => {
            expect(screen.getByText('← View mode')).toBeInTheDocument()
        })
        expect(window.sessionStorage.getItem('dii:arrive-walking')).toBe(null)
    })
})
