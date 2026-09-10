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
        // What the THING is called where a space lists its things. The work's
        // own label names the whole work ("WCC Exhibition"), which next to the
        // space of the same name says nothing; the page gets to be called what
        // it is. Defaults to the label, which is right for a work that IS one
        // piece rather than a page in front of one.
        title: work.codeSpace.title ?? work.label,
        path: work.path,
        // Shown on the card. Say what the thing IS, not that it is unusual.
        blurb: work.codeSpace.blurb,
        // What kind of thing the card opens, in the same two words the rest of
        // the product uses (SpaceContentsPage's KIND): a page you read, or a
        // scene you are inside. A work that does not say is a scene, which is
        // what a code space was until one of them turned out to be a page.
        kind: work.codeSpace.kind === 'code' ? 'code' : 'scene',
        // The authoring surface for a code space, inside Studio — the piece's
        // own timeline panel, under Studio's chrome, reached from the Spaces
        // list like any other editor.
        //
        // It must not point at the work's bare path: since the front door was
        // split off that is the LANDING page, a page with no director on it
        // and no way to reach one. Silent, too — the landing ignores a query
        // param it does not read, so the button did navigate, to the wrong
        // half of a route that had been split under it.
        //
        // Only a work that HAS a director gets the button. wcc does not, and a
        // button to a director that does not exist is a dead end wearing a
        // label — StudioCodeSpaceDirector renders its own "nothing here" for a
        // space with no piece descriptor, which no one should be able to reach.
        directorPath: work.director ? buildStudioDirectorPath(work.id) : null,
        directorLabel: work.director ? work.codeSpace.directorLabel : null,
        // The second half of a work that is a landing page in front of a scene:
        // the card opens the page, this goes to the place itself.
        sceneLabel: work.codeSpace.sceneLabel ?? null,
        scenePath: work.codeSpace.scenePath ?? null
    }))

export const getCodeSpace = (spaceId) =>
    CODE_SPACES.find((space) => space.spaceId === spaceId) ?? null

export const isCodeSpace = (spaceId) => getCodeSpace(spaceId) !== null
