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

// SpaceConstellation is a react-three-fiber Canvas -- irrelevant to what
// SpaceHub hands it. Stubbed to a plain list of the space ids it received, so
// a test can check Map's input without paying for a WebGL render.
vi.mock('./SpaceConstellation.jsx', () => ({
    default: ({ spaces }) => (
        <div data-testid="mock-constellation">
            {spaces.map(s => <span key={s.id}>{s.id}</span>)}
        </div>
    )
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
        localStorage.clear()
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

    it('embeds a non-interactive live preview on every public space, linked project or not', async () => {
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
            // The iframe is two settles behind the card: the IntersectionObserver
            // callback sets `visible`, and only the effect that runs after that
            // render asks requestPreviewBoot for a slot and sets `booted`. A
            // synchronous query here wins that race on an idle machine and loses
            // it under load -- which is exactly how this test flaked.
            const frameIn = (spaceId) => screen.getByText(spaceId)
                .closest('.ssh-space-card')
                .querySelector('.ssh-card-preview iframe')
            await waitFor(() => expect(frameIn('showroom')).not.toBeNull())
            const previewFrame = frameIn('showroom')
            expect(previewFrame.getAttribute('src')).toBe('/showroom?preview=1')
            expect(previewFrame.getAttribute('tabindex')).toBe('-1')
            // desktop virtual viewport, scaled down to the card by transform
            expect(previewFrame.style.width).toBe('1024px')
            expect(previewFrame.style.height).toBe('576px')
            expect(previewFrame.style.transform).toMatch(/^scale\(/)

            // A public space with NO linked project still previews. The gate used to
            // be `isPublic && publishedProjectId`, which blanked exactly one card:
            // the Open Space — the first card a visitor sees and the room the whole
            // product points at. It has no published project because it IS the
            // communal scene, and /open renders it fine. The preview embeds the
            // SPACE route, so a project was never needed.
            await waitFor(() => expect(frameIn('bare')).not.toBeNull())
            expect(frameIn('bare').getAttribute('src')).toBe('/bare?preview=1')

            // private → still no preview, which is the condition that matters
            expect(screen.getByText('drafts').closest('.ssh-space-card').querySelector('.ssh-card-preview')).toBeNull()
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
            // only the first two boot; the third waits for a free slot. Wait for
            // the boot to settle first -- see the sibling test above for why a
            // synchronous read here is a race, not an assertion.
            await waitFor(() => expect(framesIn('one')).not.toBeNull())
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

    it('draws an empty frame on the sandbox card instead of leaving it picture-less', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'sandbox-abc', label: 'Guest Sandbox', kind: 'sandbox', isOwner: false }
        ])

        render(<SpaceHub />)

        await screen.findByText('Guest Sandbox')
        const card = screen.getByText('Guest Sandbox').closest('.ssh-space-card')
        const frame = card.querySelector('.ssh-card-preview')
        expect(frame).not.toBeNull()
        expect(frame.querySelector('img')).toBeNull()
        expect(frame.querySelector('iframe')).toBeNull()
        expect(frame.textContent).toMatch(/nothing in it yet/i)
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

    it('collapses everything a guest does not own into one row by default, opens on click and remembers the choice', async () => {
        authState = {
            ...authState,
            type: 'guest',
            canCreateSpace: false,
            openSpaceId: 'open',
            sandboxSpaceId: 'sandbox-me'
        }
        listServerSpaces.mockResolvedValue([
            { id: 'open', label: 'Open Space', kind: 'global', isPublic: true, isOwner: false },
            { id: 'sandbox-me', label: 'Sandbox', kind: 'sandbox', isOwner: false },
            { id: 'net', label: 'Network', isOwner: false, isPublic: true },
            { id: 'azd', label: 'AZD', isOwner: false, isPublic: true }
        ])

        const { unmount } = render(<SpaceHub />)

        await screen.findByText('open')
        // Closed by default: the two things a guest can use are on screen, the
        // rest of the directory is one line, and the line names what it hides.
        const toggle = screen.getByRole('button', { name: /2 other spaces/ })
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('net')).toBeNull()
        expect(screen.queryByText('azd')).toBeNull()

        fireEvent.click(toggle)

        await screen.findByText('net')
        expect(screen.getByText('azd')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')

        unmount()

        // A fresh mount (same browser/localStorage) restores the open choice.
        render(<SpaceHub />)
        await screen.findByText('net')
        expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('never collapses a signed-in account\'s own spaces', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true },
            { id: 'mine-2', label: 'Mine Two', isOwner: true }
        ])

        render(<SpaceHub />)

        await screen.findByText('mine')
        expect(screen.getByText('mine-2')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /other space/ })).toBeNull()
    })

    it('makes at most one card live at a time, releasing the previous one', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'one', label: 'One', isOwner: true, isPublic: true },
            { id: 'two', label: 'Two', isOwner: true, isPublic: true }
        ])

        render(<SpaceHub />)

        await screen.findByText('one')
        const previewFor = (id) => screen.getByText(id).closest('.ssh-space-card').querySelector('.ssh-card-preview')
        const liveFrameFor = (id) => previewFor(id).querySelector('.ssh-card-live-frame')

        expect(liveFrameFor('one')).toBeNull()
        fireEvent.click(previewFor('one'))
        expect(liveFrameFor('one')).not.toBeNull()
        expect(liveFrameFor('two')).toBeNull()

        // Clicking a second picture releases the first — never two live rooms.
        fireEvent.click(previewFor('two'))
        expect(liveFrameFor('one')).toBeNull()
        expect(liveFrameFor('two')).not.toBeNull()
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

    it('puts Open Space and the sandbox side by side from ~1024px up, stacked below it', async () => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const { cwd } = await import('node:process')
        const cssPath = ['src/studio/styles/studio-space-hub.css', 'studio/styles/studio-space-hub.css']
            .map(p => path.join(cwd(), p))
            .find(p => fs.existsSync(p))
        const css = fs.readFileSync(cssPath, 'utf8')
        // Single column below the breakpoint -- everything just stacks.
        const baseBlock = css.match(/\.ssh-shelves-grid\s*\{[^}]*\}/)?.[0] ?? ''
        expect(baseBlock).toMatch(/grid-template-columns:\s*1fr\s*;/)
        // Two columns from the breakpoint, with Open Space and the sandbox
        // pinned to column 1 / column 2 of the same row, and the rest/collapsed
        // shelf spanning both underneath.
        const mediaBlock = css.match(/@media[^{]*min-width:\s*1024px[^{]*\{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(mediaBlock).toMatch(/grid-template-columns:\s*1fr 1fr\s*;/)
        expect(mediaBlock).toMatch(/\.ssh-shelf--open\s*\{\s*grid-column:\s*1;\s*grid-row:\s*1;\s*\}/)
        expect(mediaBlock).toMatch(/\.ssh-shelf--sandbox\s*\{\s*grid-column:\s*2;\s*grid-row:\s*1;\s*\}/)
        expect(mediaBlock).toMatch(/\.ssh-shelf--spaces\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*grid-row:\s*2;\s*\}/)
    })

    it('the Grid fold never reaches Map — Map is always given every space, unfiltered', async () => {
        authState = { ...authState, type: 'guest', canCreateSpace: false, openSpaceId: 'open', sandboxSpaceId: 'sandbox-me' }
        listServerSpaces.mockResolvedValue([
            { id: 'open', label: 'Open Space', kind: 'global', isPublic: true, isOwner: false },
            { id: 'sandbox-me', label: 'Sandbox', kind: 'sandbox', isOwner: false },
            { id: 'net', label: 'Network', isOwner: false, isPublic: true },
            { id: 'azd', label: 'AZD', isOwner: false, isPublic: true }
        ])

        render(<SpaceHub />)
        await screen.findByText('open')

        // Grid: the rest shelf is folded for a guest by default.
        expect(screen.getByRole('button', { name: /2 other spaces/ })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('net')).toBeNull()

        // Map is handed the full, unfiltered spaces list regardless — the same
        // list SpaceHub loaded, not something derived from the fold state.
        fireEvent.click(screen.getByRole('button', { name: 'Map' }))
        const constellation = await screen.findByTestId('mock-constellation')
        expect(constellation.textContent).toContain('open')
        expect(constellation.textContent).toContain('sandbox-me')
        expect(constellation.textContent).toContain('net')
        expect(constellation.textContent).toContain('azd')
    })
})
