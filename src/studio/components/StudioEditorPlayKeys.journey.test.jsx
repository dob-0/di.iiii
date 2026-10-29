import { render, screen, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react'
import { useEffect } from 'react'
import { isPlaying } from '../../project/play/playingFlag.js'
import { documentFingerprint } from '../../project/play/playCopy.js'
import { PlayButton, PlayHost, usePlay } from '../../project/components/PlayButton.jsx'

const mockApplyLocalOps = vi.fn()
// Unlike the sibling suite's stub, this one really applies the ops to the
// store — the delete guard is about what happens to a document that has
// something in it, and an entity has to exist before it can be taken.
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: ({ store }) => ({
        applyLocalOps: (ops) => {
            mockApplyLocalOps(ops)
            store.dispatch({ type: 'apply-ops', ops: Array.isArray(ops) ? ops : [ops] })
        },
        replaceDocument: vi.fn(() => Promise.resolve())
    })
}))
vi.mock('../../project/hooks/useProjectPresence.js', () => ({
    useProjectPresence: () => ({ users: [], cursors: [], emitCursor: vi.fn(), clearCursor: vi.fn() })
}))
vi.mock('../../hooks/useXrAr.js', () => ({
    default: () => ({
        xrStore: {},
        isXrPresenting: false,
        canEnterVr: false,
        canEnterAr: false,
        handleEnterXrSession: vi.fn(),
        handleExitXrSession: vi.fn()
    })
}))
vi.mock('../../hooks/useSpaceAssets.js', () => ({
    default: () => ({ assets: [], refresh: vi.fn() })
}))
vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: () => Promise.resolve(null),
    listServerSpaces: () => Promise.resolve([]),
    deleteServerAsset: () => Promise.resolve(),
    importCommonsAssets: () => Promise.resolve({}),
    importDriveAssets: () => Promise.resolve({}),
    importDriveSelection: () => Promise.resolve({}),
    setAssetShared: () => Promise.resolve(),
    updateServerSpace: () => Promise.resolve()
}))
vi.mock('../../project/authorship.js', () => ({
    currentSubject: () => 'guest:me',
    currentAuthor: () => ({ subject: 'guest:me', label: 'Me' })
}))
// The walk (WebGL) is stood in for. Everything else is REAL: StudioEditor's own keydown handlers, the store, the ops.
// Like the real walk, it ends Play on Escape (LiveProjectScene's Escape → onExit → onNavModeChange).
vi.mock('../../project/components/PublicProjectSceneSurface.jsx', () => ({
    default: function WalkStub({ onNavModeChange }) {
        useEffect(() => {
            const onKey = (event) => { if (event.key === 'Escape') onNavModeChange('orbit') }
            window.addEventListener('keydown', onKey)
            return () => window.removeEventListener('keydown', onKey)
        }, [onNavModeChange])
        return <div data-testid="walk-stub" />
    }
}))
// The shell stand-in mounts Play the way the real StudioShell does (StudioShell.jsx: PlayButton + PlayHost on the live document).
vi.mock('./StudioShell.jsx', () => ({
    default: function ShellStub(props) {
        const play = usePlay()
        return (
            <>
                <button type="button" onClick={() => props.onCreateEntity('box')}>create-entity</button>
                <output data-testid="doc">{documentFingerprint({ entities: props.entities })}</output>
                <output data-testid="entity-count">{props.entities?.length ?? 0}</output>
                <PlayButton onPlay={play.start} />
                <PlayHost playing={play.playing} document={{ projectMeta: { id: 'p', spaceId: 's' }, entities: props.entities, worldState: {}, nodes: [], edges: [] }} onStop={play.stop} />
            </>
        )
    }
}))

import StudioEditor from './StudioEditor.jsx'

describe('Play: no key reaches the editor (the real keydown path)', () => {
    afterEach(() => { mockApplyLocalOps.mockClear() })

    it('select, Play, Backspace, Ctrl+D, Ctrl+Z, Stop: the document fingerprint is equal, no op written', async () => {
        render(<StudioEditor projectId="proj-play-keys" />)
        fireEvent.click(screen.getByRole('button', { name: 'create-entity' }))
        const hashBefore = screen.getByTestId('doc').textContent
        expect(screen.getByTestId('entity-count').textContent).toBe('1')
        const opsBefore = mockApplyLocalOps.mock.calls.length

        await act(async () => { fireEvent.click(screen.getByText('Play ▸')) })
        expect(await screen.findByText('Playing')).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Backspace' })
        fireEvent.keyDown(window, { key: 'Delete' })
        fireEvent.keyDown(window, { key: 'd', code: 'KeyD', ctrlKey: true })
        fireEvent.keyDown(window, { key: 'D', code: 'KeyD', shiftKey: true })
        fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true })
        fireEvent.keyDown(window, { key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true })
        fireEvent.keyDown(window, { key: 'f', code: 'KeyF' })
        // nothing asked, nothing written, while playing
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(mockApplyLocalOps.mock.calls.length).toBe(opsBefore)
        expect(screen.getByTestId('doc').textContent).toBe(hashBefore)

        fireEvent.click(screen.getByText('Stop ■'))
        expect(screen.queryByText('Playing')).toBeNull()
        // the release is one macrotask late (the Esc that ends Play must not also reach the editor)
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
        expect(screen.getByTestId('doc').textContent).toBe(hashBefore)
        expect(mockApplyLocalOps.mock.calls.length).toBe(opsBefore)

        // and the editor's keys work again after Stop: Backspace asks first
        fireEvent.keyDown(window, { key: 'Backspace' })
        expect(screen.getByRole('dialog')).toHaveTextContent('Delete')
    })

    it('Esc ends Play, and the same Esc still counts as playing for every editor handler (it must not close the Objects window)', async () => {
        render(<StudioEditor projectId="proj-play-esc" />)
        await act(async () => { fireEvent.click(screen.getByText('Play ▸')) })
        expect(await screen.findByText('Playing')).toBeTruthy()
        // a handler registered after the walk's, as the editor's effects can be: what it sees in the Esc that ends Play
        let seenPlaying = null
        const late = (event) => { if (event.key === 'Escape') seenPlaying = isPlaying() }
        window.addEventListener('keydown', late)
        await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
        window.removeEventListener('keydown', late)
        expect(screen.queryByText('Playing')).toBeNull()
        expect(seenPlaying).toBe(true)
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
        expect(isPlaying()).toBe(false)
    })
})
