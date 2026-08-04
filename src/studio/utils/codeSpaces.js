import {
    ALGO_VRITHM_LABEL,
    ALGO_VRITHM_PATH,
    ALGO_VRITHM_SCENE_PATH,
    ALGO_VRITHM_SPACE_ID
} from '../../algoVrithm/algoVrithmRouting.js'

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
        blurb: 'A 30–60 second installation on hyperreality. Its scene is code, not a project document — open it to play, or open the director to retime the edit.',
        // The authoring surface for a code space. Not a Studio project editor —
        // the piece's own timeline panel, which is where its edit actually
        // gets made.
        // The SCENE path, not the space path. This pointed at ALGO_VRITHM_PATH,
        // which since the front door was split off is the landing page — a
        // page with no director on it and no way to reach one. The button has
        // been opening the wrong thing ever since the split, silently, because
        // the landing simply ignores an unknown query param.
        directorPath: `${ALGO_VRITHM_SCENE_PATH}?director`,
        directorLabel: 'Director'
    }
]

export const getCodeSpace = (spaceId) =>
    CODE_SPACES.find((space) => space.spaceId === spaceId) ?? null

export const isCodeSpace = (spaceId) => getCodeSpace(spaceId) !== null
