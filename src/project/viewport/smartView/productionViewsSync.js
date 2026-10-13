// One view list, written everywhere it is read (decision 3, 2026-10-13: every version of a production shows the
// same view buttons). The production's list project keeps the choice (productionViews on its `production`
// entity); each version keeps a copy in its own presentationState.viewPresets, because the viewer reads only
// the project it shows (a visitor cannot read the private list). The Studio calls this when the author changes
// a production's views; scripts/views/migrate-views.mjs calls it for a whole production.
//
// `api` is injected (the Studio passes projectsApi, the command its own client), so this has no I/O of its own:
//   getDocument(projectId)                 → { document, version }
//   submitOps(projectId, baseVersion, ops) → resolves on success, throws on refusal (a conflict included)

import { productionViewsOf, productionViewsOps } from '../../../shared/productionVersions.js'
import { productionChromeOf, productionChromeOps, normalizeVisitorChrome } from '../../../shared/visitorChrome.js'

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const writeOne = async (api, projectId, plan) => {
    // One retry: a conflict means someone wrote between our read and our write; read again and re-plan.
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const { document, version } = await api.getDocument(projectId)
        const ops = plan(document)
        if (!ops.length) return 'unchanged'
        try {
            await api.submitOps(projectId, version, ops)
            return 'written'
        } catch (error) {
            if (attempt === 1) throw error
        }
    }
    return 'unchanged'
}

/**
 * Write `viewPresets` into the production's list (when `listProjectId` is given) and into every project in
 * `projectIds`. Never throws: { written, unchanged, failed: [{ projectId, error }] } — the caller says what failed.
 */
export const writeViewsEverywhere = async ({ viewPresets, projectIds = [], listProjectId = null, api }) => {
    const result = { written: [], unchanged: [], failed: [] }
    const targets = [
        ...(listProjectId ? [[listProjectId, (doc) => (same(productionViewsOf(doc), viewPresets) ? [] : productionViewsOps(doc, viewPresets))]] : []),
        ...[...new Set(projectIds)].filter((id) => id && id !== listProjectId).map((id) => [id, (doc) => (
            same(doc?.presentationState?.viewPresets, viewPresets)
                ? []
                : [{ type: 'setPresentationState', payload: { patch: { viewPresets } } }]
        )])
    ]
    for (const [projectId, plan] of targets) {
        try {
            result[await writeOne(api, projectId, plan)].push(projectId)
        } catch (error) {
            result.failed.push({ projectId, error: String(error?.message || error) })
        }
    }
    return result
}

/**
 * Write the visitor chrome (src/shared/visitorChrome.js: what the view page shows) the same way the views are written:
 * the production's list keeps the choice, every version keeps a copy in presentationState.visitorChrome. Never throws.
 */
export const writeChromeEverywhere = async ({ chrome, projectIds = [], listProjectId = null, api }) => {
    const value = normalizeVisitorChrome(chrome)
    const result = { written: [], unchanged: [], failed: [] }
    const targets = [
        ...(listProjectId ? [[listProjectId, (doc) => (same(productionChromeOf(doc), value) ? [] : productionChromeOps(doc, value))]] : []),
        ...[...new Set(projectIds)].filter((id) => id && id !== listProjectId).map((id) => [id, (doc) => (
            same(doc?.presentationState?.visitorChrome, value)
                ? []
                : [{ type: 'setPresentationState', payload: { patch: { visitorChrome: value } } }]
        )])
    ]
    for (const [projectId, plan] of targets) {
        try {
            result[await writeOne(api, projectId, plan)].push(projectId)
        } catch (error) {
            result.failed.push({ projectId, error: String(error?.message || error) })
        }
    }
    return result
}
