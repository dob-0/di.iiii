// Resolves the shared `:spaceId` route param once, for every space-scoped
// route mounted on the same router (spaceRoutes, projectRoutes, syncRoutes,
// inscriptionRoutes all match `:spaceId` on the top-level `router` in
// index.js). A space's `slug` is a second, independently renameable address
// for the same row — see docs/architecture/SPEC_space_urls_and_portability.md
// — but every route already treats req.params.spaceId as the real id, so
// resolving the segment here, once, is smaller than teaching each route file
// about slugs individually.
//
// An id always wins: a real id short-circuits before any slug lookup runs,
// so a slug can never shadow another space's id.
function createSpaceIdParam({ normalizeSpaceId, spaceExists, findSpaceBySlug }) {
  return async function resolveSpaceIdParam(req, res, next, value) {
    try {
      const normalized = normalizeSpaceId(value)
      if (!normalized) return next()
      if (await spaceExists(normalized)) {
        req.params.spaceId = normalized
        return next()
      }
      const bySlug = await findSpaceBySlug(normalized)
      req.params.spaceId = bySlug ? bySlug.id : normalized
      next()
    } catch (error) {
      next(error)
    }
  }
}

module.exports = { createSpaceIdParam }
