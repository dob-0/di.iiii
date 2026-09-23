import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { buildStudioProjectPath } from '../studio/utils/studioRouting.js'
import { buildRawProjectPath } from '../raw/utils/rawRouting.js'
import { buildMapPath } from './mapRouting.js'
import { fireEvent, render, screen, within } from '@testing-library/react'
import MapCueList from './MapCueList.jsx'
import {
    cueFadeMs,
    fetchLightScenes,
    lightingApiUrl,
    lightingDeskPath,
    probeLightingDesk,
    recallCueLighting
} from './lightingLink.js'

const JSON_HEADERS = { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null) }
const HTML_HEADERS = { get: (k) => (k.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) }
const ok = (body = {}) => ({ ok: true, status: 200, headers: JSON_HEADERS, json: async () => body })
// What a hosted di.iiii really answers at /light/api/summary: its own app page, 200.
const htmlPage = () => ({ ok: true, status: 200, headers: HTML_HEADERS, json: async () => { throw new SyntaxError('Unexpected token <') } })
const notFound = () => ({ ok: false, status: 404, json: async () => ({}) })

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('the address of the lighting desk', () => {
    it('is app-level /light, on this origin', () => {
        expect(lightingDeskPath()).toBe('/light/')
        expect(lightingApiUrl('api/summary')).toBe(`${window.location.origin}/light/api/summary`)
    })

    // The shape the bar's Light link uses too (SurfaceBar): the two callers agree by
    // this address, not by importing each other.
    it('says which project opened it, and stays bare without one', () => {
        expect(lightingDeskPath({ spaceId: 'lab', projectId: 'first-piece' }))
            .toBe('/light/?space=lab&project=first-piece')
        expect(lightingDeskPath({ spaceId: 'lab', projectId: 'first-piece', label: 'First Piece' }))
            .toBe('/light/?space=lab&project=first-piece&label=First+Piece')
        // a title that only repeats the id says nothing new
        expect(lightingDeskPath({ spaceId: 'lab', projectId: 'first-piece', label: 'first-piece' }))
            .toBe('/light/?space=lab&project=first-piece')
        expect(lightingDeskPath({ spaceId: 'lab' })).toBe('/light/')
        expect(lightingDeskPath({ projectId: 'first-piece' })).toBe('/light/')
    })
})

// The desk is plain script served by serverXR and cannot import the app's path
// builders, so it carries its own copy of the three addresses. This holds the copy
// to the real thing: if a builder moves, or the copy drifts, the way back from Light
// would open the wrong page and nothing else would notice.
describe('the way back from the lighting desk', () => {
    const deskFrom = createRequire(import.meta.url)('../../serverXR/src/lighting/ui/from.js')

    it('opens the same three addresses the app builds', () => {
        for (const [spaceId, projectId] of [['lab', 'first-piece'], ['main', 'open-jam'], ['br_id_ge', 'rite-2']]) {
            const links = deskFrom.projectLinks({ space: spaceId, project: projectId })
            expect(links.studio).toBe(buildStudioProjectPath(projectId, spaceId))
            expect(links.nodes).toBe(buildRawProjectPath(projectId, spaceId))
            expect(links.projection).toBe(buildMapPath(spaceId, projectId))
        }
        // and, spelled out, the shapes themselves
        expect(deskFrom.projectLinks({ space: 'lab', project: 'first-piece' })).toEqual({
            studio: '/lab/studio/projects/first-piece',
            nodes: '/lab/raw/projects/first-piece',
            projection: '/lab/map/first-piece'
        })
    })

    it('reads what lightingDeskPath writes', () => {
        const search = lightingDeskPath({ spaceId: 'lab', projectId: 'first-piece', label: 'First Piece' }).split('?')[1]
        expect(deskFrom.fromQuery(`?${search}`)).toEqual({ space: 'lab', project: 'first-piece', label: 'First Piece' })
        expect(deskFrom.fromQuery('?space=lab&project=first-piece')).toEqual({ space: 'lab', project: 'first-piece', label: 'first-piece' })
        expect(deskFrom.fromQuery('')).toBeUndefined()
    })

    it('never builds a way back out of an id that is not one', () => {
        for (const bad of ['', '..', '/evil.example', '\\evil.example', 'a/b', 'a:b', 'javascript:alert(1)', 'a b']) {
            expect(deskFrom.fromQuery(`?space=${encodeURIComponent(bad)}&project=first-piece`)).toBeNull()
            expect(deskFrom.fromQuery(`?space=lab&project=${encodeURIComponent(bad)}`)).toBeNull()
        }
    })

    it('keeps it for the tab, and a bare address in a fresh tab has nothing', () => {
        const store = new Map()
        const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
        expect(deskFrom.readFrom('', storage)).toBeNull()
        expect(deskFrom.readFrom('?space=lab&project=first-piece', storage)).toEqual({ space: 'lab', project: 'first-piece', label: 'first-piece' })
        // the address lost its query — the tab still knows
        expect(deskFrom.readFrom('', storage)).toEqual({ space: 'lab', project: 'first-piece', label: 'first-piece' })
        // a new project replaces it; an unusable one clears it
        expect(deskFrom.readFrom('?space=lab&project=second-piece', storage).project).toBe('second-piece')
        expect(deskFrom.readFrom('?space=lab', storage)).toBeNull()
        expect(deskFrom.readFrom('', storage)).toBeNull()
        // storage that refuses (private mode) costs the memory, not the link
        const refusing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
        expect(deskFrom.readFrom('?space=lab&project=first-piece', refusing).project).toBe('first-piece')
        expect(deskFrom.readFrom('', refusing)).toBeNull()
    })
})

describe('a cue firing its lighting scene', () => {
    it('posts the recall with the scene id and the cue fade in milliseconds', async () => {
        // Seconds on a cue, milliseconds on the desk. Getting this wrong is
        // invisible in tests of either desk alone: a 0.6s fade sent as 0.6ms
        // is a snap, which reads as "the light just does not fade".
        const fetchImpl = vi.fn(async () => ok({ ok: true }))
        await expect(recallCueLighting({ id: 'c1', fade: 2.5, lightScene: 'sc-7' }, { fetchImpl })).resolves.toBe(true)

        expect(fetchImpl).toHaveBeenCalledTimes(1)
        const [url, init] = fetchImpl.mock.calls[0]
        expect(url).toBe(`${window.location.origin}/light/api/scenes/recall`)
        expect(init.method).toBe('POST')
        expect(JSON.parse(init.body)).toEqual({ id: 'sc-7', fadeMs: 2500 })
    })

    it('says nothing at all when the cue carries no scene', async () => {
        // The common case by far. A cue with no light must not cost a request,
        // let alone one that fails, on every keypress of a show.
        const fetchImpl = vi.fn(async () => ok())
        await expect(recallCueLighting({ id: 'c1', fade: 1 }, { fetchImpl })).resolves.toBe(false)
        await expect(recallCueLighting({ id: 'c1', lightScene: '   ' }, { fetchImpl })).resolves.toBe(false)
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('does not throw when the desk is not there', async () => {
        // THE WHOLE POINT. The wall is the promise; the light is a bonus. A
        // rejected recall that escaped would take the projection cue with it.
        const refused = vi.fn(async () => { throw new Error('ECONNREFUSED') })
        await expect(recallCueLighting({ lightScene: 'sc-7', fade: 1 }, { fetchImpl: refused })).resolves.toBe(false)

        const missing = vi.fn(async () => notFound())
        await expect(recallCueLighting({ lightScene: 'sc-7', fade: 1 }, { fetchImpl: missing })).resolves.toBe(false)
    })

    it('sends no fade when the cue has none to send', async () => {
        const fetchImpl = vi.fn(async () => ok())
        await recallCueLighting({ lightScene: 'sc-7', fade: 'soon' }, { fetchImpl })
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ id: 'sc-7' })
        expect(cueFadeMs({ fade: 0 })).toBe(0)
    })
})

describe('asking the desk what it has', () => {
    it('lists the scenes', async () => {
        const fetchImpl = vi.fn(async () => ok({ scenes: [{ id: 'sc-1', name: 'House' }] }))
        await expect(fetchLightScenes({ fetchImpl })).resolves.toEqual([{ id: 'sc-1', name: 'House' }])
    })

    it('throws on a 404 rather than reading it as an empty desk', async () => {
        // "No scenes" and "no desk" are different sentences to the operator.
        await expect(fetchLightScenes({ fetchImpl: async () => notFound() })).rejects.toThrow()
    })

    it('probes false for a hosted tab and true only for a 200', async () => {
        await expect(probeLightingDesk({ fetchImpl: async () => notFound() })).resolves.toBe(false)
        await expect(probeLightingDesk({ fetchImpl: async () => { throw new Error('offline') } })).resolves.toBe(false)
        await expect(probeLightingDesk({ fetchImpl: async () => ok({ activeScene: null }) })).resolves.toBe(true)
        // The dev-tier case: a 200 that is a web page is not a desk, and the map desk
        // must not grow a Light link to one.
        await expect(probeLightingDesk({ fetchImpl: async () => htmlPage() })).resolves.toBe(false)
    })
})

const cueOf = (patch = {}) => ({ id: 'c1', name: 'Open', key: '1', fade: 0.6, hold: 0, surfaces: {}, ...patch })

const PICKER_TITLE = 'Fire this on the lighting desk when the cue fires. A look lands on the desk\'s cue layer; a scene is recalled with the cue\'s fade.'

describe('what a cue fires', () => {
    it('fires a LOOK onto the desk cue layer, and recalls a SCENE with the fade', async () => {
        const calls = []
        const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return ok({ ok: true }) }
        await recallCueLighting(cueOf({ lightLook: 'lk-9' }), { fetchImpl })
        expect(calls[0].url.endsWith('/light/api/looks/fire')).toBe(true)
        expect(calls[0].body).toEqual({ id: 'lk-9' })
        await recallCueLighting(cueOf({ lightScene: 'sc-3' }), { fetchImpl })
        expect(calls[1].url.endsWith('/light/api/scenes/recall')).toBe(true)
        expect(calls[1].body).toEqual({ id: 'sc-3', fadeMs: 600 })
    })

    it('a look wins when a cue somehow names both', async () => {
        const calls = []
        const fetchImpl = async (url) => { calls.push(String(url)); return ok({ ok: true }) }
        await recallCueLighting(cueOf({ lightLook: 'lk-9', lightScene: 'sc-3' }), { fetchImpl })
        expect(calls).toHaveLength(1)
        expect(calls[0].endsWith('/light/api/looks/fire')).toBe(true)
    })
})

describe('the picker in the cue editor', () => {
    const openEditor = (props = {}) => {
        // createElement rather than JSX: this file is a .js and only .jsx
        // test files get the JSX loader here.
        render(createElement(MapCueList, {
            cues: [cueOf({ lightScene: 'sc-7' })],
            surfaces: [],
            liveCueId: null,
            ...props
        }))
        fireEvent.click(screen.getByText('Edit'))
    }

    it('offers what the desk can fire, looks and scenes both, with none first', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({
            looks: [{ id: 'lk-2', name: 'Ember wave', kind: 'colour', steps: 2 }],
            scenes: [{ id: 'sc-7', name: 'ԳՈՌ warm', live: 3, missing: 0 }],
        })))
        openEditor()

        const picker = await screen.findByTitle(PICKER_TITLE)
        const options = within(picker).getAllByRole('option')
        expect(options[0].textContent).toBe('— none —')
        // The NAME is shown and the ID is what is stored: a renamed look has to stay
        // the same look. The kind travels in the value, because both are just ids.
        expect(options.some((o) => o.textContent.startsWith('Ember wave') && o.value === 'look:lk-2')).toBe(true)
        expect(options.some((o) => o.textContent === 'ԳՈՌ warm' && o.value === 'scene:sc-7')).toBe(true)
        expect(picker.value).toBe('scene:sc-7')
    })

    it('a cue naming a look reads as that look, not as the scene field', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({
            looks: [{ id: 'lk-2', name: 'Ember wave', kind: 'colour', steps: 2 }], scenes: [],
        })))
        openEditor({ cues: [cueOf({ lightLook: 'lk-2' })] })
        const picker = await screen.findByTitle(PICKER_TITLE)
        expect(picker.value).toBe('look:lk-2')
    })

    it('choosing one clears the other, so a cue never names two things', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({
            looks: [{ id: 'lk-2', name: 'Ember wave', kind: 'colour', steps: 2 }],
            scenes: [{ id: 'sc-7', name: 'Warm', live: 1, missing: 0 }],
        })))
        const onUpdate = vi.fn()
        openEditor({ onUpdate })
        const picker = await screen.findByTitle(PICKER_TITLE)
        fireEvent.change(picker, { target: { value: 'look:lk-2' } })
        expect(onUpdate).toHaveBeenCalledWith('c1', { lightLook: 'lk-2', lightScene: '' })
    })

    it('keeps a scene the desk no longer lists rather than reading as none', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({ looks: [], scenes: [{ id: 'sc-1', name: 'House' }] })))
        openEditor()

        const picker = await screen.findByTitle(PICKER_TITLE)
        expect(picker.value).toBe('scene:sc-7')
        expect(within(picker).getByText('sc-7 (not on the desk)')).toBeTruthy()
    })

    it('says where the desk lives when it answers 404, and keeps the stored scene', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => notFound()))
        const onUpdate = vi.fn()
        openEditor({ onUpdate })

        expect(await screen.findByText('Lighting desk not reachable — it runs on a local di.iiii')).toBeTruthy()
        expect(screen.queryByTitle(PICKER_TITLE)).toBeNull()
        // Not reachable is not the same as not wanted: nothing writes over the
        // cue's stored scene just because this laptop is not at the venue.
        expect(onUpdate).not.toHaveBeenCalled()
    })
})
