#!/usr/bin/env node
/**
 * seed-input-check.mjs — provision the minimal wcc/main project that
 * scripts/input-check.mjs needs, against a fresh throwaway server.
 *
 * The exhibition route (/wcc/scene) hard-requires space `wcc` + project
 * `main`; space/project data is gitignored, so CI seeds a blank document
 * through the normal API instead of committing fixtures. Idempotent.
 *
 * Usage: node scripts/seed-input-check.mjs [--to <url>] [--token <tok>]
 *   defaults: --to http://localhost:4000/serverXR, --token $SEED_API_TOKEN
 *   The server must run with ADMIN_API_TOKEN=<tok> (space creation is
 *   admin/session-only) and a DATA_ROOT you are happy to write into.
 */

const argv = process.argv.slice(2)
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null }
const BASE = (opt('to') || 'http://localhost:4000/serverXR').replace(/\/+$/, '')
const TOKEN = opt('token') || process.env.SEED_API_TOKEN || ''

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

const existing = await api('/api/spaces/wcc')
if (!existing.ok) {
    const r = await api('/api/spaces', { method: 'POST', body: JSON.stringify({ slug: 'wcc', label: 'WCC (input-check seed)' }) })
    if (!r.ok) { console.error(`seed: create space failed HTTP ${r.status}: ${r.body?.error}`); process.exit(1) }
    console.log('seed: created space wcc')
}

const projects = await api('/api/spaces/wcc/projects')
if (!(projects.body?.projects || []).some((p) => p.id === 'main')) {
    const r = await api('/api/spaces/wcc/projects', { method: 'POST', body: JSON.stringify({ slug: 'main', title: 'main' }) })
    if (!r.ok) { console.error(`seed: create project failed HTTP ${r.status}: ${r.body?.error}`); process.exit(1) }
    console.log('seed: created project main')
}

const pub = await api('/api/spaces/wcc', { method: 'PATCH', body: JSON.stringify({ isPublic: true, publishedProjectId: 'main' }) })
if (!pub.ok) { console.error(`seed: publish failed HTTP ${pub.status}: ${pub.body?.error}`); process.exit(1) }

const doc = await fetch(`${BASE}/api/projects/main/document`)
if (!doc.ok) { console.error(`seed: anonymous document read failed HTTP ${doc.status}`); process.exit(1) }
console.log('seed: wcc/main ready (anonymous document read OK)')
