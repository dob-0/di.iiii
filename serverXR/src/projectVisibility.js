// Per-project visibility inside a space — the one rule every read path asks.
//
// A space's isPublic decides whether a visitor reaches the space at all
// (requireReadRole in index.js). A project's `visibility` decides, inside a
// space the visitor already reached, whether this one project is there for
// them. 'private' means: only the space's MEMBERS see it — anyone whose
// session could read the space if the space were NOT public. To everybody
// else a private project does not exist: every route answers exactly what it
// answers for a project id nobody ever created (404 "Project not found."),
// never 401/403, so a visitor cannot even learn that it is there.
//
// "Member" here is deliberately the same test requireReadRole applies to a
// private space — authenticated, at least viewer, and canAccessSpace() for
// that space (which already covers admins, unrestricted identities, sync keys
// scoped to the space, and the communal open space). There is no second
// membership list to drift from the first.
//
// docs/architecture/SPEC_project_visibility.md.

const { canAccessSpace, hasRequiredAuthRole } = require('./authAccess')

const isPrivateProjectMeta = (meta) => meta?.visibility === 'private'

// `requireAuth` false is the self-hosted, auth-off mode: every request is the
// owner there (getPublicAuthState answers admin), so everyone is a member.
const isSpaceMember = (authState, spaceId, { requireAuth = true } = {}) => {
  if (!requireAuth) return true
  const state = authState || {}
  if (!state.authenticated) return false
  if (!hasRequiredAuthRole(state.role, 'viewer')) return false
  return canAccessSpace(state, spaceId)
}

// May this caller see this one project? `meta` is a project meta row
// (projectStore rowToMeta) — it carries its own spaceId.
const canSeeProject = (authState, meta, options = {}) => {
  if (!meta) return false
  if (!isPrivateProjectMeta(meta)) return true
  return isSpaceMember(authState, meta.spaceId, options)
}

// A list of project metas from ONE space, narrowed to what this caller may
// see. The membership test runs once, not per row.
const filterVisibleProjects = (authState, spaceId, projects, options = {}) => {
  const list = Array.isArray(projects) ? projects : []
  if (!list.some(isPrivateProjectMeta)) return list
  if (isSpaceMember(authState, spaceId, options)) return list
  return list.filter((meta) => !isPrivateProjectMeta(meta))
}

// Cache-Control for a project's bytes. A private project's files must never
// be stored by a shared cache (a CDN in front of the tier would otherwise
// hand the member's copy to the next visitor who asks for the same URL).
const assetCacheControl = (meta) => (isPrivateProjectMeta(meta)
  ? 'private, no-store'
  : 'public, max-age=31536000, immutable')

const PROJECT_NOT_FOUND = Object.freeze({ error: 'Project not found.' })

module.exports = {
  PROJECT_NOT_FOUND,
  assetCacheControl,
  canSeeProject,
  filterVisibleProjects,
  isPrivateProjectMeta,
  isSpaceMember
}
