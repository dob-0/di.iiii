import { useEffect, useRef, useCallback, useState } from 'react'
import { io } from 'socket.io-client'
import {
  clearServerUnavailable,
  getServerUnavailableRetryDelay,
  isServerTemporarilyUnavailable,
  markServerUnavailable,
  normalizeClientApiToken
} from '../services/apiClient.js'
import { normalizeSpaceId } from '../utils/spaceNames.js'

const normalizeAuthToken = (value = '') => {
  return normalizeClientApiToken(value)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

const resolveLoopbackHostname = (hostname = '') => {
  if (typeof window === 'undefined') return hostname
  const currentHost = window.location.hostname
  if (
    LOOPBACK_HOSTS.has(hostname)
    && LOOPBACK_HOSTS.has(currentHost)
    && hostname !== currentHost
  ) {
    return currentHost
  }
  return hostname
}

const shouldUseSameOriginDevSocket = ({
  configuredBase = '',
  isDev = false,
  locationHostname = ''
} = {}) => {
  if (!isDev || !configuredBase) return false
  try {
    const url = new URL(configuredBase, locationHostname ? `http://${locationHostname}` : 'http://localhost')
    return LOOPBACK_HOSTS.has(url.hostname) || (locationHostname && url.hostname === locationHostname)
  } catch {
    return false
  }
}

export const getSocketConfigForRuntime = ({
  configuredBase = '',
  token = '',
  isDev = false,
  locationOrigin = ''
} = {}) => {
  const normalizedBase = String(configuredBase || '').trim()
  const authToken = normalizeAuthToken(token)
  const locationHostname = (() => {
    if (!locationOrigin) return ''
    try {
      return new URL(locationOrigin).hostname
    } catch {
      return ''
    }
  })()

  if (normalizedBase && locationOrigin) {
    const url = new URL(normalizedBase, locationOrigin)
    const useSameOrigin = shouldUseSameOriginDevSocket({
      configuredBase: normalizedBase,
      isDev,
      locationHostname
    })
    url.hostname = useSameOrigin ? locationHostname : resolveLoopbackHostname(url.hostname)
    url.port = useSameOrigin ? new URL(locationOrigin).port : url.port
    url.protocol = useSameOrigin ? new URL(locationOrigin).protocol : url.protocol
    const basePath = url.pathname.replace(/\/+$/, '')
    return {
      serverUrl: useSameOrigin ? locationOrigin : url.origin,
      path: `${basePath || ''}/socket.io`,
      auth: authToken ? { token: authToken } : undefined
    }
  }

  if (isDev) {
    const hostname = resolveLoopbackHostname('localhost')
    return {
      serverUrl: `http://${hostname}:4000`,
      path: '/serverXR/socket.io',
      auth: authToken ? { token: authToken } : undefined
    }
  }

  return {
    serverUrl: locationOrigin,
    path: '/serverXR/socket.io',
    auth: authToken ? { token: authToken } : undefined
  }
}

const getSocketConfig = () => {
  const hasWindow = typeof window !== 'undefined'
  return getSocketConfigForRuntime({
    configuredBase: import.meta.env.VITE_API_BASE_URL || '',
    token: import.meta.env.VITE_API_TOKEN || '',
    isDev: Boolean(import.meta.env.DEV),
    locationOrigin: hasWindow ? window.location.origin : ''
  })
}

const mergeUsers = (current = [], incoming = []) => {
  const map = new Map()
  current.forEach((user) => {
    const key = user?.socketId || user?.userId
    if (key) {
      map.set(key, user)
    }
  })
  incoming.forEach((user) => {
    const key = user?.socketId || user?.userId
    if (key) {
      map.set(key, user)
    }
  })
  return Array.from(map.values())
}

export function useSpaceSocket(spaceId, userId, userName) {
  const socketRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const userCursorListenersRef = useRef(new Set())
  const [isConnected, setIsConnected] = useState(false)
  const [usersInSpace, setUsersInSpace] = useState([])
  const [retryNonce, setRetryNonce] = useState(0)
  const normalizedSpaceId = normalizeSpaceId(spaceId) || spaceId

  const scheduleRetry = useCallback((delayMs = 0) => {
    const safeDelay = Math.max(1000, Number(delayMs) || 0)
    if (retryTimeoutRef.current) return
    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null
      setRetryNonce((value) => value + 1)
    }, safeDelay)
  }, [])

  // Connect to WebSocket
  useEffect(() => {
    if (!normalizedSpaceId || !userId) return
    if (isServerTemporarilyUnavailable()) {
      socketRef.current = null
      setIsConnected(false)
      setUsersInSpace([])
      scheduleRetry(getServerUnavailableRetryDelay())
      return () => {
        if (retryTimeoutRef.current) {
          window.clearTimeout(retryTimeoutRef.current)
          retryTimeoutRef.current = null
        }
      }
    }

    const { serverUrl, path, auth } = getSocketConfig()
    
    const socket = io(serverUrl, {
      path,
      auth,
      withCredentials: true,
      reconnection: false
    })

    socket.on('connect', () => {
      clearServerUnavailable()
      console.log('[Socket.IO] Connected to server')
      setIsConnected(true)

      // Join the space
      socket.emit('join-space', { spaceId: normalizedSpaceId, userId, userName })
      console.log('[Socket.IO] Joining space:', normalizedSpaceId)
    })

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected from server')
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      setIsConnected(false)
      setUsersInSpace([])
      markServerUnavailable()
      console.error('[Socket.IO] Connection error:', error.message)
      socket.disconnect()
      scheduleRetry(getServerUnavailableRetryDelay())
    })

    socket.on('users-in-space', (users) => {
      console.log('[Socket.IO] Users in space:', users)
      setUsersInSpace(Array.isArray(users) ? users : [])
    })

    socket.on('user-joined', (data) => {
      console.log('[Socket.IO] User joined:', data.userName)
      setUsersInSpace(prev => mergeUsers(prev, [{
        userId: data.userId,
        userName: data.userName,
        socketId: data.socketId,
        joinedAt: data.timestamp
      }]))
    })

    socket.on('user-left', (data) => {
      console.log('[Socket.IO] User left:', data.userName)
      setUsersInSpace(prev => prev.filter((user) => {
        if (data.socketId && user.socketId === data.socketId) return false
        if (data.userId && user.userId === data.userId) return false
        return true
      }))
    })

    socket.on('user-cursor', (data) => {
      userCursorListenersRef.current.forEach((listener) => {
        try {
          listener(data)
        } catch (error) {
          console.error('[Socket.IO] user-cursor listener failed', error)
        }
      })
    })

    socketRef.current = socket

    return () => {
      socketRef.current = null
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      socket.disconnect()
    }
  }, [normalizedSpaceId, retryNonce, scheduleRetry, userId, userName])

  // Emit scene update
  const emitSceneUpdate = useCallback((changes, version) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('scene-update', {
        spaceId: normalizedSpaceId,
        changes,
        version,
        timestamp: Date.now()
      })
    }
  }, [normalizedSpaceId])

  // Emit object change
  const emitObjectChanged = useCallback((objectId, action, payload) => {
    if (socketRef.current?.connected) {
      console.log('[Socket.IO] Emitting object-changed:', objectId, action)
      socketRef.current.emit('object-changed', {
        spaceId: normalizedSpaceId,
        objectId,
        action,
        payload,
        timestamp: Date.now()
      })
    } else {
      console.warn('[Socket.IO] Cannot emit object-changed: not connected')
    }
  }, [normalizedSpaceId])

  // Emit object added
  const emitObjectAdded = useCallback((object) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('object-added', {
        spaceId: normalizedSpaceId,
        object,
        timestamp: Date.now()
      })
    }
  }, [normalizedSpaceId])

  // Emit object deleted
  const emitObjectDeleted = useCallback((objectId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('object-deleted', {
        spaceId: normalizedSpaceId,
        objectId,
        timestamp: Date.now()
      })
    }
  }, [normalizedSpaceId])

  // Emit cursor position
  const emitUserCursor = useCallback((cursor) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('user-cursor', {
        spaceId: normalizedSpaceId,
        cursor
      })
    }
  }, [normalizedSpaceId])

  // Emit selection change
  const emitSelectionChanged = useCallback((selectedObjects) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('selection-changed', {
        spaceId: normalizedSpaceId,
        selectedObjects
      })
    }
  }, [normalizedSpaceId])

  // Listen to updates
  const onSceneUpdated = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('scene-updated', callback)
      return () => socketRef.current?.off('scene-updated', callback)
    }
  }, [])

  const onObjectChanged = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('object-changed', callback)
      return () => socketRef.current?.off('object-changed', callback)
    }
  }, [])

  const onObjectAdded = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('object-added', callback)
      return () => socketRef.current?.off('object-added', callback)
    }
  }, [])

  const onObjectDeleted = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('object-deleted', callback)
      return () => socketRef.current?.off('object-deleted', callback)
    }
  }, [])

  const onUserCursor = useCallback((callback) => {
    if (typeof callback !== 'function') return () => {}
    userCursorListenersRef.current.add(callback)
    return () => {
      userCursorListenersRef.current.delete(callback)
    }
  }, [])

  const onSelectionChanged = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('selection-changed', callback)
      return () => socketRef.current?.off('selection-changed', callback)
    }
  }, [])

  return {
    isConnected,
    usersInSpace,
    emit: {
      sceneUpdate: emitSceneUpdate,
      objectChanged: emitObjectChanged,
      objectAdded: emitObjectAdded,
      objectDeleted: emitObjectDeleted,
      userCursor: emitUserCursor,
      selectionChanged: emitSelectionChanged
    },
    on: {
      sceneUpdated: onSceneUpdated,
      objectChanged: onObjectChanged,
      objectAdded: onObjectAdded,
      objectDeleted: onObjectDeleted,
      userCursor: onUserCursor,
      selectionChanged: onSelectionChanged
    }
  }
}
