#!/usr/bin/env node
// archive-versions.mjs — keep ONE set of projects in a space, archive and hide the rest, and undo it.
//
//   node scripts/production/archive-versions.mjs --space moxir --keep a,b,c --api <serverXR base> [--api <another>]
//        [--token-env LIVE_API_TOKEN] [--apply] [--undo-dir <dir>]
//   node scripts/production/archive-versions.mjs --undo <undo-file.json> --api <serverXR base> [--token-env …] [--apply]
//
// Owner, 2026-10-07 (MOXIR): "too many versions and they are not synced — sync all, create one right version,
// archive all the rest". Archive = shelf state `archived` + visibility `private`: nothing is deleted, every
// project comes back with --undo. Dry run by default: it prints the plan and writes nothing.
//
// Why a script and not clicks: a follow does not carry a project's state or visibility yet (di.iiii PR #746
// limit), so each server is written the same way, by the same command, with an undo file written FIRST.
// Every write is read back; the exit code is 2 if any project does not end where the plan says.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The plan for one server: pure. `projects` as the server lists them. */
// One undo file per run, named by its time. A second run must never overwrite the first one's file: on
// 2026-10-07 a re-run (to finish the one project the first run could not change) wrote over it, and the four
// projects the first run had hidden lost their recorded "before" (live/public) — the re-run only saw them hidden.
export const undoFileName = ({ space, host, at }) => `undo-${space}-${host}-${String(at).replace(/[:.]/g, '-')}.json`

export const planArchive = ({ projects, keep }) => {
    const keepSet = new Set(keep)
    const missing = keep.filter((id) => !projects.some((p) => p.id === id))
    const steps = []
    for (const p of projects) {
        if (keepSet.has(p.id)) continue
        const change = {}
        if (p.state !== 'archived') change.state = 'archived'
        if (p.visibility !== 'private') change.visibility = 'private'
        steps.push({ id: p.id, title: p.title, before: { state: p.state, visibility: p.visibility }, change })
    }
    return { steps, missing, kept: projects.filter((p) => keepSet.has(p.id)).map((p) => p.id) }
}

const arg = (name, all = false) => {
    const out = []
    for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === `--${name}`) out.push(process.argv[i + 1])
    return all ? out : out[0]
}
const flag = (name) => process.argv.includes(`--${name}`)

const call = async (base, token, method, route, body) => {
    const res = await fetch(`${base.replace(/\/$/, '')}${route}`, {
        method,
        headers: { 'User-Agent': 'di-archive-versions', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* keep text */ }
    if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${json?.error || text.slice(0, 200)}`)
    return json
}

const listProjects = async (base, token, space) => (await call(base, token, 'GET', `/api/spaces/${space}/projects`)).projects || []

// visibility first while the project is still live; then the shelf state
const applyChange = async (base, token, id, change) => {
    if (change.visibility) await call(base, token, 'PATCH', `/api/projects/${id}`, { visibility: change.visibility })
    if (change.state) await call(base, token, 'PATCH', `/api/projects/${id}/shelf`, { state: change.state })
}

const main = async () => {
    const apis = arg('api', true)
    if (!apis.length) throw new Error('name at least one --api <serverXR base>, e.g. https://dev.diiii.xyz/serverXR')
    const token = process.env[arg('token-env') || 'LIVE_API_TOKEN'] || ''
    const apply = flag('apply')

    if (arg('undo')) {
        const undo = JSON.parse(fs.readFileSync(arg('undo'), 'utf8'))
        for (const base of apis) {
            console.log(`\n${base} — undo ${undo.steps.length} project(s) from ${arg('undo')}${apply ? '' : ' (dry run)'}`)
            for (const s of undo.steps) {
                const back = {}
                if (s.change.state) back.state = s.before.state
                if (s.change.visibility) back.visibility = s.before.visibility
                console.log(`  ${s.id}: ${JSON.stringify(back)}`)
                if (!apply) continue
                if (back.state) await call(base, token, 'PATCH', `/api/projects/${s.id}/shelf`, { state: back.state })
                if (back.visibility) await call(base, token, 'PATCH', `/api/projects/${s.id}`, { visibility: back.visibility })
            }
        }
        return
    }

    const space = arg('space')
    const keep = String(arg('keep') || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!space || !keep.length) throw new Error('name --space and --keep id,id,…')
    const undoDir = arg('undo-dir') || '.'
    let bad = 0
    for (const base of apis) {
        const before = await listProjects(base, token, space)
        const plan = planArchive({ projects: before, keep })
        console.log(`\n${base} — space ${space}: ${before.length} projects listed; keep ${plan.kept.length}, archive ${plan.steps.length}${apply ? '' : ' (dry run)'}`)
        if (plan.missing.length) console.log(`  NOT LISTED here (kept anyway, nothing to do): ${plan.missing.join(', ')}`)
        for (const s of plan.steps) console.log(`  ${s.id}: ${s.before.state}/${s.before.visibility} → ${JSON.stringify(s.change)}`)
        if (!apply) continue
        const host = new URL(base).host.replace(/[^a-z0-9.-]/gi, '_')
        const undoFile = path.join(undoDir, undoFileName({ space, host, at: new Date().toISOString() }))
        fs.mkdirSync(undoDir, { recursive: true })
        if (fs.existsSync(undoFile)) throw new Error(`refusing to overwrite the undo file ${undoFile}`)
        fs.writeFileSync(undoFile, `${JSON.stringify({ space, base, at: new Date().toISOString(), keep, steps: plan.steps }, null, 2)}\n`)
        console.log(`  undo file written first: ${undoFile}`)
        for (const s of plan.steps) {
            if (!Object.keys(s.change).length) continue
            try { await applyChange(base, token, s.id, s.change) } catch (e) { bad++; console.log(`  FAILED ${s.id}: ${e.message}`) }
        }
        const after = await listProjects(base, token, space)
        for (const s of plan.steps) {
            const p = after.find((x) => x.id === s.id)
            const want = { state: s.change.state || s.before.state, visibility: s.change.visibility || s.before.visibility }
            const ok = p ? p.state === want.state && (p.visibility === undefined || p.visibility === want.visibility) : true // a private project may drop out of an anonymous list
            if (!ok) { bad++; console.log(`  READ-BACK DIFFERS ${s.id}: ${p?.state}/${p?.visibility}, wanted ${want.state}/${want.visibility}`) }
        }
        for (const id of plan.kept) {
            const p = after.find((x) => x.id === id)
            console.log(`  kept ${id}: ${p ? `${p.state}/${p.visibility}` : 'not listed'}`)
        }
    }
    if (bad) { console.error(`\n${bad} problem(s) — see above`); process.exit(2) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
