import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublicProjectViewer from './PublicProjectViewer.jsx'
import { PREVIEW_ENTER_EXHIBITION_KIND, PREVIEW_HOST_MESSAGE_TYPE, PREVIEW_PAINT_CONFIRMED_KIND } from '../../utils/presentationPreviewDocument.js'

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
    buildProjectEventsUrl: (...args) => buildProjectEventsUrlMock(...args),
    // The viewer asks how many things are on show in this space, to decide
    // whether there is a rest of the space worth offering a way to. One room
    // by default: these cases are about the room, not about its neighbours.
    listSpaceContents: (...args) => listSpaceContentsMock(...args),
    DEFAULT_PROJECT_SPACE_ID: 'main'
}))

const soundState = { on: false }
vi.mock('../../utils/roomSound.js', () => ({ roomHasSound: () => true }))
vi.mock('../../hooks/useRoomSound.js', () => ({
    default: () => ({ soundOn: soundState.on, locked: false, toggleSound: () => {} }),
    useVisitorSoundGate: () => {}
}))

const listSpaceContentsMock = vi.fn(async () => [{ id: 'p', slug: null, title: 'p', mode: 'scene', updatedAt: 0 }])

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


// F12 (a11y audit 2026-10-01): the name used to flip 'Sound on'/'Sound off' AND
// aria-pressed carried the state, so a screen reader said it twice.
describe('Sound switch', () => {
    afterEach(() => { getProjectDocumentMock.mockReset(); listProjectOpsMock.mockReset() })
    it.each([false, true])('has one constant name and carries the state in aria-pressed (on=%s)', async (on) => {
        soundState.on = on
        getProjectDocumentMock.mockResolvedValue({ version: 1, document: { projectMeta: { id: 'p', title: 'P' }, presentationState: { mode: 'scene', entryView: 'scene', codeHtml: '' }, entities: [] } })
        listProjectOpsMock.mockResolvedValue({ ops: [], latestVersion: 1 })
        render(<PublicProjectViewer spaceId="main" projectId="p" spaceLabel="Main" />)
        const button = await screen.findByRole('button', { name: 'Sound' })
        expect(button).toHaveAttribute('aria-pressed', String(on))
    })
})
