const crypto = require('node:crypto')
const { Server } = require('socket.io')
const {
  canAccessSpace,
  hasRequiredAuthRole,
  normalizeAuthRole,
  normalizeAuthScopeSpaces
} = require('./authAccess')
const { readCookie, verifyAuthSessionValue } = require('./authSession')
const { buildCorsOriginHandler } = require('./config')
const logger = require('./logger')
const spaceChatStore = require('./spaceChatStore')

// Store active connections
const spaceConnections = new Map()
const projectConnections = new Map()

const CHAT_MESSAGE_MAX_LENGTH = 500
const CHAT_MESSAGE_MIN_INTERVAL_MS = 300
// How many space lines survive on disk, and how many a joiner gets replayed.
// The replay is smaller than the store so a week-long room does not push a
// megabyte at every reconnect.
const SPACE_CHAT_KEEP = 500
const SPACE_CHAT_REPLAY = 100

// The sender picks the id so its optimistic local copy and the persisted row
// are the same message — without that, an admin removing a line clears it for
// everyone EXCEPT the child who wrote it. Anything that is not a plain id gets
// a server-generated one instead of being trusted into a SQL primary key.
const normalizeChatMessageId = (value) => {
  const raw = String(value || '').trim()
  if (raw && raw.length <= 64 && /^[A-Za-z0-9_-]+$/.test(raw)) return raw
  return crypto.randomUUID()
}

const readSocketToken = (socket) => {
  const authToken = socket?.handshake?.auth?.token
  if (authToken) return String(authToken).trim().replace(/^bearer\s+/i, '')
  const header = socket?.handshake?.headers?.authorization
  if (!header) return ''
  const normalized = String(header).trim()
  return normalized.replace(/^bearer\s+/i, '')
}

const getSocketAuthState = (socket, config) => {
  const token = readSocketToken(socket)
  const identity = config?.auth?.resolveIdentity?.(token)
  if (identity) {
    return {
      authenticated: true,
      type: 'token',
      role: normalizeAuthRole(identity.role, null),
      subject: identity.subject || null,
      label: identity.label || null,
      spaces: normalizeAuthScopeSpaces(identity.spaces, null)
    }
  }
  const sessionValue = readCookie(
    socket?.handshake?.headers?.cookie || '',
    config.authSession?.cookieName
  )
  // Same revocation check the HTTP path runs — without it a logged-out cookie
  // could still open a realtime connection and keep writing.
  const result = verifyAuthSessionValue(sessionValue, {
    secret: config?.auth?.sessionSecret || config.apiToken,
    lookupTokenVersion: config?.lookupTokenVersion || null
  })
  if (!result.valid) {
    return {
      authenticated: false,
      type: 'session',
      reason: result.reason
    }
  }
  const role = normalizeAuthRole(result.session?.role, null)
  if (!role) {
    return {
      authenticated: false,
      type: 'session',
      reason: 'legacy'
    }
  }
  const base = {
    authenticated: true,
    type: 'session',
    role,
    subject: result.session?.subject || null,
    label: result.session?.label || null,
    spaces: normalizeAuthScopeSpaces(result.session?.spaces, null),
    isUnrestricted: Boolean(result.session?.isUnrestricted)
  }
  return applyFreshDbIdentity(base, config)
}

// HTTP re-checks role/spaces/isUnrestricted against the DB on every request
// (readAuthSession -> getFreshDbIdentity, index.js), so an admin's PATCH
// /api/users/:id takes effect within its 60s cache window without the target
// needing to re-login. A socket's io.use middleware only runs once, at
// connect — without this, socket.data.authState is frozen to whatever the
// cookie said at handshake time for the connection's whole lifetime, so a
// role downgrade or space-scope revocation never reaches an already-open
// tab (it can still broadcast/receive scene-update, cursor and chat events
// for a space it was just cut off from). token_version only covers logout,
// not a live role/scope edit, so it does not close this gap either.
const applyFreshDbIdentity = (authState, config) => {
  if (!authState?.subject || typeof config?.getFreshDbIdentity !== 'function') return authState
  const fresh = config.getFreshDbIdentity(authState.subject)
  if (!fresh || !fresh.dbRole) return authState
  return {
    ...authState,
    role: fresh.dbRole,
    spaces: normalizeAuthScopeSpaces(fresh.dbSpaces, null),
    isUnrestricted: Boolean(fresh.dbUnrestricted)
  }
}

// Called right before an access-control decision, on the already-established
// connection's cached authState, so a live socket picks up a DB-side role or
// scope change within the same 60s cache window HTTP requests get, instead
// of only at the socket's next reconnect.
const refreshSocketAuthState = (socket, config) => {
  const current = socket.data?.authState
  if (!current || current.type !== 'session') return current
  socket.data.authState = applyFreshDbIdentity(current, config)
  return socket.data.authState
}

const getSocketPath = (basePath = '') => {
  const raw = String(basePath || '').trim()
  if (!raw || raw === '/') {
    return '/socket.io'
  }
  const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}`
  if (!normalized || normalized === '/') {
    return '/socket.io'
  }
  return `${normalized}/socket.io`
}

function initializeSocket(httpServer, config) {
  const io = new Server(httpServer, {
    path: getSocketPath(config.basePath),
    cors: {
      origin: buildCorsOriginHandler(config.corsOrigins),
      methods: ['GET', 'POST']
    }
  })

  // Middleware for authentication
  io.use((socket, next) => {
    if (!config.requireAuth) {
      socket.data.authState = {
        authenticated: true,
        type: 'disabled',
        role: 'admin'
      }
      next()
      return
    }
    const authState = getSocketAuthState(socket, config)
    socket.data.authState = authState
    if (!authState.authenticated) {
      next(new Error('Unauthorized'))
      return
    }
    if (!hasRequiredAuthRole(authState.role, 'editor')) {
      next(new Error('Forbidden'))
      return
    }
    next()
  })

  const ensureSpaceAccess = async (spaceId, socket) => {
    const authState = refreshSocketAuthState(socket, config) || {}
    if (!canAccessSpace(authState, spaceId)) {
      socket.emit('space-forbidden', {
        spaceId,
        message: 'Space access denied.'
      })
      return false
    }
    return true
  }

  const ensureEditableSpace = async (spaceId, socket) => {
    if (!(await ensureSpaceAccess(spaceId, socket))) {
      return false
    }
    if (typeof config.canEditSpace !== 'function') {
      return true
    }
    try {
      const editable = await config.canEditSpace(spaceId)
      if (editable !== false) {
        return true
      }
      socket.emit('space-read-only', {
        spaceId,
        message: 'Space is read-only.'
      })
    } catch (error) {
      logger.error(`[Socket] Failed to verify edit permissions for ${spaceId}:`, error)
      socket.emit('server-error', {
        spaceId,
        message: 'Unable to verify space permissions.'
      })
    }
    return false
  }

  const ensureProjectAvailable = async (projectId, socket) => {
    if (typeof config.resolveProjectContext !== 'function') {
      return { projectId }
    }
    try {
      const project = await config.resolveProjectContext(projectId)
      if (project) {
        const authState = refreshSocketAuthState(socket, config) || {}
        if (!canAccessSpace(authState, project.spaceId)) {
          socket.emit('project-forbidden', {
            projectId,
            spaceId: project.spaceId,
            message: 'Project access denied.'
          })
          return null
        }
        return project
      }
      socket.emit('project-missing', {
        projectId,
        message: 'Project not found.'
      })
    } catch (error) {
      logger.error(`[Socket] Failed to verify project ${projectId}:`, error)
      socket.emit('server-error', {
        projectId,
        message: 'Unable to verify project.'
      })
    }
    return null
  }

  // Chat history is a convenience, never a precondition: a server whose DB is
  // not open (unit harnesses, a half-booted install) must still carry live
  // messages exactly the way project chat does, rather than refusing to join.
  const readSpaceChatHistory = (spaceId) => {
    try {
      return spaceChatStore.listRecent(spaceId, { limit: SPACE_CHAT_REPLAY })
    } catch (error) {
      logger.error(`[Socket] Could not read space chat history for ${spaceId}:`, error)
      return []
    }
  }

  // Guests redeeming a camp invite are `editor`, so editor cannot be the bar
  // for deleting other children's messages — this is deliberately admin-only.
  const canModerateSpaceChat = (socket) => {
    const authState = refreshSocketAuthState(socket, config) || socket.data?.authState || {}
    return hasRequiredAuthRole(authState.role, 'admin')
  }

  const joinConnectionBucket = ({
    bucketMap,
    bucketId,
    socket,
    socketEvent,
    roomPrefix,
    joinedEvent,
    listEvent,
    userId,
    userName
  }) => {
    if (!bucketMap.has(bucketId)) {
      bucketMap.set(bucketId, new Map())
    }
    socket.join(`${roomPrefix}-${bucketId}`)
    bucketMap.get(bucketId).set(socket.id, {
      userId,
      userName,
      socketId: socket.id,
      joinedAt: Date.now()
    })
    socket.to(`${roomPrefix}-${bucketId}`).emit(joinedEvent, {
      userId,
      userName,
      socketId: socket.id,
      timestamp: Date.now()
    })
    socket.emit(listEvent, Array.from(bucketMap.get(bucketId).values()))
  }

  const leaveSocketFromBucket = ({
    bucketMap,
    bucketId,
    socket,
    roomPrefix,
    leftEvent
  }) => {
    const connections = bucketMap.get(bucketId)
    if (!connections || !connections.has(socket.id)) {
      return
    }
    const userData = connections.get(socket.id)
    connections.delete(socket.id)
    socket.to(`${roomPrefix}-${bucketId}`).emit(leftEvent, {
      userId: userData.userId,
      socketId: socket.id,
      userName: userData.userName,
      timestamp: Date.now()
    })
    if (connections.size === 0) {
      bucketMap.delete(bucketId)
    }
  }

  io.on('connection', (socket) => {
    logger.info(`[Socket] Connected: ${socket.id}`)

    // User joins a space
    socket.on('join-space', (data) => {
      const { spaceId, userId, userName, chat } = data
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) {
        socket.emit('space-forbidden', {
          spaceId,
          message: 'Space access denied.'
        })
        return
      }

      logger.info(`[Socket] ${userName} joined space: ${spaceId}`)
      joinConnectionBucket({
        bucketMap: spaceConnections,
        bucketId: spaceId,
        socket,
        roomPrefix: 'space',
        joinedEvent: 'user-joined',
        listEvent: 'users-in-space',
        userId,
        userName
      })

      // Opt-in: the scene-collaboration client (useSpaceSocket) joins this same
      // room for ops and cursors and has no use for a hundred chat lines on
      // every reconnect. Only a client that says `chat: true` gets the replay.
      if (chat) {
        socket.emit('space-chat-history', {
          spaceId,
          messages: readSpaceChatHistory(spaceId),
          canModerate: canModerateSpaceChat(socket)
        })
      }
    })

    socket.on('join-project', async (data) => {
      const { projectId, userId, userName } = data || {}
      if (!projectId) return
      const project = await ensureProjectAvailable(projectId, socket)
      if (!project) return
      if (!socket.data.projectSpaces) {
        socket.data.projectSpaces = new Map()
      }
      socket.data.projectSpaces.set(project.projectId || projectId, project.spaceId || null)

      logger.info(`[Socket] ${userName} joined project: ${projectId}`)
      joinConnectionBucket({
        bucketMap: projectConnections,
        bucketId: projectId,
        socket,
        roomPrefix: 'project',
        joinedEvent: 'project-user-joined',
        listEvent: 'users-in-project',
        userId,
        userName
      })
    })

    // Scene update from client
    socket.on('scene-update', async (data) => {
      const { spaceId, changes, version } = data
      if (!spaceId) return
      if (!(await ensureEditableSpace(spaceId, socket))) return

      logger.info(`[Socket] Scene update from ${socket.id}:`, {
        spaceId,
        changesCount: changes?.length || 0
      })

      // Broadcast to all clients in space EXCEPT sender
      socket.to(`space-${spaceId}`).emit('scene-updated', {
        changes,
        version,
        userId: socket.id,
        timestamp: Date.now()
      })
    })

    // Object add/delete/transform
    socket.on('object-changed', async (data) => {
      const { spaceId, objectId, action, payload } = data
      if (!spaceId) return
      if (!(await ensureEditableSpace(spaceId, socket))) return

      logger.info(`[Socket] Object changed in space ${spaceId}: ${objectId} (${action})`)

      // Broadcast to others in space
      socket.to(`space-${spaceId}`).emit('object-changed', {
        objectId,
        action,
        payload,
        object: payload,
        userId: socket.id,
        timestamp: Date.now()
      })
    })

    // Object added
    socket.on('object-added', async (data) => {
      const { spaceId, object } = data
      if (!spaceId || !object) return
      if (!(await ensureEditableSpace(spaceId, socket))) return

      logger.info(`[Socket] Object added in space ${spaceId} by ${socket.id}`)

      // Broadcast to others in space
      socket.to(`space-${spaceId}`).emit('object-added', {
        object,
        userId: socket.id,
        timestamp: Date.now()
      })
    })

    // Object deleted
    socket.on('object-deleted', async (data) => {
      const { spaceId, objectId } = data
      if (!spaceId || !objectId) return
      if (!(await ensureEditableSpace(spaceId, socket))) return

      logger.info(`[Socket] Object deleted in space ${spaceId}: ${objectId}`)

      // Broadcast to others in space
      socket.to(`space-${spaceId}`).emit('object-deleted', {
        objectId,
        userId: socket.id,
        timestamp: Date.now()
      })
    })

    // User cursor position (for presence)
    socket.on('user-cursor', (data) => {
      const { spaceId, cursor } = data
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) return

      socket.to(`space-${spaceId}`).emit('user-cursor', {
        userId: socket.id,
        cursor,
        timestamp: Date.now()
      })
    })

    socket.on('project-cursor', async (data) => {
      const { projectId, cursor, userId, userName } = data || {}
      if (!projectId) return
      let projectSpaceId = socket.data?.projectSpaces?.get(projectId)
      if (!projectSpaceId) {
        const project = await ensureProjectAvailable(projectId, socket)
        if (!project) return
        projectSpaceId = project.spaceId || null
        if (!socket.data.projectSpaces) {
          socket.data.projectSpaces = new Map()
        }
        socket.data.projectSpaces.set(project.projectId || projectId, projectSpaceId)
      }
      if (!canAccessSpace(refreshSocketAuthState(socket, config), projectSpaceId)) return

      socket.to(`project-${projectId}`).emit('project-cursor', {
        userId: userId || socket.id,
        userName: userName || null,
        socketId: socket.id,
        cursor,
        timestamp: Date.now()
      })
    })

    // Ephemeral project chat — not persisted, room-scoped like project-cursor
    socket.on('project-chat-message', async (data) => {
      const { projectId, text, userId, userName } = data || {}
      if (!projectId) return
      const trimmed = String(text || '').trim().slice(0, CHAT_MESSAGE_MAX_LENGTH)
      if (!trimmed) return

      const now = Date.now()
      if (now - (socket.data.lastChatMessageAt || 0) < CHAT_MESSAGE_MIN_INTERVAL_MS) return
      socket.data.lastChatMessageAt = now

      let projectSpaceId = socket.data?.projectSpaces?.get(projectId)
      if (!projectSpaceId) {
        const project = await ensureProjectAvailable(projectId, socket)
        if (!project) return
        projectSpaceId = project.spaceId || null
        if (!socket.data.projectSpaces) {
          socket.data.projectSpaces = new Map()
        }
        socket.data.projectSpaces.set(project.projectId || projectId, projectSpaceId)
      }
      if (!canAccessSpace(refreshSocketAuthState(socket, config), projectSpaceId)) return

      socket.to(`project-${projectId}`).emit('project-chat-message', {
        id: crypto.randomUUID(),
        userId: userId || socket.id,
        userName: userName || null,
        socketId: socket.id,
        text: trimmed,
        timestamp: now
      })
    })

    // Space-wide chat — the same shape, cap, rate budget and scope check as
    // project chat above, one room wider: everyone in the space hears it no
    // matter which project they have open. Unlike project chat it IS persisted
    // (spaceChatStore), so somebody arriving late reads what they missed.
    socket.on('space-chat-message', (data) => {
      const { spaceId, text, userId, userName, id } = data || {}
      if (!spaceId) return
      const trimmed = String(text || '').trim().slice(0, CHAT_MESSAGE_MAX_LENGTH)
      if (!trimmed) return

      // One flood budget per socket, shared with project chat: the limit is on
      // the person, not on which of the two boxes they type into.
      const now = Date.now()
      if (now - (socket.data.lastChatMessageAt || 0) < CHAT_MESSAGE_MIN_INTERVAL_MS) return
      socket.data.lastChatMessageAt = now

      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) {
        socket.emit('space-forbidden', {
          spaceId,
          message: 'Space access denied.'
        })
        return
      }

      const message = {
        id: normalizeChatMessageId(id),
        userId: userId || socket.id,
        userName: userName || null,
        socketId: socket.id,
        text: trimmed,
        timestamp: now
      }

      try {
        spaceChatStore.appendMessage({
          id: message.id,
          spaceId,
          userId: message.userId,
          userName: message.userName,
          text: trimmed,
          ts: now
        }, { keep: SPACE_CHAT_KEEP })
      } catch (error) {
        // Live delivery is the promise; the transcript is the bonus. Losing
        // the write must not swallow the message people are waiting on.
        logger.error(`[Socket] Could not persist space chat line for ${spaceId}:`, error)
      }

      socket.to(`space-${spaceId}`).emit('space-chat-message', { ...message, spaceId })
    })

    // The adult's eraser. Admin-only on purpose (camp guests are editors), and
    // it goes to the whole room INCLUDING the sender so every open screen drops
    // the line at once, not just on next reload.
    socket.on('space-chat-remove', (data) => {
      const { spaceId, id } = data || {}
      if (!spaceId || !id) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) {
        socket.emit('space-forbidden', {
          spaceId,
          message: 'Space access denied.'
        })
        return
      }
      if (!canModerateSpaceChat(socket)) {
        socket.emit('space-chat-forbidden', {
          spaceId,
          message: 'Only an admin can remove chat messages.'
        })
        return
      }
      try {
        spaceChatStore.removeMessage(spaceId, id)
      } catch (error) {
        logger.error(`[Socket] Could not remove space chat line ${id} in ${spaceId}:`, error)
        socket.emit('server-error', {
          spaceId,
          message: 'Unable to remove that message.'
        })
        return
      }
      logger.info(`[Socket] Space chat line ${id} removed from ${spaceId} by ${socket.id}`)
      io.to(`space-${spaceId}`).emit('space-chat-removed', { spaceId, id: String(id) })
    })

    // Selection changes
    socket.on('selection-changed', (data) => {
      const { spaceId, selectedObjects } = data
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) return

      socket.to(`space-${spaceId}`).emit('selection-changed', {
        userId: socket.id,
        selectedObjects,
        timestamp: Date.now()
      })
    })

    // Disconnect
    socket.on('disconnect', () => {
      logger.info(`[Socket] Disconnected: ${socket.id}`)

      // Remove from all spaces
      for (const [spaceId] of spaceConnections.entries()) {
        leaveSocketFromBucket({
          bucketMap: spaceConnections,
          bucketId: spaceId,
          socket,
          roomPrefix: 'space',
          leftEvent: 'user-left'
        })
      }
      for (const [projectId] of projectConnections.entries()) {
        leaveSocketFromBucket({
          bucketMap: projectConnections,
          bucketId: projectId,
          socket,
          roomPrefix: 'project',
          leftEvent: 'project-user-left'
        })
      }
      socket.data.projectSpaces?.clear?.()
    })

    // Error handling
    socket.on('error', (error) => {
      logger.error(`[Socket] Error from ${socket.id}:`, error)
    })
  })

  return io
}

module.exports = {
  initializeSocket,
  spaceConnections,
  projectConnections,
  getSocketPath,
  applyFreshDbIdentity
}
