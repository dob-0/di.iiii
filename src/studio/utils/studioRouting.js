import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'
import { RESERVED_APP_SEGMENTS } from '../../utils/spaceRouting.js'

export const STUDIO_PAGE_SPACES = 'spaces'
export const STUDIO_PAGE_HUB = 'hub'
export const STUDIO_PAGE_PROJECT = 'project'

// The authoring surface for a CODE space. Studio's editor opens a project
// document, and a code space has none — its scene is React, and the thing that
// authors it is the piece's own panel. So `/<space>/studio/director` is a
// Studio page that mounts that panel instead of the document editor.
//
// Under `/studio` deliberately, not beside the piece: it inherits the same
// ProtectedSurface gate every other Studio route has, which is the correct one
// for an authoring tool. The piece's own `?director` route stays as it is, for
// judging timing on the headset the work actually runs on.
export const STUDIO_PAGE_DIRECTOR = 'director'
export const STUDIO_RESERVED_SEGMENT = 'studio'
export const DEFAULT_STUDIO_SPACE_ID = 'main'

// The layered addresses, added 2026-08-21.
//
// A space's projects belong to the SPACE, not to whichever tool you happen to be
// holding — and the list of your spaces belongs to the root. Filing either under a
// tool's name is what made "back to projects" land on /{space}/raw/projects, a
// space's own list wearing the node editor's address.
//
// These are CANONICAL, not aliases: they stay in the bar rather than healing to the
// tool-named form, because the address is the part that was wrong. Every existing
// shape — /{space}/studio, /{space}/raw/projects, /studio — keeps working forever.
export const SPACES_SEGMENT = 'spaces'
export const PROJECTS_SEGMENT = 'projects'

// An address ENDING in `projects` means "show me the list", and that has to be
// distinguishable from `/{space}/studio`, which is a DOOR — the open space
// forwards it straight into the shared jam so "step inside" lands in 3D
// (StudioHub). Both used to parse to the identical hub state, so the door
// swallowed the list: `/open/projects`, the canonical tool-free address whose
// whole purpose is the list, opened the jam document instead, and the only way
// to the list was a `?browse=1` nobody knows about. The door was written before
// these addresses existed and followed them in by accident.
//
// So: the door is `/{space}` and the bare `/{space}/studio`. Anything that says
// `projects` lists projects.
export const WANTS_PROJECT_LIST = 'wantsProjectList'

// Friendly short entry for the communal jam. `/open_jam` is a QR-/flyer-sized
// alias for the full `/open/studio/projects/open-jam` path; it resolves to the
// same editor state without a redirect, so the short URL stays in the bar.
// Kept in sync with the server's OPEN_SPACE_ID ('open') + OPEN_JAM_PROJECT_ID.
export const OPEN_JAM_ALIAS_SEGMENT = 'open_jam'
export const OPEN_JAM_SPACE_ID = 'open'
export const OPEN_JAM_PROJECT_ID = 'open-jam'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildStudioSpacesPath = () => {
    const prefix = getBasePrefix()
    return joinPath(prefix, STUDIO_RESERVED_SEGMENT)
}

// The address of a space's projects. Prefer this over buildStudioHubPath for any
// control whose label says "Projects" — it names the level it goes to.
export const buildSpaceProjectsPath = (spaceId) => {
    const prefix = getBasePrefix()
    if (!spaceId) return joinPath(prefix, SPACES_SEGMENT)
    return joinPath(prefix, spaceId, PROJECTS_SEGMENT)
}

// The address of your spaces. buildStudioSpacesPath ('/studio') stays as the
// legacy form and keeps working.
export const buildSpacesPath = () => joinPath(getBasePrefix(), SPACES_SEGMENT)

export const buildStudioHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        // spaceId is falsy in this branch, so `spaceId || DEFAULT_STUDIO_SPACE_ID`
        // always resolves to DEFAULT_STUDIO_SPACE_ID — preserved as-is from the
        // pre-extraction code rather than "fixed" here (out of scope for this pass).
        return joinPath(prefix, spaceId || DEFAULT_STUDIO_SPACE_ID, STUDIO_RESERVED_SEGMENT)
    }
    return joinPath(prefix, spaceId, STUDIO_RESERVED_SEGMENT)
}

export const buildStudioDirectorPath = (spaceId) =>
    joinPath(getBasePrefix(), spaceId, STUDIO_RESERVED_SEGMENT, STUDIO_PAGE_DIRECTOR)

// A project's address. Tool-free once the space is known — see the
// `/{space}/projects/{id}` branch in the parser for why.
//
// Without a space there is nothing to put in front, so the space-less form keeps
// its tool name. That branch also deliberately leaves `spaceId` null on parse so
// StudioEditor falls back to the project's own `document.projectMeta.spaceId`
// rather than being forced onto `main` — do not "tidy" it into `/projects/{id}`
// without solving that first.
export const buildStudioProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, STUDIO_RESERVED_SEGMENT, PROJECTS_SEGMENT, projectId)
    }
    return joinPath(prefix, spaceId, PROJECTS_SEGMENT, projectId)
}

// The tool-named form this replaced. Nothing emits it any more; it is kept so the
// parser and the heal can both name it, and so a test can prove it still works.
export const buildLegacyStudioProjectPath = (projectId, spaceId) =>
    joinPath(getBasePrefix(), spaceId, STUDIO_RESERVED_SEGMENT, PROJECTS_SEGMENT, projectId)

export const getStudioLocationState = (
    locationLike = null,
    { defaultSpaceId = DEFAULT_STUDIO_SPACE_ID } = {}
) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isStudio: false, page: null, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    // Short public alias: `/open_jam` -> the communal open-jam project editor.
    if (segments.length === 1 && segments[0] === OPEN_JAM_ALIAS_SEGMENT) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: OPEN_JAM_PROJECT_ID,
            spaceId: OPEN_JAM_SPACE_ID
        }
    }

    // The layered addresses, checked before the tool-named ones so they are never
    // mistaken for a space called "spaces" or a project called "projects". Both
    // words are reserved (RESERVED_APP_SEGMENTS here, RESERVED_SPACE_SLUGS and
    // PROJECT_RESERVED_SLUGS on the server), and neither was in use on any tier
    // when they were reserved — checked against production and staging first.
    if (segments[0] === SPACES_SEGMENT && segments.length === 1) {
        return { isStudio: true, page: STUDIO_PAGE_SPACES, projectId: null, spaceId: null }
    }

    // …and the first segment has to be a space, not a tool. Without this guard
    // `/raw/projects` parses as the hub of a space called "raw" — a space that
    // can never exist, because the word is reserved — so the lane's own
    // space-less form ("/raw/projects means the default space") was unreachable
    // and both it and `/studio/projects` rendered "Nothing lives at raw". Both
    // are documented addresses in the wiki.
    if (
        segments[0]
        && !RESERVED_APP_SEGMENTS.includes(segments[0])
        && segments[1] === PROJECTS_SEGMENT
        && segments.length === 2
    ) {
        return { isStudio: true, page: STUDIO_PAGE_HUB, projectId: null, spaceId: segments[0], wantsProjectList: true }
    }

    // `/{space}/projects/{id}` — THE address of a project.
    //
    // The list got its tool-free address in the 2026-08-21 pass and the item did
    // not, so a project's own address stayed tool-first
    // (`/{space}/studio/projects/{id}`) — you could not say where a project WAS
    // without naming which editor you happened to be holding. That is the shape
    // the arrangements work made obsolete: the tool is an arrangement now, and a
    // project is a project.
    //
    // It opens Studio, per MANIFESTO §6 — Studio is the shipped lane and an
    // experimental one must not become the default for a canonical address. The
    // node editor keeps its own `/{space}/raw/projects/{id}`, which is correct
    // rather than messy: a lane that is explicitly experimental owns a
    // lane-named address. `/{space}/{project}/raw` still gets you there in one
    // hop.
    if (
        segments[0]
        && !RESERVED_APP_SEGMENTS.includes(segments[0])
        && segments[1] === PROJECTS_SEGMENT
        && segments[2]
        && segments.length === 3
    ) {
        return { isStudio: true, page: STUDIO_PAGE_PROJECT, projectId: segments[2], spaceId: segments[0] }
    }

    // `/studio/projects` is Studio's own space-less form: the default space's
    // project list, the sibling of `/raw/projects`.
    if (segments[0] === STUDIO_RESERVED_SEGMENT && segments[1] === PROJECTS_SEGMENT && segments.length === 2) {
        return { isStudio: true, page: STUDIO_PAGE_HUB, projectId: null, spaceId: DEFAULT_STUDIO_SPACE_ID, wantsProjectList: true }
    }

    if (segments[0] !== STUDIO_RESERVED_SEGMENT) {
        if (segments[1] !== STUDIO_RESERVED_SEGMENT || !segments[0]) {
            return { isStudio: false, page: null, projectId: null, spaceId: null }
        }

        // `/{space}/studio/projects/{id}` — the tool-named form. Nothing emits it
        // any more; it stays parseable forever (bookmarks, pasted links, the
        // wiki) and heals the bar to `/{space}/projects/{id}`. The `/open_jam`
        // alias does NOT reach this branch — it resolves earlier and stays short
        // in the bar on purpose.
        if (segments[2] === PROJECTS_SEGMENT && segments[3]) {
            return {
                isStudio: true,
                legacyProjectAddress: true,
                page: STUDIO_PAGE_PROJECT,
                projectId: segments[3],
                spaceId: segments[0]
            }
        }

        // `/{space}/studio/projects` with nothing after it is the list, the same
        // as `/{space}/projects`. Only the bare `/{space}/studio` is the door.
        if (segments[2] === PROJECTS_SEGMENT) {
            return {
                isStudio: true,
                page: STUDIO_PAGE_HUB,
                projectId: null,
                spaceId: segments[0],
                wantsProjectList: true
            }
        }

        if (segments[2] === STUDIO_PAGE_DIRECTOR && !segments[3]) {
            return {
                isStudio: true,
                page: STUDIO_PAGE_DIRECTOR,
                projectId: null,
                spaceId: segments[0]
            }
        }

        return {
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: segments[0]
        }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: segments[2],
            // No space segment in the URL — leave spaceId unset so StudioEditor
            // falls back to the project's own document.projectMeta.spaceId
            // instead of being forced onto 'main' (was the wrong-space bug).
            spaceId: null
        }
    }

    if (segments.length === 1) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_SPACES,
            projectId: null,
            // Two addresses, one page: `/studio` and `/spaces` render the same
            // spaces grid, and nothing in the product emits `/studio` any more
            // (every caller already builds `/spaces`). It stays working forever —
            // it is bookmarked and typed — but the bar heals to the canonical
            // one, the same treatment the tool doorways get, so the duplicate
            // stops travelling.
            legacySpacesAddress: true,
            spaceId: null
        }
    }

    return {
        isStudio: true,
        page: STUDIO_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId,
        isDefaultSpace: true
    }
}

export const isStudioLocation = (locationState = null) => Boolean(locationState?.isStudio)

export { appNavigate as navigateToStudioPath } from '../../utils/appNavigate.js'
