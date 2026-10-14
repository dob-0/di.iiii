#!/usr/bin/env node
/**
 * apply-picture.mjs — write the CODE's picture settings into the project(s) of a production, so every
 * version shows the hall the same way. docs/architecture/RIG_BUILD.md §23.
 *
 *   node scripts/rigbuild/apply-picture.mjs --api https://dev.diiii.xyz/serverXR --token-file <file> \
 *       --space moxir --production moxir-2026-10-17 --dry-run          # every listed version
 *   … --project moxir-hall-known-ground [--project …]                  # chosen projects
 *   … --fields fog,background                                          # only some groups (default: all)
 *   … --undo ~/.di/picture-undo/<project>-<time>.json                  # put the saved values back
 *
 * WHY. The data drifted from the code. rig-lib.mjs nightOps() writes `night` of the rig file (background,
 * ambient, directional, fog 60…250). realism.mjs (bc511e97, 2026-09-29) then wrote fog 0…1.6/σ = 32 m
 * beside atmosphere σ 0.05 and exposure 3.5 by hand, and some versions never got it: dev holds two
 * families. three.js linear fog blacks out everything past `far`, so a 108 m hall under far 32 draws as
 * a round "porthole" (src/components/LiveProjectScene.jsx `<fog>`).
 *
 * WHAT IS WRITTEN — only what the code says, per version, from its rig file:
 *   background   worldState.backgroundColor                ← rig.night.backgroundColor
 *   ambient      worldState.ambientLight {color,intensity} ← rig.night.ambient
 *   directional  worldState.directionalLight {color,intensity} ← rig.night.directional
 *   fog          worldState.fog {near,far}  (+ enabled true, color null, as nightOps writes) ← rig.night.fog
 *   shadows      renderSettings.shadows true, shadowCasting {enabled false, mapSize} ← rig.budget (only when
 *                the rig says shadowCasting false; true depends on the lamp count, so it is left)
 * A field the rig file does not hold is left as it is and reported "not in the code". toneMappingExposure and
 * renderSettings.atmosphere are NOT in any rig file (only realism.mjs's CLI defaults 3.5 / 0.05, which are a
 * hand-run choice, not the code's picture) → never written here, reported per project.
 * Every write: re-read, ops route at that version (never a whole-document PUT: follow does not carry
 * one), read back, refuse on mismatch; the previous values are saved first (--undo).
 * Rig file of a version: its list entry's rig.file, else the code's versions file (derive.mjs
 * codeRecordOf), else rigVariant.source. The list entry gets the note "picture from code <file>@<blob> —
 * not yet matched to reality (light-meter + photo test owed)" and its fingerprint is re-recorded.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { listProjectIdOf } from '../../src/shared/productionVersions.js'
import { fileBlob, putEntry, readList, readProject } from '../production/versionList.mjs'
import { codeRecordOf } from '../production/derive.mjs'
import { VERSIONS_FILE } from './versions.mjs'

export const UNDO_DIR = path.join(os.homedir(), '.di', 'picture-undo')
export const GROUPS = ['background', 'ambient', 'directional', 'fog', 'shadows']
export const NOT_IN_THE_CODE = ['renderSettings.toneMappingExposure', 'renderSettings.atmosphere']
const CLIENT_ID = 'apply-picture'
const ATTEMPTS = 3
export const NOTE_MARK = 'picture from code '

const num = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * What the rig file says, as wanted leaves: [{ group, path: ['worldState','fog','far'], value }]. Pure.
 * Values the file lacks produce no leaf (never a default); `missing` names them.
 */
export const wantedFrom = (rig, groups = GROUPS) => {
    const night = rig?.night || {}
    const out = []
    const missing = []
    const leaf = (group, p, value) => { if (groups.includes(group)) out.push({ group, path: p, value }) }
    const need = (group, label, ok, add) => { if (!groups.includes(group)) return; if (ok) add(); else missing.push(label) }
    need('background', 'night.backgroundColor', typeof night.backgroundColor === 'string' && night.backgroundColor, () => leaf('background', ['worldState', 'backgroundColor'], night.backgroundColor))
    for (const [group, key, label] of [['ambient', 'ambientLight', 'night.ambient'], ['directional', 'directionalLight', 'night.directional']]) {
        const src = night[group]
        need(group, label, src && typeof src === 'object', () => {
            if (typeof src.color === 'string') leaf(group, ['worldState', key, 'color'], src.color)
            if (num(src.intensity)) leaf(group, ['worldState', key, 'intensity'], src.intensity)
            // the rig-lib night puts the moon where nightOps does
            if (group === 'directional') leaf(group, ['worldState', key, 'position'], [-20, 30, 10])
        })
    }
    need('fog', 'night.fog', night.fog && num(night.fog.near) && num(night.fog.far), () => {
        leaf('fog', ['worldState', 'fog', 'near'], night.fog.near)
        leaf('fog', ['worldState', 'fog', 'far'], night.fog.far)
        leaf('fog', ['worldState', 'fog', 'color'], null)
        leaf('fog', ['worldState', 'fog', 'enabled'], true)
    })
    need('shadows', 'budget.shadowCasting', rig?.budget?.shadowCasting === false, () => {
        leaf('shadows', ['renderSettings', 'shadows'], true)
        leaf('shadows', ['renderSettings', 'shadowCasting', 'enabled'], false)
        if (num(rig.budget.shadowMapSize)) leaf('shadows', ['renderSettings', 'shadowCasting', 'mapSize'], rig.budget.shadowMapSize)
    })
    return { wanted: out, missing }
}

const getPath = (doc, p) => p.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), doc)
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const show = (v) => (v === undefined ? '—' : JSON.stringify(v))

/** The changes a document needs: [{ path, before, after }] (leaves that already hold the value are left out). Pure. */
export const changesFor = (document, wanted) => wanted.filter((w) => !same(getPath(document, w.path), w.value)).map((w) => ({ group: w.group, path: w.path, before: getPath(document, w.path), after: w.value }))

/** A merge-patch ops pair (worldState, renderSettings) setting each change to `pick(change)`. Pure. */
const opsOf = (changes, pick, document) => {
    const patches = { worldState: {}, renderSettings: {} }
    for (const c of changes) {
        const [section, ...rest] = c.path
        // when the parent object is not there (fog: null) a leaf cannot be set into it by a patch to nothing: set the parent
        let node = patches[section]
        rest.slice(0, -1).forEach((k) => { node = node[k] = node[k] || {} })
        node[rest[rest.length - 1]] = pick(c) === undefined ? null : pick(c)
    }
    // undo of a leaf into a parent that did not exist: the parent goes back to null
    for (const c of changes) {
        const [section, ...rest] = c.path
        for (let i = 1; i < rest.length; i += 1) {
            if (pick === undoPick && !(getPath(document, [section, ...rest.slice(0, i)]) && typeof getPath(document, [section, ...rest.slice(0, i)]) === 'object')) {
                let node = patches[section]
                rest.slice(0, i - 1).forEach((k) => { node = node[k] })
                node[rest[i - 1]] = null
            }
        }
    }
    return [
        ...(Object.keys(patches.worldState).length ? [{ type: 'setWorldState', payload: { patch: patches.worldState } }] : []),
        ...(Object.keys(patches.renderSettings).length ? [{ type: 'setRenderSettings', payload: { patch: patches.renderSettings } }] : [])
    ]
}
const afterPick = (c) => c.after
const undoPick = (c) => c.before
export const forwardOps = (changes, document) => opsOf(changes, afterPick, document)
export const undoOps = (changes, document) => opsOf(changes, undoPick, document)

/** The table lines of one project's changes. Pure. */
export const tableOf = (projectId, changes) => changes.map((c) => `  ${projectId.padEnd(34)} ${c.path.join('.').padEnd(44)} ${show(c.before)} → ${show(c.after)}`)

/** Write ops at the version just read; 409 reads again and re-plans. Returns { document, version } read back. */
const post = async (client, projectId, plan, log) => {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const got = await client.get(`/api/projects/${projectId}/document`)
        if (!got.ok) throw new Error(`reading ${projectId}: ${got.status}`)
        const document = got.body?.document || {}
        const planned = plan(document)
        if (!planned.ops.length) return { status: 'nothing', document, planned }
        if (planned.dry) return { status: 'dry-run', document, planned }
        const stamp = Date.now()
        const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: Number(got.body?.version) || 0, ops: planned.ops.map((op, i) => ({ ...op, opId: `${CLIENT_ID}-${stamp}-${i}`, clientId: CLIENT_ID })) })
        if (out.status === 409) { log(`  ${projectId}: moved while writing (409) — reading again (${attempt} of ${ATTEMPTS})`); continue }
        if (!out.ok) throw new Error(`${projectId}: ops ${out.status} ${String(out.text || '').slice(0, 300)} — nothing was written`)
        const back = await client.get(`/api/projects/${projectId}/document`)
        if (!back.ok) throw new Error(`${projectId}: written but cannot be read back (${back.status})`)
        return { status: 'written', document: back.body?.document || {}, planned }
    }
    throw new Error(`${projectId} kept moving: ${ATTEMPTS} attempts refused with 409 — nothing was written`)
}

/** The rig file (repo-relative) a version was made from, and how that is known, or null. Pure but for the file test. */
export const rigFileFor = ({ entry = null, mark = null, spec = null, id = null, repoRoot = REPO_ROOT }) => {
    const exists = (f) => f && fs.existsSync(path.join(repoRoot, f))
    if (exists(entry?.rig?.file)) return { file: entry.rig.file, from: 'the version list entry (rig.file)' }
    const code = codeRecordOf(spec, entry?.id || mark?.id || id)
    if (exists(code.rigFile)) return { file: code.rigFile, from: "the code's versions file" }
    const src = String(mark?.source || '').split(/\s+—\s+/)[0]
    if (/\.json$/.test(src) && exists(src) && /rigs\//.test(src) && !/versions-/.test(src)) return { file: src, from: 'rigVariant.source' }
    return null
}

/** The list note: the picture line first (what must be owed), the earlier note after it, within the 480 the list keeps. Pure. */
export const noteFor = (old, file, blob) => {
    const mine = `${NOTE_MARK}${file}@${String(blob || 'unversioned').slice(0, 12)} — not yet matched to reality (light-meter + photo test owed).`
    const rest = String(old || '').split(/\s*(?=picture from code )/).filter((s) => s && !s.startsWith(NOTE_MARK)).join(' ').trim()
    return `${mine}${rest ? ` ${rest}` : ''}`.slice(0, 480)
}

/**
 * One project. `target`: { projectId, entry?, rigFile, from }. Returns { projectId, status, changes, missing, notInCode, undoFile }.
 */
export const applyOne = async ({ client, api, tokenFile, production, projectId, entry, rigFile, groups, dry, log, undoDir = process.env.DI_PICTURE_UNDO_DIR || UNDO_DIR, repoRoot = REPO_ROOT }) => {
    const rig = readJson(path.join(repoRoot, rigFile.file))
    const { wanted, missing } = wantedFrom(rig, groups)
    const blob = fileBlob(rigFile.file, repoRoot)
    let changes = []
    let undoFile = null
    const result = await post(client, projectId, (document) => {
        changes = changesFor(document, wanted)
        return { ops: forwardOps(changes, document), dry, changes }
    }, log)
    const hasExposure = (d) => ({ exposure: getPath(d, ['renderSettings', 'toneMappingExposure']), atmosphere: getPath(d, ['renderSettings', 'atmosphere']) })
    const kept = hasExposure(result.document)
    const row = { projectId, rig: rigFile.file, blob, changes, missing, status: result.status, notInCode: `toneMappingExposure ${show(kept.exposure)}, atmosphere ${show(kept.atmosphere)} — not in the code, left as they are` }
    if (result.status !== 'written') return row
    const wrong = changes.filter((c) => !same(getPath(result.document, c.path), c.after))
    // undo file first: it is written whatever the read-back says
    fs.mkdirSync(undoDir, { recursive: true })
    undoFile = path.join(undoDir, `${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    const list = production ? await readList(client, production).catch(() => null) : null
    const entryBefore = list?.entries?.find((v) => v.projectId === projectId) || null
    fs.writeFileSync(undoFile, `${JSON.stringify({ project: projectId, api, production: production || null, at: new Date().toISOString(), rig: rigFile.file, blob, changes, entryBefore, note: 'written by scripts/rigbuild/apply-picture.mjs before the picture was marked; replay with --undo' }, null, 2)}\n`)
    row.undoFile = undoFile
    if (wrong.length) throw new Error(`${projectId}: written but reads back wrong (${wrong.map((c) => c.path.join('.')).join(', ')}) — NOT marked; put it back with: ${undoCommand({ api, tokenFile, undoFile })}`)
    // the mark on the version list entry
    if (entryBefore) {
        const fresh = await readProject(client, projectId)
        const next = { ...entryBefore, rig: { file: rigFile.file, blob }, fingerprint: fresh.fingerprint, note: noteFor(entryBefore.note, rigFile.file, blob) }
        await putEntry({ client, api, tokenFile, space: null, production, meta: { id: production }, dry: false, log, undoDir }, next)
        row.marked = true
    } else row.marked = false
    return row
}

export const undoCommand = ({ api, tokenFile, undoFile }) => `node scripts/rigbuild/apply-picture.mjs --api ${api}${tokenFile ? ` --token-file ${tokenFile}` : ''} --undo ${undoFile}`

/** --undo <file>: the saved values back, read back, and the list entry as it was. */
export const undoFrom = async ({ client, api, tokenFile, file, dry = false, log = say, undoDir }) => {
    const saved = readJson(path.resolve(String(file).replace(/^~/, os.homedir())))
    const { project: projectId, changes, production, entryBefore } = saved
    const result = await post(client, projectId, (document) => {
        const now = changes.filter((c) => !same(getPath(document, c.path), c.before))
        return { ops: undoOps(now, document), dry, changes: now }
    }, log)
    if (result.status === 'written') {
        const wrong = changes.filter((c) => !same(getPath(result.document, c.path), c.before))
        if (wrong.length) throw new Error(`${projectId}: undone but reads back wrong (${wrong.map((c) => c.path.join('.')).join(', ')})`)
        if (entryBefore && production) {
            const fresh = await readProject(client, projectId)
            await putEntry({ client, api, tokenFile, space: null, production, meta: { id: production }, dry: false, log, undoDir }, { ...entryBefore, fingerprint: fresh.fingerprint })
        }
    }
    log(`${projectId}: ${result.status === 'written' ? 'put back' : result.status}${result.planned?.changes ? ` (${result.planned.changes.length} field${result.planned.changes.length === 1 ? '' : 's'})` : ''}`)
    return { projectId, status: result.status }
}

/** The projects to do: from the production's list, or the named ones (resolved against the list for their rig file). */
export const targetsOf = async ({ client, production, projects, spec, repoRoot = REPO_ROOT, rigFileGiven = null }) => {
    const list = production ? await readList(client, production) : null
    if (production && !list.exists) throw new Error(`no version list for ${production} on this install (${listProjectIdOf(production)})`)
    const entries = list?.entries || []
    const wanted = projects.length ? projects : entries.map((v) => v.projectId)
    const targets = []
    for (const projectId of wanted) {
        const entry = entries.find((v) => v.projectId === projectId) || null
        const project = await readProject(client, projectId)
        if (!project) { targets.push({ projectId, skip: 'not on this install' }); continue }
        const rigFile = rigFileGiven ? { file: rigFileGiven, from: '--rig-file' } : rigFileFor({ entry, mark: project.mark, spec, id: project.mark?.id, repoRoot })
        targets.push(rigFile ? { projectId, entry, rigFile } : { projectId, entry, skip: 'no rig file found (no list rig.file, not in the code versions file, no rigVariant.source)' })
    }
    return targets
}

const UNDO_DIR_NOW = () => process.env.DI_PICTURE_UNDO_DIR || UNDO_DIR
export const KNOWN_FLAGS = ['api', 'token-file', 'space', 'production', 'project', 'fields', 'dry-run', 'undo', 'rig-file']

export const run = async (argv, { client = null, log = say, repoRoot = REPO_ROOT } = {}) => {
    const dry = argv.includes('--dry-run')
    const multi = []
    const clean = []
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--dry-run') continue
        if (argv[i] === '--project' && argv[i + 1]) { multi.push(argv[i + 1]); i += 1; continue }
        clean.push(argv[i])
    }
    const args = { ...parseArgs(clean), ...(dry ? { 'dry-run': true } : {}) }
    const stray = Object.keys(args).filter((k) => k !== '_' && !KNOWN_FLAGS.includes(k))
    if (stray.length) throw new Error(`unknown argument${stray.length > 1 ? 's' : ''}: ${stray.map((k) => `--${k}`).join(' ')} — nothing was done`)
    const api = args.api ? String(args.api).replace(/\/+$/, '') : null
    if (!api) throw new Error('needs --api <install>/serverXR — it has no default on purpose')
    const tokenFile = args['token-file'] ? path.resolve(String(args['token-file'])) : null
    const c = client || makeClient(api, readToken(tokenFile))
    if (args.undo) return [await undoFrom({ client: c, api, tokenFile, file: args.undo, dry, log })]
    const production = args.production ? String(args.production) : null
    if (!production && !multi.length) throw new Error('needs --production <set id> (every listed version) or --project <id> …')
    const groups = args.fields ? String(args.fields).split(',').map((s) => s.trim()).filter(Boolean) : GROUPS
    const bad = groups.filter((g) => !GROUPS.includes(g))
    if (bad.length) throw new Error(`--fields: ${bad.join(', ')} is not one of ${GROUPS.join(' · ')}`)
    const given = args['rig-file'] ? String(args['rig-file']) : null
    if (given) {
        if (production) throw new Error('--rig-file is for one --project and cannot be used with --production (the list is not touched; record rig.file with versions.mjs put, then run with --production)')
        if (multi.length !== 1) throw new Error('--rig-file needs exactly one --project')
        const rel = path.isAbsolute(given) ? path.relative(repoRoot, given) : given
        if (rel.startsWith('..') || !fs.existsSync(path.join(repoRoot, rel))) throw new Error(`--rig-file ${given}: not a file inside this checkout`)
        args['rig-file'] = rel
    }
    const specFile = path.join(repoRoot, VERSIONS_FILE)
    const spec = fs.existsSync(specFile) ? readJson(specFile) : null
    const targets = await targetsOf({ client: c, production, projects: multi, spec, repoRoot, rigFileGiven: given ? args['rig-file'] : null })
    const rows = []
    for (const t of targets) {
        if (t.skip) {
            log(`${t.projectId}: skipped — ${t.skip}`)
            if (t.entry && production) {
                // never guess a file by name: write the entry as listed, the person names the rig file in it
                fs.mkdirSync(UNDO_DIR_NOW(), { recursive: true })
                const ef = path.join(UNDO_DIR_NOW(), `${t.projectId}-record-rig-file.json`)
                fs.writeFileSync(ef, `${JSON.stringify({ ...t.entry, rig: { file: 'REPLACE-WITH-THE-RIG-FILE-PATH', blob: null } }, null, 2)}\n`)
                log(`  to record its rig file: put the real path in "rig.file" of ${ef}, then`)
                log(`    node scripts/production/versions.mjs --api ${api}${tokenFile ? ` --token-file ${tokenFile}` : ''} --production ${production} put --file ${ef}`)
                log(`  or, for this one project now (list untouched): … --project ${t.projectId} --rig-file <path>`)
            } rows.push({ projectId: t.projectId, status: 'skipped', reason: t.skip }); continue
        }
        const row = await applyOne({ client: c, api, tokenFile, production, projectId: t.projectId, entry: t.entry, rigFile: t.rigFile, groups, dry, log, repoRoot })
        rows.push(row)
        log(`${t.projectId} — picture from ${row.rig} (${t.rigFile.from})`)
        if (row.changes.length) tableOf(t.projectId, row.changes).forEach((l) => log(l))
        else log('  already as the code says — nothing to change')
        if (row.missing.length) log(`  not in the code (left as is): ${row.missing.join(', ')}`)
        log(`  ${row.notInCode}`)
        if (row.undoFile) log(`  undo: ${undoCommand({ api, tokenFile, undoFile: row.undoFile })}`)
    }
    const n = (s) => rows.filter((r) => r.status === s).length
    log(`${dry ? 'DRY-RUN — nothing written. ' : ''}${rows.length} project${rows.length === 1 ? '' : 's'}: ${dry ? `${rows.filter((r) => r.changes?.length).length} would change` : `${n('written')} written`}, ${rows.filter((r) => r.status !== 'skipped' && !r.changes?.length).length} already right, ${n('skipped')} skipped`)
    return rows
}

if (isMainModule(import.meta.url)) {
    run(process.argv.slice(2)).catch((error) => die(error.message))
}
