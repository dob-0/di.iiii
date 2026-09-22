// THE SOURCES ROOM, WRITTEN TO WHILE THE WALK IS HAPPENING.
//
// `<space>-sources` is the same room scripts/place/import.mjs builds at the end
// of a batch import — the footage a hall was made of, hung where a visitor can
// stand in front of it. The difference is only WHEN: here it is written a
// picture at a time, from a phone, as the person walks. Open
// /{space}/p/{space}-sources on a laptop while somebody walks the hall with a
// phone and the wall grows in front of you.
//
// Two things make that harder than it sounds.
//
// TWO PHONES. The owner asked for footage that "lands on the sources wall as it
// arrives, from ANY phone that has access", so two people can walk one hall from
// both ends. Nothing here may assume it is the only writer: the slot a picture
// hangs in is decided from the document as it is at that moment, and the
// document is re-read on every append. Keeping a local counter would put two
// pictures in one slot, and one would be invisible behind the other.
//
// THE VERSION. `POST /ops` takes a baseVersion and answers 409 with the version
// it actually has. That is not an error here — it is the normal outcome of two
// phones, and of one phone whose still landed while a walk piece was in the air.
// So every append re-reads, re-slots and tries again, a few times, and only then
// gives up and says so.
//
// Nothing invents a document field. `normalizeProjectDocument` returns a fixed
// set of keys and silently drops anything else (paid for on 2026-08-24), so
// everything this room knows — how much walk, how many stills, how wide the
// measured wall is — is carried by objects and their names.

import { createProject, getProjectDocument, listProjects, submitProjectOps, uploadProjectAsset } from '../project/services/projectsApi.js'
import {
    MEASURED_WALL_ENTITY_ID,
    measuredWallEntity,
    readMeasuredWallLabel,
    sourceWallEntity
} from './sourceWall.js'

/** `moxir` → `moxir-sources`. The same name import.mjs uses, so both fill one room. */
export const sourcesProjectId = (spaceId) => `${String(spaceId || '').trim()}-sources`

/** The phone's own objects, so a batch import's `source-N` can never collide. */
export const SCAN_ENTITY_PREFIX = 'scan-'

// A walk piece's own length, written into its name. The recorder cuts at 30 s;
// the last piece of a walk is whatever was left.
export const walkPieceName = (index, seconds) => `walk ${index} · ${Math.round(seconds)} s`
export const stillName = (index) => `still ${index}`

const WALK_SECONDS_RE = /^walk\s+\d+\s+·\s+(\d+)\s*s$/

/**
 * WHAT THIS PLACE HAS SO FAR, read out of the room itself.
 *
 * Read from the document and not from anything the page remembers, because the
 * page is a phone that will be locked, backgrounded and reopened, and because a
 * second phone's work counts too. A walk is measured in the seconds its pieces
 * say they hold — not in pieces × 30, which would call a 4-second tail half a
 * minute.
 */
export const scanProgress = (document) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    const mine = entities.filter((entity) => String(entity?.id || '').startsWith(SCAN_ENTITY_PREFIX))
    let walkSeconds = 0
    let pieces = 0
    let stills = 0
    mine.forEach((entity) => {
        if (entity.id === MEASURED_WALL_ENTITY_ID) return
        const match = WALK_SECONDS_RE.exec(String(entity.name || ''))
        if (match) {
            walkSeconds += Number(match[1]) || 0
            pieces += 1
            return
        }
        if (entity.type === 'image') stills += 1
    })
    const measured = entities.find((entity) => entity?.id === MEASURED_WALL_ENTITY_ID)
    return {
        walkSeconds,
        pieces,
        stills,
        // Every object on the wall, the label included — the slot the next one
        // hangs in is one past the last picture, and the label is not a picture.
        hung: mine.filter((entity) => entity.id !== MEASURED_WALL_ENTITY_ID).length,
        measuredMetres: measured ? readMeasuredWallLabel(measured.components?.text?.value || measured.name) : null
    }
}

// ENOUGH TO BUILD A ROOM FROM. Not a guess: frames.mjs wants 60 usable frames
// (scripts/place/frames-lib.mjs MIN_USABLE_FRAMES) and pulls video apart at
// 2 fps, so 60 seconds of walk is 120 candidate frames before anything is thrown
// out for blur or sameness — the margin the thrower-out needs. 40 stills is the
// same floor reached the other way, for a hall photographed rather than walked.
export const ENOUGH_WALK_SECONDS = 60
export const ENOUGH_STILLS = 40

/**
 * Whether the hall can be built yet, and if not, what is missing — in the words
 * a person can act on, never a bare "not ready".
 */
export const buildReadiness = (progress) => {
    const walkSeconds = Math.floor(progress?.walkSeconds || 0)
    const stills = progress?.stills || 0
    if (walkSeconds >= ENOUGH_WALK_SECONDS || stills >= ENOUGH_STILLS) {
        return { ready: true, missing: '' }
    }
    // Whichever route this walk is closer to finishing is the one to name. A
    // person who has walked for 50 seconds wants to hear "10 seconds more", not
    // "40 photographs".
    const walkShare = walkSeconds / ENOUGH_WALK_SECONDS
    const stillShare = stills / ENOUGH_STILLS
    if (stillShare > walkShare) {
        return { ready: false, missing: `${ENOUGH_STILLS - stills} more photographs` }
    }
    const seconds = ENOUGH_WALK_SECONDS - walkSeconds
    return { ready: false, missing: `${seconds} more ${seconds === 1 ? 'second' : 'seconds'} of walking` }
}

/**
 * The sources room, made if it is not there yet.
 *
 * A 409 from the create is not a failure: two phones opening the page at the
 * same moment both look, both see nothing, and both create. Whichever loses has
 * exactly what it wanted anyway.
 */
export const ensureSourcesProject = async (spaceId, { label = '' } = {}) => {
    const projectId = sourcesProjectId(spaceId)
    const existing = await listProjects(spaceId).catch(() => [])
    if (existing.some((project) => project.id === projectId)) return { projectId, created: false }
    try {
        await createProject(spaceId, {
            title: `${label || spaceId} — what it was made of`,
            slug: projectId
        })
        return { projectId, created: true }
    } catch (error) {
        if (Number(error?.status) === 409) return { projectId, created: false }
        throw error
    }
}

const RETRIES = 4

/**
 * Write ops into the room, re-slotting against the room as it actually is.
 *
 * `buildOps(progress)` is called again on every attempt, so a picture that lost
 * a race is placed in the slot after whatever won it — never on top of it.
 */
export const writeToSources = async (projectId, buildOps) => {
    let lastError = null
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
        const current = await getProjectDocument(projectId)
        const ops = buildOps(scanProgress(current?.document))
        if (!ops.length) return { version: Number(current?.version) || 0, ops: [] }
        try {
            const result = await submitProjectOps(projectId, Number(current?.version) || 0, ops)
            return { version: result?.newVersion ?? null, ops }
        } catch (error) {
            // 409 is the normal outcome of two phones, not a fault. Anything
            // else is real and must not be retried into a loop.
            if (Number(error?.status) !== 409) throw error
            lastError = error
        }
    }
    throw lastError || new Error('the room kept changing under us')
}

/**
 * One capture: the bytes up, then the picture on the wall.
 *
 * The upload happens FIRST and outside the retry loop. An asset id is the
 * sha256 of its own bytes, so uploading the same file twice is free and lands on
 * the same id — but a retry that re-uploaded would still spend a phone's uplink
 * on it, and the uplink is the scarce thing here.
 */
export const hangCapture = async (projectId, file, { name, kind = 'still' } = {}) => {
    const asset = await uploadProjectAsset(projectId, file, { filename: file?.name || name })
    const { version } = await writeToSources(projectId, (progress) => {
        const index = progress.hung
        return [
            { type: 'upsertAsset', payload: { asset } },
            {
                type: 'createEntity',
                payload: {
                    entity: sourceWallEntity(asset, index, {
                        id: `${SCAN_ENTITY_PREFIX}${index + 1}`,
                        // The name carries what kind of capture this was and how
                        // long it ran; nothing else in the document can hold it.
                        name
                    })
                }
            }
        ]
    })
    return { asset, version, kind }
}

/**
 * The measured wall. One object id, so measuring again replaces the number
 * rather than hanging a second one beside it.
 */
export const setMeasuredWall = async (projectId, metres) => {
    const entity = measuredWallEntity(metres)
    if (!entity) throw new Error('that is not a length in metres')
    return writeToSources(projectId, () => [{ type: 'createEntity', payload: { entity } }])
}

/**
 * The room the wall stands in: dark, no grid, and the visitor arriving facing
 * the footage. Written once, when the room is made — never again, so a person
 * who has since moved the arrival point keeps their change.
 */
export const dressSourcesRoom = async (projectId) => writeToSources(projectId, () => ([
    {
        type: 'setWorldState',
        payload: {
            patch: {
                backgroundColor: '#0a1118',
                gridVisible: false,
                spawn: { x: 0, z: 4.5, yaw: Math.PI, pitch: 0, altY: 1.6 }
            }
        }
    }
]))
