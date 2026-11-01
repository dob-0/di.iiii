// Resources — one list of everything a team can run work on, as data.
//
// A resources file holds every machine, cloud GPU, model credit, local model,
// service and show device a team has, each with its state READ from the thing
// itself (a command and its answer, a file, a URL), who may use it, what it
// costs, its limit, and the jobs it is best for. People and agents read it to
// pick the best resource per job; `bestFor()` gives that order.
//
// This module is the contract: the shape, the checks (`validateResources`) and
// the pick (`bestFor`). It holds no team's data. A team's own file lives where
// that team keeps private things (never in this public repo); the renderer
// (scripts/resources/render-resources.mjs) turns it into a page.
//
// Method: an asset register in the ITIL 4 "IT asset management" sense (one
// record per asset, its owner, state and evidence), with the state rule of
// this repo's agents: a resource "works" only when it was USED in the check
// (a real call), and every fact carries its source and date.
// Decision: docs/ai/decisions/2026-11-01-resources-one-list.md.

export const RESOURCES_SCHEMA = 'di.resources/1'

// Kinds, in the order a page shows them.
export const KINDS = [
    { id: 'machine', label: 'Machines', line: 'Computers and phones we can run work on.' },
    { id: 'cloud-gpu', label: 'Cloud GPUs', line: 'Rented graphics cards, paid per hour.' },
    { id: 'model-credit', label: 'Model credits', line: 'Plans and keys that answer with a model.' },
    { id: 'local-model', label: 'Local models', line: 'Models served from our own machines.' },
    { id: 'service', label: 'Services', line: 'Accounts that host, name, connect or store.' },
    { id: 'show-device', label: 'Show devices', line: 'Lamps, lasers, nodes and controllers.' }
]
export const KIND_IDS = KINDS.map((kind) => kind.id)

// What the last check found. `works` = used in the check (a real call, a
// command that ran on it). `spent` = it answered that its credit is gone.
// `down` = it did not answer. `off` = it is powered down or not joined, on
// purpose. `unchecked` = no call was possible or none was made; say why.
export const STATES = ['works', 'spent', 'down', 'off', 'unchecked']
// The words a person reads for each state (the ids stay in the file).
export const STATE_WORDS = {
    works: 'works now',
    spent: 'credit used up',
    down: 'not answering',
    off: 'switched off',
    unchecked: 'not checked'
}

// Plain words for the terms that stay in the details of a row.
export const GLOSSARY = [
    ['GPU / graphics card', 'the part of a computer that draws pictures and runs big models fast'],
    ['VRAM', 'the memory on the graphics card; a model or scene must fit in it'],
    ['units (Colab)', 'what a rented Google Colab graphics card costs per hour'],
    ['model, token', 'a model is the program that answers; a token is a small piece of a word it reads or writes'],
    ['tailnet', 'our private network (Tailscale) that joins our machines wherever they are'],
    ['ssh', 'logging into another machine from here to run a command on it'],
    ['HTTP 530, 200', 'what a web address answers: 200 = fine; 530 = the door is there but nothing is behind it'],
    ['Q4_K_M', 'a size of a model squeezed to fit a small machine'],
    ['aarch64, arm64, Darwin', 'the kind of chip or system (Raspberry Pi, phone, Mac)'],
    ['DMX, Art-Net', 'the signals that control stage lamps']
]

const NEEDS_PROOF = new Set(['works', 'spent', 'down'])

// Who may use it. `ours` = the team's own work only (a plan login that cannot
// be shared). `shared` = may also serve others (team, partners, strangers).
// `owner` = a person's own device, used with that person's word.
// `venue` = belongs to a place or a production; used there, by its terms.
export const USES = ['ours', 'shared', 'owner', 'venue']

const DATE = /^\d{4}-\d{2}-\d{2}/
const ID = /^[a-z0-9][a-z0-9-]*$/

// Values that look like a credential. A resources file names WHERE a secret
// lives, never its value; any string that matches one of these fails the file.
export const SECRET_PATTERNS = [
    /sk-ant-[a-z0-9_-]{8,}/i,
    /\bsk-[a-z0-9]{20,}/i,
    /\bgh[pousr]_[a-z0-9]{20,}/i,
    /github_pat_[a-z0-9_]{20,}/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bxox[abprs]-[a-z0-9-]{10,}/i,
    /\bAIza[0-9a-z_-]{30,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:password|passwd|api[_-]?key|token|secret)\s*[:=]\s*["']?[^\s"']{8,}/i
]

export const findSecretLike = (value, path = '$', hits = []) => {
    if (typeof value === 'string') {
        if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) hits.push(path)
    } else if (Array.isArray(value)) {
        value.forEach((item, index) => findSecretLike(item, `${path}[${index}]`, hits))
    } else if (value && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) findSecretLike(item, `${path}.${key}`, hits)
    }
    return hits
}

const checkEvidence = (evidence, where, errors) => {
    if (!evidence || typeof evidence !== 'object') {
        errors.push(`${where}: missing`)
        return
    }
    if (!evidence.text) errors.push(`${where}: no text`)
    if (!evidence.source) errors.push(`${where}: no source (a command, a file or a URL)`)
    if (!DATE.test(String(evidence.date || ''))) errors.push(`${where}: no date (YYYY-MM-DD)`)
}

// Returns a list of plain-language errors; an empty list means the file is good.
export const validateResources = (doc) => {
    const errors = []
    if (!doc || typeof doc !== 'object') return ['the file is not an object']
    if (doc.schema !== RESOURCES_SCHEMA) errors.push(`schema must be "${RESOURCES_SCHEMA}"`)
    if (!doc.title) errors.push('title is missing')
    if (!DATE.test(String(doc.readAt || ''))) errors.push('readAt (when the check ran) is missing')
    const tasks = Array.isArray(doc.tasks) ? doc.tasks : []
    const taskIds = new Set(tasks.map((task) => task.id))
    if (!Array.isArray(doc.resources) || doc.resources.length === 0) {
        errors.push('resources is empty')
        return errors
    }
    const seen = new Set()
    doc.resources.forEach((row, index) => {
        const at = `resources[${index}]${row?.id ? ` (${row.id})` : ''}`
        if (!row || typeof row !== 'object') {
            errors.push(`${at}: not an object`)
            return
        }
        if (!ID.test(String(row.id || ''))) errors.push(`${at}: id must be lower-case words joined by -`)
        if (seen.has(row.id)) errors.push(`${at}: id is used twice`)
        seen.add(row.id)
        if (!row.name) errors.push(`${at}: name is missing`)
        if (!KIND_IDS.includes(row.kind)) errors.push(`${at}: kind must be one of ${KIND_IDS.join(', ')}`)
        if (!STATES.includes(row.state)) errors.push(`${at}: state must be one of ${STATES.join(', ')}`)
        if (!USES.includes(row.use)) errors.push(`${at}: use must be one of ${USES.join(', ')}`)
        if (NEEDS_PROOF.has(row.state)) checkEvidence(row.proof, `${at}: proof for "${row.state}"`, errors)
        if (row.plain != null && (typeof row.plain !== 'string' || row.plain.length > 140)) errors.push(`${at}: plain must be one short sentence (up to 140 characters)`)
        if (row.state === 'unchecked' && !row.why) errors.push(`${at}: unchecked needs a why`)
        ;(row.facts || []).forEach((fact, factIndex) => checkEvidence(fact, `${at}: facts[${factIndex}]`, errors))
        ;(row.bestFor || []).forEach((task) => {
            if (taskIds.size && !taskIds.has(task)) errors.push(`${at}: bestFor "${task}" is not in tasks`)
        })
        if (row.order != null && !Number.isFinite(row.order)) errors.push(`${at}: order must be a number`)
    })
    for (const path of findSecretLike(doc)) errors.push(`${path}: looks like a secret value; name where it lives instead`)
    return errors
}

// The pick: every resource that is best for `task`, works today, and may be
// used by `who` ('ours' = the team's own work, 'others' = anyone else),
// cheapest first by its `order` (lower runs first), then by name.
export const bestFor = (doc, task, { who = 'ours' } = {}) => {
    const allowed = who === 'others' ? new Set(['shared']) : new Set(['ours', 'shared', 'owner'])
    return (doc?.resources || [])
        .filter((row) => (row.bestFor || []).includes(task))
        .filter((row) => row.state === 'works' && allowed.has(row.use))
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name)))
}

// What is best for `task` and may be used by `who`, but was not checked, so
// the pick can say "not checked" instead of hiding it.
export const unchecked = (doc, task, { who = 'ours' } = {}) => {
    const allowed = who === 'others' ? new Set(['shared']) : new Set(['ours', 'shared', 'owner'])
    return (doc?.resources || [])
        .filter((row) => (row.bestFor || []).includes(task) && row.state === 'unchecked' && allowed.has(row.use))
}

// True when no resource at all is meant for `who` on this job (so "nothing works
// today" would be wrong: the job is simply not for them).
export const notForOthers = (doc, task) => !(doc?.resources || [])
    .some((row) => (row.bestFor || []).includes(task) && row.use === 'shared')

export const countByKind = (doc) => Object.fromEntries(
    KIND_IDS.map((kind) => [kind, (doc?.resources || []).filter((row) => row.kind === kind).length])
)
