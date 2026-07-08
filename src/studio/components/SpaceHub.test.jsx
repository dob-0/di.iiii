import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceHub from './SpaceHub.jsx'

const listServerSpaces = vi.fn()
const getServerConfig = vi.fn()
const updateServerSpace = vi.fn()
const deleteServerSpace = vi.fn()
const getApiAuthProviders = vi.fn()

let authState

vi.mock('../../hooks/useAuthSession.js', () => ({
    default: () => authState
}))

vi.mock('../../services/serverSpaces.js', () => ({
    listServerSpaces: (...args) => listServerSpaces(...args),
    getServerConfig: (...args) => getServerConfig(...args),
    createServerSpace: vi.fn(),
    updateServerSpace: (...args) => updateServerSpace(...args),
    deleteServerSpace: (...args) => deleteServerSpace(...args),
    patchServerConfig: vi.fn(),
    // GithubSyncSection (rendered on demand from a card) uses these.
    getSpaceGithubLink: () => Promise.resolve(null),
    connectSpaceGithub: vi.fn(),
    disconnectSpaceGithub: vi.fn(),
    getGithubAppInfo: () => Promise.resolve({ configured: false }),
    listGithubRepos: () => Promise.resolve({ repos: [] })
}))

vi.mock('../../project/services/projectsApi.js', () => ({
    listProjects: () => Promise.resolve([]),
    getProject: () => Promise.resolve(null),
    updateProject: vi.fn()
}))

vi.mock('../../services/apiClient.js', () => ({
    getApiAuthProviders: (...args) => getApiAuthProviders(...args),
    getOAuthUrl: (provider) => `/serverXR/api/auth/${provider}`
}))

vi.mock('../utils/studioRouting.js', () => ({
    buildStudioHubPath: (spaceId) => `/${spaceId || ''}/studio`,
    navigateToStudioPath: vi.fn()
}))

const mockAppNavigate = vi.fn()

vi.mock('../../utils/appNavigate.js', () => ({
    appNavigate: (...args) => mockAppNavigate(...args)
}))

const cardActionsFor = (spaceId) => {
    const card = screen.getByText(spaceId).closest('.ssh-space-card')
    return [...card.querySelectorAll('.ssh-card-btn')].map((btn) => btn.textContent)
}

describe('SpaceHub', () => {
    beforeEach(() => {
        listServerSpaces.mockReset()
        getServerConfig.mockReset()
        getServerConfig.mockResolvedValue({})
        getApiAuthProviders.mockReset()
        mockAppNavigate.mockReset()
        authState = {
            authenticated: true,
            type: 'session',
            role: 'editor',
            canCreateSpace: true,
            ownedSpaceCount: 1,
            spaceLimit: 3
        }
    })

    it('shows management actions only on spaces the account owns', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true },
            { id: 'theirs', label: 'Theirs', isOwner: false, isPublic: true }
        ])

        render(<SpaceHub />)

        await screen.findByText('mine')
        expect(cardActionsFor('mine')).toEqual(
            expect.arrayContaining(['Rename', 'Delete', 'GitHub sync'])
        )
        // Owner is not an admin — no Set main anywhere.
        expect(cardActionsFor('mine')).not.toContain('Set main')
        // Someone else's public space: no management, only the live-link Copy.
        expect(cardActionsFor('theirs')).toEqual(['Copy'])
        expect(screen.getByText('View live')).toBeTruthy()
    })

    it('clicking a public space you cannot enter goes to its live view, scoped spaces open the editor', async () => {
        const { navigateToStudioPath } = await import('../utils/studioRouting.js')
        authState = { ...authState, type: 'guest', canCreateSpace: false, spaces: ['main'] }
        listServerSpaces.mockResolvedValue([
            { id: 'main', label: 'Main Space', isOwner: false, isPublic: true },
            { id: 'beyond-form', label: 'Beyond Form', isOwner: false, isPublic: true }
        ])

        render(<SpaceHub />)

        // Guest is scoped into main (open jam) — the card still opens the editor.
        fireEvent.click(await screen.findByText('Main Space'))
        expect(navigateToStudioPath).toHaveBeenCalledWith('/main/studio')
        expect(mockAppNavigate).not.toHaveBeenCalled()

        // A public space outside the session scope goes straight to the live view.
        fireEvent.click(screen.getByText('Beyond Form'))
        expect(mockAppNavigate).toHaveBeenCalledWith('/beyond-form')
    })

    it('shows the live public link with a copy action on public spaces', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'showroom', label: 'Showroom', isOwner: true, isPublic: true },
            { id: 'drafts', label: 'Drafts', isOwner: true, isPublic: false }
        ])

        render(<SpaceHub />)

        await screen.findByText('showroom')
        const liveLink = screen.getByRole('link', { name: /\/showroom$/ })
        expect(liveLink.getAttribute('target')).toBe('_blank')
        expect(screen.getByText('Live')).toBeTruthy()

        const draftsCard = screen.getByText('drafts').closest('.ssh-space-card')
        expect(draftsCard.querySelector('.ssh-live-link')).toBeNull()
    })

    it('gives admins management everywhere, including Set main', async () => {
        authState = { ...authState, role: 'admin' }
        listServerSpaces.mockResolvedValue([
            { id: 'anyones', label: 'Anyones', isOwner: false }
        ])

        render(<SpaceHub />)

        await screen.findByText('anyones')
        expect(cardActionsFor('anyones')).toEqual(
            expect.arrayContaining(['Rename', 'Delete', 'Set main'])
        )
    })

    it('shows guests a sandbox banner and no management or create controls', async () => {
        authState = { ...authState, type: 'guest', canCreateSpace: false, ownedSpaceCount: 0 }
        listServerSpaces.mockResolvedValue([
            { id: 'sandbox-abc', label: 'Guest Sandbox', kind: 'sandbox', isOwner: false }
        ])

        render(<SpaceHub />)

        await screen.findByText('sandbox-abc')
        expect(screen.getByText(/private temporary sandbox/i)).toBeTruthy()
        expect(cardActionsFor('sandbox-abc')).toEqual([])
        expect(screen.getByRole('button', { name: 'Sign in to create' })).toBeTruthy()
        expect(screen.queryByText(/Space limit reached/)).toBeNull()
    })

    it('sign-in button reveals working OAuth provider links instead of a broken token login', async () => {
        authState = { ...authState, authenticated: false, type: null }
        listServerSpaces.mockResolvedValue([])
        getApiAuthProviders.mockResolvedValue({ github: true, google: false })

        render(<SpaceHub />)

        fireEvent.click(await screen.findByRole('button', { name: 'Sign in to create' }))

        await waitFor(() => {
            const link = screen.getByRole('link', { name: 'Continue with GitHub' })
            expect(link.getAttribute('href')).toBe('/serverXR/api/auth/github')
        })
    })
})
