const crypto = require('node:crypto')
const { Server } = require('socket.io')
const {
  canAccessSpace,
  hasRequiredAuthRole,
  isGuestSubject,
  normalizeAuthRole,
  normalizeAuthScopeSpaces
} = require('./authAccess')
const { readCookie, verifyAuthSessionValue } = require('./authSession')
const { buildCorsOriginHandler } = require('./config')
const { createFreeSpaceChecker } = require('./diskGuard')
const logger = require('./logger')
const spaceChatStore = require('./spaceChatStore')

// Store active connections
// Who is reachable for a direct conversation, right now. Subject → socket ids.
// In memory ONLY: it is a fact about this moment, and a fact about this moment
// written to disk becomes a lie the next time the process restarts.
const dmSockets = new Map()

const spaceConnections = new Map()
const projectConnections = new Map()

const CHAT_MESSAGE_MAX_LENGTH = 500
const CHAT_MESSAGE_MIN_INTERVAL_MS = 300
// userName/userId ride in on the client's own say-so — unlike text, nothing
// capped their length before this. socket.io's 1MB frame ceiling means an
// uncapped identity is a bigger hole than the 500-char message body.
const CHAT_IDENTITY_MAX_LENGTH = 64
// How many space lines survive on disk, and how many a joiner gets replayed.
// The replay is smaller than the store so a week-long room does not push a
// megabyte at every reconnect.
const SPACE_CHAT_KEEP = 500
const SPACE_CHAT_REPLAY = 100
// A quote is a reminder of what is being answered, not a second copy of it.
const SPACE_CHAT_REPLY_QUOTE_MAX = 160
// "Someone is typing" repeats while a sentence is written; once a second is
// plenty for a person to see it, and it keeps a long message from becoming a
// hundred broadcasts.
const SPACE_CHAT_TYPING_MIN_INTERVAL_MS = 1000

// The sender picks the id so its optimistic local copy and the persisted row
// are the same message — without that, an admin removing a line clears it for
// everyone EXCEPT the child who wrote it. Anything that is not a plain id gets
// a server-generated one instead of being trusted into a SQL primary key.
const normalizeChatMessageId = (value) => {
  const raw = String(value || '').trim()
  if (raw && raw.length <= 64 && /^[A-Za-z0-9_-]+$/.test(raw)) return raw
  return crypto.randomUUID()
}

// Same trim-and-cap for both userId and userName, in both chat channels — a
// name is a label, not a payload. `fallback` preserves each call site's
// existing behaviour for a blank value (null for a name, the socket id for
// an id).
const normalizeChatIdentity = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback
  const trimmed = String(value).trim().slice(0, CHAT_IDENTITY_MAX_LENGTH)
  return trimmed || fallback
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
// Two people may open a private channel when they already share a room. Without
// this the platform would carry a directory anyone could use to reach any
// stranger who ever signed up — which is a different product, and a worse one.
//
// An unrestricted account (the owner) is in every space by definition, so it
// shares one with everybody; that is the same rule the rest of the platform
// applies, not an exception carved for this.
const sharesASpaceWith = (authState, otherSubject, config) => {
  if (!authState?.subject || !otherSubject) return false
  if (authState.isUnrestricted) return true
  const theirs = typeof config?.getFreshDbIdentity === 'function'
    ? config.getFreshDbIdentity(String(otherSubject))
    : null
  if (!theirs) return false
  if (theirs.isUnrestricted || theirs.dbUnrestricted) return true
  const mine = new Set(Array.isArray(authState.spaces) ? authState.spaces : [])
  const others = Array.isArray(theirs.dbSpaces) ? theirs.dbSpaces : (Array.isArray(theirs.spaces) ? theirs.spaces : [])
  return others.some((spaceId) => mine.has(spaceId))
}

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

  // Mirrors the gate in index.js around createDiskWriteGuard: no floor
  // configured means no checker, same as the HTTP side. `config.diskStatfs`
  // is only ever set by tests — production always falls through to the
  // real fs.statfs default inside createFreeSpaceChecker.
  const spaceChatFreeSpaceChecker = config.minFreeDiskBytes > 0
    ? createFreeSpaceChecker({ dir: config.directories?.dataDir, statfs: config.diskStatfs })
    : null

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
  // The account behind this socket, or null for a guest. Read from the SESSION
  // every time rather than from anything the client sent, which is what makes
  // it usable as the "this is my own line" check.
  const socketAccountId = (socket) => {
    const authState = refreshSocketAuthState(socket, config) || socket.data?.authState || {}
    return (authState.type === 'session' && authState.subject && !isGuestSubject(authState.subject))
      ? authState.subject
      : null
  }

  const readSpacePin = (spaceId) => {
    try {
      return spaceChatStore.getPin(spaceId)
    } catch (error) {
      logger.error(`[Socket] Could not read the pin for ${spaceId}:`, error)
      return null
    }
  }

  const ownsSpaceChatLine = (socket, spaceId, id) => {
    let line = null
    try {
      line = spaceChatStore.getMessage(spaceId, id)
    } catch (error) {
      logger.error(`[Socket] Could not read space chat line ${id} in ${spaceId}:`, error)
      return false
    }
    return wroteSpaceChatLine({
      line,
      accountId: socketAccountId(socket),
      socketUserId: socket.data?.chatUserId || ''
    })
  }

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
    userName,
    // The ACCOUNT, stamped by the server from the session — never taken from
    // the client, which is the whole difference between it and `userId`. That
    // one is a label a browser made up for itself; this one is who the person
    // actually is, and a private conversation can only be opened against it.
    // Absent for a guest, which is correct: there is nobody there to write to.
    accountId = null
  }) => {
    if (!bucketMap.has(bucketId)) {
      bucketMap.set(bucketId, new Map())
    }
    socket.join(`${roomPrefix}-${bucketId}`)
    bucketMap.get(bucketId).set(socket.id, {
      userId,
      userName,
      ...(accountId ? { accountId } : {}),
      socketId: socket.id,
      joinedAt: Date.now()
    })
    socket.to(`${roomPrefix}-${bucketId}`).emit(joinedEvent, {
      userId,
      userName,
      ...(accountId ? { accountId } : {}),
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
      const { spaceId, userId, userName, chat } = data || {}
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) {
        socket.emit('space-forbidden', {
          spaceId,
          message: 'Space access denied.'
        })
        return
      }

      logger.info(`[Socket] ${userName} joined space: ${spaceId}`)
      // Kept on the socket so a later `space-chat-remove` can tell whether the
      // line belongs to this browser without trusting the id it sends back.
      socket.data.chatUserId = normalizeChatIdentity(userId, socket.id)
      socket.data.chatUserName = normalizeChatIdentity(userName)
      joinConnectionBucket({
        bucketMap: spaceConnections,
        bucketId: spaceId,
        socket,
        roomPrefix: 'space',
        joinedEvent: 'user-joined',
        listEvent: 'users-in-space',
        userId,
        userName,
        accountId: socketAccountId(socket)
      })

      // Opt-in: the scene-collaboration client (useSpaceSocket) joins this same
      // room for ops and cursors and has no use for a hundred chat lines on
      // every reconnect. Only a client that says `chat: true` gets the replay.
      if (chat) {
        socket.emit('space-chat-history', {
          spaceId,
          messages: readSpaceChatHistory(spaceId),
          canModerate: canModerateSpaceChat(socket),
          // Pinning is for people the room can name. A guest is a browser that
          // will be gone tomorrow, and one line at the top of the room for
          // everybody is not a thing an anonymous visitor gets to set.
          canPin: Boolean(socketAccountId(socket)),
          pinned: readSpacePin(spaceId)
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
      const { spaceId, changes, version } = data || {}
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
      const { spaceId, objectId, action, payload } = data || {}
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
      const { spaceId, object } = data || {}
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
      const { spaceId, objectId } = data || {}
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
      const { spaceId, cursor } = data || {}
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
        userId: normalizeChatIdentity(userId, socket.id),
        userName: normalizeChatIdentity(userName),
        socketId: socket.id,
        text: trimmed,
        timestamp: now
      })
    })

    // ── direct, end-to-end, between two people ──────────────────────────
    //
    // The server's entire part in a private conversation is this: carry the
    // introduction. WebRTC's offer, answer and ICE candidates pass through
    // here verbatim and are never stored; the words themselves never come this
    // way at all, because they travel browser-to-browser and are sealed with a
    // key this process has never seen (src/chat/p2pCrypto.js).
    //
    // Two refusals hold the whole thing up:
    //
    //   · only a real account may signal. A guest identity is per-browser and
    //     disposable, so "who am I talking to" would mean nothing.
    //   · you may only reach somebody you SHARE A SPACE with. Without that the
    //     platform would have a directory anyone could use to open a channel to
    //     any stranger who ever signed up.
    socket.on('dm-signal', (data) => {
      const authState = refreshSocketAuthState(socket, config) || socket.data?.authState || {}
      const from = authState.subject
      const { to, signal } = data || {}
      if (!from || !to || !signal) return
      if (authState.type !== 'session' || isGuestSubject(from)) {
        socket.emit('dm-forbidden', { message: 'Sign in with an account to talk privately.' })
        return
      }
      if (String(to) === String(from)) return

      if (!sharesASpaceWith(authState, to, config)) {
        // Deliberately the same answer as "that person has no device here":
        // whether somebody exists is not a question this endpoint should let
        // a stranger ask.
        socket.emit('dm-unreachable', { to })
        return
      }

      const targets = dmSockets.get(String(to))
      if (!targets || targets.size === 0) {
        // Nobody is holding the other end. This is the honest cost of a
        // conversation with no server in it: there is no mailbox to leave it
        // in, so the answer is "they are not here", not a silent drop.
        socket.emit('dm-unreachable', { to })
        return
      }
      for (const targetId of targets) {
        io.to(targetId).emit('dm-signal', { from, signal })
      }
    })

    // A person announces they are reachable for direct conversations. Kept in
    // memory only — it is a fact about right now, and a fact about right now
    // that outlives the connection is a lie.
    socket.on('dm-here', () => {
      const authState = refreshSocketAuthState(socket, config) || socket.data?.authState || {}
      const subject = authState.subject
      if (!subject || authState.type !== 'session' || isGuestSubject(subject)) return
      if (!dmSockets.has(String(subject))) dmSockets.set(String(subject), new Set())
      dmSockets.get(String(subject)).add(socket.id)
      socket.data.dmSubject = String(subject)
    })

    // Space-wide chat — the same shape, cap, rate budget and scope check as
    // project chat above, one room wider: everyone in the space hears it no
    // matter which project they have open. Unlike project chat it IS persisted
    // (spaceChatStore), so somebody arriving late reads what they missed.
    socket.on('space-chat-message', async (data) => {
      const { spaceId, text, userId, userName, id, replyTo } = data || {}
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

      // The HTTP side of every other write refuses below the same floor
      // (diskGuard.js); this is the socket path to that same volume — a
      // chat line skips multer and the JSON body parser, so without this it
      // would skip the ENOSPC check too.
      if (spaceChatFreeSpaceChecker) {
        const free = await spaceChatFreeSpaceChecker.freeBytes()
        if (Number.isFinite(free) && free < config.minFreeDiskBytes) {
          logger.warn(`[Socket] Refused space chat message for ${spaceId}: ${free} bytes free < ${config.minFreeDiskBytes} required`)
          return
        }
      }

      // A reply quotes what it answers, and the quote is normalised HERE
      // rather than trusted: the client sends what it had on screen, and what
      // it had on screen is not something the server should repeat to a room
      // unchecked. The id is the anchor; the two strings are only a label.
      const quoted = replyTo?.id
        ? {
          id: normalizeChatMessageId(replyTo.id),
          userName: normalizeChatIdentity(replyTo.userName),
          text: String(replyTo.text || '').trim().slice(0, SPACE_CHAT_REPLY_QUOTE_MAX)
        }
        : null

      const message = {
        id: normalizeChatMessageId(id),
        userId: normalizeChatIdentity(userId, socket.id),
        userName: normalizeChatIdentity(userName),
        socketId: socket.id,
        text: trimmed,
        timestamp: now,
        ...(quoted ? { replyTo: quoted } : {})
      }

      try {
        spaceChatStore.appendMessage({
          id: message.id,
          spaceId,
          userId: message.userId,
          userName: message.userName,
          accountId: socketAccountId(socket),
          text: trimmed,
          ts: now,
          replyTo: quoted
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
      // Two ways to be allowed: it is your own line, or you are the adult with
      // the eraser. "Your own" means the ACCOUNT the server stamped on the row
      // when it was written — for a signed-in person that is a real boundary.
      // A guest has no account, so the fallback is the label this socket joined
      // with, which is a courtesy rather than a wall: anybody already inside
      // the room could claim it. The wall that matters is the admin one, and it
      // is unchanged.
      if (!canModerateSpaceChat(socket) && !ownsSpaceChatLine(socket, spaceId, id)) {
        socket.emit('space-chat-forbidden', {
          spaceId,
          message: 'You can remove your own messages; an admin can remove any.'
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

    // One line at the top of the room. Telegram's pin, minus the list of them:
    // a room with nine pins has none, because nobody reads a stack.
    socket.on('space-chat-pin', (data) => {
      const { spaceId, id } = data || {}
      if (!spaceId || !id) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) {
        socket.emit('space-forbidden', { spaceId, message: 'Space access denied.' })
        return
      }
      if (!socketAccountId(socket)) {
        socket.emit('space-chat-forbidden', {
          spaceId,
          message: 'Sign in to pin a message for the room.'
        })
        return
      }
      let pinned = null
      try {
        pinned = spaceChatStore.setPin(spaceId, {
          messageId: String(id),
          pinnedBy: socketAccountId(socket),
          pinnedByName: socket.data?.chatUserName || ''
        })
      } catch (error) {
        logger.error(`[Socket] Could not pin ${id} in ${spaceId}:`, error)
        return
      }
      if (!pinned) return
      io.to(`space-${spaceId}`).emit('space-chat-pinned', { spaceId, pinned })
    })

    socket.on('space-chat-unpin', (data) => {
      const { spaceId } = data || {}
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) return
      if (!socketAccountId(socket)) return
      try {
        spaceChatStore.clearPin(spaceId)
      } catch (error) {
        logger.error(`[Socket] Could not unpin in ${spaceId}:`, error)
        return
      }
      io.to(`space-${spaceId}`).emit('space-chat-pinned', { spaceId, pinned: null })
    })

    // Typing is the one live signal worth carrying and the one that must never
    // be written down: it is relayed to whoever is in the room at this instant
    // and stored nowhere. It also stays inside the flood budget's spirit by
    // being cheap — no disk, no history, no fan-out beyond the room.
    socket.on('space-chat-typing', (data) => {
      const { spaceId } = data || {}
      if (!spaceId) return
      if (!canAccessSpace(refreshSocketAuthState(socket, config), spaceId)) return
      const now = Date.now()
      if (now - (socket.data.lastTypingAt || 0) < SPACE_CHAT_TYPING_MIN_INTERVAL_MS) return
      socket.data.lastTypingAt = now
      socket.to(`space-${spaceId}`).emit('space-chat-typing', {
        spaceId,
        userId: socket.data?.chatUserId || socket.id,
        userName: socket.data?.chatUserName || '',
        timestamp: now
      })
    })

    // Selection changes
    socket.on('selection-changed', (data) => {
      const { spaceId, selectedObjects } = data || {}
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

      // Stop offering this socket as a way to reach a person. A stale entry
      // here is worse than none: the sender is told the message went somewhere.
      const dmSubject = socket.data?.dmSubject
      if (dmSubject && dmSockets.has(dmSubject)) {
        const set = dmSockets.get(dmSubject)
        set.delete(socket.id)
        if (set.size === 0) dmSockets.delete(dmSubject)
      }

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

// Whether the person on this socket wrote this line. Pure, and exported, so the
// rule can be read and tested without a server: it is the difference between
// "delete my own message" and "delete anybody's".
//
// An ACCOUNT is a real answer — the server stamped it when the line was written
// and re-reads it from the session now. A guest has none, and falls back to the
// label its socket joined with, which is a courtesy: anybody already inside the
// room could claim it. That is why a line written by an account is never
// removable by a guest, however the guest labels itself, and why the admin
// eraser is the check that actually holds.
const wroteSpaceChatLine = ({ line, accountId = null, socketUserId = '' }) => {
  if (!line) return false
  if (accountId) return line.accountId === accountId
  if (line.accountId) return false
  return Boolean(socketUserId) && line.userId === socketUserId
}

module.exports = {
  initializeSocket,
  spaceConnections,
  projectConnections,
  getSocketPath,
  applyFreshDbIdentity,
  wroteSpaceChatLine
}
