#!/usr/bin/env node
/**
 * ground-scenes.mjs — the underground scenes for the two ground-mover versions (minimal-ground,
 * full-ground): the designed looks, the cue list and the loop, as data. docs/architecture/RIG_BUILD.md §15.12
 * (the rig), §15.6 (looks, cues, the loop). docs/ai/sessions/feat-moxir-ground-scenes.md (the note).
 *
 *   node scripts/rigbuild/ground-scenes.mjs           # write the scene looks into the versions file and the two .show.json files
 *   node scripts/rigbuild/ground-scenes.mjs --check   # exit 1 when a committed file is stale
 *   node scripts/rigbuild/versions.mjs                # then regenerate the rig files from the versions file
 *
 * The owner's mood (2026-09-30): "the underground rave thing, lights like that, not the commercial shit" —
 * darkness, haze, monochrome (cold white / deep red), blinders, the DJ a silhouette, the structure revealed in
 * pieces. No rainbow, no colour chase, no butterfly, no effect as decoration.
 *
 * The scenes are NOT new schema: each is an ordinary rig look (title, intent, aims, colours, levels) and each show
 * file is the existing show shape (project, why, loop, cues[look, name, fade, hold]). What a look cannot say
 * (strobe rate, laser sign-off, hazer / spark state, colour temperature, a sweep's speed) is kept in SCENES here,
 * in the look's intent as a plain marker, and in the session note — never invented as a field.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson, REPO_ROOT } from '../place/common.mjs'
import { VERSIONS_FILE, RIGS_DIR, findVersion } from './versions.mjs'

export const GROUND_VERSIONS = ['minimal-ground', 'full-ground']
export const WHITE = '#eef3ff' // cold white — the set's white (the existing looks')
export const RED = '#ff1408' // deep red — the set's red
export const LASER_GROUP = 'laser-cut'
/** The one group that can strobe (UP-COB200, 1-25 flashes/s in its own channel list): held STEADY by a look — a look has no rate field. */
export const BLINDER_GROUP = 'cob-cut-curtain'
export const MAX_FLASHES_PER_S = 3 // photosensitivity guideline (WCAG 2.3.1 / Harding: no more than three flashes in any one second)

const GROUPS = ['cob-cut-curtain', 'par-cut-x', 'par-cut-bridge', 'par-columns-8', 'par-press-cut', 'beam380-backstage', 'beam380-columns-6', 'bsw250-ground', 'beeeye-ground', LASER_GROUP]

// A group's part in a scene: [level 0..1, colour, aim params]. Every group not named is OUT (level 0).
const on = (level, colour, aim) => ({ level, colour, ...(aim ? { aim } : {}) })
const up = (extra = {}) => ({ rule: 'vertical', in_deg: 0, ...extra })

/**
 * The scenes. `uses` = the fixture groups that are lit. `sees` = what you would see, in plain words.
 * `strobe`: the scene lights the blinder/strobe-capable COB (a hit); `laser`: it lights a laser (requiresLaserSignOff);
 * `effects`: what the scene asks of the floor effects, NOT SIMULATED anywhere in the room.
 */
export const SCENES = {
    'gs-one-shaft': {
        title: 'Blackout + one shaft',
        sees: 'Black. One thin white shaft stands straight up from behind the press into the roof, the DJ a silhouette cut out of it. Nothing else.',
        parts: { 'beam380-backstage': on(1, WHITE, up({ solo: 3 })) }
    },
    'gs-columns-below': {
        title: 'Columns from below',
        sees: 'The eight column faces glow cold white from their feet and fade to black before the roof; a low white beam at the foot of each far column. The floor is dark, the structure stands up out of it.',
        parts: { 'par-columns-8': on(0.55, WHITE, { rule: 'up-the-column' }), 'bsw250-ground': on(0.3, WHITE, up()) }
    },
    'gs-roof-reveal': {
        title: 'Roof reveal',
        sees: 'The space-frame roof appears in pieces: the beams behind the press fan open into the trusswork, then the column beams stand up beside them; a dim white graze along the crane bridge above. Still, no sweep.',
        parts: {
            'beam380-backstage': on(0.9, WHITE, { rule: 'fan', spread_deg: 14, lean_deg: 0 }),
            'beam380-columns-6': on(0.7, WHITE, up()),
            'par-cut-bridge': on(0.35, WHITE, { rule: 'bridge-underside', out: 6 })
        }
    },
    'gs-slow-fan': {
        title: 'Slow fan',
        sees: 'The column beams lean slowly in across the nave, the wall beams lean slowly out toward the side walls, the booth beams open into a wide fan up into the roof. The move is the slow crossfade in from the reveal (6 s); nothing flashes.',
        parts: {
            'beam380-backstage': on(0.8, WHITE, { rule: 'fan', spread_deg: 34, lean_deg: 3 }),
            'beam380-columns-6': on(0.7, WHITE, up({ in_deg: 24 })),
            'bsw250-ground': on(0.4, WHITE, up({ in_deg: -14 })),
            'beeeye-ground': on(0.5, WHITE, up({ in_deg: 12 }))
        }
    },
    'gs-cross-beams': {
        title: 'Cross beams',
        sees: 'Beams from both walls lean in and cross high over the dance floor, above head height, like a lattice in the haze. The booth beams stay upright and dim behind.',
        parts: {
            'beam380-columns-6': on(0.85, WHITE, up({ in_deg: 30 })),
            'bsw250-ground': on(0.5, WHITE, up({ in_deg: 24 })),
            'beeeye-ground': on(0.6, WHITE, up({ in_deg: 22 })),
            'beam380-backstage': on(0.4, WHITE, up())
        }
    },
    'gs-red-room': {
        title: 'Red room',
        sees: 'Deep red only and low: the columns and the press glow red from their feet, a dim red graze on the crane bridge, the booth beams stand still and dim. The DJ is a dark shape against the red press. The roof stays black.',
        parts: {
            'par-columns-8': on(0.5, RED, { rule: 'up-the-column' }),
            'par-press-cut': on(0.6, RED, { rule: 'backdrop', h: 0.6 }),
            'par-cut-bridge': on(0.45, RED, { rule: 'bridge-underside', out: 6 }),
            'bsw250-ground': on(0.25, RED, up()),
            'beeeye-ground': on(0.3, RED, up()),
            'beam380-backstage': on(0.4, RED, up())
        }
    },
    'gs-white-cathedral': {
        title: 'White cathedral',
        sees: 'The whole nave in cold white: every column beam straight up in mirrored pairs, the wall beams up the walls, the crane bridge grazed white from the cut above, a narrow fan behind the DJ, who stands as a silhouette against the lit press.',
        parts: {
            'beam380-columns-6': on(0.9, WHITE, up()),
            'bsw250-ground': on(0.6, WHITE, up()),
            'beeeye-ground': on(0.6, WHITE, up()),
            'par-columns-8': on(0.3, WHITE, { rule: 'up-the-column' }),
            'par-cut-bridge': on(0.6, WHITE, { rule: 'bridge-underside', out: 6 }),
            'par-press-cut': on(0.4, WHITE, { rule: 'backdrop', h: 0.6 }),
            'beam380-backstage': on(0.7, WHITE, { rule: 'fan', spread_deg: 8, lean_deg: 0 })
        }
    },
    'gs-blinder-hit': {
        title: 'Blinder hit',
        strobe: true,
        sees: 'One hard white blinder hit on the front of the floor from the cut, cut in from black and cut back to black. The COB curtain is held steady by the look; the room flashes only by the cue cutting in and out.',
        parts: { 'cob-cut-curtain': on(1, WHITE, { rule: 'vertical' }) }
    },
    'gs-laser-roof': {
        title: 'Laser into the roof',
        laser: true,
        sees: 'OPTIONAL, NOT IN THE LOOP. In the dark, red laser lines from the top of the cut into the roof frame, one dim red shaft behind the DJ. Needs a certified laser safety officer before it is ever switched on.',
        parts: {
            [LASER_GROUP]: on(0.6, RED, { rule: 'laser-into-roof', a: 18 }),
            'beam380-backstage': on(0.35, RED, up({ solo: 3 }))
        }
    },
    'gs-haze-wall': {
        title: 'Haze wall',
        effects: 'hazers on (hazer-back, hazer-hall) — NOT SIMULATED',
        sees: 'Haze rolls from behind the DJ; all seven booth beams stand straight up in a row, a wall of light in the haze behind the silhouette; the rest is dark.',
        parts: {
            'beam380-backstage': on(0.8, WHITE, up()),
            'par-press-cut': on(0.25, WHITE, { rule: 'backdrop', h: 0.6 })
        }
    },
    'gs-spark-hit': {
        title: 'Spark hit',
        effects: 'cold spark machines in the pit, one burst on the cue — NOT SIMULATED, plume height and clearance UNVALIDATED (maker manual owed)',
        sees: 'From black: the booth beams open in a narrow white fan and back-light one burst of cold sparks rising in the pit in front of the silhouette; then black. (The sparks are not drawn in the room.)',
        parts: { 'beam380-backstage': on(0.55, WHITE, { rule: 'fan', spread_deg: 10, lean_deg: 0 }) }
    }
}

/** The four simple controls of a scene deck, and the EXISTING look field each would drive (owner's scene-deck UI). */
export const CONTROLS = {
    intensity: { field: 'levels[group] (0..1 per group)', exists: true, how: 'scale every named group\'s level by one factor, clamp 0..1' },
    colour: { field: 'colours[group] (hex per group)', exists: true, how: 'swap between the set\'s two colours (cold white #eef3ff / deep red #ff1408); colour TEMPERATURE is not a field — pick a hex' },
    speed: { field: 'the cue\'s `fade` (s) into the scene; the aim rule\'s spread_deg / lean_deg / in_deg is a held frame', exists: 'partly', how: 'a look holds a pose; the sweep is the crossfade between two looks (cue fade). No per-look speed or animation field exists: owed' },
    strobe: { field: 'levels[cob-cut-curtain] (on/off only)', exists: 'partly', how: 'the blinder group\'s level; no strobe RATE field in a look (the desk hard-codes 10 Hz for a strobe-CATEGORY fixture, none is in these rigs): owed, and a rate must be capped at 3/s' }
}

const SHARED = ['gs-one-shaft', 'gs-columns-below', 'gs-roof-reveal', 'gs-slow-fan', 'gs-cross-beams', 'gs-red-room', 'gs-white-cathedral', 'gs-blinder-hit']
export const VERSION_SCENES = {
    'minimal-ground': [...SHARED, 'gs-laser-roof'],
    'full-ground': [...SHARED, 'gs-haze-wall', 'gs-spark-hit', 'gs-laser-roof']
}

// The loops (the LOOP is the holds; a fade is inside its cue's hold). Cuts where a set cuts: into the shaft and into the hit.
export const LOOPS = {
    'minimal-ground': [
        ['gs-one-shaft', 0, 10], ['gs-columns-below', 4, 10], ['gs-roof-reveal', 5, 12], ['gs-slow-fan', 6, 14],
        ['gs-cross-beams', 4, 10], ['gs-red-room', 5, 12], ['gs-white-cathedral', 3, 8], ['gs-blinder-hit', 0, 3]
    ],
    'full-ground': [
        ['gs-one-shaft', 0, 8], ['gs-columns-below', 4, 8], ['gs-haze-wall', 5, 10], ['gs-roof-reveal', 5, 10], ['gs-slow-fan', 6, 12],
        ['gs-cross-beams', 4, 8], ['gs-red-room', 5, 10], ['gs-white-cathedral', 3, 8], ['gs-blinder-hit', 0, 3], ['gs-spark-hit', 0, 4]
    ]
}

export const showFileOf = (id) => `${RIGS_DIR}/moxir-2026-10-17-${id}.show.json`
const clean = (s) => s.replace(/\s+/g, ' ').trim()

/** The intent line: what it is, with the plain markers a person reading the look sees. */
const intentOf = (s) => clean(`${s.sees}${s.strobe ? ' STROBE-CAPABLE: lights the blinder, held steady, cut by the cue; flash rate never above 3/s.' : ''}${s.laser ? ' LASER: off by default; requiresLaserSignOff: written at level 0, the laser stays dark until a human raises it after a certified laser safety officer signs off (Class 4, owed).' : ''}${s.effects ? ` EFFECT: ${s.effects}.` : ''}`).slice(0, 480)

/** A scene as a rig look. Pure. */
export const lookOf = (scene) => {
    const aims = {}
    const colours = {}
    const levels = {}
    for (const g of GROUPS) {
        const part = scene.parts[g]
        if (part?.aim) aims[g] = { ...part.aim } // a group the scene does not light keeps its resting aim (versions.mjs restAim)
        if (part?.colour) colours[g] = part.colour
        // The laser is ALWAYS written at 0 (cap review A2-1, 2026-09-30): a level in a look is sent
        // like any other group, and `requiresLaserSignOff` in the intent is only text. A laser scene
        // keeps its aim and its asked level (`laserAskedLevel`); lighting it is a human's act after a
        // certified laser safety officer signs off, not something selecting a look can do.
        levels[g] = part && g !== LASER_GROUP ? part.level : 0
    }
    return { title: scene.title, intent: intentOf(scene), aims, colours, levels }
}

/** The show file for a version. Pure. Exactly the existing shape. */
export const showOf = (id) => ({
    project: `moxir-hall-${id}`,
    why: `The underground loop for ${id} (owner 2026-09-30: "the underground rave thing, lights like that, not the commercial shit"): darkness, haze, cold white and deep red only, the DJ a silhouette, the structure revealed in pieces, one blinder hit. Movers all on the ground, so it works the roof and the walls: beams up and across above head height, columns from below. The loop is the holds: ${LOOPS[id].reduce((s, c) => s + c[2], 0)} s; a cue's fade is inside its hold. No laser cue (a laser needs a certified laser safety officer). Designed and tested, NOT seen on a screen. Scenes: scripts/rigbuild/ground-scenes.mjs.`,
    loop: true,
    cues: LOOPS[id].map(([look, fade, hold]) => ({ look, name: SCENES[look].title, fade, hold }))
})

/** The versions file with the scene looks merged in (existing looks kept; any laser in an existing look forced OFF). Pure. */
export const withScenes = (spec) => {
    const out = JSON.parse(JSON.stringify(spec))
    for (const id of GROUND_VERSIONS) {
        const v = findVersion(out, id)
        if (!v) throw new Error(`no version ${id} in the versions file`)
        for (const look of Object.values(v.looks)) look.levels = { ...look.levels, [LASER_GROUP]: 0 }
        for (const key of VERSION_SCENES[id]) v.looks[key] = lookOf(SCENES[key])
        v.looks = Object.fromEntries(Object.entries(v.looks).filter(([k]) => !k.startsWith('gs-') || VERSION_SCENES[id].includes(k)))
    }
    return out
}

const ser = (o) => `${JSON.stringify(o, null, 2)}\n`

const main = () => {
    const args = parseArgs()
    const file = path.join(REPO_ROOT, VERSIONS_FILE)
    const wanted = [[file, ser(withScenes(readJson(file)))], ...GROUND_VERSIONS.map((id) => [path.join(REPO_ROOT, showFileOf(id)), ser(showOf(id))])]
    const stale = wanted.filter(([f, text]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== text)
    if (args.check) {
        if (stale.length) die(`stale: ${stale.map(([f]) => path.relative(REPO_ROOT, f)).join(', ')} — run scripts/rigbuild/ground-scenes.mjs`)
        say('scenes current')
        return
    }
    for (const [f, text] of stale) { fs.writeFileSync(f, text); say(`wrote ${path.relative(REPO_ROOT, f)}`) }
    if (!stale.length) say('nothing to write')
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main()
