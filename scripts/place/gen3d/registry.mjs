// gen3d registry + guards. Pure functions, no network. Data: models.json (primary-source licences, pinned code revs).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const KINDS = ['furniture', 'thin', 'round', 'default']
export const USES = ['product', 'research']

export function loadRegistry(file = path.join(HERE, 'models.json')) {
    const reg = JSON.parse(fs.readFileSync(file, 'utf8'))
    validateRegistry(reg)
    return reg
}

const REQUIRED = ['id', 'name', 'repo', 'code_rev', 'weights', 'licence', 'commercial_ok', 'research_only', 'territory', 'vram_gb', 'where', 'runner', 'invoke']

// Returns the registry or throws with every problem listed (so a bad edit says all of it once).
export function validateRegistry(reg, { runnersDir = path.join(HERE, 'runners'), checkRunners = true } = {}) {
    const errs = []
    const ids = new Set()
    for (const m of reg.models || []) {
        for (const k of REQUIRED) if (m[k] === undefined) errs.push(`${m.id || '?'}: missing ${k}`)
        if (ids.has(m.id)) errs.push(`${m.id}: duplicate id`)
        ids.add(m.id)
        if (!/^[0-9a-f]{40}$/.test(m.code_rev || '')) errs.push(`${m.id}: code_rev must be a full 40-char commit (pinned)`)
        if (![true, false, 'conditional'].includes(m.commercial_ok)) errs.push(`${m.id}: commercial_ok must be true|false|"conditional"`)
        if (!m.licence?.code || !m.licence?.weights) errs.push(`${m.id}: licence needs code and weights`)
        if (m.research_only && m.commercial_ok === true) errs.push(`${m.id}: research_only cannot be commercial_ok true`)
        if (m.commercial_ok === false && !m.research_only) errs.push(`${m.id}: commercial_ok false must be research_only`)
        if (m.territory !== 'none' && !String(m.territory).trim()) errs.push(`${m.id}: territory empty`)
        if (!Array.isArray(m.where) || !m.where.every(w => ['colab', 'local'].includes(w))) errs.push(`${m.id}: where must be colab|local`)
        if (m.where?.includes('local') && !m.local_runner) errs.push(`${m.id}: where has local but no local_runner`)
        if (checkRunners && m.runner && !fs.existsSync(path.join(runnersDir, m.runner))) errs.push(`${m.id}: runner file not found: ${m.runner}`)
    }
    for (const [kind, list] of Object.entries(reg.ranking || {})) {
        if (kind.startsWith('_')) continue
        if (!KINDS.includes(kind)) errs.push(`ranking: unknown kind ${kind}`)
        for (const id of list) if (!ids.has(id)) errs.push(`ranking.${kind}: unknown model ${id}`)
    }
    if (!reg.ranking?.default) errs.push('ranking.default missing')
    for (const id of reg.never_auto || []) if (!ids.has(id)) errs.push(`never_auto: unknown model ${id}`)
    if (errs.length) throw new Error('models.json invalid:\n  ' + errs.join('\n  '))
    return reg
}

export function getModel(reg, id) {
    const m = reg.models.find(x => x.id === id)
    if (!m) throw new Error(`unknown model "${id}". Known: ${reg.models.map(x => x.id).join(', ')}`)
    return m
}

// The research_only guard. Returns {ok, reason, flags}. use: 'product' (default) | 'research'.
export function checkModelUse(model, { use = 'product', allowConditional = false } = {}) {
    if (!USES.includes(use)) return { ok: false, reason: `--use must be product|research, got "${use}"` }
    if (model.research_only && use !== 'research') {
        return { ok: false, reason: `${model.id} is RESEARCH ONLY (${model.territory}). Refused for product output. Re-run with --use research to make a marked comparison; never show it in the EU/UK/KR.` }
    }
    if (model.commercial_ok === 'conditional' && use === 'product' && !allowConditional) {
        return { ok: false, reason: `${model.id} has an open licence question (${model.licence.dependencies || 'see models.json'}). Product use needs the owner's decision: pass --allow-conditional to accept and record it.` }
    }
    return { ok: true, flags: { conditional: model.commercial_ok === 'conditional', research_only: !!model.research_only } }
}

// Output location guard: research output must never land in a product path, and is always suffixed.
export function researchOutDir(out) {
    return /RESEARCH-ONLY$/.test(out) ? out : out.replace(/\/+$/, '') + '-RESEARCH-ONLY'
}

// auto: first ranked model for the kind that passes the guard (and, for unrun models, never auto).
export function pickModel(reg, { kind = 'default', use = 'product', allowConditional = false, where = 'colab' } = {}) {
    const list = reg.ranking[kind] || reg.ranking.default
    const skipped = []
    for (const id of list) {
        const m = getModel(reg, id)
        if ((reg.never_auto || []).includes(id)) { skipped.push(`${id}: never auto`); continue }
        if (!m.where.includes(where)) { skipped.push(`${id}: cannot run ${where}`); continue }
        const g = checkModelUse(m, { use, allowConditional })
        if (!g.ok) { skipped.push(`${id}: ${g.reason}`); continue }
        return { model: m, skipped }
    }
    throw new Error(`auto: no model passes for kind=${kind} use=${use} where=${where}:\n  ${skipped.join('\n  ')}`)
}

export function guessKind(name) {
    const n = name.toLowerCase()
    if (/(tripod|camera|stand|lamp|mic|boom)/.test(n)) return 'thin'
    if (/(reel|disc|wheel|drum|bugle|round)/.test(n)) return 'round'
    if (/(chair|table|desk|projector|cabinet|seat|sofa|box|case)/.test(n)) return 'furniture'
    return 'default'
}
