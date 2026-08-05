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

vi.mock('../../studio/components/StudioViewport.jsx', () => ({
    default: function MockStudioViewport({ document, enableNavigation, showChrome, lowPower }) {
        return (
            <div>
                <div>viewer-scene:{document.presentationState?.entryView || 'scene'}</div>
                <div data-testid="viewport-flags">{`nav:${enableNavigation} chrome:${showChrome} low:${lowPower}`}</div>
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

    it('keeps navigation and Walk / Fly outside preview mode', async () => {
        getProjectDocumentMock.mockResolvedValue(sceneDocumentResponse)
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })

        render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        expect(screen.getByTestId('viewport-flags').textContent).toBe('nav:true chrome:true low:false')
        expect(await screen.findByRole('button', { name: 'Walk / Fly' })).toBeInTheDocument()
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

        render(<PublicProjectViewer spaceId="main" projectId="live-project" spaceLabel="Main Space" />)

        expect(await screen.findByText('viewer-scene:scene')).toBeInTheDocument()
        const badge = screen.getByRole('link', { name: /build your own space/i })
        expect(badge).toHaveAttribute('href', '/')
    })
})
