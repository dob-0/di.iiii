// LIGHT SCENE -> LASER LOOK (2026-10-31; the owner's ask "connect the laser and light", ledger N1530, again N1587).
//
// Picking a scene on the LIGHT desk puts the look that follows it on the LASER desk, so one scene drives both. This file
// holds what is pure and what joins the two desks; the laser desk (laserDesk.js) holds the setting and the look, the
// light engine (lighting/engine.js onScene) holds the one event, and index.js joins them with linkLightToLaser.
//
// THE DATA is the laser desk's own saved show (desk.json): a switch `followLight` (default OFF: off is today's behaviour,
// nothing is read or written for a light scene) and, on a look, `follows` — the id of the light scene it follows. A look's
// `follows` is null until it has been set (the first fill below may set it), '' once a person chose "none", else a scene id.
// No production name lives here: "MUTH 05" is only data that happens to be shaped like every numbered scene.
//
// THE SAFETY (the lead's rule, 2026-10-31): the link changes the laser's LIVE LOOK and nothing else. It never arms or
// disarms a cube, never lifts a Blackout, never changes Master or BPM, never counts as a person's Go (so a cube the engine
// stopped stays stopped: stopResume "person"), and a scene with no look leaves the laser as it is. And it opens no path
// around the laser's own request guards (laserRoutes.js: requireOwnPage, the local token, requireSameMachine): the light
// desk takes a scene recall from any request it answers, the laser takes a request that makes light only from di's own
// page or with its token. So the light desk tags every recall with WHOSE HAND it is (`origin`: 'page' | 'token' | null,
// laserRoutes.js originOf, which runs the laser's own guards) and the link follows only 'page' and 'token'. A chase step
// or a recall that waited for its beat carries the origin of the request that started it; a chase that came back from the
// show file on a restart has none.
'use strict'

/** The id of a light scene as a look keeps it: no control characters, at most 80. '' when it is not a string. */
const sceneIdOf = (v) => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, '').trim().slice(0, 80) : '')

/** The origins that may drive the lasers: di's own page, or a request that carried the local token. */
const DRIVES = new Set(['page', 'token'])
const mayDrive = (origin) => DRIVES.has(origin)

/**
 * The first word and the first number of a name, lower case, the number as a number: "MUTH 05 Catacomb" and "muth 5" are
 * both "muth 5". Null when a name does not begin with a word and a number.
 */
const leadingKey = (name) => {
    const m = /^\s*(\p{L}[\p{L}\p{N}_-]*)\s+(\d+)/u.exec(String(name ?? ''))
    return m ? `${m[1].toLowerCase()} ${Number(m[2])}` : null
}

/**
 * The first fill of the links. Each look that has never been given a link (`follows` null) gets the light scene whose
 * leading word and number are its own ("MUTH 05 Catacomb" follows the scene "MUTH 05 Catacomb"; "MUTH 09 Lusabats (Dawn)"
 * follows "MUTH 09 Lusabats"). Nothing is guessed: two scenes with that key, or a scene another look already follows
 * (a person's choice always wins), leave the look unlinked; a look a person set to "none" ('') is never filled again.
 * Pure: returns [{ look, scene }] and changes nothing.
 */
const fillLinks = (looks, scenes) => {
    const taken = new Set(looks.map((l) => l.follows).filter((s) => typeof s === 'string' && s))
    const byKey = new Map()
    for (const scene of scenes) {
        const key = leadingKey(scene.name)
        if (key) byKey.set(key, [...(byKey.get(key) || []), scene])
    }
    const out = []
    for (const look of looks) {
        if (look.follows !== null && look.follows !== undefined) continue
        const key = leadingKey(look.name)
        const found = key ? byKey.get(key) : null
        if (!found || found.length !== 1 || taken.has(found[0].id)) continue
        taken.add(found[0].id)
        out.push({ look: look.id, scene: found[0].id })
    }
    return out
}

/**
 * Join the two desks: when a light scene becomes active, the laser desk follows it (laserDesk.js followScene).
 * `lighting` is registerLightingRoutes' answer (onSceneRecall), `lasers` registerLaserRoutes' (followingDesk).
 * Returns the function that unlinks.
 */
const linkLightToLaser = ({ lighting, lasers, log = null }) => lighting.onSceneRecall((scene) => {
    // FIRST, whose hand it is: nothing else is looked at, built or written for a recall that is not a hand the lasers obey.
    // The light desk did its thing; the laser stays as it is.
    if (!mayDrive(scene?.origin)) {
        log?.info?.(`[scene link] ${scene?.name ?? scene?.id}: the laser did not follow (the recall did not come from di's own page or with the local token)`)
        return
    }
    try {
        // The desk when the link can act (built, or desk.json says it is on); otherwise null and nothing is built.
        const desk = lasers.followingDesk()
        if (!desk) return
        const out = desk.followScene(scene)
        if (out.followed) log?.info?.(`[scene link] ${scene.name} -> laser look ${out.look}`)
    } catch (error) {
        log?.warn?.(`[scene link] ${scene?.name ?? scene?.id}: ${error?.message || error} (the light desk is not affected)`)
    }
})

module.exports = { sceneIdOf, leadingKey, fillLinks, mayDrive, linkLightToLaser }
