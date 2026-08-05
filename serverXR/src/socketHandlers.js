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

// Store active connections
const spaceConnections = new Map()
const projectConnections = new Map()

const CHAT_MESSAGE_MAX_LENGTH = 500
const CHAT_MESSAGE_MIN_INTERVAL_MS = 300

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
  return {
    authenticated: true,
    type: 'session',
    role,
    subject: result.session?.subject || null,
    label: result.session?.label || null,
    spaces: normalizeAuthScopeSpaces(result.session?.spaces, null)
  }
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
    const authState = socket.data?.authState || {}
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
        const authState = socket.data?.authState || {}
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
      const { spaceId, userId, userName } = data
      if (!spaceId) return
      if (!canAccessSpace(socket.data?.authState, spaceId)) {
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
      if (!canAccessSpace(socket.data?.authState, spaceId)) return

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
      if (!canAccessSpace(socket.data?.authState, projectSpaceId)) return

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
      if (!canAccessSpace(socket.data?.authState, projectSpaceId)) return

      socket.to(`project-${projectId}`).emit('project-chat-message', {
        id: crypto.randomUUID(),
        userId: userId || socket.id,
        userName: userName || null,
        socketId: socket.id,
        text: trimmed,
        timestamp: now
      })
    })

    // Selection changes
    socket.on('selection-changed', (data) => {
      const { spaceId, selectedObjects } = data
      if (!spaceId) return
      if (!canAccessSpace(socket.data?.authState, spaceId)) return

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

module.exports = { initializeSocket, spaceConnections, projectConnections, getSocketPath }
