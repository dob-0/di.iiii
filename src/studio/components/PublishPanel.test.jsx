import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublishPanel } from './StudioShellPanels.jsx'

vi.mock('../../services/serverSpaces.js', () => ({
    listCommonsAssets: vi.fn(() => Promise.resolve([]))
}))
vi.mock('../../hooks/useDriveImport.js', () => ({
    useDriveImport: () => ({ status: 'idle' })
}))

const authState = vi.hoisted(() => ({ current: { type: null } }))
vi.mock('../../hooks/useAuthSession.js', () => ({
    default: () => authState.current
}))
vi.mock('../../services/apiClient.js', () => ({
    getApiAuthProviders: vi.fn(() => Promise.resolve({ github: true, google: true })),
    getOAuthUrl: (provider) => `/api/auth/${provider}`
}))

const baseProps = {
    document: { publishState: {} },
    publishState: { shareEnabled: true },
    onPublishPatch: vi.fn(),
    onSetLiveProject: vi.fn(),
    onClearLiveProject: vi.fn(),
    onCopyShareLink: vi.fn(),
    onExportProject: vi.fn(),
    exportStatus: null,
    onImportProjectFile: vi.fn(),
    xrState: { supportedXrModes: { vr: false, ar: false } },
    presentationState: { entryView: 'scene' },
    onPresentationPatch: vi.fn(),
    onSaveCurrentCamera: vi.fn(),
    activity: []
}

const liveState = (overrides = {}) => ({
    spaceId: 'demo',
    spaceLabel: 'demo',
    currentLiveProjectId: 'p1',
    isLiveProject: true,
    isUpdating: false,
    ...overrides
})

describe('PublishPanel space visibility', () => {
    // Regression guard: "Set as live project" used to report "Published" while
    // the space stayed private and visitors hit a login wall. The panel must
    // always disclose the space's public state next to the live-project action.
    it('warns and offers one-click make-public when the space is private', () => {
        const onMakeSpacePublic = vi.fn()
        render(
            <PublishPanel
                {...baseProps}
                liveProjectState={liveState({ isPublic: false })}
                onMakeSpacePublic={onMakeSpacePublic}
            />
        )
        expect(screen.getByText(/Space is private — visitors will see a login wall/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Make space public' }))
        expect(onMakeSpacePublic).toHaveBeenCalledTimes(1)
    })

    it('confirms visibility when the space is public', () => {
        render(
            <PublishPanel
                {...baseProps}
                liveProjectState={liveState({ isPublic: true })}
                onMakeSpacePublic={vi.fn()}
            />
        )
        expect(screen.getByText(/Space is public — visitors can enter/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Make space public' })).toBeNull()
    })

    // Regression guard: sign-in nudges used to be ambient-only — the moment a
    // guest opens Share (their work just became keep-worthy) now leads with
    // the upgrade path instead of publish controls their sandbox can't use.
    it('shows guests the keep-this-work path instead of publish controls', async () => {
        authState.current = { type: 'guest' }
        try {
            render(
                <PublishPanel
                    {...baseProps}
                    liveProjectState={liveState({ isPublic: false })}
                    onMakeSpacePublic={vi.fn()}
                />
            )
            expect(screen.getByText('Keep this work')).toBeTruthy()
            expect(await screen.findByRole('button', { name: 'Continue with GitHub' })).toBeTruthy()
            expect(screen.getByRole('button', { name: 'Export project' })).toBeTruthy()
            expect(screen.queryByText('Share enabled')).toBeNull()
            expect(screen.queryByRole('button', { name: 'Set as live project' })).toBeNull()
        } finally {
            authState.current = { type: null }
        }
    })

    it('shows neither state before space meta has loaded', () => {
        render(
            <PublishPanel
                {...baseProps}
                liveProjectState={liveState({ isPublic: null })}
                onMakeSpacePublic={vi.fn()}
            />
        )
        expect(screen.queryByText(/Space is private/)).toBeNull()
        expect(screen.queryByText(/Space is public/)).toBeNull()
    })
})
