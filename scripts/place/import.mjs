#!/usr/bin/env node
/**
 * import.mjs — step 5 of the place pipeline: the room arrives on di.iiii.
 *
 * Makes a space, hangs the hall in it as ONE static model on the floor with a
 * walkable floor plan and a spawn inside the door, and keeps the footage that
 * built it as a second project in the same space. Then prints the addresses
 * to walk.
 *
 * A space IS a place, and its layers stack: `hall` is the room, `sources` is
 * what the room was made of. Neither is a folder of files — both are rooms.
 *
 * Usage:
 *   node scripts/place/import.mjs --work <folder> --name <space> [options]
 *
 *   --api <base>        di.iiii API base (default https://local.thedi.studio/serverXR)
 *   --label <text>      what the space is called (default the name)
 *   --title <text>      what the hall is called in the room
 *   --sources <dir>     the footage folder (default: the one frames.json names)
 *   --no-sources        skip the second project
 *   --replace           the hall project already holds a room: swap the model (its other
 *                       components, the night, fog, spawn and opening shot are KEPT —
 *                       they belong to the rig; add --reset-view to write the defaults)
 *                       and drop the old file's asset from the document (the
 *                       entity keeps its id, so lamps hung beside it stay)
 *   --max-sources <n>   how many source files to carry (default 60)
 *   --dry-run           say what would happen, change nothing
 *
 * The token is read, never printed: DI_API_TOKEN, or --token-file <path>, or
 * the usual env files (~/.di/di.env for the installed di.iiii on this
 * machine, serverXR/.env.local for a checkout's own server).
 */
import fs from 'node:fs'
import path from 'node:path'

import {
    parseArgs, num, say, warn, die, readJson, writeJson,
    IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, walkFiles, fmtBytes
} from './common.mjs'
import { DEFAULT_API, makeClient, mimeFor, readToken as readApiToken } from './api.mjs'
import { readPlaceRecord } from './fit-lib.mjs'
import { sourceRoomOps, sourceWall } from '../../src/scan/sourceWall.js'

const args = parseArgs()

// The API client, the token reader and the mime table moved to ./api.mjs on
// 2026-09-22, when frames.mjs needed the same three to pull a hosted space's
// footage back down (`--from-space`). `readToken` is re-exported because this
// module already published it.
export { readToken } from './api.mjs'

export const must = (result, what) => {
    if (!result.ok) {
        die(`${what} failed — HTTP ${result.status}`, result.text.slice(0, 300))
    }
    return result.body
}

export const uploadAsset = async (client, projectId, file, options = {}) => {
    const form = new FormData()
    const bytes = fs.readFileSync(file)
    form.append('asset', new Blob([bytes], { type: options.mimeType || mimeFor(file) }), options.name || path.basename(file))
    const result = await client.post(`/api/projects/${projectId}/assets`, form)
    // A source file the server will not take (413 too large, 415 an image it
    // cannot scrub) is one picture missing from a wall, not a reason to throw
    // away the whole room. The hall itself is never optional, so only the
    // footage passes `skippable`.
    if (options.skippable && !result.ok) {
        warn(`    left out, the server refused it (${result.status}): ${path.basename(file)}`)
        // add-sources.mjs reports every refusal by name, size and reason at the end.
        options.onRefused?.({ name: options.name || path.basename(file), size: bytes.length, status: result.status, reason: result.text.slice(0, 160) })
        return null
    }
    const asset = must(result, `uploading ${path.basename(file)}`).asset
    return {
        id: asset.id,
        name: asset.name || options.name || path.basename(file),
        mimeType: asset.mimeType || options.mimeType || mimeFor(file),
        size: asset.size || bytes.length,
        url: asset.url,
        source: 'server',
        createdAt: Date.now()
    }
}

const ensureSpace = async (client, spaceId, label) => {
    const head = await client.get(`/api/spaces/${spaceId}`)
    if (head.status === 200) return { created: false }
    const made = must(await client.post('/api/spaces', { label, permanent: true }), 'creating the space')
    if (made.space?.id !== spaceId) {
        die(
            `Asked for a space called "${spaceId}" and the server named it "${made.space?.id}".`,
            'Give --name something that survives the server\'s own naming, or rename by hand.'
        )
    }
    return { created: true }
}

const ensureProject = async (client, spaceId, projectId, title) => {
    const listed = must(await client.get(`/api/spaces/${spaceId}/projects`), 'listing projects')
    if ((listed.projects || []).some((project) => project.id === projectId)) return { created: false }
    must(await client.post(`/api/spaces/${spaceId}/projects`, { title, slug: projectId }), `creating ${projectId}`)
    return { created: true }
}

export const sendOps = async (client, projectId, ops) => {
    const current = must(await client.get(`/api/projects/${projectId}/document`), 'reading the document')
    const result = await client.post(`/api/projects/${projectId}/ops`, {
        baseVersion: Number(current.version) || 0,
        ops
    })
    return must(result, `writing ${ops.length} changes to ${projectId}`)
}

// ── the hall ──────────────────────────────────────────────────────────────────
/**
 * `--replace` swaps the room by re-creating `place-hall`, which would drop every
 * component other scripts wrote on it — the rig builder's `venuePlan` went
 * (seen 2026-09-28: the plot lost its venue until load-plot --plan-only ran).
 * Carry the old entity's components the new one does not write; the new ones
 * (transform, media, …) win. Mutates the createEntity op; returns what it kept.
 */
export const carryComponents = (ops, old) => {
    const op = ops.find((o) => o.type === 'createEntity' && o.payload?.entity?.id === 'place-hall')
    if (!op || !old?.components) return []
    const fresh = op.payload.entity.components || {}
    const kept = Object.keys(old.components).filter((key) => !(key in fresh))
    op.payload.entity.components = { ...Object.fromEntries(kept.map((key) => [key, old.components[key]])), ...fresh }
    return kept
}

/**
 * `--replace` on a rigged hall: the lights, fog, spawn and opening shot were
 * written by rig.mjs (the night, `rig.opening`), not by the room. Re-importing
 * the model must not reset them to the arrival daylight (seen 2026-09-28: the
 * hall fix's re-import lit the rig's night room white until --night-only ran).
 * Keeps only the walkable floor, which IS the room's; drops the presentation op.
 */
export const keepRoomState = (ops) => {
    for (let i = ops.length - 1; i >= 0; i -= 1) {
        const op = ops[i]
        if (op.type === 'setPresentationState') ops.splice(i, 1)
        else if (op.type === 'setWorldState') op.payload.patch = { walkableAreas: op.payload.patch.walkableAreas }
    }
    return ops
}

export const hallOps = ({ asset, place, title }) => {
    // With the fit baked into the file, the entity is exactly where the room
    // is: at the origin, unturned, unscaled. di.iiii frames a room's arrival
    // from where its entities are, so an entity carrying a big cancelling
    // offset points the opening shot at empty space.
    const { position, rotation, scale } = place.bakedIn
        ? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
        : place.transform
    return [
        { type: 'upsertAsset', payload: { asset } },
        {
            type: 'createEntity',
            payload: {
                entity: {
                    id: 'place-hall',
                    type: 'model',
                    name: title,
                    components: {
                        transform: { position, rotation, scale },
                        media: { assetId: asset.id, playAnimations: false },
                        // WITHOUT THIS THE WHOLE BUILDING SPINS. An entity with
                        // no authored animation falls back to "models float"
                        // (src/project/viewport/entityAnimation.js) — fine for a
                        // sculpture on a plinth, absurd for a hall you stand in.
                        animation: { mode: 'static', speed: 1, amplitude: 1 }
                    }
                }
            }
        },
        {
            type: 'setWorldState',
            payload: {
                patch: {
                    backgroundColor: '#07090c',
                    gridVisible: false,
                    spawn: place.spawn,
                    // Far enough to see across the hall, near enough that the
                    // far wall is not a flat cut-out.
                    fog: {
                        near: Math.max(4, place.size[2] * 0.4),
                        far: Math.max(30, place.size[2] * 3),
                        color: null,
                        enabled: true
                    },
                    walkableAreas: place.walkableAreas,
                    // The orbit camera starts on the same shot the walker gets.
                    savedView: {
                        mode: 'perspective',
                        ...arrivalShot(place)
                    },
                    ambientLight: { color: '#ffffff', intensity: 0.9 },
                    directionalLight: {
                        color: '#fff7ea',
                        intensity: 1.1,
                        position: [place.size[0] * 0.4, place.size[1] * 1.6, place.size[2] * 0.4]
                    }
                }
            }
        },
        {
            type: 'setPresentationState',
            payload: {
                patch: {
                    // 'fixed-camera', not 'scene': the scene entry auto-frames
                    // from the entities' bounding sphere, and for a room that
                    // is one big model it puts the visitor's nose against the
                    // nearest column (seen on the test room, 2026-09-21).
                    // fixed-camera honours the shot below, and it is just as
                    // walkable — the Walk gate takes either
                    // (PublicProjectViewer.jsx:224).
                    mode: 'fixed-camera',
                    entryView: 'fixed-camera',
                    fixedCamera: arrivalShot(place)
                }
            }
        }
    ]
}

// The opening shot: standing where the visitor will stand, looking into the
// room. Left to itself di.iiii frames a room from its entities' bounding
// sphere, and for a single model that is ONE object — the camera ends up with
// its nose against a column (seen, 2026-09-21). A room is not a sculpture;
// the shot that says "this is a place" is the one from inside it, at eye
// height, which is also exactly what pressing Walk gives you.
export const arrivalShot = (place) => {
    const spawn = place.spawn || { x: 0, z: 0, altY: 1.6 }
    const eye = spawn.altY || 1.6
    const reach = Math.max(place.size?.[0] || 8, place.size?.[2] || 8)
    return {
        projection: 'perspective',
        position: [spawn.x, eye, spawn.z],
        target: [0, eye, 0],
        fov: 60,
        zoom: 1,
        near: 0.05,
        far: Math.max(80, reach * 6),
        locked: false
    }
}

// ── the footage ───────────────────────────────────────────────────────────────
// The wall's geometry moved to src/scan/sourceWall.js on 2026-09-22, when a
// phone at /{space}/scan became the second thing that hangs pictures on it. Two
// copies would drift, and a wall that hangs one way when this script builds it
// and another way when a phone does is two rooms. Re-exported here because
// import.test.js and anything else that already knew this name should keep
// working.
export { sourceWall, sourceWallEntity, sourceWallSlot, sourceRoomOps } from '../../src/scan/sourceWall.js'

const main = async () => {
    const work = args.work ? path.resolve(String(args.work)) : null
    const name = args.name ? String(args.name).trim() : null
    if (!work || !name) die('import.mjs needs --work <folder> and --name <space>.')

    const place = readPlaceRecord(readJson(path.join(work, 'place.json')))
    if (!place) die(`No usable place.json in ${work}. Run fit.mjs first.`)
    // The fitted file is the room; the crushed one is only a step on the way.
    const glb = place.bakedIn && place.fittedGlb && fs.existsSync(place.fittedGlb)
        ? place.fittedGlb
        : path.join(work, 'place.glb')
    if (!fs.existsSync(glb)) die(`No model at ${glb}. Run crush.mjs and fit.mjs first.`)

    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const label = String(args.label || name)
    const title = String(args.title || `${label} — the hall`)
    // Project ids are GLOBAL across every space on a di.iiii, so a bare
    // `hall` works exactly once and every place imported after the first
    // answers 409 "that name is taken" (2026-09-22). Name them after the
    // space; --project still overrides.
    const hallProject = String(args.project || `${name}-hall`)
    const sourcesProject = String(args['sources-project'] || `${name}-sources`)

    say(`Space "${name}" on ${api}`)
    say(`  the hall: ${fmtBytes(fs.statSync(glb).size)}, ${place.size.map((v) => v.toFixed(1)).join(' x ')} m (${place.scaleSource})`)

    if (args['dry-run']) {
        say('')
        say('[dry run] would:')
        say(`  create space ${name} ("${label}")`)
        say(`  create project ${hallProject}, upload place.glb, hang it static on the floor`)
        say(`  set the spawn at ${JSON.stringify(place.spawn)} and the walkable floor`)
        if (!args['no-sources']) say(`  create project ${sourcesProject} and carry the footage into it`)
        return
    }

    const token = readApiToken(args['token-file'] ? String(args['token-file']) : null)
    if (!token) {
        die(
            'No API token found, so nothing was sent.',
            'Set DI_API_TOKEN, or pass --token-file <path to an env file holding ADMIN_API_TOKEN>.'
        )
    }
    const client = makeClient(api, token)

    const reachable = await client.get('/api/spaces').catch(() => null)
    if (!reachable || reachable.status >= 500 || reachable.status === 0) {
        die(`${api} did not answer. Is the di.iiii you mean actually running?`)
    }

    const space = await ensureSpace(client, name, label)
    say(space.created ? `  created space ${name}` : `  space ${name} was already there`)

    // ── hall ──
    const hall = await ensureProject(client, name, hallProject, title)
    say(hall.created ? `  created project ${hallProject}` : `  project ${hallProject} was already there`)
    say('  sending the model up …')
    const asset = await uploadAsset(client, hallProject, glb)
    const ops = hallOps({ asset, place, title })
    if (args.replace) {
        // `createEntity` on an id that exists replaces it (applyProjectOps), so
        // the room swaps in place. The old file would otherwise stay listed in
        // the document's assets for ever; the bytes stay on the server (and in
        // whatever backup was taken first), only the reference goes.
        const before = must(await client.get(`/api/projects/${hallProject}/document`), 'reading the old hall')
        const old = (before.document?.entities || []).find((entity) => entity.id === 'place-hall')
        const oldAsset = old?.components?.media?.assetId
        if (oldAsset && oldAsset !== asset.id) {
            ops.push({ type: 'deleteAsset', payload: { assetId: oldAsset } })
            say(`  replacing the old model (asset ${oldAsset.slice(0, 12)}…)`)
        }
        const kept = carryComponents(ops, old)
        if (kept.length) say(`  kept on the hall: ${kept.join(', ')}`)
        if (!args['reset-view']) {
            keepRoomState(ops)
            say('  kept the room\'s night, fog, spawn and opening shot (--reset-view to write the arrival defaults)')
        }
    }
    const written = await sendOps(client, hallProject, ops)
    say(`  the hall stands (document version ${written.version ?? '?'})`)

    // ── sources ──
    let carried = []
    if (!args['no-sources']) {
        const frames = readJson(path.join(work, 'frames.json'))
        const sourceDir = args.sources ? path.resolve(String(args.sources)) : (frames?.from || null)
        if (!sourceDir || !fs.existsSync(sourceDir)) {
            warn('  no footage folder to carry — skipping the sources room')
        } else {
            const limit = num(args['max-sources'], 60)
            const files = walkFiles(sourceDir)
                .filter((file) => {
                    const ext = path.extname(file).toLowerCase()
                    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)
                })
                .slice(0, limit)
            if (files.length) {
                const sources = await ensureProject(client, name, sourcesProject, `${label} — what it was made of`)
                say(sources.created ? `  created project ${sourcesProject}` : `  project ${sourcesProject} was already there`)
                say(`  sending ${files.length} source files up …`)
                for (const file of files) {
                    const carriedAsset = await uploadAsset(client, sourcesProject, file, { skippable: true })
                    if (carriedAsset) carried.push(carriedAsset)
                }
                const wall = sourceWall(carried)
                await sendOps(client, sourcesProject, [
                    ...carried.map((entry) => ({ type: 'upsertAsset', payload: { asset: entry } })),
                    ...wall.map((entity) => ({ type: 'createEntity', payload: { entity } })),
                    // The room, not just the wall — one copy, shared with the
                    // phone (src/scan/sourceWall.js). It also carries the
                    // arrival SHOT now: left to auto-frame, a wall is one thin
                    // wide flat thing and the camera lands high above and behind
                    // it, so six photographs read as a strip on the floor (seen
                    // 2026-09-22). Same lesson as the hall, four lines up.
                    ...sourceRoomOps()
                ])
                const refused = files.length - carried.length
                say(`  ${carried.length} files hung on the wall${refused ? ` · ${refused} the server would not take` : ''}`)
            }
        }
    }

    // The front door of the space opens the hall.
    await client.patch(`/api/spaces/${name}`, { publishedProjectId: hallProject, permanent: true })

    const site = api.replace(/\/serverXR$/, '')
    writeJson(path.join(work, 'import.json'), {
        tool: 'scripts/place/import.mjs',
        createdAt: new Date().toISOString(),
        api,
        space: name,
        projects: { hall: hallProject, sources: carried.length ? sourcesProject : null },
        assetId: asset.id,
        addresses: {
            space: `${site}/${name}`,
            hall: `${site}/${name}/p/${hallProject}`,
            sources: carried.length ? `${site}/${name}/p/${sourcesProject}` : null
        }
    })

    say('')
    say('Walk it:')
    say(`  the hall      ${site}/${name}/p/${hallProject}`)
    if (carried.length) say(`  the footage   ${site}/${name}/p/${sourcesProject}`)
    say(`  the space     ${site}/${name}`)
    say('')
    say('Open the hall, press Walk, and look: upright, on the floor, still.')
    if (place.scaleSource !== 'measured') {
        warn(`The room's size is ${place.scaleSource.toUpperCase()} — it will walk the wrong size until somebody measures a wall.`)
    }
}

if (process.argv[1] && process.argv[1].endsWith('import.mjs')) await main()
