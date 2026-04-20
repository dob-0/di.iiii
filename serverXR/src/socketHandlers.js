const { Server } = require('socket.io')
const { buildCorsOriginHandler } = require('./config')

// Store active connections
const spaceConnections = new Map()
const projectConnections = new Map()

const readSocketToken = (socket) => {
  const authToken = socket?.handshake?.auth?.token
  if (authToken) return String(authToken).trim().replace(/^bearer\s+/i, '')
  const header = socket?.handshake?.headers?.authorization
  if (!header) return ''
  const normalized = String(header).trim()
  return normalized.replace(/^bearer\s+/i, '')
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
    if (config.requireAuth) {
      const token = readSocketToken(socket)
      if (!token || token !== config.apiToken) {
        next(new Error('Unauthorized'))
        return
      }
    }
    next()
  })

  const ensureEditableSpace = async (spaceId, socket) => {
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
      console.error(`[Socket] Failed to verify edit permissions for ${spaceId}:`, error)
      socket.emit('server-error', {
        spaceId,
        message: 'Unable to verify space permissions.'
      })
    }
    return false
  }

  const ensureProjectAvailable = async (projectId, socket) => {
    if (typeof config.projectExists !== 'function') {
      return true
    }
    try {
      const exists = await config.projectExists(projectId)
      if (exists) {
        return true
      }
      socket.emit('project-missing', {
        projectId,
        message: 'Project not found.'
      })
    } catch (error) {
      console.error(`[Socket] Failed to verify project ${projectId}:`, error)
      socket.emit('server-error', {
        projectId,
        message: 'Unable to verify project.'
      })
    }
    return false
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
    console.log(`[Socket] Connected: ${socket.id}`)

    // User joins a space
    socket.on('join-space', (data) => {
      const { spaceId, userId, userName } = data
      if (!spaceId) return

      console.log(`[Socket] ${userName} joined space: ${spaceId}`)
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
      if (!(await ensureProjectAvailable(projectId, socket))) return

      console.log(`[Socket] ${userName} joined project: ${projectId}`)
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

      console.log(`[Socket] Scene update from ${socket.id}:`, {
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

      console.log(`[Socket] Object changed in space ${spaceId}: ${objectId} (${action})`)

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

      console.log(`[Socket] Object added in space ${spaceId} by ${socket.id}`)

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

      console.log(`[Socket] Object deleted in space ${spaceId}: ${objectId}`)

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

      socket.to(`space-${spaceId}`).emit('user-cursor', {
        userId: socket.id,
        cursor,
        timestamp: Date.now()
      })
    })

    socket.on('project-cursor', (data) => {
      const { projectId, cursor, userId, userName } = data || {}
      if (!projectId) return

      socket.to(`project-${projectId}`).emit('project-cursor', {
        userId: userId || socket.id,
        userName: userName || null,
        socketId: socket.id,
        cursor,
        timestamp: Date.now()
      })
    })

    // Selection changes
    socket.on('selection-changed', (data) => {
      const { spaceId, selectedObjects } = data
      if (!spaceId) return

      socket.to(`space-${spaceId}`).emit('selection-changed', {
        userId: socket.id,
        selectedObjects,
        timestamp: Date.now()
      })
    })

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`)

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
    })

    // Error handling
    socket.on('error', (error) => {
      console.error(`[Socket] Error from ${socket.id}:`, error)
    })
  })

  return io
}

module.exports = { initializeSocket, spaceConnections, projectConnections, getSocketPath }
