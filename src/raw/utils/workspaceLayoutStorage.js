import { RAW_LAYOUT_VERSION } from './workspaceLayout.js'

/**
 * The person's own arrangement, on this device. Same shape of module as
 * localWorkspaceStorage.js, and the same rule: every read and every write is
 * wrapped, because a browser in private mode throws on access rather than
 * returning null, and a desk that will not open because of a preference is a
 * worse bug than a desk that opens in its default arrangement.
 *
 * Versioned envelope: a layout written by a future shape must be ignored, not
 * half-read. `presets` is carried through untouched so an older build cannot
 * silently drop the arrangements a newer one saved.
 */

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

export const emptyLayout = () => ({ v: RAW_LAYOUT_VERSION, frames: {}, presets: [], activePreset: null })

export const readWorkspaceLayout = (storageKey) => {
    if (!storageKey || !canUseStorage()) return emptyLayout()
    try {
        const rawValue = window.localStorage.getItem(storageKey)
        if (!rawValue) return emptyLayout()
        const parsed = JSON.parse(rawValue)
        if (!parsed || typeof parsed !== 'object') return emptyLayout()
        if (parsed.v !== RAW_LAYOUT_VERSION) return emptyLayout()
        return {
            v: RAW_LAYOUT_VERSION,
            frames: parsed.frames && typeof parsed.frames === 'object' ? parsed.frames : {},
            presets: Array.isArray(parsed.presets) ? parsed.presets : [],
            activePreset: typeof parsed.activePreset === 'string' ? parsed.activePreset : null
        }
    } catch {
        return emptyLayout()
    }
}

export const writeWorkspaceLayout = (storageKey, layout = null) => {
    if (!storageKey || !layout || typeof layout !== 'object' || !canUseStorage()) return false
    try {
        window.localStorage.setItem(storageKey, JSON.stringify({ ...layout, v: RAW_LAYOUT_VERSION }))
        return true
    } catch {
        return false
    }
}

export const clearWorkspaceLayout = (storageKey) => {
    if (!storageKey || !canUseStorage()) return false
    try {
        window.localStorage.removeItem(storageKey)
        return true
    } catch {
        return false
    }
}
