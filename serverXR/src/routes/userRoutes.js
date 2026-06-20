const { AUTH_ROLE_LEVELS } = require('../authAccess')

function registerUserRoutes(router, {
  requireAdminAlways,
  listUsers,
  findUserById,
  setUserSpaces,
  setUserRole
}) {
  router.get('/api/users', requireAdminAlways, (req, res) => {
    const users = listUsers().map(({ id, provider, email, display_name, role, spaces, created_at, updated_at }) => ({
      id,
      provider,
      email,
      displayName: display_name,
      role,
      spaces,
      createdAt: created_at,
      updatedAt: updated_at
    }))
    res.json({ users })
  })

  router.patch('/api/users/:userId', requireAdminAlways, (req, res) => {
    const { userId } = req.params
    const existing = findUserById(userId)
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' })
    }
    const { spaces, role } = req.body || {}
    if (spaces !== undefined && spaces !== null && !Array.isArray(spaces)) {
      return res.status(400).json({ error: 'spaces must be an array of space ids, or null for unrestricted access.' })
    }
    if (role !== undefined && !Object.prototype.hasOwnProperty.call(AUTH_ROLE_LEVELS, String(role || '').trim().toLowerCase())) {
      return res.status(400).json({ error: `role must be one of: ${Object.keys(AUTH_ROLE_LEVELS).join(', ')}.` })
    }
    if (spaces !== undefined) {
      setUserSpaces(userId, spaces)
    }
    if (role !== undefined) {
      setUserRole(userId, role)
    }
    const updated = findUserById(userId)
    res.json({
      user: {
        id: updated.id,
        provider: updated.provider,
        email: updated.email,
        displayName: updated.display_name,
        role: updated.role,
        spaces: updated.spaces,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    })
  })
}

module.exports = {
  registerUserRoutes
}
