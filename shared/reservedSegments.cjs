/**
 * THE WORDS A SPACE OR PROJECT MAY NOT BE CALLED — one list, four claimants.
 *
 * A top-level URL segment can be claimed in four independent places, and until
 * this file existed nothing reconciled them:
 *
 *   1. the SPA router          src/utils/spaceRouting.js RESERVED_APP_SEGMENTS
 *   2. space creation          serverXR/src/spaceStore.js
 *   3. project creation        serverXR/src/projectStore.js
 *   4. the web server          nginx.conf + the real directories in public/
 *
 * They disagreed. `privacy`, `terms`, `tools` and `make` were reserved by the
 * router but creatable as a space, so a space could be made at an address that
 * can never open it. `wiki`, `light`, `spaces` and five more were creatable as
 * project slugs while spaceRouting.js's guard drops them, so /{space}/{slug}
 * would quietly render the bare space instead. And the static directories were
 * in no list at all.
 *
 * This is the same defect as the `wcc` tangle, generalized: one word, several
 * systems, no agreement. reservedSegments.test.js fails if they drift again.
 *
 * CJS because serverXR is CJS; the client keeps its own list (it needs the
 * constants as values) and the test asserts the two match — the same
 * mirror-plus-contract-test shape as shared/projectSchema.cjs.
 */

// Top-level app routes. Mirrors src/utils/spaceRouting.js RESERVED_APP_SEGMENTS.
const APP_SEGMENTS = [
    'admin', 'preferences', 'prefrenaces', 'preferances',
    'wiki', 'privacy', 'terms', 'tools',
    'beta', 'raw', 'seed', 'open_jam', 'studio', 'make', 'light',
    'spaces', 'projects', 'chat', 'login'
]

// Real directories under public/, plus the build's own output prefixes, served
// by nginx before the SPA ever sees the path. A space slug matching one of
// these is shadowed by files.
//
// `wcc` is deliberately NOT here: it is both a directory in public/ AND a real
// space, which is why nginx.conf carries a hand-written `location ~ ^/wcc/?$`
// block (mirrored in public/.htaccess) to send the bare path to the app. That
// exception is the cost of the collision — see src/works/works.js.
const STATIC_SEGMENTS = [
    'assets', 'basis', 'brand', 'draco', 'fonts', 'get', 'og',
    'serverXR', 'suite', 'unicode-fonts', 'vendor',
    // The studio chat's manifest and icons. Named `chat-app` and not `chat`
    // ON PURPOSE: a directory that matches the ROUTE shadows it — nginx serves
    // the directory before the SPA fallback and express.static redirects the
    // bare path to a trailing slash. See reservedSegments.test.js.
    'chat-app',
    // Android reads /.well-known/assetlinks.json to decide whether the studio
    // chat's APK may open this origin without a browser bar over it
    // (docs/deploy/STUDIO_CHAT_APK.md). A slug can never contain a dot, so no
    // space could take the word anyway — it is listed because the contract is
    // "every directory in public/ is spoken for", and an unlisted one is
    // indistinguishable from an oversight.
    '.well-known'
]

// `p` is the explicit project shape /{space}/p/{project}; it can never be a
// name on either side.
const SHAPE_SEGMENTS = ['p']

const RESERVED_SPACE_SLUGS = new Set([...APP_SEGMENTS, ...STATIC_SEGMENTS, ...SHAPE_SEGMENTS])

// Static directories do not shadow a project: they only ever match at the top
// level, and a project always lives one segment deeper.
const RESERVED_PROJECT_SLUGS = new Set([...APP_SEGMENTS, ...SHAPE_SEGMENTS])

module.exports = {
    APP_SEGMENTS,
    STATIC_SEGMENTS,
    SHAPE_SEGMENTS,
    RESERVED_SPACE_SLUGS,
    RESERVED_PROJECT_SLUGS
}
