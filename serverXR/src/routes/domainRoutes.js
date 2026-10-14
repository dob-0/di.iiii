// A space on its own domain — the routes. Spec: docs/architecture/SPEC_space_own_domain.md.
//
// Three audiences:
//   - anyone's browser, at boot on any host: GET /api/host answers "which space
//     does this host show?" It is public and holds nothing private: only an
//     ACTIVE domain of a PUBLIC space ever answers with a space.
//   - Caddy, before it asks Let's Encrypt for a certificate (on-demand TLS):
//     GET /api/domain-check?domain=<host> answers 200 only for a domain we
//     serve. https://caddyserver.com/docs/caddyfile/options#on-demand-tls
//   - the space's owner (or an admin), in the space's settings: list, add,
//     check and remove the space's domains. Same guard as every other space
//     setting, so control sits with the owner's account.

const registerDomainRoutes = (router, {
  domains,                       // createDomainService(...)
  findActiveSpaceIdForHost,      // domainStore.findActiveSpaceIdForHost
  loadSpaceMeta,
  normalizeSpaceId,
  requireSpaceOwnerOrAdminWrite,
  platformOrigin,
  config
}) => {
  const hostOf = (req) => String(req.hostname || '').toLowerCase()

  router.get('/api/host', async (req, res, next) => {
    try {
      const hostname = hostOf(req)
      const spaceId = findActiveSpaceIdForHost(hostname)
      const meta = spaceId ? await loadSpaceMeta(spaceId) : null
      // Short cache: a domain switched on or off shows within a minute, and a
      // page load on a busy domain does not cost a database read every time.
      res.set('Cache-Control', 'public, max-age=60')
      if (!meta || !meta.isPublic) return res.json({ hostname, space: null, platformOrigin })
      res.json({
        hostname,
        space: { id: meta.id, slug: meta.slug || null, label: meta.label || meta.id },
        platformOrigin
      })
    } catch (error) {
      next(error)
    }
  })

  // Caddy's `ask` endpoint. Caddy reads only the status: 200 means "get a
  // certificate for this name", anything else means "refuse the handshake".
  // The same rule as /api/host, so a name gets a certificate exactly when it
  // would show a space. One indexed read (the hostname is the table's key)
  // and a space lookup only for a live domain, so a stranger aiming random
  // names at us costs next to nothing and gets nothing issued.
  router.get('/api/domain-check', async (req, res, next) => {
    try {
      const asked = typeof req.query.domain === 'string' ? req.query.domain : ''
      const spaceId = findActiveSpaceIdForHost(asked)
      const meta = spaceId ? await loadSpaceMeta(spaceId) : null
      res.set('Cache-Control', 'no-store')
      if (!meta || !meta.isPublic) return res.status(404).json({ domain: asked, serve: false })
      res.json({ domain: asked, serve: true })
    } catch (error) {
      next(error)
    }
  })

  const spaceIdOf = (req) => normalizeSpaceId(req.params.spaceId) || req.params.spaceId
  const send = (res, result, okStatus = 200) => (result.error
    ? res.status(result.status || 400).json({ error: result.error, message: result.message })
    : res.status(okStatus).json(result))

  router.get('/api/spaces/:spaceId/domains', requireSpaceOwnerOrAdminWrite, (req, res) => {
    res.json({ domains: domains.list(spaceIdOf(req)), connected: domains.connected, provider: domains.provider || null })
  })

  router.post('/api/spaces/:spaceId/domains', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      const spaceMeta = req.spaceMeta || await loadSpaceMeta(spaceIdOf(req))
      if (!spaceMeta) return res.status(404).json({ error: 'not_found', message: 'Space not found.' })
      const result = await domains.add({
        spaceMeta,
        hostname: req.body?.hostname,
        addedBy: req.authState?.subject || null
      })
      send(res, result, 201)
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/spaces/:spaceId/domains/:hostname/check', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      // Saying a domain is live by hand is only for a platform with no
      // provider (Cloudflare or Caddy), and only for an admin.
      const wanted = req.body?.state
      if (wanted !== undefined) {
        const isAdmin = !config.requireAuth || req.authState?.role === 'admin'
        if (!isAdmin) return res.status(403).json({ error: 'admin_only', message: 'Only an admin can mark a domain live by hand.' })
        if (domains.connected) {
          const who = domains.provider === 'caddy' ? 'Its DNS decides' : 'Cloudflare decides'
          return res.status(409).json({ error: 'managed', message: `${who} when this domain is live; use check instead.` })
        }
      }
      send(res, await domains.check({ spaceId: spaceIdOf(req), hostname: req.params.hostname, setState: wanted || null }))
    } catch (error) {
      next(error)
    }
  })

  router.delete('/api/spaces/:spaceId/domains/:hostname', requireSpaceOwnerOrAdminWrite, async (req, res, next) => {
    try {
      send(res, await domains.remove({ spaceId: spaceIdOf(req), hostname: req.params.hostname }))
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerDomainRoutes }
