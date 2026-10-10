#!/usr/bin/env node
/**
 * rebuild-compare.mjs — does a version's project hold what git builds from its rig file? READ ONLY.
 * Audit D1, MOXIR 2026-10-05 (docs/ai/audits/moxir-2026-10-05/D-data-sync.md on docs/moxir-audit-2026-10-05).
 *
 *   node scripts/production/rebuild-compare.mjs --version known-full --doc <a project document .json>
 *   node scripts/production/rebuild-compare.mjs --version known-full --api https://dev.diiii.xyz/serverXR \
 *       --project moxir-hall-known-full --token-file <env with ADMIN_API_TOKEN> [--at-version 1] [--json <out.json>]
 *   … --copy-label "PONYO 10-04" --copy-siblings scripts/place/rigs/moxir-ponyo-to-dev-siblings-2026-10-04.json
 *       (the version was brought from another install with copy-version.mjs: its mark carries the label)
 *   node scripts/production/rebuild-compare.mjs --record scripts/production/records/<record>.json --api … [--at-version N]
 *       (everything but the install from a committed record; also says whether a pinned file moved since)
 *   Exit 0 when the document is the git build plus only the parts named "not built from git"; 1 otherwise.
 *
 * Nothing is written anywhere: every request is a GET. `--at-version N` rebuilds the document as it was at
 * version N by replaying the project's own op log (GET /api/projects/:id/ops; the replay is checked for the
 * op types it understands and refuses others), so a list fingerprint taken at an earlier version can be
 * re-derived.
 *
 * THE METHOD (the steps a version is made by, each replayed offline with the repo's own pure functions):
 *   1. load-version.mjs step 3 — the version's typed, patched document: versions-report.mjs, the same
 *      functions `versions.mjs --report` runs (moxir.mjs moxirDocument + patchMoxir; hall file from the
 *      versions file); the rig boxes become build pieces as load-plot.mjs lays them (piecesFromRigBoxes),
 *      each piece's asset id the sha256 of its body in scripts/rigbuild/pieces/ (the upload route
 *      content-addresses — load-version.mjs refuses a copy whose id differs);
 *   2. load-plot.mjs step 1 — place-hall's venuePlan, venuePlanFromHall(hall file);
 *   3. load-version.mjs step 4 — rig-show's rentalList (the rentals file), rigLooks (looks.mjs rigLooksFrom)
 *      and rigVariant (load-version.mjs variantOf);
 *   4. load-version.mjs --look <defaultLook> --nominal — every lamp's aim, colour, light and haze
 *      (rig-lib buildRig, the look's levels dropped);
 *   5. realism.mjs — every lamp's beam.aperture (apertureByType);
 *   6. the server's own normalisation (src/shared/projectSchema.js normalizeEntity — e.g. beam.haze is
 *      clamped to 0..1);
 *   7. with `--copy-label <label> [--copy-siblings <file>]`: copy-version.mjs's mark on a copy brought
 *      from another install (copiedEntities: the id and title labelled, copyOf, the siblings given);
 *   8. the world and render values the tools write — rig-lib nightOps (load-version.mjs step 4) then
 *      realism.mjs at its defaults (σ 0.05/m, g 0.7, ACESFilmic × 3.5) — CHECKED against the document,
 *      key by key (`worldRender`), for the reader; NOT put into the fingerprint, because the arguments
 *      those tools ran with are not recorded anywhere.
 * What none of these makes is NOT built: the hall's model (hall.py runs in Blender; realism.mjs makes its
 * night copy), place-hall's other components and the rest of the world/render state (copied from the
 * hall's source project, which git does not hold), the rigBounce measured off the hall model. Those are
 * named, with their hashes, under `notFromGit`.
 *
 * The comparison: per entity (id) and per field, git side against the document. And one fingerprint
 * (versionList.mjs fingerprintOf, the list's own): the document with every git-built part put in its
 * place. That fingerprint equals the document's own exactly when every part git builds is identical to
 * what the project holds — then the project = git rig file + the parts named in `notFromGit`.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { buildRig, nightOps } from '../place/rig-lib.mjs'
import { FIXTURE_DIR, readGeometry } from '../place/fixtures-glb.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'
import { normalizeEntity } from '../../src/shared/projectSchema.js'
import { venuePlanFromHall } from '../../src/rigbuild/venuePlan.js'
import { catalogueHeightOf } from '../../src/rigbuild/pieces.js'
import { RIG_SHOW_ID } from '../../src/rigbuild/rental.js'
import { rentalFileOf, rigFileOf, VERSIONS_FILE } from '../rigbuild/versions.mjs'
import { rigLooksFrom } from '../rigbuild/looks.mjs'
import { apertureByType, hazeFog } from '../rigbuild/realism.mjs'
import { copiedEntities, defaultSuffix } from '../rigbuild/copy-version.mjs'
import { piecesFromRigBoxes } from '../rigbuild/load-plot.mjs'
import { fileBlob, fingerprintOf, gitCommit } from './versionList.mjs'

const HALL_PROJECT = 'moxir-hall'
const VENUE_NAME = 'MOXIR · Charentsavan factory hall' // load-version.mjs passes this --name to load-plot.mjs
const r3 = (v) => Math.round(v * 1000) / 1000
const clone = (v) => JSON.parse(JSON.stringify(v))
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
/**
 * The server's normaliser, applied until nothing changes. Every write passes a document through it, and it
 * is not idempotent everywhere (projectSchema.js planText trims THEN cuts, so a cut that ends on a space
 * loses it on the next write): a version made in several writes (load-version, then copy-version) holds the
 * fixed point. Pure.
 */
export const settled = (entity) => {
    let e = normalizeEntity(entity)
    for (let i = 0; i < 4; i += 1) {
        const next = normalizeEntity(e)
        if (JSON.stringify(next) === JSON.stringify(e)) return e
        e = next
    }
    return e
}
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))

/** Every leaf where two values differ: [{ path, git, live }]. Pure. */
export const fieldDiff = (a, b, at = '', out = []) => {
    const both = a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
    if (both) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) fieldDiff(a[k], b[k], at ? `${at}.${k}` : k, out)
    } else if (stable(a) !== stable(b)) out.push({ path: at, git: a === undefined ? '(absent)' : a, live: b === undefined ? '(absent)' : b })
    return out
}

/** Apply one op of the kinds a version's making writes to a document. Pure (returns a new document); throws on any other kind. */
export const applyOp = (doc, op) => {
    const d = clone(doc)
    const p = op.payload || {}
    const entity = (id) => d.entities.find((e) => e.id === id)
    switch (op.type) {
        case 'replaceDocument': return clone(p.document)
        case 'setWorldState': d.worldState = { ...(d.worldState || {}), ...p.patch }; return d
        case 'setRenderSettings': d.renderSettings = { ...(d.renderSettings || {}), ...p.patch }; return d
        case 'updateComponent': {
            const e = entity(p.entityId)
            if (!e) throw new Error(`op ${op.opId}: no entity ${p.entityId}`)
            e.components = { ...e.components, [p.component]: { ...(e.components?.[p.component] || {}), ...p.patch } }
            return d
        }
        default: throw new Error(`op ${op.opId}: type ${op.type} is not replayed by this tool — refusing rather than guessing`)
    }
}

/** The document at version `at`, from the op log (ops numbered by `version`). Pure. */
export const documentAt = (ops, at) => ops.filter((o) => Number(o.version) <= at).reduce(applyOp, { entities: [] })

/**
 * What git builds for one version: { lamps, pieces, venuePlan, show, sources }. Offline; writes only a
 * temporary report directory, removed after.
 */
export const gitSide = async ({ versionId, repoRoot = REPO_ROOT, look = null, copy = null }) => {
    const spec = readJson(path.join(repoRoot, VERSIONS_FILE))
    const rigFile = rigFileOf(spec.set, versionId)
    const rentalFile = rentalFileOf(spec.set, versionId)
    const rig = readJson(path.join(repoRoot, rigFile))
    const hallFile = spec.hall
    const hall = readJson(path.join(repoRoot, hallFile))
    const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const types = readJson(path.join(repoRoot, 'src/rigbuild/types/moxir.json'))

    // 1. the typed, patched document — the report versions.mjs writes
    const { report } = await import('../rigbuild/versions-report.mjs')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-compare-'))
    const quiet = console.log
    console.log = () => {}
    try { await report({ out: tmp, only: [versionId] }) } finally { console.log = quiet }
    const doc = readJson(path.join(tmp, versionId, `${versionId}.document.json`))
    fs.rmSync(tmp, { recursive: true, force: true })

    // the boxes that become pieces (load-plot.mjs), and the pieces
    const pieces = piecesFromRigBoxes(doc.entities)
    const replaced = new Set(pieces.map((p) => p.replaces).filter(Boolean))
    for (const id of ['rig-truss-tower-l', 'rig-truss-tower-r', 'rig-truss-header', 'rig-truss-z-arm', 'rig-stage-deck']) if (doc.entities.some((e) => e.id === id)) replaced.add(id)
    const pieceAsset = (kind) => {
        const file = path.join(repoRoot, 'scripts/rigbuild/pieces', `${kind}.glb`)
        return { id: sha256(fs.readFileSync(file)), name: `rigbuild-${kind}.glb`, file: path.relative(repoRoot, file) }
    }
    const pieceEntities = pieces.map((p) => {
        const base = catalogueHeightOf(p.kind)
        return {
            id: p.id, type: 'model', name: p.name,
            components: {
                transform: { position: p.position, rotation: [0, p.yaw, p.roll || 0], scale: [1, base && p.height ? r3(p.height / base) : 1, 1] },
                media: { assetId: pieceAsset(p.kind).id },
                appearance: { color: '#8a8f98', opacity: 1 },
                piece: { kind: p.kind }
            }
        }
    })

    // 4. the default look at nominal light, as load-version.mjs --look <id> --nominal writes it (lookOps)
    const lookId = look || rig.defaultLook
    const shown = { ...rig, looks: { ...rig.looks, [lookId]: { ...rig.looks[lookId], levels: undefined } } }
    const built = new Map(buildRig(shown, hall, { geometry, manifest, look: lookId }).entities.filter((x) => x.type === 'spotLight').map((x) => [x.id, x]))
    // 5. realism.mjs: each lamp's lens
    const apertures = apertureByType(types, manifest)
    const lamps = doc.entities.filter((e) => !replaced.has(e.id)).map((e0) => {
        const e = clone(e0)
        const b = built.get(e.id)
        if (e.type === 'spotLight' && b) {
            e.components.transform = { ...e.components.transform, position: b.components.transform.position, rotation: b.components.transform.rotation }
            e.components.light = { ...e.components.light, color: b.components.light.color, intensity: b.components.light.intensity }
            e.components.beam = { ...e.components.beam, haze: b.components.beam.haze }
        }
        if (e.type === 'spotLight' && e.components?.beam && apertures[e.components?.fixture?.type]) e.components.beam = { ...e.components.beam, aperture: apertures[e.components.fixture.type] }
        return e
    })

    // 2. the venue plan; 3. the show
    const venuePlan = venuePlanFromHall(hall, { name: VENUE_NAME, source: `scripts/place/rigs/${path.basename(hallFile)} (hall.py v${hall.version}, ${String(hall.createdAt || '').slice(0, 16)})`, site: null })
    const { rentalList } = readJson(path.join(repoRoot, rentalFile))
    const { variantOf } = await import('../rigbuild/load-version.mjs')
    let rigVariant = variantOf(spec, versionId, HALL_PROJECT)
    // 7. copy-version.mjs --from-api … --to <the same id> --label <label> [--siblings <file>]
    if (copy) {
        const projectId = `${HALL_PROJECT}-${versionId}`
        const siblings = copy.siblingsFile ? readJson(path.join(repoRoot, copy.siblingsFile)) : null
        rigVariant = copiedEntities([{ id: RIG_SHOW_ID, components: { rigVariant } }], { from: projectId, to: projectId, label: copy.label, suffix: copy.suffix || defaultSuffix(copy.label), siblings })[0].components.rigVariant
    }
    const show = { rentalList, rigLooks: rigLooksFrom(rig, path.join(repoRoot, rigFile)), rigVariant }

    // 8. the world and render values the tools write, in their order
    const realLights = Object.values(rig.budget?.realLights || {}).reduce((s, v) => s + (typeof v === 'number' ? v : Number(v.count) || 0), 0)
    const [nightWorld, nightRender] = nightOps(rig, { realLights }).map((op) => op.payload.patch)
    const REALISM = { scattering: 0.05, anisotropy: 0.7, tone: 'ACESFilmic', exposure: 3.5 }
    const worldRender = {
        worldState: { ...nightWorld, ambientLight: { color: '#000000', intensity: 0 }, directionalLight: { ...nightWorld.directionalLight, intensity: 0 }, backgroundColor: '#000000', fog: { ...hazeFog(REALISM.scattering), color: null } },
        renderSettings: { ...nightRender, atmosphere: { scattering: REALISM.scattering, anisotropy: REALISM.anisotropy }, toneMapping: REALISM.tone, toneMappingExposure: REALISM.exposure }
    }

    const files = [VERSIONS_FILE, rigFile, rentalFile, hallFile, ...(copy?.siblingsFile ? [copy.siblingsFile] : []), 'scripts/place/fixtures/fixtures.json', 'src/rigbuild/types/moxir.json', ...new Set(pieces.map((p) => pieceAsset(p.kind).file))]
    return {
        versionId, look: lookId,
        entities: [...pieceEntities, ...lamps].map(settled),
        venuePlan, show, worldRender,
        pieceAssets: Object.fromEntries([...new Set(pieces.map((p) => p.kind))].map((k) => [k, pieceAsset(k)])),
        sources: { commit: gitCommit(repoRoot), files: Object.fromEntries(files.map((f) => [f, fileBlob(f, repoRoot)])) }
    }
}

/**
 * The comparison of a project document with what git builds. Pure but for nothing: { fingerprint, entities,
 * show, venuePlan, assets, notFromGit }. `live`: the project document.
 */
export const compare = (live, git) => {
    const L = new Map(live.entities.map((e) => [e.id, e]))
    const G = new Map(git.entities.map((e) => [e.id, e]))
    const changed = []
    let equal = 0
    for (const [id, g] of G) {
        const l = L.get(id)
        if (!l) continue
        const fields = fieldDiff(g, settled(l))
        if (fields.length) changed.push({ id, fields })
        else equal += 1
    }
    const onlyGit = [...G.keys()].filter((id) => !L.has(id))
    const notBuilt = new Set(['place-hall', RIG_SHOW_ID])
    const onlyLive = [...L.keys()].filter((id) => !G.has(id) && !notBuilt.has(id))
    const liveShow = L.get(RIG_SHOW_ID)?.components || {}
    const gitShow = settled({ id: RIG_SHOW_ID, type: 'group', components: clone(git.show) }).components
    const gitPlan = settled({ id: 'place-hall', type: 'model', components: { venuePlan: clone(git.venuePlan) } }).components.venuePlan
    const show = Object.fromEntries(Object.keys(git.show).map((k) => [k, fieldDiff(gitShow[k], liveShow[k])]))
    const venuePlan = fieldDiff(gitPlan, L.get('place-hall')?.components?.venuePlan)
    // the world/render keys the tools write at their defaults, against the document — a CHECK only, never
    // substituted: the arguments those tools ran with are not recorded, and the rest came with the hall's project
    const worldRender = Object.fromEntries(Object.entries(git.worldRender || {}).map(([part, patch]) => [part, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, fieldDiff(v, live[part]?.[k])]))]))
    const assets = Object.fromEntries(Object.entries(git.pieceAssets).map(([kind, a]) => {
        const held = (live.assets || []).find((x) => x.name === a.name)
        return [kind, { name: a.name, git: a.id, live: held?.id || null, equal: held?.id === a.id }]
    }))

    // the substitution: every git-built part in its place, the rest as the document holds it
    const sub = clone(live)
    sub.entities = sub.entities.map((e) => {
        if (G.has(e.id)) return clone(G.get(e.id))
        if (e.id === RIG_SHOW_ID) return { ...e, components: { ...e.components, ...Object.fromEntries(Object.keys(git.show).map((k) => [k, clone(gitShow[k])])) } }
        if (e.id === 'place-hall') return { ...e, components: { ...e.components, venuePlan: clone(gitPlan) } }
        return e
    }).filter((e) => !onlyLive.includes(e.id))
    for (const id of onlyGit) sub.entities.push(clone(G.get(id)))
    for (const a of Object.values(assets)) if (a.live && !a.equal) sub.assets = sub.assets.map((x) => (x.name === a.name ? { ...x, id: a.git } : x))

    const hall = L.get('place-hall')
    const hallAsset = (live.assets || []).find((a) => a.id === hall?.components?.media?.assetId)
    return {
        fingerprint: { live: fingerprintOf(live), withGitParts: fingerprintOf(sub) },
        entities: { gitBuilt: G.size, equal, changed, onlyGit, onlyLive },
        show, venuePlan, assets, worldRender,
        notFromGit: {
            'place-hall model': hallAsset ? { name: hallAsset.name, sha256: hallAsset.id, size: hallAsset.size, why: 'hall.py builds the hall in Blender; realism.mjs makes the night copy — not rebuilt here' } : null,
            'place-hall other components': Object.keys(hall?.components || {}).filter((k) => k !== 'venuePlan'),
            'rig-show components': Object.keys(liveShow).filter((k) => !(k in git.show) && k !== 'transform'),
            worldState: live.worldState,
            renderSettings: live.renderSettings,
            sha256: {
                worldState: sha256(stable(live.worldState ?? null)),
                renderSettings: sha256(stable(live.renderSettings ?? null))
            }
        }
    }
}

/** A short human summary of a comparison. Pure. */
export const summary = (c, { versionId, projectId, listed = null }) => {
    const lines = []
    const byField = {}
    for (const ch of c.entities.changed) for (const f of ch.fields) { const k = f.path.replace(/\.\d+(?=\.|$)/g, '[]'); (byField[k] ||= []).push(ch.id) }
    lines.push(`${projectId} against git's ${versionId}:`)
    lines.push(`  fingerprint of the document     ${c.fingerprint.live}${listed ? `  (listed: ${listed}${listed === c.fingerprint.live ? ', the same' : ', DIFFERENT'})` : ''}`)
    lines.push(`  with every git-built part in it  ${c.fingerprint.withGitParts}  → ${c.fingerprint.withGitParts === c.fingerprint.live ? 'EQUAL: every part git builds is what the project holds' : 'NOT equal'}`)
    lines.push(`  entities git builds: ${c.entities.gitBuilt}; identical ${c.entities.equal}; differ ${c.entities.changed.length}; only in git ${c.entities.onlyGit.length}; rig-like only in the project ${c.entities.onlyLive.length}`)
    for (const [k, ids] of Object.entries(byField)) lines.push(`    field ${k}: ${ids.length} entities (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''})`)
    if (c.entities.onlyGit.length) lines.push(`    only in git: ${c.entities.onlyGit.join(', ')}`)
    if (c.entities.onlyLive.length) lines.push(`    only in the project: ${c.entities.onlyLive.join(', ')}`)
    for (const [k, d] of Object.entries(c.show)) lines.push(`  rig-show.${k}: ${d.length ? `${d.length} field(s) differ — ${d.slice(0, 3).map((f) => f.path).join(', ')}` : 'identical'}`)
    lines.push(`  place-hall.venuePlan: ${c.venuePlan.length ? `${c.venuePlan.length} field(s) differ` : 'identical'}`)
    for (const [part, keys] of Object.entries(c.worldRender || {})) for (const [k, d] of Object.entries(keys)) lines.push(`  ${part}.${k} (as the tools write it): ${d.length ? d.map((f) => `${f.path || k} git ${JSON.stringify(f.git)} project ${JSON.stringify(f.live)}`).join('; ') : 'identical'}`)
    for (const a of Object.values(c.assets)) lines.push(`  piece body ${a.name}: ${a.equal ? 'same bytes as git' : `git ${a.git.slice(0, 12)}…, project ${String(a.live).slice(0, 12)}…`}`)
    const h = c.notFromGit['place-hall model']
    lines.push(`  not built from git: hall model ${h ? `${h.name} sha256 ${h.sha256}` : '(none)'}; place-hall ${c.notFromGit['place-hall other components'].join(', ')}; rig-show ${c.notFromGit['rig-show components'].join(', ')}; worldState ${c.notFromGit.sha256.worldState.slice(0, 12)}…; renderSettings ${c.notFromGit.sha256.renderSettings.slice(0, 12)}…`)
    return lines.join('\n')
}

const main = async () => {
    const args = parseArgs()
    // --record: the version, the project, the copy step and the listed fingerprint from a committed record
    const record = args.record ? readJson(path.resolve(String(args.record))) : null
    if (record) {
        args.version ??= record.versionOf
        args.project ??= record.projectId
        args.listed ??= record.listed?.fingerprint
        if (record.rebuild?.copy && args['copy-label'] === undefined) {
            args['copy-label'] = record.rebuild.copy.label
            if (record.rebuild.copy.siblingsFile) args['copy-siblings'] = record.rebuild.copy.siblingsFile
        }
        if (record.rebuild?.look && args.look === undefined) args.look = record.rebuild.look
        const moved = Object.entries(record.pinned || {}).filter(([file, blob]) => fileBlob(file) !== blob)
        say(moved.length ? `the record pins ${Object.keys(record.pinned).length} files; ${moved.length} moved since: ${moved.map(([f]) => f).join(', ')} — the build below is from the files as they are now` : `the record pins ${Object.keys(record.pinned || {}).length} files; none moved since`)
    }
    const versionId = String(args.version || die('needs --version <id in the versions file>, e.g. known-full'))
    let live = null
    let projectId = String(args.project || '')
    if (args.doc) {
        const read = readJson(path.resolve(String(args.doc)))
        live = read.document || read
        projectId ||= live.projectMeta?.id || '(file)'
    } else {
        const api = String(args.api || die('needs --doc <file> or --api <install>/serverXR --project <id>')).replace(/\/+$/, '')
        if (!projectId) die('needs --project <id>')
        const token = readToken(args['token-file'] ? String(args['token-file']) : null)
        const client = makeClient(api, token)
        if (args['at-version'] !== undefined) {
            const got = await client.get(`/api/projects/${projectId}/ops`)
            if (!got.ok) die(`reading ${projectId}'s ops on ${api}: ${got.status}`)
            live = documentAt(got.body.ops, Number(args['at-version']))
        } else {
            const got = await client.get(`/api/projects/${projectId}/document`)
            if (!got.ok) die(`reading ${projectId} on ${api}: ${got.status}`)
            live = got.body.document
        }
    }
    const copy = args['copy-label'] ? { label: String(args['copy-label']), suffix: args['copy-suffix'] ? String(args['copy-suffix']) : null, siblingsFile: args['copy-siblings'] ? String(args['copy-siblings']) : null } : null
    const git = await gitSide({ versionId, look: args.look ? String(args.look) : null, copy })
    const c = compare(live, git)
    say(summary(c, { versionId, projectId, listed: args.listed ? String(args.listed) : null }))
    if (args.json) fs.writeFileSync(path.resolve(String(args.json)), `${JSON.stringify({ versionId, projectId, look: git.look, sources: git.sources, ...c }, null, 2)}\n`)
    process.exitCode = c.fingerprint.withGitParts === c.fingerprint.live ? 0 : 1
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
