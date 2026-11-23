// What an empty rig page offers as its next step (F038, ux slice S22): one button that
// does it, never the name of a developer script. Pure: the words, and the ops each button
// sends through the page's own op path (the project's history, the server's write check),
// so a visitor who may only look gets the links and no writes.
//
// The scripts stay (nothing is ever lost): scripts/rigbuild/looks.mjs and load-plot.mjs run
// the same code from a terminal (rigLooksFrom.js, venuePlan.js).
import { normalizeRigLooks } from '../shared/projectSchema.js'
import { lampGroups } from './looks.js'
import { rigLooksFrom, rigLooksOp } from './rigLooksFrom.js'
import { venuePlanFromHall, venueOf } from './venuePlan.js'

// The words of each empty page: what is missing, said plainly, and what the buttons do.
export const NEXT_STEP_WORDS = Object.freeze({
    looks: 'No looks in this project yet. A look says where each lamp points and its colour.',
    rental: 'No rental list in this project yet. The equipment page makes one: pick what you take.',
    positions: 'Nothing to hang lamps from yet: no truss, towers, decks or hall plan. Build them first.',
    hall: 'The hall is not drawn yet: this project has no plan of the room.',
    scenes: 'No scenes in this project yet. The cards page makes looks and puts them on the cue list.',
    firstLook: 'make a first look',
    rigFile: 'load looks from a rig file',
    hallFile: 'load the hall plan',
    equipment: 'pick the equipment',
    build: 'build it in the room',
    plot: 'build on the plot',
    cards: 'put looks on the cue list',
    readOnly: 'You can look at this project, not change it.'
})

export const FIRST_LOOK_ID = 'first-look'

/**
 * A first look for the lamps this project has: every group points at the stage centre,
 * open white. The aim is the rule the rig files use (`point`, lookRules.js), so the
 * beam is computed from the room like any other look's. Null when there is no lamp yet.
 */
export const firstLookOps = (entities, library, writtenAt = new Date().toISOString()) => {
    const { groups } = lampGroups({ entities, library })
    const keys = [...groups.keys()]
    if (!keys.length) return null
    const looks = normalizeRigLooks({
        source: 'made on the page: every lamp on the stage centre, open white',
        writtenAt,
        defaultLook: FIRST_LOOK_ID,
        looks: [{
            id: FIRST_LOOK_ID,
            title: 'first look',
            intent: 'every lamp on the stage centre, open white',
            aims: Object.fromEntries(keys.map((k) => [k, { rule: 'point' }])),
            colours: Object.fromEntries(keys.map((k) => [k, '#ffffff']))
        }]
    })
    return looks ? [rigLooksOp(entities, looks)] : null
}

/** The ops that write a rig file's looks into the project — what looks.mjs --api sends. Throws, saying why, on a file it cannot read. */
export const rigFileLooksOps = (entities, rig, fileName) => [rigLooksOp(entities, rigLooksFrom(rig, fileName))]

export const VENUE_ENTITY_ID = 'place-hall'

/**
 * The ops that put a hall plan (hall.json, scripts/place/hall.py) on the project's
 * venue: the entity that already holds a plan, else `place-hall` (load-plot.mjs's
 * default), created when missing. Throws, saying why, on a file that is not a hall.
 */
export const hallPlanOps = (entities, hall, fileName) => {
    // The hall's own name when it has one, else the file's (hall.py writes none; its `what` is a paragraph, not a name).
    const name = String(hall?.name || hall?.title || String(fileName || '').replace(/(\.hall)?\.json$/i, '')).trim()
    const plan = venuePlanFromHall(hall, { name, source: `${fileName} (loaded on the page${hall?.version ? `, hall.py v${hall.version}` : ''})` })
    const list = entities || []
    const holder = venueOf(list).entity || list.find((e) => e?.id === VENUE_ENTITY_ID)
    if (holder) return [{ type: 'updateComponent', payload: { entityId: holder.id, component: 'venuePlan', patch: plan } }]
    return [{ type: 'createEntity', payload: { entity: { id: VENUE_ENTITY_ID, type: 'group', name: name || 'the hall', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, venuePlan: plan } } } }]
}
