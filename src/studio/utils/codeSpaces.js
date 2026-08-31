import { WORKS } from '../../works/works.js'
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
// Add a work to src/works/works.js, not here.
// Derived from the works registry rather than restated here: a code space IS
// a work whose scene is code, and two lists of the same works drift. The
// Studio-shaped fields (the blurb, the director's label) live on the work's
// `codeSpace` block; the rest is the work's own identity.
export const CODE_SPACES = WORKS
    .filter((work) => work.codeSpace)
    .map((work) => ({
        spaceId: work.id,
        label: work.label,
        path: work.path,
        // Shown on the card. Say what the thing IS, not that it is unusual.
        blurb: work.codeSpace.blurb,
        // The authoring surface for a code space, inside Studio — the piece's
        // own timeline panel, under Studio's chrome, reached from the Spaces
        // list like any other editor.
        //
        // It must not point at the work's bare path: since the front door was
        // split off that is the LANDING page, a page with no director on it
        // and no way to reach one. Silent, too — the landing ignores a query
        // param it does not read, so the button did navigate, to the wrong
        // half of a route that had been split under it.
        directorPath: buildStudioDirectorPath(work.id),
        directorLabel: work.codeSpace.directorLabel,
        scenePath: work.codeSpace.scenePath
    }))

export const getCodeSpace = (spaceId) =>
    CODE_SPACES.find((space) => space.spaceId === spaceId) ?? null

export const isCodeSpace = (spaceId) => getCodeSpace(spaceId) !== null
