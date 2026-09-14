import { createBasePathHelpers, joinPath } from './laneBasePath.js'
import { OPEN_JAM_ALIAS_SEGMENT, OPEN_JAM_PROJECT_ID, OPEN_JAM_SPACE_ID } from '../../studio/utils/studioRouting.js'
import { isPreviewRequest } from '../../utils/previewMode.js'

// The jam surface's address.
//
// `/open_jam` is untouched: it still opens the full editor, which is the thing
// a laptop at the same event wants and the only place the jam's project can be
// taken apart. This is its sibling — `/open_jam/scene`, the same jam as a place
// you stand in rather than a document you edit.
//
// A SUB-PATH of the alias, deliberately, rather than a new top-level word.
// `open_jam` is already reserved everywhere a segment has to be reserved
// (RESERVED_APP_SEGMENTS here, RESERVED_SPACE_SLUGS and PROJECT_RESERVED_SLUGS
// on the server), so nothing new has to be checked against live data and no
// space or project can ever shadow this. Minting a fresh top-level `/jam` would
// have needed exactly that check, on tiers this branch is not allowed to touch.
//
// `scene` is the sanctioned word for the 3D place you can be inside
// (docs/ai/vocabulary.md), and `/wcc/scene` already means the same thing one
// level down: the bare segment is the way in, `/scene` is the place itself.
export const JAM_SCENE_SEGMENT = 'scene'

export const JAM_SPACE_ID = OPEN_JAM_SPACE_ID
export const JAM_PROJECT_ID = OPEN_JAM_PROJECT_ID

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildJamScenePath = () => joinPath(getBasePrefix(), OPEN_JAM_ALIAS_SEGMENT, JAM_SCENE_SEGMENT)

// The way out — the full editor, at the address it has always had. A phone has
// never been offered this link, and the "All tools" escape inside Studio lives
// behind the desktop-only control cluster, so on the device the QR code targets
// there has been no route to the complete toolset at all.
export const buildJamEditorPath = () => joinPath(
    getBasePrefix(),
    OPEN_JAM_SPACE_ID,
    'studio',
    'projects',
    OPEN_JAM_PROJECT_ID
)

/**
 * Does this location want the jam surface?
 *
 * Two shapes, not one. `/open_jam/scene` is the alias this file always
 * answered at. `/open` bare is the OTHER address the same room is handed out
 * on — the front page's own QR/link, the space card's "Live" button, the one
 * a stranger is actually given — and until now it fell through to the
 * generic published-space viewer instead: same document, a read-only Walk/Fly
 * shell with no presence and no way to add anything. Two components drawing
 * one room was the bug (see the "/open" row in
 * docs/ai/known-fixes.md); an address that resolves to a
 * different EXPERIENCE than its sibling is not a routing nuance, it is the
 * same room lying about itself.
 *
 * `?preview=1` is carved out of the bare match on purpose: that query is the
 * space card's own thumbnail embed (SpaceHub.jsx's SpaceCardPreview), which
 * wants the static published view scaled into a card — not a live multiplayer
 * surface with open presence sockets rendered a hundred pixels wide. The
 * card's "make it live" button re-embeds the SAME `/open` with no `?preview`,
 * which now correctly gets the real jam.
 *
 * Anything else under `/open` — `/open/studio`, `/open/projects`,
 * `/open/preferences`, another project's slug — is untouched: only the bare
 * space address and the alias name the jam.
 */
export const getJamLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) return { isJam: false }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    const isAlias = segments.length === 2
        && segments[0] === OPEN_JAM_ALIAS_SEGMENT
        && segments[1] === JAM_SCENE_SEGMENT
    const isBareSpace = segments.length === 1
        && segments[0] === OPEN_JAM_SPACE_ID
        && !isPreviewRequest(resolvedLocation.search)

    if (!isAlias && !isBareSpace) return { isJam: false }

    return {
        isJam: true,
        spaceId: OPEN_JAM_SPACE_ID,
        projectId: OPEN_JAM_PROJECT_ID
    }
}

export const isJamLocation = (locationState = null) => Boolean(locationState?.isJam)
