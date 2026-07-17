import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceHub from './SpaceHub.jsx'

const listServerSpaces = vi.fn()
const getServerConfig = vi.fn()
const updateServerSpace = vi.fn()
const deleteServerSpace = vi.fn()
const getApiAuthProviders = vi.fn()
const uploadServerAsset = vi.fn()
const purgeStaleSandboxes = vi.fn()

let authState
// Admin-only summary the hub's collapsed sandbox row renders from.
let sandboxSummary = null

vi.mock('../../hooks/useAuthSession.js', () => ({
    default: () => authState
}))

vi.mock('../../services/serverSpaces.js', () => ({
    listServerSpaces: (...args) => listServerSpaces(...args),
    fetchServerSpacesIndex: async (...args) => ({
        spaces: await listServerSpaces(...args),
        sandboxSummary
    }),
    purgeStaleSandboxes: (...args) => purgeStaleSandboxes(...args),
    getServerConfig: (...args) => getServerConfig(...args),
    createServerSpace: vi.fn(),
    updateServerSpace: (...args) => updateServerSpace(...args),
    deleteServerSpace: (...args) => deleteServerSpace(...args),
    patchServerConfig: vi.fn(),
    uploadServerAsset: (...args) => uploadServerAsset(...args),
    getServerSpaceAssetUrl: (spaceId, assetId) => `/serverXR/api/spaces/${spaceId}/assets/${assetId}`,
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
        updateServerSpace.mockReset()
        uploadServerAsset.mockReset()
        purgeStaleSandboxes.mockReset()
        sandboxSummary = null
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

    it('embeds a non-interactive live preview only on public spaces with a linked project', async () => {
        // preview iframes mount when the card becomes visible
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback) { this.callback = callback }
            observe(target) { this.callback([{ isIntersecting: true, target }]) }
            unobserve() {}
            disconnect() {}
        })
        try {
            listServerSpaces.mockResolvedValue([
                { id: 'showroom', label: 'Showroom', isOwner: true, isPublic: true, publishedProjectId: 'p1' },
                { id: 'drafts', label: 'Drafts', isOwner: true, isPublic: false, publishedProjectId: 'p2' },
                { id: 'bare', label: 'Bare', isOwner: true, isPublic: true }
            ])

            render(<SpaceHub />)

            await screen.findByText('showroom')
            const previewFrame = screen.getByText('showroom')
                .closest('.ssh-space-card')
                .querySelector('.ssh-card-preview iframe')
            expect(previewFrame).not.toBeNull()
            expect(previewFrame.getAttribute('src')).toBe('/showroom?preview=1')
            expect(previewFrame.getAttribute('tabindex')).toBe('-1')
            // desktop virtual viewport, scaled down to the card by transform
            expect(previewFrame.style.width).toBe('1024px')
            expect(previewFrame.style.height).toBe('576px')
            expect(previewFrame.style.transform).toMatch(/^scale\(/)

            // not public → no preview; public without a linked project → no preview
            expect(screen.getByText('drafts').closest('.ssh-space-card').querySelector('.ssh-card-preview')).toBeNull()
            expect(screen.getByText('bare').closest('.ssh-space-card').querySelector('.ssh-card-preview')).toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('boots at most two previews at once and frees a slot when an iframe loads', async () => {
        vi.stubGlobal('IntersectionObserver', class {
            constructor(callback) { this.callback = callback }
            observe(target) { this.callback([{ isIntersecting: true, target }]) }
            unobserve() {}
            disconnect() {}
        })
        try {
            listServerSpaces.mockResolvedValue([
                { id: 'one', label: 'One', isOwner: true, isPublic: true, publishedProjectId: 'p1' },
                { id: 'two', label: 'Two', isOwner: true, isPublic: true, publishedProjectId: 'p2' },
                { id: 'three', label: 'Three', isOwner: true, isPublic: true, publishedProjectId: 'p3' }
            ])

            render(<SpaceHub />)

            await screen.findByText('one')
            const framesIn = (spaceId) => screen.getByText(spaceId)
                .closest('.ssh-space-card')
                .querySelector('.ssh-card-preview iframe')
            // only the first two boot; the third waits for a free slot
            expect(framesIn('one')).not.toBeNull()
            expect(framesIn('two')).not.toBeNull()
            expect(framesIn('three')).toBeNull()

            fireEvent.load(framesIn('one'))
            await waitFor(() => expect(framesIn('three')).not.toBeNull())
            // the loaded iframe stays mounted — only its boot slot was freed
            expect(framesIn('one')).not.toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('shows the custom preview image instead of the live embed when set', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'gallery', label: 'Gallery', isOwner: true, isPublic: true, publishedProjectId: 'p1', previewImageAssetId: 'cover123' }
        ])

        render(<SpaceHub />)

        await screen.findByText('gallery')
        const card = screen.getByText('gallery').closest('.ssh-space-card')
        const image = card.querySelector('.ssh-card-preview img')
        expect(image).not.toBeNull()
        expect(image.getAttribute('src')).toBe('/serverXR/api/spaces/gallery/assets/cover123')
        expect(card.querySelector('.ssh-card-preview iframe')).toBeNull()
    })

    it('uploads a preview image from the card Preview manager and links it to the space', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true, isPublic: true, publishedProjectId: 'p1' }
        ])
        uploadServerAsset.mockResolvedValue({ assetId: 'newcover' })
        updateServerSpace.mockResolvedValue({})

        render(<SpaceHub />)

        await screen.findByText('mine')
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        const fileInput = screen.getByText('Upload image').querySelector('input[type="file"]')
        const file = new File(['img-bytes'], 'cover.png', { type: 'image/png' })
        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => expect(uploadServerAsset).toHaveBeenCalledWith('mine', file))
        await waitFor(() => expect(updateServerSpace).toHaveBeenCalledWith('mine', { previewImageAssetId: 'newcover' }))
    })

    it('gives admins management everywhere, but not Set main -- that only lives in /admin now', async () => {
        authState = { ...authState, role: 'admin' }
        listServerSpaces.mockResolvedValue([
            { id: 'anyones', label: 'Anyones', isOwner: false }
        ])

        render(<SpaceHub />)

        await screen.findByText('anyones')
        expect(cardActionsFor('anyones')).toEqual(
            expect.arrayContaining(['Rename', 'Delete'])
        )
        expect(cardActionsFor('anyones')).not.toContain('Set main')
    })

    it('shows guests a sandbox banner and no management or create controls', async () => {
        authState = { ...authState, type: 'guest', canCreateSpace: false, ownedSpaceCount: 0 }
        listServerSpaces.mockResolvedValue([
            { id: 'sandbox-abc', label: 'Guest Sandbox', kind: 'sandbox', isOwner: false }
        ])

        render(<SpaceHub />)

        // Sandbox cards hide their noisy generated id behind a plain label.
        await screen.findByText('Guest Sandbox')
        expect(screen.getByText(/Open Space, or use your private sandbox/i)).toBeTruthy()
        expect(cardActionsFor('Guest Sandbox')).toEqual([])
        expect(screen.getByRole('button', { name: 'Sign in to create' })).toBeTruthy()
        expect(screen.queryByText(/Space limit reached/)).toBeNull()
    })

    it('groups the directory into Open Space / sandbox / spaces shelves and opens the open space in the editor', async () => {
        const { navigateToStudioPath } = await import('../utils/studioRouting.js')
        authState = { ...authState, openSpaceId: 'open', sandboxSpaceId: 'sandbox-me' }
        listServerSpaces.mockResolvedValue([
            { id: 'open', label: 'Open Space', kind: 'global', isPublic: true, isOwner: false },
            { id: 'sandbox-me', label: 'Sandbox', kind: 'sandbox', isOwner: false },
            { id: 'mine', label: 'Mine', isOwner: true }
        ])

        render(<SpaceHub />)

        await screen.findByText('mine')
        const shelfLabels = [...document.querySelectorAll('.ssh-shelf-label')].map((el) => el.textContent)
        expect(shelfLabels[0]).toMatch(/^Open Space/)
        expect(shelfLabels[1]).toMatch(/^Your sandbox/)
        expect(shelfLabels[2]).toMatch(/^Your spaces/)

        // The open space is public but everyone can enter it — the card opens
        // the editor, never the read-only live view.
        fireEvent.click(screen.getByText('open'))
        expect(navigateToStudioPath).toHaveBeenCalledWith('/open/studio')
        expect(mockAppNavigate).not.toHaveBeenCalled()
    })

    it('shows admins a collapsed sandbox row with an expired sweep instead of sandbox cards', async () => {
        authState = { ...authState, role: 'admin' }
        sandboxSummary = { total: 14, stale: 3 }
        purgeStaleSandboxes.mockResolvedValue({ ok: true, removed: 3 })
        listServerSpaces.mockResolvedValue([
            { id: 'main', label: 'Main Space', isOwner: false }
        ])

        render(<SpaceHub />)

        await screen.findByText(/Guest sandboxes — 14 active, 3 expired/)
        fireEvent.click(screen.getByRole('button', { name: 'Sweep expired' }))
        await waitFor(() => expect(purgeStaleSandboxes).toHaveBeenCalledTimes(1))
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

    it('hub root owns its own scroll — the document never scrolls (html/body/#root are position:fixed)', async () => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const { cwd } = await import('node:process')
        const cssPath = ['src/studio/styles/studio-space-hub.css', 'studio/styles/studio-space-hub.css']
            .map(p => path.join(cwd(), p))
            .find(p => fs.existsSync(p))
        const css = fs.readFileSync(cssPath, 'utf8')
        const rootBlock = css.match(/\.ssh-root\s*\{[^}]*\}/)?.[0] ?? ''
        expect(rootBlock).toMatch(/overflow-y:\s*auto/)
        expect(rootBlock).not.toMatch(/min-height:\s*100vh/)
    })
})
