import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { migrateDocument, planDocument, planProduction } from './migrate-views.mjs'
import { applyProjectOps, normalizeProjectDocument } from '../../src/shared/projectSchema.js'
import { entryOps, productionOps, productionViewsOps } from '../../src/shared/productionVersions.js'
import { resolveViews } from '../../src/project/viewport/smartView/viewData.js'
import { VIEW_PRESET_IDS } from '../../src/project/viewport/smartView/smartViewGeometry.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// The repo's fixture: a real production's rig file, whose `views` block is what its scripts wrote into
// presentationState (fixedCamera + viewPresets: floor, entry, top, side). There is no whole project document of
// it in the repo; this is the closest copy. Read, never written.
const FIXTURE = path.join(here, '..', 'place', 'rigs', 'moxir-v2-7-2026-10-12.json')
const fixtureDocument = () => normalizeProjectDocument({ entities: [], presentationState: JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).views })
const computed = (extras) => [...VIEW_PRESET_IDS, ...extras].map((id) => ({ id, label: id, title: id, position: [0, 1, 0], target: [0, 0, 0] }))

describe('migrate-views: a project’s current views become data', () => {
    it('keeps every button the fixture’s visitors see today, with its authored camera and label', () => {
        const doc = fixtureDocument()
        const before = resolveViews(computed(['entry']), doc.presentationState.viewPresets, 'visitor').map((v) => v.id)
        expect(before).toEqual(['floor', 'top'])          // without the migration: the new default only
        const plan = planDocument(doc)
        expect(plan.changed).toBe(true)
        const after = resolveViews(computed(['entry']), plan.viewPresets, 'visitor').map((v) => v.id)
        expect(after).toEqual([...VIEW_PRESET_IDS, 'entry'])  // what the viewer showed before 2026-10-13
        const floor = plan.viewPresets.find((v) => v.id === 'floor')
        expect(floor).toMatchObject({ live: true, label: 'Floor 1.7 m', position: [-3.75, 1.7, 18.1], target: [-3.75, 5, -20], fov: 70 })
    })

    it('is idempotent, touches nothing else in the document, and survives the schema', () => {
        const doc = fixtureDocument()
        const once = normalizeProjectDocument(migrateDocument(doc))
        expect(planDocument(once).changed).toBe(false)
        expect(once.presentationState.fixedCamera).toEqual(doc.presentationState.fixedCamera)
        expect(once.presentationState.viewPresets).toEqual(planDocument(doc).viewPresets)
    })

    it('--live keeps only the named views live', () => {
        const plan = planDocument(fixtureDocument(), { live: ['floor', 'entry'] })
        expect(plan.viewPresets.filter((v) => v.live).map((v) => v.id)).toEqual(['floor', 'entry'])
    })

    it('a production takes its own list when it has one, else the version for the show’s', () => {
        let list = normalizeProjectDocument({ entities: [] })
        list = applyProjectOps(list, productionOps(list, { id: 'show-2030', title: 'Show 2030' }))
        list = applyProjectOps(list, entryOps(list, { id: 'a', projectId: 'show-a', status: 'candidate' }).ops)
        list = applyProjectOps(list, entryOps(list, { id: 'b', projectId: 'show-b', status: 'for-the-show' }).ops)
        const docs = new Map([['show-a', normalizeProjectDocument({ entities: [] })], ['show-b', fixtureDocument()]])
        const fromShow = planProduction(list, docs)
        expect(fromShow.from).toBe('show-b')
        expect(fromShow.viewPresets.some((v) => v.id === 'entry' && v.live)).toBe(true)
        const chosen = [{ id: 'top', live: true }]
        const withChoice = applyProjectOps(list, productionViewsOps(list, chosen))
        expect(planProduction(withChoice, docs)).toEqual({ from: 'production', viewPresets: chosen })
    })

    it('the command migrates a copy on disk and refuses a host that is not a scratch stack', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-views-'))
        const input = path.join(dir, 'doc.json')
        const out = path.join(dir, 'out.json')
        fs.writeFileSync(input, JSON.stringify({ document: fixtureDocument() }))
        const script = path.join(here, 'migrate-views.mjs')
        execFileSync(process.execPath, [script, '--file', input, '--out', out], { encoding: 'utf8' })
        const written = JSON.parse(fs.readFileSync(out, 'utf8')).document.presentationState.viewPresets
        expect(written.every((v) => typeof v.live === 'boolean')).toBe(true)
        expect(JSON.parse(fs.readFileSync(input, 'utf8')).document.presentationState.viewPresets.some((v) => 'live' in v)).toBe(false)
        let refused = ''
        try {
            execFileSync(process.execPath, [script, '--api', 'https://example.org/serverXR', '--project', 'x'], { encoding: 'utf8', stdio: 'pipe' })
        } catch (error) {
            refused = String(error.stderr)
        }
        expect(refused).toMatch(/scratch stack only/)
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
