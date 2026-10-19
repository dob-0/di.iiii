import { buildPublicProjectPath, buildVanityProjectPath } from '../../utils/spaceRouting.js'

// The address of this project's VIEW page: the public room as visitors see it. The Studio's Preview
// button opens it in a new tab (owner 2026-10-13: "from studio I can't find the button to go to the
// preview" — "View live" only shows on the space's live project and opens the SPACE, so a project
// being edited had no way across).
//
// Same order every other link in the product uses (SpaceContentsPage contentsHref, ProjectSwitcher
// copyProjectLink): the pretty address /{space}/{slug} when the project has a public handle, the
// permanent /{space}/p/{id} when it has none or the handle is not known yet — never a link that cannot
// resolve. The slug is not on the Studio's document (projectMeta is { id, spaceId, title, … }); it is on
// the project record (GET /api/projects/:id), so the caller passes what it has.
export function buildStudioPreviewPath({ spaceSlug = '', spaceId = '', projectSlug = '', projectId = '' } = {}) {
    if (projectSlug && (spaceSlug || spaceId)) {
        return buildVanityProjectPath(spaceSlug || spaceId, projectSlug)
    }
    if (projectId && (spaceId || spaceSlug)) {
        return buildPublicProjectPath(spaceId || spaceSlug, projectId)
    }
    return null
}

// The same, absolute, with ?render=show, on the origin the Studio itself runs on — a local install stays local
// (diiii.localhost), a dev tree stays on its tree, dev stays on dev. Null when nothing is known yet.
export function buildStudioPreviewUrl({ origin, ...ids } = {}) {
    const path = buildStudioPreviewPath(ids)
    if (!path) return null
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
    // Preview = the Show render (src/shared/renderPlan.js, decision 2026-10-15-studio-tech-show-render.md): the room as the
    // audience sees it, even in a tab that chose Tech before
    return `${base}${path}?render=show`
}
