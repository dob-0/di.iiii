import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
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

const ok = (body = {}) => ({ ok: true, status: 200, json: async () => body })
const notFound = () => ({ ok: false, status: 404, json: async () => ({}) })

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('the address of the lighting desk', () => {
    it('is app-level /light, on this origin', () => {
        expect(lightingDeskPath()).toBe('/light/')
        expect(lightingApiUrl('api/summary')).toBe(`${window.location.origin}/light/api/summary`)
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
    })
})

const cueOf = (patch = {}) => ({ id: 'c1', name: 'Open', key: '1', fade: 0.6, hold: 0, surfaces: {}, ...patch })

const PICKER_TITLE = 'Recall this scene on the lighting desk when the cue fires'

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

    it('offers the desk scenes with none first', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({ scenes: [{ id: 'sc-7', name: 'ԳՈՌ warm' }] })))
        openEditor()

        const picker = await screen.findByTitle(PICKER_TITLE)
        const options = within(picker).getAllByRole('option')
        expect(options[0].textContent).toBe('— none —')
        // The NAME is shown and the ID is what is stored: a renamed scene has
        // to stay the same scene.
        expect(options.some((option) => option.textContent === 'ԳՈՌ warm' && option.value === 'sc-7')).toBe(true)
        expect(picker.value).toBe('sc-7')
    })

    it('keeps a scene the desk no longer lists rather than reading as none', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ok({ scenes: [{ id: 'sc-1', name: 'House' }] })))
        openEditor()

        const picker = await screen.findByTitle(PICKER_TITLE)
        expect(picker.value).toBe('sc-7')
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
