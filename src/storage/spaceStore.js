import { slugifySpaceName, isValidSpaceSlug } from '../utils/spaceNames.js'

const STORAGE_KEY = 'editor-shared-spaces'
export const TEMP_SPACE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

const isBrowser = typeof window !== 'undefined'
const BASE_PATH = ((import.meta?.env?.BASE_URL) || '/').replace(/\/+$/, '') || '/'
const getBasePrefix = () => (BASE_PATH === '/' ? '' : BASE_PATH)

const buildSpacePathname = (spaceId) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return prefix ? `${prefix}/` : '/'
    }
    return `${prefix}/${spaceId}`.replace(/\/{2,}/g, '/')
}

const readSpaces = () => {
    if (!isBrowser) return []
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        if (!Array.isArray(raw)) return []
        return raw
            .filter(entry => entry && typeof entry.id === 'string')
            .map(space => normalizeSpace(space))
    } catch {
        return []
    }
}

const writeSpaces = (spaces) => {
    if (!isBrowser) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces))
}

const normalizeSpace = (space) => {
    const id = String(space.id)
    const fallbackLabel = `Space ${id.slice(-4)}`
    return {
        id,
        label: (space.label && String(space.label).trim()) || fallbackLabel,
        createdAt: Number(space.createdAt) || Date.now(),
        lastActive: Number(space.lastActive) || Date.now(),
        isPermanent: Boolean(space.isPermanent)
    }
}

const generateRandomSpaceId = () => `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const getExistingIds = () => new Set(readSpaces().map(space => space.id))

const claimSpaceId = (desiredId) => {
    const ids = getExistingIds()
    if (!desiredId || ids.has(desiredId)) {
        if (!desiredId) {
            let fallback
            do {
                fallback = generateRandomSpaceId()
            } while (ids.has(fallback))
            return fallback
        }
        let counter = 2
        let candidate
        do {
            candidate = `${desiredId}-${counter}`
            counter += 1
        } while (ids.has(candidate))
        return candidate
    }
    return desiredId
}

export const getAvailableSpaceId = (name = '') => {
    const candidate = slugifySpaceName(name)
    if (!isValidSpaceSlug(candidate)) return ''
    const ids = getExistingIds()
    if (!ids.has(candidate)) {
        return candidate
    }
    let counter = 2
    let slug
    do {
        slug = `${candidate}-${counter}`
        counter += 1
    } while (ids.has(slug))
    return slug
}

export const isSpaceIdAvailable = (name = '') => {
    const candidate = slugifySpaceName(name)
    if (!isValidSpaceSlug(candidate)) return false
    return !getExistingIds().has(candidate)
}

export const listSpaces = () => {
    const spaces = readSpaces()
    return spaces.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))
}

export const createSpace = ({ label, slug, isPermanent = false } = {}) => {
    const preferredSlug = slugifySpaceName(slug || label || '')
    const normalizedId = claimSpaceId(isValidSpaceSlug(preferredSlug) ? preferredSlug : '')
    const record = normalizeSpace({
        id: normalizedId,
        label,
        isPermanent
    })
    const spaces = readSpaces()
    spaces.unshift(record)
    writeSpaces(spaces)
    return record
}

export const deleteSpace = (spaceId) => {
    if (!spaceId) return
    const spaces = readSpaces().filter(space => space.id !== spaceId)
    writeSpaces(spaces)
}

export const toggleSpacePermanent = (spaceId, isPermanent) => {
    if (!spaceId) return
    const spaces = readSpaces()
    const index = spaces.findIndex(space => space.id === spaceId)
    if (index === -1) return
    spaces[index] = {
        ...spaces[index],
        isPermanent: Boolean(isPermanent)
    }
    writeSpaces(spaces)
}

export const markSpaceActive = (spaceId) => {
    if (!spaceId) return
    const spaces = readSpaces()
    const index = spaces.findIndex(space => space.id === spaceId)
    if (index === -1) {
        const record = normalizeSpace({ id: spaceId })
        spaces.unshift(record)
    } else {
        spaces[index] = {
            ...spaces[index],
            lastActive: Date.now()
        }
    }
    writeSpaces(spaces)
}

export const cleanupSpaces = (currentSpaceId, ttl = TEMP_SPACE_TTL_MS) => {
    const spaces = readSpaces()
    if (!spaces.length) return
    const now = Date.now()
    const filtered = spaces.filter(space => {
        if (space.isPermanent) return true
        if (space.id === currentSpaceId) return true
        const last = space.lastActive || space.createdAt || now
        return now - last <= ttl
    })
    if (filtered.length !== spaces.length) {
        writeSpaces(filtered)
    }
}

export const getSpaceShareUrl = (spaceId) => {
    if (!isBrowser) return ''
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.pathname = buildSpacePathname(spaceId)
    return url.toString()
}
