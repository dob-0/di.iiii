#!/usr/bin/env node
/**
 * seed-reach-check.mjs — provision the space `navtest` that scripts/reach-check.mjs
 * walks, against a fresh throwaway server (PR #1278, doors and shelves).
 *
 * What it makes (through the normal API, nothing committed as a fixture):
 *   - space navtest, public, whose published project is `home` (mode code)
 *   - projects scene-alpha (title alpha) and scene-beta (title beta), one box each
 *   - shelves Show {scene-alpha} and Archive {scene-beta}; `home` stays off a shelf
 * Every read and write carries the token: a new space is private until the last
 * steps publish it, and the check runs the server with REQUIRE_AUTH=true.
 * Idempotent: each write happens only when its result is not there yet.
 *
 * Usage: node scripts/seed-reach-check.mjs [--to <url>] [--token <tok>]
 *   defaults: --to http://localhost:4000/serverXR, --token $SEED_API_TOKEN
 *   The server must run with ADMIN_API_TOKEN=<tok> and a DATA_ROOT you are
 *   happy to write into. Any failure prints the HTTP status and exits 1.
 */

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null }
const BASE = (opt('to') || 'http://localhost:4000/serverXR').replace(/\/+$/, '')
const TOKEN = opt('token') || process.env.SEED_API_TOKEN || ''
const SPACE = 'navtest'

const fail = (what, r) => { console.error(`seed: ${what} failed HTTP ${r.status}: ${r.body?.error || ''}`); process.exit(1) }

const api = async (path, options = {}) => {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
            ...options.headers,
        },
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
}
const send = (method, path, data) => api(path, { method, body: JSON.stringify(data) })

const space = await api(`/api/spaces/${SPACE}`)
if (!space.ok) {
    const r = await send('POST', '/api/spaces', { slug: SPACE, label: 'Nav test (reach-check seed)' })
    if (!r.ok) fail('create space', r)
    console.log(`seed: created space ${SPACE}`)
}

const have = ((await api(`/api/spaces/${SPACE}/projects`)).body?.projects || []).map((p) => p.id)
for (const [slug, title] of [['home', 'Home page'], ['scene-alpha', 'alpha'], ['scene-beta', 'beta']]) {
    if (have.includes(slug)) continue
    const r = await send('POST', `/api/spaces/${SPACE}/projects`, { slug, title })
    if (!r.ok) fail(`create project ${slug}`, r)
    console.log(`seed: created project ${slug}`)
}

// The space is still private here, so this read carries the token like every other.
const readDoc = async (id) => {
    const r = await api(`/api/projects/${id}/document`)
    if (!r.ok) fail(`read the document of ${id}`, r)
    return r.body
}
const putOp = async (id, op, n) => {
    const d = await readDoc(id)
    const r = await send('POST', `/api/projects/${id}/ops`, {
        baseVersion: Number(d?.version) || 0,
        ops: [{ opId: `seed-reach-check-${id}-${n}`, clientId: 'seed-reach-check', ...op }],
    })
    if (!r.ok) fail(`write to ${id}`, r)
}

// home is a code project (the space's way in); the two scenes get one box each so
// a project opens what it holds and a Perform door exists. The mode lives in
// presentationState (src/shared/projectSchema.js, setPresentationState).
if ((await readDoc('home'))?.document?.presentationState?.mode !== 'code') {
    await putOp('home', { type: 'setPresentationState', payload: { patch: { mode: 'code' } } }, 1)
    console.log('seed: made home a code page')
}
for (const id of ['scene-alpha', 'scene-beta']) {
    const d = await readDoc(id)
    if (!(d?.document?.entities || []).length) {
        await putOp(id, { type: 'createEntity', payload: { entity: { id: `${id}-box`, type: 'box' } } }, 1)
        console.log(`seed: put one object in ${id}`)
    }
}

const pub = await send('PATCH', `/api/spaces/${SPACE}`, { isPublic: true, publishedProjectId: 'home' })
if (!pub.ok) fail('publish space', pub)
// 202 is "pending approval" (APPROVAL_GATE_ENABLED): queued, not applied, so a
// visitor would meet a private space. Stop here rather than walk the wrong page.
if (pub.status === 202) fail('publish space (queued for approval, not applied)', pub)

const listShelves = async () => (await api(`/api/spaces/${SPACE}/collections`)).body?.collections || []
let shelves = await listShelves()
for (const label of ['Show', 'Archive']) {
    if (shelves.some((c) => c.label === label)) continue
    const r = await send('POST', `/api/spaces/${SPACE}/collections`, { label })
    if (!r.ok) fail(`create shelf ${label}`, r)
    console.log(`seed: created shelf ${label}`)
}
shelves = await listShelves()
const shelfId = (label) => shelves.find((c) => c.label === label)?.id
for (const [project, label] of [['scene-alpha', 'Show'], ['scene-beta', 'Archive']]) {
    const r = await send('PATCH', `/api/projects/${project}/shelf`, { collectionId: shelfId(label) })
    if (!r.ok) fail(`put ${project} on shelf ${label}`, r)
}

const out = await api(`/api/spaces/${SPACE}/projects`)
console.log(`seed: ${SPACE} ready:`, JSON.stringify((out.body?.projects || []).map((p) => ({ id: p.id, mode: p.mode, shelf: p.collectionId }))))
