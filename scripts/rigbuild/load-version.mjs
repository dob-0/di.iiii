#!/usr/bin/env node
/**
 * load-version.mjs — put one rig VERSION into its own project of the space, beside the
 * hall's project, AS OPS; or show one of its looks there. docs/architecture/RIG_BUILD.md §15.
 *
 *   node scripts/rigbuild/load-version.mjs --api http://localhost:4411/serverXR --space moxir \
 *     --from moxir-hall --version minimal --report <dir from versions.mjs --report> \
 *     --hall <hall.json> --token-file serverXR/.env.local
 *   … --version minimal --look red-room      # show a look (aims, colours, levels) and re-bake its wash
 *   … --version minimal --look red-room --nominal   # the look's aims and colours, every lamp at its NOMINAL
 *                                            # light (levels not written): the rest for a room that follows
 *                                            # the desk — a look's level scales the document's light, so a
 *                                            # lamp rested at 0 could never come back up in another look
 *   … --version minimal --mark               # write only which version this project (and the hall's own) is
 *
 * A version is a PROJECT (moxir-hall-minimal, -middle, -full), not a field inside one:
 * each has its own lamps, equipment list, patch, looks and desk, so the plot, the cards,
 * the equipment page, the patch sheet and the build view all work on it unchanged. What
 * ties the set together is `components.rigVariant` on the show's entity: the set, which
 * version this is, and its siblings, in order — the space view's switch reads it.
 *
 * Steps (a new project):
 *   1. create the project in the space (POST /api/spaces/:space/projects);
 *   2. copy the hall: the source project's non-rig entities (the venue model and its
 *      plan), their assets (downloaded and uploaded again) and the room's world, render
 *      and presentation state — one PUT, the project's first document;
 *   3. load-plot.mjs with the version's typed, patched document (versions-report.mjs):
 *      the truss and decks as pieces, every lamp and effect;
 *   4. the show's entity: the equipment list, the looks (looks.mjs), the rigVariant — ops;
 *   5. the default look's wash (rig.mjs --wash-only).
 * `--look` writes the look's poses from the rig file (rig-lib buildRig: aims, colours
 * AND levels — reversible, because the nominal comes from the rig file, not the document)
 * and re-bakes the wash for it. For previews and renders; the desk plays looks without it.
 *
 * Point it only at a stack you own: no default address, the token from --token-file.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { buildRig, nightOps } from '../place/rig-lib.mjs'
import { FIXTURE_DIR, readGeometry } from '../place/fixtures-glb.mjs'
import { RIG_SHOW_ID } from '../../src/rigbuild/rental.js'
import { projectOf, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { rigLooksFrom } from './looks.mjs'

const args = parseArgs()
const readTokenFile = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

/** The set as the switch reads it: every version, in order, with the project it lives in. */
export const variantOf = (spec, id, hallProject) => {
    const v = id === spec.ordered?.id ? spec.ordered : spec.versions.find((x) => x.id === id)
    return {
        set: spec.set, id, title: v.title, summary: v.summary,
        source: `${VERSIONS_FILE} — scripts/rigbuild/load-version.mjs`,
        siblings: [
            // the hall's own project, the rig as ordered, first: what the versions are compared to
            ...(spec.ordered ? [{ id: spec.ordered.id, projectId: hallProject, title: spec.ordered.title, summary: spec.ordered.summary }] : []),
            ...spec.versions.map((s) => ({ id: s.id, projectId: projectOf(hallProject, s.id), title: s.title, summary: s.summary }))
        ]
    }
}

/** The op that marks a project as one of the set (on its show entity, created when missing). */
export const variantOps = (entities, variant) => (entities.some((e) => e.id === RIG_SHOW_ID)
    ? [{ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigVariant', patch: variant } }]
    : [{ type: 'createEntity', payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — equipment list, looks, version', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigVariant: variant } } } }])

/** Ops that show a look: each lamp's transform, light (colour, intensity) and beam haze, from the rig file. Pure. */
export const lookOps = (entities, built) => {
    const have = new Set(entities.map((e) => e.id))
    const ops = []
    for (const e of built.entities.filter((x) => x.type === 'spotLight' && have.has(x.id))) {
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'transform', patch: { position: e.components.transform.position, rotation: e.components.transform.rotation } } })
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'light', patch: { color: e.components.light.color, intensity: e.components.light.intensity } } })
        ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch: { haze: e.components.beam.haze } } })
    }
    return ops
}

const main = async () => {
    const api = args.api ? String(args.api).replace(/\/+$/, '') : die('needs --api <base> — it has no default on purpose')
    const space = String(args.space || die('needs --space <id>'))
    const from = String(args.from || die('needs --from <the hall project>'))
    const id = String(args.version || die('needs --version minimal|middle|full'))
    const hallFile = path.resolve(String(args.hall || die('needs --hall <hall.json>')))
    const tokenFile = path.resolve(String(args['token-file'] || die('needs --token-file')))
    const token = readTokenFile(tokenFile) || die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const rigFile = path.join(REPO_ROOT, rigFileOf(spec.set, id))
    const rig = readJson(rigFile)
    const project = projectOf(from, id)
    const send = async (ops, what) => {
        const doc = await client.get(`/api/projects/${project}/document`)
        if (!doc.ok) die(`reading ${project}: ${doc.status}`)
        let version = doc.body.version
        for (let i = 0; i < ops.length; i += 200) {
            const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops: ops.slice(i, i + 200).map((op, j) => ({ ...op, opId: `load-version-${Date.now()}-${i + j}`, clientId: 'load-version' })) })
            if (!out.ok) die(`${what}: ${out.status} ${out.text.slice(0, 300)}`)
            version = out.body.newVersion
        }
        return version
    }
    const washFor = (look) => execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts/place/rig.mjs'), '--api', api, '--rig', rigFile, '--hall', hallFile, '--project', project, '--wash-only', '--look', look, '--token-file', tokenFile], { stdio: 'inherit' })

    const markFrom = async () => {
        const base = await client.get(`/api/projects/${from}/document`)
        const out = await client.post(`/api/projects/${from}/ops`, { baseVersion: base.body.version, ops: variantOps(base.body.document.entities, variantOf(spec, spec.ordered.id, from)).map((op, j) => ({ ...op, opId: `load-version-${Date.now()}-${j}`, clientId: 'load-version' })) })
        if (!out.ok) die(`marking ${from}: ${out.status} ${out.text.slice(0, 200)}`)
        say(`${from}: marked "${spec.ordered.id}" in the set`)
    }

    // --mark: write only which version each project is (this one and the hall's own).
    if (args.mark) {
        const doc = await client.get(`/api/projects/${project}/document`)
        if (!doc.ok) die(`reading ${project}: ${doc.status}`)
        await send(variantOps(doc.body.document.entities, variantOf(spec, id, from)), 'the version mark')
        say(`${project}: marked "${id}" in the set`)
        await markFrom()
        return
    }

    if (args.look) {
        const look = String(args.look)
        const hall = readJson(hallFile)
        const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
        const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
        // --nominal: the look without its levels, so every lamp keeps its full light
        const shown = args.nominal ? { ...rig, looks: { ...rig.looks, [look]: { ...rig.looks[look], levels: undefined } } } : rig
        const built = buildRig(shown, hall, { geometry, manifest, look })
        const doc = await client.get(`/api/projects/${project}/document`)
        if (!doc.ok) die(`reading ${project}: ${doc.status}`)
        const ops = lookOps(doc.body.document.entities, built)
        const v = await send(ops, 'the look')
        say(`${project}: look "${look}" shown${args.nominal ? ' at nominal light' : ''} (${ops.length / 3} lamps); version ${v}`)
        washFor(look)
        return
    }

    // 1. the project
    const exists = await client.get(`/api/projects/${project}`)
    if (!exists.ok) {
        const made = await client.post(`/api/spaces/${space}/projects`, { title: rig.rig, slug: project })
        if (!made.ok) die(`creating ${project}: ${made.status} ${made.text.slice(0, 200)}`)
        say(`${project}: created in ${space}`)
    } else if (!args.force) die(`${project} exists — pass --force to load over it`)

    // 2. the hall
    const src = await client.get(`/api/projects/${from}/document`)
    if (!src.ok) die(`reading ${from}: ${src.status}`)
    const source = src.body.document
    const hallEntities = source.entities.filter((e) => !e.id.startsWith('rig-'))
    const wanted = new Set(hallEntities.map((e) => e.components?.media?.assetId).filter(Boolean))
    const assets = []
    for (const a of source.assets.filter((x) => wanted.has(x.id))) {
        const got = await client.bytes(`/api/projects/${from}/assets/${a.id}`)
        if (!got.ok) die(`downloading ${a.name}: ${got.status}`)
        const form = new FormData()
        form.append('asset', new Blob([got.buffer], { type: a.mimeType }), a.name)
        const up = await client.post(`/api/projects/${project}/assets`, form)
        if (!up.ok) die(`copying ${a.name}: ${up.status} ${up.text.slice(0, 200)}`)
        if (up.body.asset.id !== a.id) die(`${a.name} came back as ${up.body.asset.id}, not ${a.id} — the copy is not the same bytes`)
        assets.push(up.body.asset)
        say(`  copied ${a.name} (${a.size} bytes)`)
    }
    const put = await client.put(`/api/projects/${project}/document`, {
        ...source,
        projectMeta: { ...source.projectMeta, title: rig.rig },
        entities: hallEntities,
        assets
    })
    if (!put.ok) die(`writing the hall into ${project}: ${put.status} ${put.text.slice(0, 200)}`)

    // 3. the rig: pieces, lamps, effects — the typed and patched document versions-report.mjs wrote
    const reportDir = path.resolve(String(args.report || die('needs --report <the dir versions.mjs --report wrote>')))
    const docFile = path.join(reportDir, id, `${id}.document.json`)
    if (!fs.existsSync(docFile)) die(`no ${docFile} — run: node scripts/rigbuild/versions.mjs --report ${reportDir}`)
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts/rigbuild/load-plot.mjs'), '--api', api, '--project', project, '--doc', docFile, '--hall', hallFile, '--token-file', tokenFile, '--name', 'MOXIR · Charentsavan factory hall'], { stdio: 'inherit' })

    // 4. the show: equipment list, looks, which version this is
    const { rentalList } = readJson(path.join(REPO_ROOT, rentalFileOf(spec.set, id)))
    const looks = rigLooksFrom(rig, rigFile)
    const now = await client.get(`/api/projects/${project}/document`)
    const hasShow = now.body.document.entities.some((e) => e.id === RIG_SHOW_ID)
    const components = { rentalList, rigLooks: looks, rigVariant: variantOf(spec, id, from) }
    const real = Object.values(rig.budget.realLights || {}).reduce((s, v) => s + (typeof v === 'number' ? v : Number(v.count) || 0), 0)
    const ops = hasShow
        ? Object.entries(components).map(([component, patch]) => ({ type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component, patch } }))
        : [{ type: 'createEntity', payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — equipment list, looks, version', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, ...components } } } }]
    // the version's night (darker than the base's), as rig.mjs writes it
    const v = await send([...ops, ...nightOps(rig, { realLights: real })], 'the show')
    say(`${project}: equipment list (${rentalList.items.length} lines), ${looks.looks.length} looks, version "${id}" of ${spec.set}; version ${v}`)

    // 5. the wash of the default look
    washFor(rig.defaultLook)

    // 6. the hall's own project joins the set as "as ordered", so the switch shows on it too
    await markFrom()
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
