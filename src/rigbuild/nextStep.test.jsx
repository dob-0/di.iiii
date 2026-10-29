// An empty rig page offers its next step as a button (F038, ux slice S22). What these prove:
// the empty pages' words name no developer script; each button's ops, run through the
// document's own op path, give the page what it was missing; the script and the button run
// one code; a visitor who may only look gets no button that writes. jsdom + testing-library.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceEntity } from './plotEdits.js'
import { layRun } from './plotGeometry.js'
import { positionsOf } from './positions.js'
import { dealOps } from './deal.js'
import { lookPoses, rigLooksOf } from './looks.js'
import { venueOf } from './venuePlan.js'
import { RIG_SHOW_ID } from './rental.js'
import * as script from '../../scripts/rigbuild/looks.mjs'
import * as shared from './rigLooksFrom.js'
import { FIRST_LOOK_ID, NEXT_STEP_WORDS, VENUE_ENTITY_ID, firstLookOps, hallPlanOps, rigFileLooksOps } from './nextStep.js'
import NextStep from './NextStep.jsx'
import ScenesDeck from './ScenesDeck.jsx'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const HALL = 'scripts/place/rigs/moxir-hall-2026-09-28.hall.json'

afterEach(cleanup)

// The page's text, not its comments: JSX comments, line comments and block comments out.
const pageText = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the empty rig pages name no developer script', () => {
    for (const file of ['src/rigbuild/CardsSurface.jsx', 'src/rigbuild/PlotSurface.jsx', 'src/rigbuild/ScenesDeck.jsx']) {
        it(`${file}: no "scripts/rigbuild" and no ".mjs" in what the page says`, () => {
            const text = pageText(read(file))
            expect(text).not.toMatch(/scripts\/rigbuild/)
            expect(text).not.toMatch(/[\w-]+\.mjs\b/)
        })
    }
    it('the words of every next step are plain: no file names, no script names', () => {
        for (const [key, words] of Object.entries(NEXT_STEP_WORDS)) expect(words, key).not.toMatch(/\.mjs|scripts\/|--[a-z]/)
    })
    it('the empty scenes page shows a button to the cards page', () => {
        render(<ScenesDeck doc={normalizeProjectDocument({})} applyOps={() => {}} spaceId="main" projectId="p1" storage={null} />)
        expect(screen.getByText(NEXT_STEP_WORDS.scenes)).toBeTruthy()
        const link = screen.getByRole('link', { name: NEXT_STEP_WORDS.cards })
        expect(link.getAttribute('href')).toMatch(/p1/)
        expect(document.body.textContent).not.toMatch(/\.mjs/)
    })
})

describe('the script and the button run one code', () => {
    it('looks.mjs re-exports the app\'s functions, the same objects', () => {
        expect(script.rigLooksFrom).toBe(shared.rigLooksFrom)
        expect(script.groupKeys).toBe(shared.groupKeys)
        expect(script.rigLooksOp).toBe(shared.rigLooksOp)
    })
})

// A dealt room with no looks: the test room of lookLevel.test.jsx (a hall plan, three decks, a truss header).
const plan = {
    outline: [[-40, -60], [40, -60], [40, 60], [-40, 60]],
    columns: [-12, 12].flatMap((x) => [6, 12, 18, 24].map((z) => [x, z, 0.8, 0.5])),
    zones: [{ id: 'stage', rects: [[-3.8, 3.6, 3.8, 7.5]] }, { id: 'dance', rects: [[-10, 7.5, 10, 30]] }],
    overhead: [{ id: 'runway-l', line: [[-11, -50], [-11, 50]], bottom: 6.5 }]
}
const dealtRoom = () => {
    let doc = normalizeProjectDocument({ entities: [
        { id: 'hall', type: 'model', components: { venuePlan: plan } },
        ...[-1, 0, 1].map((dx, i) => pieceEntity({ id: `d${i}`, kind: 'deck-2x1', position: [dx, 0, 5.2], yaw: Math.PI / 2, height: 1.2 })),
        ...layRun({ from: [-3.5, 5.1], to: [3.5, 5.1], y: 7 }).map((s, i) => pieceEntity({ id: `h${i}`, kind: s.kind, position: s.position, yaw: s.yaw, name: 'truss header' }))
    ] })
    let n = 0
    for (const [pos, type, k] of [['column-bases', 'up-b380f', 4], ['truss:h0', 'up-250bsw', 2]]) {
        const position = positionsOf(doc.entities).find((p) => p.id === pos)
        doc = applyProjectOps(doc, dealOps({ entities: doc.entities, position, filled: new Set(), type: typeById(TYPE_LIBRARY, type), n: k, newId: () => `L${++n}` }).ops)
    }
    return doc
}

describe('make a first look', () => {
    it('writes one look on the show: every group on the stage centre, open white, and it poses every lamp', () => {
        const doc = dealtRoom()
        expect(rigLooksOf(doc.entities)).toBeNull()
        const after = applyProjectOps(doc, firstLookOps(doc.entities, TYPE_LIBRARY, '2026-10-29'))
        const looks = rigLooksOf(after.entities)
        expect(looks.looks.map((l) => l.id)).toEqual([FIRST_LOOK_ID])
        expect(looks.defaultLook).toBe(FIRST_LOOK_ID)
        const look = looks.looks[0]
        expect(Object.values(look.aims).every((a) => a.rule === 'point')).toBe(true)
        expect(Object.values(look.colours).every((c) => c === '#ffffff')).toBe(true)
        const lamps = after.entities.filter((e) => e.components?.fixture?.type)
        expect(lamps.length).toBe(6)
        expect(lookPoses({ entities: after.entities, library: TYPE_LIBRARY, lookId: FIRST_LOOK_ID }).size).toBe(6)
    })
    it('a project with no lamp gets no look (nothing to point)', () => {
        expect(firstLookOps(normalizeProjectDocument({}).entities, TYPE_LIBRARY)).toBeNull()
    })
})

describe('load looks from a rig file', () => {
    const rig = {
        rig: 'next-step-test', writtenAt: '2026-10-29',
        classes: { beam: { code: 'UP-B380F' } },
        groups: [{ id: 'beams-cols', class: 'beam', mount: 'column-bases' }],
        looks: { up: { title: 'Up', aims: { 'beams-cols': { rule: 'vertical' } }, colours: { 'beams-cols': '#ff3a12' } } }
    }
    it('creates the show with the looks when it is missing, and updates it when it is there', () => {
        const doc = normalizeProjectDocument({})
        const once = applyProjectOps(doc, rigFileLooksOps(doc.entities, rig, 'my-rig.json'))
        expect(rigLooksOf(once.entities).looks[0].aims).toEqual({ 'column-bases/up-b380f': { rule: 'vertical' } })
        const twice = rigFileLooksOps(once.entities, rig, 'my-rig.json')
        expect(twice[0].type).toBe('updateComponent')
        expect(twice[0].payload.entityId).toBe(RIG_SHOW_ID)
    })
    it('refuses a file it cannot read, saying why', () => {
        expect(() => rigFileLooksOps([], { groups: [{ id: 'g', class: 'x', mount: 'nowhere' }] }, 'bad.json')).toThrow(/has no position/)
    })
})

describe('load the hall plan', () => {
    const hall = JSON.parse(read(HALL))
    it('creates the hall with its plan in an empty project, and the plot reads it', () => {
        const doc = normalizeProjectDocument({})
        const after = applyProjectOps(doc, hallPlanOps(doc.entities, hall, 'my-hall.hall.json'))
        const { entity, plan: got } = venueOf(after.entities)
        expect(entity.id).toBe(VENUE_ENTITY_ID)
        expect(got.outline.length).toBe(4)
        expect(got.name).toBe('my-hall')
    })
    it('updates the entity that already holds a plan', () => {
        const ops = hallPlanOps([{ id: 'hall', type: 'model', components: { venuePlan: plan } }], hall, 'hall.json')
        expect(ops).toHaveLength(1)
        expect(ops[0]).toMatchObject({ type: 'updateComponent', payload: { entityId: 'hall', component: 'venuePlan' } })
    })
    it('refuses a file that is not a hall', () => {
        expect(() => hallPlanOps([], { nope: 1 }, 'x.json')).toThrow(/not a hall/)
    })
})

describe('NextStep: who may write', () => {
    const actions = [{ label: 'do it', make: () => [{ type: 'noop' }], done: 'did it' }, { label: 'go there', href: '/main/plot/p1' }]
    it('a person who may write gets the buttons, and the button sends its ops', () => {
        const applyOps = vi.fn()
        render(<NextStep line="empty" actions={actions} applyOps={applyOps} />)
        fireEvent.click(screen.getByRole('button', { name: 'do it' }))
        expect(applyOps).toHaveBeenCalledWith([{ type: 'noop' }])
        expect(screen.getByRole('status').textContent).toBe('did it')
    })
    it('read only: the links stay, no button that writes, and the page says why', () => {
        const applyOps = vi.fn()
        render(<NextStep line="empty" actions={actions} applyOps={applyOps} readOnly />)
        expect(screen.queryByRole('button', { name: 'do it' })).toBeNull()
        expect(screen.getByRole('link', { name: 'go there' })).toBeTruthy()
        expect(screen.getByText(NEXT_STEP_WORDS.readOnly)).toBeTruthy()
        expect(applyOps).not.toHaveBeenCalled()
    })
    it('a file button reads the chosen .json and sends what it makes; a bad file is said, not sent', async () => {
        const applyOps = vi.fn()
        const { container } = render(<NextStep line="empty" actions={[{ label: 'load', file: (json, name) => { if (!json.ok) throw new Error('not a rig'); return [{ type: 'noop', name }] } }]} applyOps={applyOps} />)
        const input = container.querySelector('input[type="file"]')
        fireEvent.click(screen.getByRole('button', { name: 'load' }))
        const bad = new File(['{"ok":false}'], 'bad.json', { type: 'application/json' })
        fireEvent.change(input, { target: { files: [bad] } })
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/could not load bad.json: not a rig/))
        expect(applyOps).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'load' }))
        fireEvent.change(input, { target: { files: [new File(['{"ok":true}'], 'good.json', { type: 'application/json' })] } })
        await waitFor(() => expect(applyOps).toHaveBeenCalledWith([{ type: 'noop', name: 'good.json' }]))
    })
})
