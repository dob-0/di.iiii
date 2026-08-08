const { AUTH_ROLE_LEVELS } = require('../authAccess')

function registerUserRoutes(router, {
  requireAdminAlways,
  listUsers,
  findUserById,
  setUserSpaces,
  setUserUnrestricted,
  setUserRole,
  approvalGate = null
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

  // Registered even when the gate is disabled — gateOrApply calls this
  // directly in that case, so behaviour is identical to before this existed.
  if (approvalGate) {
    approvalGate.registerExecutor('users.patch', ({ userId, spaces, role, isUnrestricted }) => {
      if (spaces !== undefined) setUserSpaces(userId, spaces)
      if (isUnrestricted !== undefined) setUserUnrestricted(userId, isUnrestricted)
      if (role !== undefined) setUserRole(userId, role)
      return { user: serializeUser(findUserById(userId)) }
    })
  }

  router.get('/api/users', requireAdminAlways, (req, res) => {
    res.json({ users: listUsers().map(serializeUser) })
  })

  router.patch('/api/users/:userId', requireAdminAlways, async (req, res, next) => {
    try {
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
      const args = { userId, spaces, role, isUnrestricted }
      const changeDesc = [
        role !== undefined ? `role→${role}` : null,
        spaces !== undefined ? `spaces→[${spaces.join(', ')}]` : null,
        isUnrestricted !== undefined ? `unrestricted→${isUnrestricted}` : null
      ].filter(Boolean).join(', ')
      const outcome = await approvalGate.gateOrApply({
        kind: 'users.patch',
        args,
        actorState: req.authState,
        summary: `patch user ${existing.email || userId}: ${changeDesc}`,
        req
      })
      if (outcome.pending) {
        return res.status(202).json({ status: 'pending_approval', approvalId: outcome.id, expiresAt: outcome.expiresAt })
      }
      res.json(outcome.result)
    } catch (error) {
      next(error)
    }
  })
}

module.exports = {
  registerUserRoutes
}
