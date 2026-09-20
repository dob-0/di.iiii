import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceHub from './SpaceHub.jsx'
import { WORKS } from '../../works/works.js'

// Several tests here render the thirteen-card hub, which mounts thirteen preview
// iframes and waits for them to report; two of them already ask waitFor for 8s.
// vitest's own per-test budget is 5s, so on a loaded CI runner the test died
// before its waits could spend theirs and reported as a broken behaviour — red
// three times in one day, on three unrelated branches, passing alone every time.
// The budget belongs to the file, not to one test that happened to lose the race.
vi.setConfig({ testTimeout: 20000 })


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
    default: () => authState,
    announceSessionChanged: () => {}
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

const probeLightingDesk = vi.fn()

// The lighting desk only exists on an install running on the artist's own
// machine, so the row that leads to it is drawn from an answer, not a flag.
vi.mock('../../map/lightingLink.js', () => ({
    lightingDeskPath: () => '/light/',
    probeLightingDesk: (...args) => probeLightingDesk(...args)
}))

// Door project titles, by id. Empty unless a test sets them.
let projectTitlesById = {}

vi.mock('../../project/services/projectsApi.js', () => ({
    listProjects: () => Promise.resolve([]),
    getProject: (id) => Promise.resolve(projectTitlesById[id] ? { project: { id, title: projectTitlesById[id] } } : null),
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
// A card goes through the entry transition (components/entryTransition), which
// navigates once the cover is up. What these tests hold is WHERE a card goes —
// the editor or the live view — so the transition is reduced to its href.
const mockEnter = vi.fn()
vi.mock('../../components/entryTransition/entryTransition.js', () => ({
    enterFromElement: (event, href) => mockEnter(href)
}))

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

// A card is found by the space it belongs to, not by printed text: since the
// one-name rule (utils/spaceNames.js) a card no longer prints its id at all.
const cardOf = (spaceId) => document.querySelector(`.ssh-space-card[data-space-id="${spaceId}"]`)
const rowOf = (spaceId) => document.querySelector(`.ssh-list-row[data-space-id="${spaceId}"]`)
const findCard = (spaceId) => waitFor(() => {
    const card = cardOf(spaceId)
    if (!card) throw new Error(`no card for ${spaceId}`)
    return card
})

const cardActionsFor = (spaceId) => {
    const card = cardOf(spaceId)
    return [...card.querySelectorAll('.ssh-card-btn')].map((btn) => btn.textContent)
}

// A resting card shows one button ("Manage"); the management row is behind it.
// Open it first, the way a person does, then read the actions.
const openManageFor = (spaceId) => {
    const card = cardOf(spaceId)
    const toggle = [...card.querySelectorAll('.ssh-card-btn')].find((b) => b.textContent === 'Manage')
    if (toggle) fireEvent.click(toggle)
    return card
}

describe('SpaceHub', () => {
    beforeEach(() => {
        listServerSpaces.mockReset()
        getServerConfig.mockReset()
        getServerConfig.mockResolvedValue({})
        getApiAuthProviders.mockReset()
        mockAppNavigate.mockReset()
        mockEnter.mockReset()
        updateServerSpace.mockReset()
        uploadServerAsset.mockReset()
        purgeStaleSandboxes.mockReset()
        probeLightingDesk.mockReset()
        probeLightingDesk.mockResolvedValue(false)
        sandboxSummary = null
        projectTitlesById = {}
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

    // /spaces used to carry the platform's own tab title, same as every
    // other route — docs/ai/vocabulary.md's naming rule names this address.
    it('names /spaces itself in the tab, not the platform', async () => {
        listServerSpaces.mockResolvedValue([])
        render(<SpaceHub />)
        await screen.findByText('Spaces')
        expect(document.title).toBe('Spaces — di.iiii')
    })

    it('leads to the lighting desk only when a desk on this machine answers', async () => {
        listServerSpaces.mockResolvedValue([{ id: 'mine', label: 'Mine', isOwner: true }])
        probeLightingDesk.mockResolvedValue(true)

        render(<SpaceHub />)

        const link = await screen.findByText('Lights')
        expect(link.getAttribute('href')).toBe('/light/')
        expect(screen.getByText('On this machine')).toBeTruthy()
    })

    it('says nothing about lights on a tier with no desk', async () => {
        listServerSpaces.mockResolvedValue([{ id: 'mine', label: 'Mine', isOwner: true }])

        render(<SpaceHub />)

        await findCard('mine')
        expect(screen.queryByText('Lights')).toBeNull()
        expect(screen.queryByText('On this machine')).toBeNull()
    })

    it('shows management actions only on spaces the account owns', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true },
            { id: 'theirs', label: 'Theirs', isOwner: false, isPublic: true }
        ])

        render(<SpaceHub />)

        await findCard('mine')
        // Resting, an owned card offers only Manage — the eight actions are behind it.
        expect(cardActionsFor('mine')).toEqual(['Manage'])
        openManageFor('mine')
        expect(cardActionsFor('mine')).toEqual(
            expect.arrayContaining(['Rename', 'Delete', 'GitHub sync'])
        )
        // Someone else's public space: no management at all, only the live-link Copy.
        expect(cardActionsFor('theirs')).toEqual(['Copy'])
        expect(screen.getByText('View live')).toBeTruthy()
    })

    it('clicking a public space you cannot enter goes to its live view, scoped spaces open the editor', async () => {
        authState = { ...authState, type: 'guest', canCreateSpace: false, spaces: ['main'] }
        listServerSpaces.mockResolvedValue([
            { id: 'main', label: 'Main Space', isOwner: false, isPublic: true },
            { id: 'beyond-form', label: 'Beyond Form', isOwner: false, isPublic: true }
        ])

        render(<SpaceHub />)

        // Guest is scoped into main (open jam) — the card still opens the editor.
        fireEvent.click(await screen.findByText('Main Space'))
        expect(mockEnter).toHaveBeenCalledWith('/main/studio')
        expect(mockEnter).not.toHaveBeenCalledWith('/main')

        // A public space outside the session scope goes straight to the live view.
        fireEvent.click(screen.getByText('Beyond Form'))
        expect(mockEnter).toHaveBeenCalledWith('/beyond-form')
    })

    it('shows the live public link with a copy action on public spaces', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'showroom', label: 'Showroom', isOwner: true, isPublic: true },
            { id: 'drafts', label: 'Drafts', isOwner: true, isPublic: false }
        ])

        render(<SpaceHub />)

        await findCard('showroom')
        const liveLink = screen.getByRole('link', { name: /\/showroom$/ })
        expect(liveLink.getAttribute('target')).toBe('_blank')
        expect(screen.getByText('Live')).toBeTruthy()

        const draftsCard = cardOf('drafts')
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

            await findCard('showroom')
            // The iframe is two settles behind the card: the IntersectionObserver
            // callback sets `visible`, and only the effect that runs after that
            // render asks requestPreviewBoot for a slot and sets `booted`. A
            // synchronous query here wins that race on an idle machine and loses
            // it under load -- which is exactly how this test flaked.
            const frameIn = (spaceId) => cardOf(spaceId)
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
            expect(cardOf('drafts').querySelector('.ssh-card-preview')).toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    // 13 public spaces: one more than the card grid's boot ceiling, so exactly
    // one card is left waiting and it is unambiguous what freed its slot.
    const thirteenPublicSpaces = Array.from({ length: 13 }, (_, index) => ({
        id: `s${index}`,
        label: `S${index}`,
        isOwner: true,
        isPublic: true,
        publishedProjectId: `p${index}`
    }))

    const everyCardVisible = () => vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { this.callback = callback }
        observe(target) { this.callback([{ isIntersecting: true, target }]) }
        unobserve() {}
        disconnect() {}
    })

    const frameIn = (spaceId) => cardOf(spaceId)
        .querySelector('.ssh-card-preview iframe')

    it('frees a card’s boot slot when the preview says it has PAINTED, not when its html loads', async () => {
        everyCardVisible()
        try {
            listServerSpaces.mockResolvedValue(thirteenPublicSpaces)

            render(<SpaceHub />)

            await findCard('s0')
            await waitFor(() => expect(frameIn('s0')).not.toBeNull())
            expect(frameIn('s11')).not.toBeNull()
            expect(frameIn('s12')).toBeNull()

            // `load` fires when the iframe's HTML document arrives, which for
            // this app is ~100ms in -- before its chunks, its scene document or
            // one asset. Releasing there is what let twelve app instances boot
            // at once and starve each other on a black loading screen.
            fireEvent.load(frameIn('s0'))
            await Promise.resolve()
            expect(frameIn('s12')).toBeNull()

            // the embedded app reports pixels; only then does the queue move on
            fireEvent(window, new MessageEvent('message', {
                data: { type: 'dii:preview-ready', spaceId: 's0' },
                origin: window.location.origin,
                source: frameIn('s0').contentWindow
            }))
            await waitFor(() => expect(frameIn('s12')).not.toBeNull())
            // the reporting iframe stays mounted — only its boot slot was freed
            expect(frameIn('s0')).not.toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('ignores a ready message that did not come from the card’s own frame', async () => {
        everyCardVisible()
        try {
            listServerSpaces.mockResolvedValue(thirteenPublicSpaces)

            render(<SpaceHub />)

            await findCard('s0')
            await waitFor(() => expect(frameIn('s0')).not.toBeNull())

            fireEvent(window, new MessageEvent('message', {
                data: { type: 'dii:preview-ready', spaceId: 's0' },
                origin: 'https://somewhere-else.example',
                source: frameIn('s0').contentWindow
            }))
            fireEvent(window, new MessageEvent('message', {
                data: { type: 'dii:preview-ready', spaceId: 's0' },
                origin: window.location.origin,
                source: window
            }))
            await Promise.resolve()
            expect(frameIn('s12')).toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('a preview that never reports gives its slot back on the backstop', async () => {
        everyCardVisible()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            listServerSpaces.mockResolvedValue(thirteenPublicSpaces)

            render(<SpaceHub />)

            await findCard('s0')
            await waitFor(() => expect(frameIn('s0')).not.toBeNull())
            expect(frameIn('s12')).toBeNull()

            await act(async () => { await vi.advanceTimersByTimeAsync(12000) })
            expect(frameIn('s12')).not.toBeNull()
        } finally {
            vi.useRealTimers()
            vi.unstubAllGlobals()
        }
    })

    it('draws "not in this copy" on a card whose preview says its route is a local-profile stub', async () => {
        everyCardVisible()
        try {
            listServerSpaces.mockResolvedValue(thirteenPublicSpaces)

            render(<SpaceHub />)

            await findCard('s0')
            // The default 1s waitFor is the machine's budget, not this
            // behaviour's: twelve card frames mount before s0 reports, and on a
            // loaded CI runner that crossed 1s and failed here while passing
            // every time locally. The assertion is unchanged.
            await waitFor(() => expect(frameIn('s0')).not.toBeNull(), { timeout: 8000 })
            expect(frameIn('s12')).toBeNull()

            // Under DI_PROFILE=local a work's route (wcc, algovrithm) is a
            // page of text with no canvas, so it never says preview-ready. It
            // says preview-stub instead, from the card's own frame.
            fireEvent(window, new MessageEvent('message', {
                data: { type: 'dii:preview-stub', spaceId: 's0' },
                origin: window.location.origin,
                source: frameIn('s0').contentWindow
            }))

            // the slot is freed like a paint would free it
            await waitFor(() => expect(frameIn('s12')).not.toBeNull(), { timeout: 8000 })
            // and the card draws its own line in place of the scaled-down frame
            const card = cardOf('s0')
            expect(card.querySelector('.ssh-card-preview iframe')).toBeNull()
            expect(card.querySelector('.ssh-card-preview-fill--stub')).not.toBeNull()
            expect(card.textContent).toContain('not in this copy')
            // every other card paints exactly as before
            expect(frameIn('s1')).not.toBeNull()
            expect(cardOf('s1').textContent).not.toContain('not in this copy')
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('shows the custom preview image instead of the live embed when set', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'gallery', label: 'Gallery', isOwner: true, isPublic: true, publishedProjectId: 'p1', previewImageAssetId: 'cover123' }
        ])

        render(<SpaceHub />)

        await findCard('gallery')
        const card = cardOf('gallery')
        const image = card.querySelector('.ssh-card-preview img')
        expect(image).not.toBeNull()
        expect(image.getAttribute('src')).toBe('/serverXR/api/spaces/gallery/assets/cover123')
        expect(card.querySelector('.ssh-card-preview iframe')).toBeNull()
    })

    it('falls back to the live preview when a cover image is gone instead of a torn picture', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'gallery', label: 'Gallery', isOwner: true, isPublic: true, previewImageAssetId: 'missing' }
        ])

        render(<SpaceHub />)

        await findCard('gallery')
        const card = () => cardOf('gallery')
        fireEvent.error(card().querySelector('.ssh-card-preview img'))
        await waitFor(() => expect(card().querySelector('.ssh-card-preview img')).toBeNull())
        expect(card().querySelector('.ssh-card-preview')).not.toBeNull()
    })

    it('uploads a preview image from the card Preview manager and links it to the space', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true, isPublic: true, publishedProjectId: 'p1' }
        ])
        uploadServerAsset.mockResolvedValue({ assetId: 'newcover' })
        updateServerSpace.mockResolvedValue({})

        render(<SpaceHub />)

        await findCard('mine')
        openManageFor('mine')
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

        await findCard('anyones')
        openManageFor('anyones')
        expect(cardActionsFor('anyones')).toEqual(
            expect.arrayContaining(['Rename', 'Delete'])
        )
        expect(cardActionsFor('anyones')).not.toContain('Set main')
    })

    it('shows guests a one-line banner and no management or create controls', async () => {
        authState = { ...authState, type: 'guest', canCreateSpace: false, ownedSpaceCount: 0 }
        listServerSpaces.mockResolvedValue([
            { id: 'sandbox-abc', label: 'Guest Sandbox', kind: 'sandbox', isOwner: false },
            { id: 'wcc', label: 'WCC Exhibition', isOwner: false, isPublic: true, publishedProjectId: 'p1' }
        ])

        render(<SpaceHub />)

        await findCard('wcc')
        expect(screen.getByText(/step into any space here/i)).toBeTruthy()
        expect(cardActionsFor('wcc')).toEqual(['Copy'])
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
        authState = { ...authState, openSpaceId: 'open', sandboxSpaceId: 'sandbox-me' }
        listServerSpaces.mockResolvedValue([
            { id: 'open', label: 'Open Space', kind: 'global', isPublic: true, isOwner: false },
            { id: 'sandbox-me', label: 'Sandbox', kind: 'sandbox', isOwner: false },
            { id: 'mine', label: 'Mine', isOwner: true }
        ])

        render(<SpaceHub />)

        await findCard('mine')
        const shelfLabels = [...document.querySelectorAll('.ssh-shelf-label')].map((el) => el.textContent)
        expect(shelfLabels[0]).toMatch(/^Open Space/)
        expect(shelfLabels[1]).toMatch(/^Your sandbox/)
        expect(shelfLabels[2]).toMatch(/^Your spaces/)

        // The open space is public but everyone can enter it — the card opens
        // the editor, never the read-only live view.
        fireEvent.click(cardOf('open'))
        expect(mockEnter).toHaveBeenCalledWith('/open/studio')
        expect(mockEnter).toHaveBeenCalledTimes(1)
    })

    const visitorSpaces = () => [
        { id: 'open', label: 'Open Space', kind: 'global', isPublic: true, isOwner: false, publishedProjectId: 'open-jam' },
        { id: 'sandbox-me', label: 'Sandbox', kind: 'sandbox', isOwner: false },
        { id: 'bare', label: 'Bare', isOwner: false, isPublic: true },
        { id: 'net', label: 'Network', isOwner: false, isPublic: true, publishedProjectId: 'network' },
        { id: 'azd', label: 'AZD', isOwner: false, isPublic: true, publishedProjectId: 'azd' }
    ]

    const asGuest = () => {
        authState = {
            ...authState,
            type: 'guest',
            canCreateSpace: false,
            openSpaceId: 'open',
            sandboxSpaceId: 'sandbox-me'
        }
    }

    it('shows a visitor every public space at once, with no collapse to click through', async () => {
        asGuest()
        listServerSpaces.mockResolvedValue(visitorSpaces())

        render(<SpaceHub />)

        // Every listed space is on the page, Open Space among them — the page
        // is the spaces, not one card plus a folded shelf.
        await findCard('open')
        for (const id of ['bare', 'net', 'azd']) {
            expect(cardOf(id)).toBeTruthy()
        }
        expect(screen.queryByRole('button', { name: /other space/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull()
        // One grid, one title — no shelf headings above a visitor's cards.
        expect(document.querySelectorAll('.ssh-shelf-label').length).toBe(0)
        // The Open Space still says what it is, and keeps its Live badge.
        expect(screen.getByText('everyone builds here, together')).toBeTruthy()
        expect(screen.getAllByText('Live').length).toBe(4)
        // ...but not a second badge on every card saying the same thing.
        expect(screen.queryByText('View live')).toBeNull()
    })

    it('leads a visitor with the spaces that have something to show', async () => {
        asGuest()
        listServerSpaces.mockResolvedValue(visitorSpaces())

        render(<SpaceHub />)

        await findCard('open')
        const ids = [...document.querySelectorAll('.ssh-space-card')].map((el) => el.dataset.spaceId)
        expect(ids).toEqual(['open', 'net', 'azd', 'bare'])
    })

    it('gives a visitor the sandbox as one secondary line, not a hero card', async () => {
        asGuest()
        listServerSpaces.mockResolvedValue(visitorSpaces())

        render(<SpaceHub />)

        await findCard('open')
        // Not a card in the grid, and no "nothing in it yet" empty frame.
        expect(screen.queryByText('Sandbox')).toBeNull()
        expect(screen.queryByText(/nothing in it yet/i)).toBeNull()
        // Still reachable in one click.
        const link = screen.getByRole('button', { name: 'Your private sandbox' })
        fireEvent.click(link)
        expect(mockEnter).toHaveBeenCalledWith('/sandbox-me/studio')
    })

    it('never collapses a signed-in account\'s own spaces', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true },
            { id: 'mine-2', label: 'Mine Two', isOwner: true }
        ])

        render(<SpaceHub />)

        await findCard('mine')
        expect(cardOf('mine-2')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /other space/ })).toBeNull()
    })

    it('makes at most one card live at a time, releasing the previous one', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'one', label: 'One', isOwner: true, isPublic: true },
            { id: 'two', label: 'Two', isOwner: true, isPublic: true }
        ])

        render(<SpaceHub />)

        await findCard('one')
        const previewFor = (id) => cardOf(id).querySelector('.ssh-card-preview')
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

    // A space whose bare segment a WORK has taken. `/{work}` is compiled code
    // (src/wccSite, src/algoVrithm) and RootApp resolves it before the space
    // router ever sees it, so a card built on the bare path could not open the
    // rows the space holds — on an offline install, where the works are
    // replaced by HostedPieceStub, it could only reach "not in this copy".
    // The id comes from the registry: nothing here names a work.
    const shadowedSpace = {
        id: WORKS[0].id,
        label: 'Shadowed by a work',
        isOwner: true,
        isPublic: true,
        publishedProjectId: 'linked-project'
    }

    it('shows the work’s own front page on a card whose work is in this build', async () => {
        everyCardVisible()
        try {
            listServerSpaces.mockResolvedValue([shadowedSpace])

            render(<SpaceHub />)

            await findCard(shadowedSpace.id)
            await waitFor(() => expect(frameIn(shadowedSpace.id)).not.toBeNull())
            // The card prints /{work}; its picture is what that address shows.
            expect(frameIn(shadowedSpace.id).getAttribute('src')).toBe(`${WORKS[0].path}?preview=1`)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('opens the SPACE from a card whose work was left out of this copy, not the stub', async () => {
        everyCardVisible()
        // A copy built without the works: the build writes an empty list.
        vi.stubGlobal('__DI_WORKS__', [])
        try {
            listServerSpaces.mockResolvedValue([
                shadowedSpace,
                { id: 'plain', label: 'Plain', isOwner: true, isPublic: true, publishedProjectId: 'p9' }
            ])

            render(<SpaceHub />)

            await findCard(shadowedSpace.id)
            const door = `/${shadowedSpace.id}/p/linked-project`

            // the thumbnail
            await waitFor(() => expect(frameIn(shadowedSpace.id)).not.toBeNull())
            expect(frameIn(shadowedSpace.id).getAttribute('src')).toBe(`${door}?preview=1`)

            // the picture made live, and its Open link
            const preview = cardOf(shadowedSpace.id).querySelector('.ssh-card-preview')
            fireEvent.click(preview)
            const liveFrame = preview.querySelector('.ssh-card-live-frame iframe')
            expect(liveFrame.getAttribute('src')).toBe(door)
            expect(preview.querySelector('.ssh-card-live-open').getAttribute('href')).toBe(door)

            // A space no work shadows is untouched.
            await waitFor(() => expect(frameIn('plain')).not.toBeNull())
            expect(frameIn('plain').getAttribute('src')).toBe('/plain?preview=1')
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('gives the list row’s Live link the same door', async () => {
        listServerSpaces.mockResolvedValue([
            shadowedSpace,
            { id: 'plain', label: 'Plain', isOwner: true, isPublic: true, publishedProjectId: 'p9' }
        ])

        render(<SpaceHub />)

        await findCard(shadowedSpace.id)
        fireEvent.click(screen.getByRole('button', { name: /list/i }))

        const rowLive = (id) => rowOf(id).querySelector('a.ssh-card-btn')
        await waitFor(() => expect(rowLive(shadowedSpace.id)).not.toBeNull())
        expect(rowLive(shadowedSpace.id).getAttribute('href')).toBe(`/${shadowedSpace.id}/p/linked-project`)
        expect(rowLive('plain').getAttribute('href')).toBe('/plain')
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

    // One name per space (owner, 2026-09-14). Dev printed the same words three
    // times on six of thirteen cards — "drum-rhythms" / "Drum Rhythms" /
    // "Project: Drum Rhythms" — and a mismatched door on the rest ("WCC
    // Exhibition" / "Project: Main").
    const namedSpaces = () => ([
        { id: 'drum-rhythms', label: 'Drum Rhythms', isOwner: true, isPublic: true, publishedProjectId: 'rhythms' },
        { id: 'wcc-space', label: 'WCC Exhibition', isOwner: true, isPublic: true, publishedProjectId: 'main' },
        { id: 'algo', label: 'algo', isOwner: true, isPublic: true }
    ])

    it('shows a visitor each space by its name once, with no project line', async () => {
        asGuest()
        projectTitlesById = { rhythms: 'Drum Rhythms', main: 'Main' }
        listServerSpaces.mockResolvedValue(namedSpaces().map(s => ({ ...s, isOwner: false })))

        render(<SpaceHub />)
        const drums = await findCard('drum-rhythms')
        await waitFor(() => expect(cardOf('wcc-space')).toBeTruthy())

        for (const id of ['drum-rhythms', 'wcc-space', 'algo']) {
            const card = cardOf(id)
            // No project line of any wording, and the id is not printed as a
            // second name in the header (the live-link row still carries the
            // address, as an address).
            expect(card.querySelector('.ssh-space-project')).toBeNull()
            expect(card.querySelector('.ssh-space-id')).toBeNull()
            expect(card.textContent).not.toMatch(/Project:|Opens on/)
            expect(card.querySelectorAll('.ssh-space-label').length).toBe(1)
        }
        expect(drums.querySelector('.ssh-space-label').textContent).toBe('Drum Rhythms')
        expect(drums.querySelector('.ssh-card-header').textContent).toBe('Live')
    })

    it('tells an owner the door only where its title is not the space’s name', async () => {
        projectTitlesById = { rhythms: 'Drum Rhythms', main: 'Main' }
        listServerSpaces.mockResolvedValue(namedSpaces())

        render(<SpaceHub />)
        await findCard('drum-rhythms')

        await waitFor(() => expect(cardOf('wcc-space').querySelector('.ssh-space-project')?.textContent).toBe('Opens on: Main'))
        expect(cardOf('drum-rhythms').querySelector('.ssh-space-project')).toBeNull()
        expect(cardOf('algo').querySelector('.ssh-space-project')).toBeNull()
    })

    it('names each list row once and says what opens by the same rule', async () => {
        projectTitlesById = { rhythms: 'Drum Rhythms', main: 'Main' }
        listServerSpaces.mockResolvedValue(namedSpaces())

        render(<SpaceHub />)
        await findCard('drum-rhythms')
        fireEvent.click(screen.getByRole('button', { name: /list/i }))

        await waitFor(() => expect(rowOf('wcc-space').querySelector('.ssh-list-project').textContent).toBe('Main'))
        expect(rowOf('drum-rhythms').querySelector('.ssh-list-name').textContent).toBe('Drum Rhythms')
        expect(rowOf('drum-rhythms').querySelector('.ssh-list-project').textContent).toBe('the space itself')
        expect(rowOf('algo').querySelector('.ssh-list-project').textContent).toBe('nothing published')
    })

    it('the Grid/Map toggle still works — Map counts the same set the grid does, sandbox excluded for a visitor', async () => {
        asGuest()
        listServerSpaces.mockResolvedValue(visitorSpaces())

        render(<SpaceHub />)
        await findCard('open')

        // Facade audit wave 3 (2026-09-14): the map used to be handed the raw
        // `spaces` list while the grid counted `arrangeable` (sandbox left out
        // for a visitor — "not one of the spaces to visit"), so the same page
        // reported two different totals for what should be one set (14 on the
        // map, 13 in the grid, on the real audit). Map now gets `arrangeable`
        // too: same four cards the grid shows, sandbox not among them.
        fireEvent.click(screen.getByRole('button', { name: 'Map' }))
        const constellation = await screen.findByTestId('mock-constellation')
        expect(constellation.textContent).toContain('open')
        expect(constellation.textContent).toContain('net')
        expect(constellation.textContent).toContain('azd')
        expect(constellation.textContent).toContain('bare')
        expect(constellation.textContent).not.toContain('sandbox-me')
    })

    it('never shows a visitor the "Only you" filter — the server lists only public spaces to them, so the count is always a dead 0', async () => {
        asGuest()
        // Five spaces (more than the 3-space threshold that shows the bar) so
        // the arrange/filter bar renders at all.
        listServerSpaces.mockResolvedValue(visitorSpaces())

        render(<SpaceHub />)
        await findCard('open')

        expect(screen.getByRole('button', { name: /^Open to anyone/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /^Needs a door/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^Only you/ })).toBeNull()
    })

    it('an account (not a visitor) still gets the "Only you" filter — it is a real, usable state for an owner', async () => {
        listServerSpaces.mockResolvedValue([
            { id: 'mine', label: 'Mine', isOwner: true },
            { id: 'secret', label: 'Secret', isOwner: true, isPublic: false },
            { id: 'pub', label: 'Pub', isOwner: true, isPublic: true, publishedProjectId: 'p' },
            { id: 'empty-door', label: 'Empty Door', isOwner: true, isPublic: true }
        ])

        render(<SpaceHub />)
        await findCard('mine')

        expect(screen.getByRole('button', { name: /^Only you/ })).toBeTruthy()
    })
})
