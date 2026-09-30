import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RIG_LIGHT, RIG_ROOM, RIG_STEPS, rigEntryPath, rigLightPath, rigNeighbours, rigRow, rigStepPath } from './rigTools.js'
import { rigProgress } from './rigProgress.js'
import RigBar, { RigSteps } from './RigSteps.jsx'
import { hasRig } from './hasRigLamps.js'
import { getEquipmentLocationState } from './equipmentRouting.js'
import { getBuildLocationState } from './buildRouting.js'
import { getPlotLocationState } from './plotRouting.js'
import { getCardsLocationState } from './cardsRouting.js'
import { getPatchSheetLocationState } from './patchRouting.js'
import { BUILD_KEYS } from './buildKeys.js'
import { RIG_KIT_LINES } from '../kit/kitCatalogue.js'
import library from './types/moxir.json'

// The rig, step by step (RIG_BUILD.md §14). Owner 2026-09-28: "look to UI/UX fix tha
// gaps that we can easy go from one place to other" and "make buttons in space that we
// can easy move in the workflow".

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const LOCATE = {
    equipment: (p) => getEquipmentLocationState({ pathname: p }).isEquipment,
    build: (p) => getBuildLocationState({ pathname: p }).isBuild && !getBuildLocationState({ pathname: p }).crew,
    plot: (p) => getPlotLocationState({ pathname: p }).isPlot,
    cards: (p) => getCardsLocationState({ pathname: p }).isCards,
    patch: (p) => getPatchSheetLocationState({ pathname: p }).isPatchSheet,
    crew: (p) => getBuildLocationState({ pathname: p }).crew
}

describe('the steps — one list, in the order a show is made', () => {
    it('numbers six steps between the room and the light desk, in plain words', () => {
        expect(RIG_STEPS.map((s) => `${s.n} ${s.label}`)).toEqual(['1 equipment', '2 build', '3 plot', '4 cards & looks', '5 patch sheet', '6 crew link'])
        expect(RIG_ROOM.label).toBe('room')
        expect(RIG_LIGHT.label).toBe('light desk')
        for (const s of [RIG_ROOM, ...RIG_STEPS, RIG_LIGHT]) expect(s.hint.length).toBeGreaterThan(10)
    })

    it('opens every step at the address the router gives that page — built, never written', () => {
        for (const s of RIG_STEPS) {
            const href = rigStepPath(s.key, 'moxir', 'moxir-hall')
            expect(href).toBe(`/moxir/${s.key}/moxir-hall`)
            expect(LOCATE[s.key](href), `${s.key} → ${href}`).toBe(true)
        }
        expect(rigStepPath('room', 'moxir', 'moxir-hall')).toBe('/moxir')
        expect(rigEntryPath('moxir', 'moxir-hall')).toBe('/moxir/equipment/moxir-hall')
        expect(rigEntryPath('moxir', 'moxir-hall', 'plot')).toBe('/moxir/plot/moxir-hall')
    })

    it('tells the desk which step opened it, and keeps it on the app hosted', () => {
        expect(rigLightPath({ spaceId: 'moxir', projectId: 'moxir-hall', label: 'MOXIR', from: 'cards' }))
            .toBe('/light/?space=moxir&project=moxir-hall&label=MOXIR&from=cards')
        // not a step (the room): no &from, the desk's way back stays the Studio's
        expect(rigLightPath({ spaceId: 'moxir', projectId: 'moxir-hall', from: 'room' })).toBe('/light/?space=moxir&project=moxir-hall')
        expect(rigLightPath({ spaceId: 'moxir', projectId: 'moxir-hall', from: 'cards', isLocalInstall: false })).toBe('/light')
        const row = rigRow({ spaceId: 'moxir', projectId: 'moxir-hall', here: 'patch', isLocalInstall: false })
        expect(row.find((s) => s.key === 'light').clientSide).toBe(true)
    })

    it('has a step before and a step after every step; the room and the desk close the ends', () => {
        expect(rigNeighbours('equipment')).toMatchObject({ back: { key: 'room' }, next: { key: 'build' } })
        expect(rigNeighbours('plot')).toMatchObject({ back: { key: 'build' }, next: { key: 'cards' } })
        expect(rigNeighbours('crew')).toMatchObject({ back: { key: 'patch' }, next: { key: 'light' } })
        // from the room, "next" is the step the show waits on
        expect(rigNeighbours('room', 'patch')).toMatchObject({ back: null, next: { key: 'patch' } })
        expect(rigNeighbours('room')).toMatchObject({ back: null, next: { key: 'equipment' } })
    })

    it('the Kit prints the same list, one line a step', () => {
        expect(RIG_KIT_LINES).toHaveLength(RIG_STEPS.length + 2)
        RIG_STEPS.forEach((s, i) => expect(RIG_KIT_LINES[i + 1]).toContain(`${s.n} ${s.label}`))
    })
})

const lamp = (id, fixture) => ({ id, type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, fixture } })
const listEntity = (items) => ({ id: 'rig-show', type: 'group', components: { rentalList: { items } } })

describe('rigProgress — what the document says about each step', () => {
    it('says "no list yet" before there is a list, and waits on equipment', () => {
        const p = rigProgress({ entities: [], library })
        expect(p.said.equipment).toBe('no list yet')
        expect(p.suggested).toBe('equipment')
    })

    it('counts the order, what is placed and what is addressed', () => {
        const entities = [
            listEntity([{ type: 'up-b380f', code: 'B380F', ordered: 4 }, { kind: 'item', code: 'NODE', ordered: 2 }]),
            lamp('a', { type: 'up-b380f', mode: '16ch', universe: 1, address: 1, position: 'truss', unit: 1 }),
            lamp('b', { type: 'up-b380f', position: 'truss', unit: 2 })
        ]
        const p = rigProgress({ entities, library })
        expect(p.said.equipment).toBe('6 on order')
        expect(p.said.build).toBe('2 of 4 placed')
        expect(p.said.patch).toMatch(/^1 of 2 addressed/)
        expect(p.suggested).toBe('build')
    })

    it('knows a room with a rig — a typed lamp, or only a list waiting to be hung', () => {
        expect(hasRig([])).toBe(false)
        expect(hasRig([listEntity([])])).toBe(true)
        expect(hasRig([lamp('a', { type: 'up-b380f' })])).toBe(true)
        expect(hasRig([{ id: 'x', type: 'spotLight', components: { light: {} } }])).toBe(false)
    })
})

describe('RigSteps — the row', () => {
    it('marks where you are, numbers the steps, and says what each holds', () => {
        const progress = { said: { equipment: '104 on order', patch: '46 of 104 addressed · ! 4' }, warn: { patch: true }, suggested: 'patch' }
        render(<RigSteps spaceId="moxir" projectId="moxir-hall" here="plot" progress={progress} />)
        const nav = screen.getByRole('navigation', { name: 'The rig, step by step' })
        const list = within(nav).getByRole('list')
        const items = within(list).getAllByRole('link')
        expect(items.map((a) => a.getAttribute('href'))).toEqual([
            '/moxir', '/moxir/equipment/moxir-hall', '/moxir/build/moxir-hall', '/moxir/plot/moxir-hall',
            '/moxir/cards/moxir-hall', '/moxir/patch/moxir-hall', '/moxir/crew/moxir-hall',
            '/light/?space=moxir&project=moxir-hall&from=plot',
            '/moxir/visualise/moxir-hall' // the desk beside the room (RIG_BUILD.md §19)
        ])
        const here = items.find((a) => a.getAttribute('aria-current') === 'page')
        expect(here.textContent).toMatch(/3\s*plot/)
        expect(items[1].textContent).toContain('104 on order')
        expect(items[5].className).toContain('is-warn')
        // the step before and the step after, at the two ends
        expect(within(nav).getByRole('link', { name: 'back to build' }).getAttribute('href')).toBe('/moxir/build/moxir-hall')
        expect(within(nav).getAllByRole('link').find((a) => /next/.test(a.textContent)).getAttribute('href')).toBe('/moxir/cards/moxir-hall')
    })

    it('folds to one button that lists every step, a finger tall', () => {
        render(<RigSteps spaceId="moxir" projectId="moxir-hall" here="cards" />)
        const pick = screen.getByRole('button', { name: /4\/6\s*cards & looks/ })
        fireEvent.click(pick)
        const menu = screen.getByRole('menu')
        expect(within(menu).getAllByRole('link')).toHaveLength(9)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('is gone while the room has the pointer', () => {
        const { container } = render(<RigSteps spaceId="moxir" projectId="moxir-hall" here="build" hidden />)
        expect(container.innerHTML).toBe('')
    })

    it('sits under the platform bar on every rig page (RigBar)', () => {
        render(<RigBar spaceId="moxir" projectId="moxir-hall" here="equipment" />)
        expect(screen.getByRole('navigation', { name: 'di.iiii' })).toBeTruthy()
        expect(screen.getByRole('navigation', { name: 'The rig, step by step' })).toBeTruthy()
    })
})

describe('every rig page carries the row, and no page keeps a list of its own', () => {
    const PAGES = {
        'src/rigbuild/EquipmentSurface.jsx': 'equipment',
        'src/rigbuild/PlotSurface.jsx': 'plot',
        'src/rigbuild/CardsSurface.jsx': 'cards',
        'src/rigbuild/PatchSheetSurface.jsx': 'patch'
    }
    it.each(Object.entries(PAGES))('%s', (file, here) => {
        const src = read(file)
        expect(src).toMatch(new RegExp(`<RigBar[^>]*here="${here}"`))
        // the old per-page links to the other views are gone (the row has them all)
        expect(src).not.toMatch(/<a href=\{build(Build|Cards|Equipment)Path\(/)
    })

    it('view A and crew: the row floats over the room and hides under the locked pointer', () => {
        const src = read('src/rigbuild/BuildSurface.jsx')
        expect(src).toMatch(/here=\{crew \? 'crew' : 'build'\}/)
        expect(src).toMatch(/hidden=\{locked\}/)
        expect(src).not.toMatch(/rigbuild-links/)
    })

    it('the room (/{space}) and the Studio open the rig', () => {
        expect(read('src/project/components/PublicProjectViewer.jsx')).toMatch(/<RoomRigSteps/)
        expect(read('src/studio/components/StudioShell.jsx')).toMatch(/rigEntryPath\(rigSpaceId, rigProjectId, 'plot'\)/)
    })
})

describe('the build keys, said once', () => {
    // Each key the legend names is one the handler reads (BuildSurface's onKey).
    it('names only keys the build handler answers', () => {
        const src = read('src/rigbuild/BuildSurface.jsx')
        for (const k of ['b', 'e', 'r', 'q', 'z', 'i', 'h']) expect(src).toMatch(new RegExp(`k === '${k}'`))
        expect(BUILD_KEYS.map(([k]) => k)).toEqual(['B', '1 – 0', 'E', 'click', 'right-click', 'R', 'Q / Z', 'Esc', 'I', 'Ctrl Z', 'H'])
    })
})
