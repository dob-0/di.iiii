const { AUTH_ROLE_LEVELS } = require('../authAccess')

function registerUserRoutes(router, {
  requireAdminAlways,
  listUsers,
  findUserById,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole
}) {
  const serializeUser = (user) => ({
    id: user.id,
    provider: user.provider,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    spaces: user.spaces,
    isUnrestricted: Boolean(user.isUnrestricted),
    createdAt: user.created_at,
    updatedAt: user.updated_at
  })

  router.get('/api/users', requireAdminAlways, (req, res) => {
    res.json({ users: listUsers().map(serializeUser) })
  })

  router.patch('/api/users/:userId', requireAdminAlways, (req, res) => {
    const { userId } = req.params
    const existing = findUserById(userId)
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' })
    }
    const { spaces, role, isUnrestricted } = req.body || {}
    if (spaces !== undefined && !Array.isArray(spaces)) {
      return res.status(400).json({ error: 'spaces must be an array of space ids. Use isUnrestricted:true for access to every space.' })
    }
    if (role !== undefined && !Object.prototype.hasOwnProperty.call(AUTH_ROLE_LEVELS, String(role || '').trim().toLowerCase())) {
      return res.status(400).json({ error: `role must be one of: ${Object.keys(AUTH_ROLE_LEVELS).join(', ')}.` })
    }
    if (isUnrestricted !== undefined && typeof isUnrestricted !== 'boolean') {
      return res.status(400).json({ error: 'isUnrestricted must be a boolean.' })
    }
    if (spaces !== undefined) {
      setUserSpaces(userId, spaces)
    }
    if (isUnrestricted !== undefined) {
      setUserUnrestricted(userId, isUnrestricted)
    }
    if (role !== undefined) {
      setUserRole(userId, role)
    }
    res.json({ user: serializeUser(findUserById(userId)) })
  })
}

module.exports = {
  registerUserRoutes
}
