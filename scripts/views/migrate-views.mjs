#!/usr/bin/env node
/**
 * migrate-views.mjs — a project's view buttons become data (docs/ai/decisions/2026-10-13-views-library-words-workflow.md).
 *
 * Before 2026-10-13 every room with a building showed the six built-in views (plus any extra camera a script placed);
 * since then the viewer shows only the views a project marks live, and a project without that data gets the default
 * (the walk at eye height and the plan). This command writes today's buttons into the project as data, so a room keeps
 * what its visitors see now. Generic: any project, any production. Idempotent: a list that is already data is left alone.
 *
 *   node scripts/views/migrate-views.mjs --file <document.json> [--out <copy.json>] [--live floor,top]
 *       a document on disk (a project document, or { document }): prints the plan; --out writes the migrated copy
 *   node scripts/views/migrate-views.mjs --api http://127.0.0.1:4337/serverXR --project <id> [--apply]
 *   node scripts/views/migrate-views.mjs --api http://127.0.0.1:4337/serverXR --production <id> [--apply]
 *       a production: its list (`<id>-versions`) keeps the choice, every version gets the same list
 *
 *   --live a,b   keep only these views live (default: every view visitors see today)
 *   --apply      write (otherwise a dry run that writes nothing)
 * Writes to a scratch stack only (localhost / 127.0.0.1) unless --allow-host names the API's host exactly — a live
 * install is the owner's call, never a default.
 */
import fs from 'node:fs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { isViewData, migrateToViewData } from '../../src/project/viewport/smartView/viewData.js'
import { forTheShow, listProjectIdOf, productionViewsOf, versionProjectIds, versionsFromDocument } from '../../src/shared/productionVersions.js'
import { writeViewsEverywhere } from '../../src/project/viewport/smartView/productionViewsSync.js'

const args = (argv) => { const o = {}; for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; return o }
const liveOption = (value) => (typeof value === 'string' && value.trim() ? value.split(',').map((s) => s.trim()).filter(Boolean) : 'all')

/** One document's plan: { changed, before, viewPresets }. Pure. */
export const planDocument = (document, { live = 'all' } = {}) => {
    const before = document?.presentationState?.viewPresets
    const { changed, viewPresets } = migrateToViewData(before, { live })
    return { changed, before: before ?? null, viewPresets }
}

/** The document with its views migrated (a copy; the input is not touched). Pure. */
export const migrateDocument = (document, options) => {
    const { viewPresets } = planDocument(document, options)
    return { ...document, presentationState: { ...(document?.presentationState || {}), viewPresets } }
}

/**
 * A production's one list: the list's own choice when it already has data; else the version for the show's
 * views (or the first version's), migrated. `docs` maps project id → document. Pure.
 */
export const planProduction = (listDocument, docs, { live = 'all' } = {}) => {
    const chosen = productionViewsOf(listDocument)
    if (isViewData(chosen)) return { from: 'production', viewPresets: chosen }
    const { entries } = versionsFromDocument(listDocument)
    const lead = forTheShow(entries) || entries[0]
    if (!lead) throw new Error('the production lists no versions')
    const doc = docs.get(lead.projectId)
    if (!doc) throw new Error(`cannot read ${lead.projectId}, the version the views come from`)
    return { from: lead.projectId, viewPresets: planDocument(doc, { live }).viewPresets }
}

const scratchOnly = (api, allowHost) => {
    const host = new URL(`${api}/`).hostname
    if (host === 'localhost' || host === '127.0.0.1' || (allowHost && host === allowHost)) return
    throw new Error(`migrate-views.mjs writes to a scratch stack only (localhost / 127.0.0.1); ${host} needs --allow-host ${host}`)
}

const main = async (opt) => {
    const live = liveOption(opt.live)
    if (opt.file) {
        const raw = JSON.parse(fs.readFileSync(String(opt.file), 'utf8'))
        const doc = raw?.document && typeof raw.document === 'object' ? raw.document : raw
        const plan = planDocument(doc, { live })
        console.log(JSON.stringify({ changed: plan.changed, viewPresets: plan.viewPresets }, null, 1))
        if (opt.out) {
            const next = migrateDocument(doc, { live })
            fs.writeFileSync(String(opt.out), `${JSON.stringify(raw?.document ? { ...raw, document: next } : next, null, 1)}\n`)
            console.log(`written: ${opt.out}`)
        }
        return
    }
    if (!opt.api) throw new Error('needs --file, or --api with --project / --production')
    const api = String(opt.api).replace(/\/+$/, '')
    scratchOnly(api, typeof opt['allow-host'] === 'string' ? opt['allow-host'] : null)
    const client = makeClient(api, readToken(opt['token-file'] ? String(opt['token-file']) : null))
    const io = {
        getDocument: async (id) => {
            const got = await client.get(`/api/projects/${id}/document`)
            if (!got.ok) throw new Error(`reading ${id}: ${got.status}`)
            return { document: got.body.document, version: got.body.version }
        },
        submitOps: async (id, baseVersion, ops) => {
            const out = await client.post(`/api/projects/${id}/ops`, { baseVersion, ops: ops.map((op, i) => ({ ...op, opId: `migrate-views-${Date.now()}-${i}`, clientId: 'migrate-views' })) })
            if (!out.ok) throw new Error(`writing ${id}: ${out.status} ${out.text.slice(0, 200)}`)
        }
    }
    let listProjectId = null
    let projectIds = []
    let viewPresets = null
    if (opt.production) {
        listProjectId = listProjectIdOf(String(opt.production))
        const { document: list } = await io.getDocument(listProjectId)
        projectIds = versionProjectIds(list)
        const docs = new Map()
        for (const id of projectIds) docs.set(id, (await io.getDocument(id)).document)
        const plan = planProduction(list, docs, { live })
        viewPresets = plan.viewPresets
        console.log(`production ${opt.production}: ${projectIds.length} versions; views from ${plan.from}`)
    } else if (opt.project) {
        const { document } = await io.getDocument(String(opt.project))
        const plan = planDocument(document, { live })
        if (!plan.changed) { console.log(`${opt.project}: already data, nothing to do`); return }
        viewPresets = plan.viewPresets
        projectIds = [String(opt.project)]
    } else {
        throw new Error('needs --project or --production')
    }
    console.log('views:', viewPresets.map((v) => `${v.id}${v.live ? ' live' : ' work'}${v.hidden ? ' hidden' : ''}`).join(' · '))
    if (!opt.apply) { console.log('dry run: nothing written (--apply writes)'); return }
    const result = await writeViewsEverywhere({ viewPresets, listProjectId, projectIds, api: io })
    console.log(JSON.stringify(result, null, 1))
    if (result.failed.length) process.exitCode = 1
}

if (isMainModule(import.meta.url)) {
    main(args(process.argv.slice(2))).catch((e) => { console.error(e.message); process.exit(1) })
}
