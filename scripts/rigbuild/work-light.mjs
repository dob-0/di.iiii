#!/usr/bin/env node
/**
 * work-light.mjs — a dim, neutral WORK LIGHT in a show room, so the hall reads on a screen
 * between the beams (docs/architecture/RIG_BUILD.md §20.4). DATA, written as ops.
 *
 * Why: a room made "as a camera sees the night" (realism.mjs) has no ambient of its own —
 * the hall gets only the rig's return (rigBounce.js) and the light of its few REAL lamps
 * (MOXIR Minimal: 8 of 90; the other 82 are beam-only and light no surface). On the
 * owner's screen that read as a black frame (2026-10-01: "ok so its to dark"). Lighting
 * visualisers keep a venue/ambient light apart from the rig for this reason; this is that
 * light, stated as a viewing aid — a real hall at night has none.
 *
 * The level is SCENE-REFERRED: ambient intensity × the room's toneMappingExposure, so rooms
 * with different cameras (realism 3.5, older nights 1) get the same work light on screen.
 * Default 1.4 (= 0.4 at exposure 3.5), chosen on the owner's complaint and measured with
 * look-probe.mjs (numbers in RIG_BUILD §20.4). Colour #a39c92: the neutral fill of the
 * 2026-09-28 hall fix (owner: "the real hall is warm", not blue).
 *
 *   node scripts/rigbuild/work-light.mjs --space moxir --out <dir> [--level 1.4] [--color '#a39c92'] \
 *       [--projects a,b] [--include-archived] [--dry-run] [--api …/serverXR] [--token-file ~/.di/di.env]
 *   node scripts/rigbuild/work-light.mjs --undo <dir>/work-light-undo.json [--api …]
 *
 * Touches ONLY worldState.ambientLight of rooms that have a rig show (entity `rig-show`).
 * Saves every room's previous ambient first to <dir>/work-light-undo.json (refuses to
 * overwrite one). Refuses any host but a local install unless --allow-remote.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say } from '../place/common.mjs'
import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'

export const DEFAULT_LEVEL = 1.4
export const DEFAULT_COLOR = '#a39c92'

/** The ambient intensity that gives `level` on screen through a room's exposure. */
export const intensityFor = (level, exposure) => {
    const e = Number(exposure) > 0 ? Number(exposure) : 1
    return Math.round((level / e) * 1000) / 1000
}

/** The op that sets a room's work light, or null when the room has no rig show. */
export const workLightOp = (doc, { level = DEFAULT_LEVEL, color = DEFAULT_COLOR } = {}) => {
    if (!(doc?.entities || []).some((e) => e?.id === 'rig-show')) return null
    const intensity = intensityFor(level, doc.renderSettings?.toneMappingExposure)
    return { type: 'setWorldState', payload: { patch: { ambientLight: { color, intensity } } } }
}

const LOCAL = /^(local\.thedi\.studio|localhost|127\.0\.0\.1)$/
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || DEFAULT_API).replace(/\/+$/, '')
    const host = new URL(api).hostname
    if (!LOCAL.test(host) && !args['allow-remote']) die(`refusing ${host}: this writes a local install only (--allow-remote to override, never for production).`)
    const client = makeClient(api, readToken(args['token-file']) || die('no API token (see scripts/place/api.mjs readToken)'))

    const send = async (project, ops, what) => {
        if (args['dry-run']) return say(`[dry run] ${project}: ${what}`)
        const fresh = await client.get(`/api/projects/${project}/document`)
        if (!fresh.ok) die(`${project}: read ${fresh.status}`)
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: fresh.body.version, ops: ops.map((op, i) => ({ ...op, opId: `work-light-${stamp()}-${i}`, clientId: 'work-light' })) })
        if (!out.ok) die(`${project}: ${out.status} ${out.text.slice(0, 300)}`)
        say(`${project}: ${what} → version ${out.body.newVersion}`)
    }

    if (args.undo) {
        const undo = JSON.parse(fs.readFileSync(String(args.undo), 'utf8'))
        for (const room of undo.rooms) {
            await send(room.project, [{ type: 'setWorldState', payload: { patch: { ambientLight: room.ambientLight } } }], `ambient back to ${JSON.stringify(room.ambientLight)}`)
        }
        return
    }

    const space = String(args.space || die('needs --space <id> (or --undo <file>)'))
    const out = String(args.out || die('needs --out <dir> for the undo file'))
    const level = Number(args.level ?? DEFAULT_LEVEL)
    if (!(level >= 0 && level < 20)) die(`--level ${args.level}: expected 0 … 20`)
    const color = String(args.color || DEFAULT_COLOR)
    if (!/^#[0-9a-f]{6}$/i.test(color)) die(`--color ${color}: expected #rrggbb`)
    const only = args.projects ? new Set(String(args.projects).split(',')) : null

    const list = await client.get(`/api/spaces/${space}/projects`)
    if (!list.ok) die(`list ${space}: ${list.status}`)
    const projects = list.body.projects.filter((p) => (only ? only.has(p.id) : true) && (args['include-archived'] || p.state !== 'archived'))

    const rooms = []
    for (const p of projects) {
        const got = await client.get(`/api/projects/${p.id}/document`)
        if (!got.ok) die(`${p.id}: read ${got.status}`)
        const doc = got.body.document || got.body
        const op = workLightOp(doc, { level, color })
        if (!op) continue
        rooms.push({ project: p.id, title: p.title, exposure: doc.renderSettings?.toneMappingExposure ?? 1, ambientLight: doc.worldState?.ambientLight ?? null, op })
    }
    if (!rooms.length) die(`no rig rooms in ${space}`)

    const undoFile = path.join(out, 'work-light-undo.json')
    if (!args['dry-run']) {
        if (fs.existsSync(undoFile)) die(`${undoFile} exists — an earlier run's undo; --undo it or use another --out.`)
        fs.mkdirSync(out, { recursive: true })
        fs.writeFileSync(undoFile, JSON.stringify({ space, at: new Date().toISOString(), note: 'written by scripts/rigbuild/work-light.mjs before it wrote anything; replay with --undo', rooms: rooms.map(({ project, ambientLight }) => ({ project, ambientLight })) }, null, 2))
        say(`undo saved: ${undoFile}`)
    }
    for (const r of rooms) {
        const a = r.op.payload.patch.ambientLight
        await send(r.project, [r.op], `work light ${a.color} ${a.intensity} (level ${level} ÷ exposure ${r.exposure}; was ${JSON.stringify(r.ambientLight)})`)
    }
}

if (process.argv[1] && process.argv[1].endsWith('work-light.mjs')) main().catch((error) => die(error.stack || error.message))
