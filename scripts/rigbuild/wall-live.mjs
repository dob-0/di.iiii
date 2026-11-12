#!/usr/bin/env node
/**
 * wall-live.mjs: the wall in the 3D room plays the live picture of the deck (owner N3853 / N3855:
 * "sync this and we dont want that screen is move; yes scenes work but visuals not connected").
 *
 *   node scripts/rigbuild/wall-live.mjs --api <install>/serverXR --project <id> --wall <entity id>
 *        [--surface <mapping surface id>] [--mode live|still] [--token-file <env>] [--apply]
 *
 * Dry by default: it prints the ops it would post and changes nothing. With --apply it posts them to
 * POST /api/projects/<id>/ops (as screen-picture.mjs / epic-build.mjs do), reads the document back and prints what it finds.
 *
 * What it does, by the platform's own live screen (src/project/viewport/liveScreen.js, LiveScreens.jsx):
 *   - finds the wall box by the id given (the platform never checks a production by name: the id is an argument);
 *   - finds the mapping surface that shows the deck (kind network, ref = the project's vj.deck node), or creates one in the
 *     shape the real document uses when the project has a deck node and no such surface (--surface names it; absent: the
 *     deck's surface is looked up, else created as `deck-<wall id>`);
 *   - creates ONE plane entity `<wall id>-live`: the wall's width and height, standing on the audience face (+z) of the box,
 *     animation static (an entity without animation gets an idle drift in walk mode: entityAnimation.js resolveAnimation),
 *     components.surface = { surfaceId }. It sits 10 mm off the cabinet face, 5 mm in front of the still picture
 *     (`<wall id>-picture`, 5 mm off the face), so the two do not fight for the same pixels.
 *   - running it twice makes no second plane: an existing `<wall id>-live` is left as it is.
 * The still picture entity is never changed except by --mode: `--mode still` hides the live plane (runtime.visible false) and
 * shows the still; `--mode live` shows the live plane (the still stays, under it: the viewer's Live wall switch in the room
 * shows it when turned off). --mode is the undo: `--mode still` puts the room back to the still wall. Nothing is deleted.
 * A wall box that is turned (rotation not 0) is refused: the plane would have to be turned with it.
 */
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const GAP = 0.01 // from the cabinet face; the still picture sits at 0.005 (screen-picture.mjs GAP)
const UPRIGHT = [Math.round(Math.PI / 2 * 1e6) / 1e6, 0, 0] // a plane lies flat; +90 deg about x stands it up facing +z
const r3 = (v) => Math.round(v * 1000) / 1000

export const DECK_TYPE = 'vj.deck'

export const liveId = (wallId) => `${wallId}-live`
export const pictureId = (wallId) => `${wallId}-picture`
export const surfaceIdFor = (wallId) => `deck-${wallId}`

/** The surface a deck is shown by: the first mapping surface whose network source is the deck node. */
export const surfaceOfDeck = (doc, deckNodeId) => (doc.mappingState?.surfaces || []).find((s) => s.source?.kind === 'network' && s.source?.ref === deckNodeId) || null

/** A mapping surface in the shape the real document uses (MapOutput's whole-wall surface). */
export const deckSurface = ({ id, name, deckNodeId, width, height }) => ({
    id, name, enabled: true, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], mask: [], source: { kind: 'network', ref: deckNodeId },
    resolution: [width, height], opacity: 1, brightness: 1, contrast: 1, saturation: 1, hue: 0, blend: 'normal'
})

/** The live plane for a wall box (a box drawn upward from its position = its foot, +z = the audience). Pure. */
export const liveEntity = ({ wall, surfaceId }) => {
    const t = wall.components.transform
    const [w, h, d] = t.scale
    return {
        id: liveId(wall.id), type: 'plane', name: `${wall.id}: the live picture on the wall`, parentId: null,
        components: {
            transform: { position: [t.position[0], r3(t.position[1] + h / 2), r3(t.position[2] + d / 2 + GAP)], rotation: [...UPRIGHT], scale: [1, 1, 1] },
            primitive: { width: r3(w), depth: r3(h) },
            surface: { surfaceId },
            animation: { mode: 'static', speed: 1, amplitude: 1 }
        }
    }
}

const visibleOp = (entityId, visible) => ({ type: 'updateComponent', payload: { entityId, component: 'runtime', patch: { visible } } })

/** What to post for this document. Pure: the document in, { ops, notes, surfaceId, entityId } out. Throws on what cannot be done. */
export const planWallLive = (doc, { wallId, surfaceId = '', mode = '' } = {}) => {
    if (!wallId) throw new Error('needs --wall <entity id>')
    if (mode && mode !== 'live' && mode !== 'still') throw new Error('--mode is live or still')
    const entities = doc.entities || []
    const wall = entities.find((e) => e.id === wallId)
    if (!wall) throw new Error(`the project has no entity ${wallId}`)
    const t = wall.components?.transform
    if (!t?.position || !t?.scale) throw new Error(`${wallId} has no position and scale`)
    if ((t.rotation || [0, 0, 0]).some((v) => Math.abs(v) > 1e-6)) throw new Error(`${wallId} is turned; the plane would have to turn with it (not done)`)
    const ops = []
    const notes = []
    const existing = entities.find((e) => e.id === liveId(wallId))
    const still = entities.find((e) => e.id === pictureId(wallId))
    let useSurface = surfaceId
    if (existing) {
        useSurface = existing.components?.surface?.surfaceId || surfaceId
        notes.push(`${liveId(wallId)} is already there (surface ${useSurface}); not created again`)
    } else {
        const surfaces = doc.mappingState?.surfaces || []
        const deck = (doc.nodes || []).find((n) => n.typeId === DECK_TYPE)
        if (useSurface && surfaces.some((s) => s.id === useSurface)) {
            notes.push(`surface ${useSurface} is there`)
        } else if (!useSurface && deck && surfaceOfDeck(doc, deck.id)) {
            useSurface = surfaceOfDeck(doc, deck.id).id
            notes.push(`surface ${useSurface} already shows the deck`)
        } else if (deck) {
            useSurface = useSurface || surfaceIdFor(wallId)
            ops.push({ type: 'createMappingSurface', payload: { surface: deckSurface({ id: useSurface, name: `${wallId}: the deck`, deckNodeId: deck.id, width: 1280, height: Math.round(1280 * (t.scale[1] / t.scale[0])) }) } })
            notes.push(`surface ${useSurface} is made: network source, ref ${deck.id} (the deck)`)
        } else {
            throw new Error('no mapping surface shows a deck and the project has no vj.deck node (name one with --surface)')
        }
        ops.push({ type: 'createEntity', payload: { entity: liveEntity({ wall, surfaceId: useSurface }) } })
    }
    if (mode === 'still') {
        if (existing && existing.components?.runtime?.visible !== false) ops.push(visibleOp(existing.id, false))
        if (still && still.components?.runtime?.visible === false) ops.push(visibleOp(still.id, true))
    } else if (mode === 'live') {
        if (existing && existing.components?.runtime?.visible === false) ops.push(visibleOp(existing.id, true))
        if (still && still.components?.runtime?.visible === false) ops.push(visibleOp(still.id, true))
    }
    if (!still) notes.push(`there is no ${pictureId(wallId)}: the room shows the dark box when the viewer switches Live wall off`)
    return { ops, notes, surfaceId: useSurface, entityId: liveId(wallId) }
}

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api <install>/serverXR')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`${project}: ${got.status}`)
    let plan
    try {
        plan = planWallLive(got.body.document, { wallId: String(args.wall || ''), surfaceId: args.surface ? String(args.surface) : '', mode: args.mode ? String(args.mode) : '' })
    } catch (e) {
        die(e.message)
    }
    for (const note of plan.notes) say(`-- ${note}`)
    if (!args.apply) {
        say(`${project}: DRY, ${plan.ops.length} ops, nothing changed (add --apply)`)
        for (const op of plan.ops) say(JSON.stringify(op))
        return
    }
    if (plan.ops.length) {
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: plan.ops.map((op, j) => ({ ...op, opId: `wall-live-${Date.now()}-${j}`, clientId: 'wall-live' })) })
        if (!out.ok) die(`writing ${project}: ${out.status} ${String(out.text || '').slice(0, 200)}`)
    }
    const back = (await client.get(`/api/projects/${project}/document`)).body.document
    const planes = (back.entities || []).filter((e) => e.id === plan.entityId)
    const surface = (back.mappingState?.surfaces || []).find((s) => s.id === plan.surfaceId)
    say(`${project}: ${plan.ops.length} ops posted; read back ${planes.length} ${plan.entityId}, surface ${surface ? `${surface.id} (${surface.source?.kind} ${surface.source?.ref})` : 'MISSING'}`)
    for (const e of planes) say(`   transform ${JSON.stringify(e.components?.transform)} primitive ${JSON.stringify(e.components?.primitive)} surface ${JSON.stringify(e.components?.surface)} animation ${JSON.stringify(e.components?.animation)} visible ${e.components?.runtime?.visible !== false}`)
    if (planes.length !== 1 || !surface) die('read back does not match')
}

if (isMainModule(import.meta.url)) {
    main().catch((e) => die(e.message))
}
