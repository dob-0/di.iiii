import {
    ALGO_VRITHM_LABEL,
    ALGO_VRITHM_PATH,
    ALGO_VRITHM_SCENE_PATH,
    ALGO_VRITHM_SPACE_ID
} from '../../algoVrithm/algoVrithmRouting.js'
import { buildStudioDirectorPath } from './studioRouting.js'

// Spaces whose scene is CODE rather than a project document.
//
// Studio lists a space's projects from the server, so a code-backed space
// looks empty — "No projects yet", with an invitation to create one, on a
// space that already contains a finished work. That reads as broken, and
// creating a project there would not help: the piece is a React route, and
// nothing the editor can open would render it.
//
// This registry is the missing half. It is client-side on purpose: adding a
// database row so the space "has a project" would make the piece dependent on
// server content a fresh clone does not have — the empty-clone trap these
// spaces exist to avoid. The code is the content; the registry just tells
// Studio that.
//
// Add a space here when its route is real and its scene lives in src/.
export const CODE_SPACES = [
    {
        spaceId: ALGO_VRITHM_SPACE_ID,
        label: ALGO_VRITHM_LABEL,
        path: ALGO_VRITHM_PATH,
        // Shown on the card. Say what the thing IS, not that it is unusual.
        blurb: 'A 30–60 second installation on hyperreality. It is built from code, not a project — open it to play, or open the director to retime the edit.',
        // The authoring surface for a code space, inside Studio — the piece's
        // own timeline panel, under Studio's chrome, reached from the Spaces
        // list like any other editor.
        //
        // It used to point at ALGO_VRITHM_PATH, which since the front door was
        // split off is the LANDING page: a page with no director on it and no
        // way to reach one. Silent, because the landing simply ignores a query
        // param it does not read, so the button did navigate — to the wrong half
        // of a route that had been split under it.
        directorPath: buildStudioDirectorPath(ALGO_VRITHM_SPACE_ID),
        directorLabel: 'Director',
        // The bare piece with no Studio around it. Still the right thing for
        // judging timing on the headset the work runs on, where a header above
        // the picture is meaningless and XR entry owns the whole window.
        scenePath: `${ALGO_VRITHM_SCENE_PATH}?director`
    }
]

export const getCodeSpace = (spaceId) =>
    CODE_SPACES.find((space) => space.spaceId === spaceId) ?? null

export const isCodeSpace = (spaceId) => getCodeSpace(spaceId) !== null
