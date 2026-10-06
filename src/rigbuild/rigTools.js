import { buildAppSpacePath } from '../utils/spaceRouting.js'
import { lightingDeskPath } from '../map/lightingLink.js'
import { buildEquipmentPath } from './equipmentRouting.js'
import { buildBuildPath, buildCrewPath } from './buildRouting.js'
import { buildPlotPath } from './plotRouting.js'
import { buildCardsPath } from './cardsRouting.js'
import { buildPatchSheetPath } from './patchRouting.js'
import { buildVisualisePath } from './visualiseRouting.js'
import { buildScenesPath } from './scenesRouting.js'

// THE RIG, STEP BY STEP — one list, read by every door to the rig tools: the steps row
// on each rig page (RigSteps.jsx), the room's own row on /{space}, the Studio's Rig
// link, the Kit's card and the desk's way back (serverXR/src/lighting/ui/from.js
// mirrors the keys and words; lightingLink.test.js holds the two together).
//
// Owner, 2026-09-28: "look to UI/UX fix tha gaps that we can easy go from one place to
// other i mean cards tools lights and so on" and "also make buttons in space that we
// can easy move in the workflow". So the tools are laid out in the order a show is
// made (docs/architecture/RIG_BUILD.md §14, the workflow), numbered, and each page
// has the one before and the one after beside them.
//
// Words are the theatre's, not the code's: a lighting designer knows a "plot" (USITT
// RP-2 calls the drawing the light plot) and a "patch sheet", and the crew link is the
// page you send the crew. The address segment of every step equals its key, which the
// desk's from.js relies on.

export const RIG_STEPS = Object.freeze([
    { key: 'equipment', n: 1, label: 'equipment', short: 'pick what we take', hint: 'pick what we take — the rental list, each item’s card, the order' },
    { key: 'build', n: 2, label: 'build', short: 'place it in the room', hint: 'place it in the room, first person: B builds, E opens the inventory' },
    { key: 'plot', n: 3, label: 'plot', short: 'check it from above, print', hint: 'check it from above, the drawing; print sheet 1' },
    { key: 'cards', n: 4, label: 'cards & looks', short: 'positions, looks, GO', hint: 'positions, looks on the cue list, GO' },
    { key: 'patch', n: 5, label: 'patch sheet', short: 'addresses and power', hint: 'the addresses the crew plugs by, and the power' },
    { key: 'crew', n: 6, label: 'crew link', short: 'hand it to the crew', hint: 'the room for the crew, read only — the link to send them' }
])

// Before the steps, the room as a visitor sees it; after them, the desk that runs it.
export const RIG_ROOM = Object.freeze({ key: 'room', label: 'room', short: 'as a visitor sees it', hint: 'the room as a visitor sees it' })
export const RIG_LIGHT = Object.freeze({ key: 'light', label: 'light desk', short: 'run the show', hint: 'run the show: patch, looks, faders — on this machine' })
// And the two together: the desk beside the room it drives (RIG_BUILD.md §18).
export const RIG_VISUALISE = Object.freeze({ key: 'visualise', label: 'visualiser', short: 'desk + room, live', hint: 'the desk and the room side by side — move a fader, watch the lamps' })
// And the scenes of the show: A the deck, B the loop as a timeline, one scene list (RIG_BUILD.md §22).
// Not a numbered step (the desk's from.js mirrors the six), so it sits at the end of the row.
export const RIG_SCENES = Object.freeze({ key: 'scenes', label: 'scenes', short: 'deck + timeline', hint: 'the scenes of the show: tiles, four controls, the loop as a timeline, sync by file' })

export const RIG_STEP_KEYS = RIG_STEPS.map((s) => s.key)
export const isRigStep = (key) => RIG_STEP_KEYS.includes(key)

// Where each one lives. Every address from the routing helpers, never written by hand.
export const rigStepPath = (key, spaceId, projectId, { isLocalInstall = true, label = null } = {}) => {
    if (!spaceId) return null
    switch (key) {
        case 'room': return buildAppSpacePath(spaceId)
        case 'equipment': return buildEquipmentPath(spaceId, projectId)
        case 'build': return buildBuildPath(spaceId, projectId)
        case 'plot': return buildPlotPath(spaceId, projectId)
        case 'cards': return buildCardsPath(spaceId, projectId)
        case 'patch': return buildPatchSheetPath(spaceId, projectId)
        case 'crew': return buildCrewPath(spaceId, projectId)
        case 'light': return rigLightPath({ spaceId, projectId, label, isLocalInstall })
        case 'visualise': return buildVisualisePath(spaceId, projectId)
        case 'scenes': return buildScenesPath(spaceId, projectId)
        default: return null
    }
}

// The desk lives only on a di.iiii on your own machine; a hosted tier gets the app's
// own page that says so (the same rule as SurfaceBar's Light). Opened from a rig page
// the desk is told which one (&from=), so its way back leads to that page and not to
// the Studio (from.js).
export const rigLightPath = ({ spaceId, projectId, label = null, from = null, isLocalInstall = true }) => {
    if (!isLocalInstall) return '/light'
    const path = lightingDeskPath({ spaceId, projectId, label })
    if (!from || !isRigStep(from) || !path.includes('?')) return path
    return `${path}&from=${encodeURIComponent(from)}`
}

/**
 * The row, in order: room, the six steps, the light desk — each with its address.
 * `here` is the step (or 'room') the person stands on.
 */
export const rigRow = ({ spaceId, projectId, projectLabel = null, here = null, isLocalInstall = true }) => {
    if (!spaceId || !projectId) return []
    const hrefOf = (key) => (key === 'light'
        ? rigLightPath({ spaceId, projectId, label: projectLabel, from: isRigStep(here) ? here : null, isLocalInstall })
        : rigStepPath(key, spaceId, projectId, { isLocalInstall }))
    return [RIG_ROOM, ...RIG_STEPS, RIG_LIGHT, RIG_VISUALISE, RIG_SCENES].map((s) => ({
        ...s,
        href: hrefOf(s.key),
        here: s.key === here,
        // Hosted, the desk's page is the app's own: move there without a page load.
        clientSide: s.key === 'light' && !isLocalInstall
    }))
}

/**
 * The step before and the step after. The first step's "before" is the room; the last
 * step's "after" is the desk. From the room (or anywhere that is not a step), "next" is
 * the step the show is waiting on (`suggested`, from rigProgress), else the first.
 */
export const rigNeighbours = (here, suggested = null) => {
    // The two pages at the end of the row (not numbered steps) lead on from the desk: the
    // visualiser after it, the scenes after the visualiser, and the row ends there.
    if (here === RIG_VISUALISE.key) return { back: RIG_LIGHT, next: RIG_SCENES }
    if (here === RIG_SCENES.key) return { back: RIG_VISUALISE, next: null }
    const i = RIG_STEP_KEYS.indexOf(here)
    if (i < 0) {
        const next = RIG_STEPS.find((s) => s.key === suggested) || RIG_STEPS[0]
        return { back: null, next }
    }
    return {
        back: i === 0 ? RIG_ROOM : RIG_STEPS[i - 1],
        next: i === RIG_STEPS.length - 1 ? RIG_LIGHT : RIG_STEPS[i + 1]
    }
}

// Which step the Studio's and the room's "Rig" door opens when nothing else says.
export const rigEntryPath = (spaceId, projectId, key = 'equipment') => rigStepPath(key, spaceId, projectId)
