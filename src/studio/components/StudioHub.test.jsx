import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StudioHub from './StudioHub.jsx'
import { setAppNavigate } from '../../utils/appNavigate.js'
// Literals rather than an import from the piece: this is a test of Studio's
// hub, and the paths are what a visitor types.
const ALGO_VRITHM_PATH = '/algovrithm'
const ALGO_VRITHM_SCENE_PATH = '/algovrithm/scene'
// Resolves to the mock declared below, which is the point: the assertion then
// checks that the button and codeSpaces.js agree on a destination, rather than
// restating a literal that both could drift away from together.
import { buildStudioDirectorPath } from '../utils/studioRouting.js'

const createProject = vi.fn()
const deleteProject = vi.fn()
const listProjects = vi.fn()
const listCollections = vi.fn(async () => [])
const createCollection = vi.fn()
const setProjectShelf = vi.fn()
const listTrash = vi.fn(async () => ({ projects: [], ttlMs: 0 }))
const restoreProject = vi.fn()
const updateProjectDocument = vi.fn()
const uploadProjectAsset = vi.fn()
const getServerSpace = vi.fn()
const updateServerSpace = vi.fn()
const navigateToStudioPath = vi.fn()
const importLegacySceneFile = vi.fn()

vi.mock('../../project/services/projectsApi.js', () => ({
    DEFAULT_PROJECT_SPACE_ID: 'main',
    createProject: (...args) => createProject(...args),
    deleteProject: (...args) => deleteProject(...args),
    listProjects: (...args) => listProjects(...args),
    // Shelves and the trash: a space with neither is the default this suite
    // asserts on, so they answer empty rather than being left undefined —
    // calling an undefined export threw before the hub had rendered anything.
    listCollections: (...args) => listCollections(...args),
    createCollection: (...args) => createCollection(...args),
    setProjectShelf: (...args) => setProjectShelf(...args),
    listTrash: (...args) => listTrash(...args),
    restoreProject: (...args) => restoreProject(...args),
    updateProjectDocument: (...args) => updateProjectDocument(...args),
    uploadProjectAsset: (...args) => uploadProjectAsset(...args),
    // GridFloorBackground (rendered by StudioHub) fetches its own live
    // document independently of anything this suite asserts on.
    buildProjectEventsUrl: () => '',
    getProjectDocument: () => Promise.resolve({ document: {}, version: 0 }),
    listProjectOps: () => Promise.resolve({ ops: [], latestVersion: 0 })
}))

vi.mock('../../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpace(...args),
    updateServerSpace: (...args) => updateServerSpace(...args),
    // GridFloorBackground (rendered by StudioHub) also calls this directly.
    listServerSpaces: () => Promise.resolve([])
}))

vi.mock('../../project/import/importLegacyScene.js', () => ({
    importLegacySceneFile: (...args) => importLegacySceneFile(...args)
}))

vi.mock('../utils/studioRouting.js', () => ({
    buildStudioProjectPath: (projectId, spaceId) => `/${spaceId}/studio/projects/${projectId}`,
    // codeSpaces.js builds the Director destination from this, at module scope.
    // A mock that omits it does not fail where it is missing — it fails the
    // whole suite at import, which is why this list has to track the real
    // module rather than only the calls the component makes directly.
    buildStudioDirectorPath: (spaceId) => `/${spaceId}/studio/director`,
    buildStudioSpacesPath: () => '/studio',
    buildStudioHubPath: (spaceId) => `/${spaceId}/studio`,
    navigateToStudioPath: (...args) => navigateToStudioPath(...args)
}))

let authState = {}

vi.mock('../../hooks/useAuthSession.js', () => ({
    default: () => authState
}))

describe('StudioHub', () => {
    beforeEach(() => {
        createProject.mockReset()
        deleteProject.mockReset()
        listProjects.mockReset()
        updateProjectDocument.mockReset()
        uploadProjectAsset.mockReset()
        getServerSpace.mockReset()
        getServerSpace.mockResolvedValue(null)
        updateServerSpace.mockReset()
        navigateToStudioPath.mockReset()
        importLegacySceneFile.mockReset()
        authState = { role: null, openSpaceId: null }
        vi.spyOn(window, 'confirm').mockImplementation(() => true)
    })

    // The replace matters as much as the forward: pushing left /open/studio in
    // history, so Back re-entered the door and bounced forward again — a trap.
    it('forwards the open-space hub straight into the shared jam project, replacing history', async () => {
        authState = { role: null, openSpaceId: 'open' }
        listProjects.mockResolvedValue([
            { id: 'open-jam', title: 'Open Jam', updatedAt: Date.now(), source: 'studio-v3' }
        ])

        render(<StudioHub spaceId="open" />)

        await waitFor(() =>
            expect(navigateToStudioPath).toHaveBeenCalledWith(
                '/open/studio/projects/open-jam',
                { replace: true }
            )
        )
    })

    it('clears the live pointer before deleting a published project', async () => {
        listProjects
            .mockResolvedValueOnce([{
                id: 'live-project',
                title: 'Live Project',
                updatedAt: Date.now(),
                source: 'studio-v3'
            }])
            .mockResolvedValueOnce([])
        getServerSpace.mockResolvedValue({
            id: 'gallery',
            publishedProjectId: 'live-project'
        })
        updateServerSpace.mockResolvedValue({ id: 'gallery', publishedProjectId: null })
        deleteProject.mockResolvedValue({ ok: true })

        render(<StudioHub spaceId="gallery" />)

        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

        await waitFor(() => {
            expect(updateServerSpace).toHaveBeenCalledWith('gallery', { publishedProjectId: null })
            expect(deleteProject).toHaveBeenCalledWith('live-project')
        })
    })

    // The doors audit (2026-08-21): this button promised "The node editor" and
    // landed on /{space}/raw — the localStorage scratch canvas — instead of the
    // space's node project list one segment deeper. The label is a list promise.
    it('sends Nodes to the node project list, not the local canvas', async () => {
        const navigate = vi.fn()
        setAppNavigate(navigate)
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="gallery" />)

        fireEvent.click(await screen.findByRole('button', { name: 'Nodes' }))
        expect(navigate).toHaveBeenCalledWith('/gallery/raw/projects', { replace: false })
        setAppNavigate(null)
    })

    describe('code spaces', () => {
        // algovrithm's scene is a React route, not a project document, so the
        // server correctly reports zero projects for it. Without the registry
        // Studio then tells the author their finished installation is an empty
        // space and offers to create a project that could never render it.
        const navigate = vi.fn()

        beforeEach(() => {
            navigate.mockReset()
            setAppNavigate(navigate)
        })

        afterEach(() => setAppNavigate(null))

        it('lists the code space instead of the empty state', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            expect(await screen.findByText('algovrithm')).toBeTruthy()
            expect(screen.getByText('built from code')).toBeTruthy()
            expect(screen.queryByText('No projects yet')).toBeNull()
            expect(screen.queryByRole('button', { name: '+ Create your first project' })).toBeNull()
        })

        it('opens the piece from the card', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
            // Open goes to the front door; Director goes past it, to the scene.
            expect(navigate).toHaveBeenCalledWith(ALGO_VRITHM_PATH, { replace: false })
        })

        it('opens the director without also firing the card underneath', async () => {
            // The action sits inside a clickable card; without stopPropagation
            // the click would navigate twice and the last one would win.
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="algovrithm" />)

            fireEvent.click(await screen.findByRole('button', { name: 'Director' }))
            expect(navigate).toHaveBeenCalledTimes(1)
            // Studio's OWN director page — `/algovrithm/studio/director`, which
            // is Studio chrome around the piece's timeline panel.
            //
            // Two fixes landed on this line at once and both were right about
            // the bug: it asserted `${ALGO_VRITHM_PATH}?director`, the front
            // door, for as long as the door existed, which is exactly how the
            // button went on opening a page with no director on it — the
            // landing ignores an unknown query param, so nothing failed. The
            // other fix pointed it at the scene; this one gives the director a
            // home instead, and keeps the scene reachable from that page as
            // "Open the piece".
            //
            // Built from the path builder, not a literal, so moving the route
            // again cannot leave this stale and green.
            expect(navigate).toHaveBeenCalledWith(buildStudioDirectorPath('algovrithm'), { replace: false })
            expect(navigate).not.toHaveBeenCalledWith(`${ALGO_VRITHM_PATH}?director`, expect.anything())
            expect(navigate).not.toHaveBeenCalledWith(`${ALGO_VRITHM_SCENE_PATH}?director`, expect.anything())
        })

        // WCC's code space is a landing PAGE with a scene behind it, and it
        // has no director. A "Director" button on a work with no piece
        // descriptor leads to a surface that renders its own "nothing here" —
        // a dead end wearing a label, which is worse than no button.
        it('offers the scene, and no director, for a work that has none', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="wcc" />)

            expect(await screen.findByText('built from code')).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Director' })).toBeNull()

            fireEvent.click(screen.getByRole('button', { name: 'The ring' }))
            expect(navigate).toHaveBeenCalledTimes(1)
            expect(navigate).toHaveBeenCalledWith('/wcc/scene', { replace: false })
        })

        it('leaves an ordinary empty space alone', async () => {
            listProjects.mockResolvedValue([])

            render(<StudioHub spaceId="gallery" />)

            expect(await screen.findByText('No projects yet')).toBeTruthy()
            expect(screen.queryByText('built from code')).toBeNull()
        })
    })

    it('shows a create-first-project empty state when the space has no projects', async () => {
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="gallery" />)

        expect(await screen.findByText('No projects yet')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '+ Create your first project' }))
        expect(screen.getByPlaceholderText('Project name')).toBeTruthy()
    })

    it('creates imported Studio projects with the Studio import source', async () => {
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({
            project: {
                id: 'imported-project'
            }
        })
        uploadProjectAsset.mockResolvedValue({
            id: 'asset-1',
            mimeType: 'image/webp'
        })
        updateProjectDocument.mockResolvedValue({ ok: true })
        importLegacySceneFile.mockResolvedValue({
            document: {
                projectMeta: {
                    title: 'Imported Studio Scene'
                },
                assets: [],
                entities: []
            },
            assetFiles: new Map(),
            warnings: []
        })

        render(<StudioHub spaceId="gallery" />)

        const input = document.querySelector('input[type="file"]')
        const file = new File(['{}'], 'legacy-scene.json', { type: 'application/json' })
        fireEvent.change(input, {
            target: {
                files: [file]
            }
        })

        await waitFor(() => {
            expect(createProject).toHaveBeenCalledWith('gallery', {
                title: 'Imported Studio Scene',
                slug: 'Imported Studio Scene',
                source: 'legacy-import-studio'
            })
        })
        expect(updateProjectDocument).toHaveBeenCalledWith('imported-project', expect.objectContaining({
            projectMeta: expect.objectContaining({
                id: 'imported-project',
                spaceId: 'gallery',
                source: 'legacy-import-studio'
            })
        }))
    })
})

// ── Shelves, state and the trash (2026-09-10) ───────────────────────────────
// The container that did not exist between "a space" and "a project" — one
// space held 74 of them as flat siblings — and the undo that did not exist for
// delete.
describe('shelves and the trash', () => {
    it('a space with no shelves looks exactly as it did — one grid, no headings', async () => {
        listProjects.mockResolvedValue([
            { id: 'a', title: 'Alpha', updatedAt: Date.now(), source: 'project' },
            { id: 'b', title: 'Beta', updatedAt: Date.now(), source: 'project' }
        ])
        listCollections.mockResolvedValue([])

        render(<StudioHub spaceId="main" />)

        await screen.findByText('Alpha')
        expect(document.querySelectorAll('.sh-shelf').length).toBe(0)
        expect(document.querySelectorAll('.sh-project-card').length).toBe(2)
    })

    it('groups by shelf the moment there is one, and gives whatever is loose a heading of its own', async () => {
        listProjects.mockResolvedValue([
            { id: 'a', title: 'Entry one', collectionId: 'call-2026', updatedAt: Date.now(), source: 'project' },
            { id: 'b', title: 'Something else', collectionId: null, updatedAt: Date.now(), source: 'project' }
        ])
        listCollections.mockResolvedValue([{ id: 'call-2026', label: 'Open call 2026', spaceId: 'main', position: 0 }])

        render(<StudioHub spaceId="main" />)

        await screen.findByText('Entry one')
        const headings = [...document.querySelectorAll('.sh-shelf-label')].map(el => el.textContent)
        expect(headings).toEqual(['Open call 2026', 'Not on a shelf'])
    })

    it('an archived project is hidden until asked for, by its state and not by its title', async () => {
        listProjects.mockResolvedValue([
            { id: 'a', title: 'Still going', state: 'live', updatedAt: Date.now(), source: 'project' },
            { id: 'b', title: 'ops board', state: 'archived', updatedAt: Date.now(), source: 'project' }
        ])
        listCollections.mockResolvedValue([])

        render(<StudioHub spaceId="main" />)

        await screen.findByText('Still going')
        expect(screen.queryByText('ops board')).toBeNull()
        fireEvent.click(screen.getByText('1 archived'))
        expect(await screen.findByText('ops board')).toBeTruthy()
    })

    it('offers the trash with what is in it, and brings a project back', async () => {
        const deletedAt = Date.now() - 60_000
        listProjects.mockResolvedValue([{ id: 'a', title: 'Kept', updatedAt: Date.now(), source: 'project' }])
        listCollections.mockResolvedValue([])
        listTrash.mockResolvedValue({
            projects: [{ id: 'gone', title: 'Deleted by mistake', deletedAt, spaceId: 'main' }],
            ttlMs: 30 * 24 * 60 * 60 * 1000
        })
        restoreProject.mockResolvedValue({ id: 'gone' })

        render(<StudioHub spaceId="main" />)

        const opener = await screen.findByText('Trash — 1')
        fireEvent.click(opener)
        expect(await screen.findByText('Deleted by mistake')).toBeTruthy()

        fireEvent.click(screen.getByText('Bring it back'))
        await waitFor(() => expect(restoreProject).toHaveBeenCalledWith('gone'))
    })
})

// ── One project list per space (2026-09-23) ─────────────────────────────────
// /{space}/raw/projects had a list of its own — "First Landing", "Choose a
// path", "Build small", "Space → project → publish", a title box and a flat
// list with no shelves, drafts or trash. The owner: "a separate line not
// connected to the system". It now renders this hub with openIn="nodes": the
// same cards on the same shelves, each opening the node canvas.
describe('the Nodes copy of the list', () => {
    const navigate = vi.fn()

    beforeEach(() => {
        navigate.mockReset()
        setAppNavigate(navigate)
        createProject.mockReset()
        listProjects.mockReset()
        navigateToStudioPath.mockReset()
        getServerSpace.mockReset()
        getServerSpace.mockResolvedValue(null)
        listCollections.mockReset()
        listCollections.mockResolvedValue([])
        authState = { role: null, openSpaceId: null }
    })

    afterEach(() => setAppNavigate(null))

    const titlesByShelf = () => [...document.querySelectorAll('.sh-shelf')].map(shelf => [
        shelf.querySelector('.sh-shelf-label')?.textContent,
        [...shelf.querySelectorAll('.sh-project-title')].map(el => el.textContent)
    ])

    it('shows the same cards on the same shelves as the Studio copy', async () => {
        listProjects.mockResolvedValue([
            { id: 'a', title: 'Entry one', collectionId: 'call-2026', state: 'draft', updatedAt: Date.now(), source: 'studio-v3' },
            { id: 'b', title: 'Something else', collectionId: null, updatedAt: Date.now(), source: 'raw-v2' }
        ])
        listCollections.mockResolvedValue([{ id: 'call-2026', label: 'Open call 2026', spaceId: 'lab', position: 0 }])

        const studio = render(<StudioHub spaceId="lab" />)
        await screen.findByText('Entry one')
        const inStudio = titlesByShelf()
        studio.unmount()

        render(<StudioHub spaceId="lab" openIn="nodes" />)
        await screen.findByText('Entry one')

        expect(titlesByShelf()).toEqual(inStudio)
        expect(inStudio).toEqual([
            ['Open call 2026', ['Entry one']],
            ['Not on a shelf', ['Something else']]
        ])
        // A draft is on the list — the whole reason ← Projects comes here.
        expect(document.querySelector('.sh-state--draft')?.textContent).toBe('draft')
    })

    it('opens a card in the node canvas, not in Studio', async () => {
        listProjects.mockResolvedValue([{ id: 'p1', title: 'Alpha', state: 'draft', updatedAt: Date.now(), source: 'studio-v3' }])

        render(<StudioHub spaceId="lab" openIn="nodes" />)
        fireEvent.click(await screen.findByText('Alpha'))

        expect(navigate).toHaveBeenCalledWith('/lab/raw/projects/p1', { replace: false })
        expect(navigateToStudioPath).not.toHaveBeenCalled()
    })

    it('makes a new project as a Nodes project and lands in its canvas', async () => {
        listProjects.mockResolvedValue([])
        createProject.mockResolvedValue({ project: { id: 'first-thing' } })

        render(<StudioHub spaceId="lab" openIn="nodes" />)
        fireEvent.click(await screen.findByRole('button', { name: '+ New project' }))
        fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'First thing' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/lab/raw/projects/first-thing', { replace: false }))
        expect(createProject).toHaveBeenCalledWith('lab', { title: 'First thing', slug: 'First thing', source: 'raw-v2' })
    })

    it('crosses to the Studio copy of the same list, where Studio crosses back', async () => {
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="lab" openIn="nodes" />)
        fireEvent.click(await screen.findByRole('button', { name: 'Studio' }))

        expect(navigate).toHaveBeenCalledWith('/lab/studio', { replace: false })
        expect(screen.queryByRole('button', { name: 'Nodes' })).toBeNull()
    })

    it('draws no door of its own — no onboarding cards, no title box', async () => {
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="lab" openIn="nodes" />)
        await screen.findByText('No projects yet')

        for (const gone of ['First Landing', 'Choose a path.', 'Build small', 'Look first', 'Space → project → publish', 'open the Studio node']) {
            expect(screen.queryByText(gone)).toBeNull()
        }
        expect(screen.queryByPlaceholderText('project title')).toBeNull()
    })

    // /open/studio is the door that is handed out, and it forwards into the
    // jam. The Nodes copy is where you manage the space, so it stays a list.
    it('does not forward the open space into the jam', async () => {
        authState = { role: null, openSpaceId: 'open' }
        listProjects.mockResolvedValue([{ id: 'open-jam', title: 'Open Jam', updatedAt: Date.now(), source: 'studio-v3' }])

        render(<StudioHub spaceId="open" openIn="nodes" />)
        await screen.findByText('Open Jam')

        expect(navigateToStudioPath).not.toHaveBeenCalled()
        expect(navigate).not.toHaveBeenCalled()
    })

    it('renders what its page hands it under the list', async () => {
        listProjects.mockResolvedValue([])

        render(<StudioHub spaceId="lab" openIn="nodes"><p>live sync row</p></StudioHub>)

        expect(await screen.findByText('live sync row')).toBeTruthy()
    })
})
