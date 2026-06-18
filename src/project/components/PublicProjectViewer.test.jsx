import { act, render, screen, waitFor } from '@testing-library/react'
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
    default: function MockStudioViewport({ document }) {
        return <div>viewer-scene:{document.presentationState?.entryView || 'scene'}</div>
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
})
