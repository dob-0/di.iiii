import { useEffect, useMemo, useState } from 'react'
import { defaultWindowLayout, normalizeWindowLayout } from '../../shared/projectSchema.js'

export const STUDIO_LAYOUT_STORAGE_PREFIX = 'studio-layout'

const DEFAULT_LAYOUTS = {
    desktop: {
        leftOpen: true,
        leftTab: 'library',
        leftWidth: 360,
        rightOpen: true,
        rightWidth: 360,
        bottomOpen: true,
        bottomTab: 'activity',
        popouts: {
            assets: false,
            outliner: false,
            activity: false,
            publish: false
        }
    },
    tablet: {
        leftOpen: true,
        leftTab: 'library',
        leftWidth: 340,
        rightOpen: false,
        rightWidth: 340,
        bottomOpen: false,
        bottomTab: 'activity',
        popouts: {
            assets: false,
            outliner: false,
            activity: false,
            publish: false
        }
    },
    mobile: {
        leftOpen: false,
        leftTab: 'library',
        leftWidth: 320,
        rightOpen: false,
        rightWidth: 320,
        bottomOpen: true,
        bottomTab: 'activity',
        popouts: {
            assets: false,
            outliner: false,
            activity: false,
            publish: false
        }
    }
}

const cloneLayout = (layout) => ({
    ...layout,
    popouts: {
        ...(layout?.popouts || {})
    }
})

const mergeLayout = (profile, partial = {}) => ({
    ...cloneLayout(DEFAULT_LAYOUTS[profile] || DEFAULT_LAYOUTS.desktop),
    ...(partial || {}),
    popouts: {
        ...cloneLayout(DEFAULT_LAYOUTS[profile] || DEFAULT_LAYOUTS.desktop).popouts,
        ...(partial?.popouts || {})
    }
})

const safeParse = (value) => {
    if (!value) return null
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

const getStorageKey = (projectId, profile) => `${STUDIO_LAYOUT_STORAGE_PREFIX}:${projectId}:${profile}`

export const deriveStudioLayoutFromLegacy = (windowLayout, profile = 'desktop') => {
    const normalized = normalizeWindowLayout(windowLayout || defaultWindowLayout)
    const { assets, inspector, outliner, activity, project } = normalized.windows

    return mergeLayout(profile, {
        leftOpen: profile === 'desktop'
            ? true
            : (profile === 'tablet' ? Boolean(assets?.visible || outliner?.visible) : false),
        leftTab: assets?.visible ? 'assets' : (outliner?.visible ? 'structure' : 'library'),
        leftWidth: Math.max(300, Number(assets?.width) || Number(outliner?.width) || 360),
        rightOpen: Boolean(inspector?.visible),
        rightWidth: Math.max(320, Number(inspector?.width) || 360),
        bottomOpen: profile === 'desktop'
            ? Boolean(activity?.visible || project?.visible)
            : true,
        bottomTab: activity?.visible ? 'activity' : 'publish',
        popouts: profile === 'desktop'
            ? {
                assets: false,
                outliner: Boolean(outliner?.visible),
                activity: Boolean(activity?.visible),
                publish: Boolean(project?.visible)
            }
            : undefined
    })
}

export function useStudioLayoutPrefs({
    projectId,
    profile = 'desktop',
    legacyWindowLayout = null
} = {}) {
    const storageKey = useMemo(() => getStorageKey(projectId || 'local', profile), [profile, projectId])
    const [layout, setLayout] = useState(() => mergeLayout(profile))

    useEffect(() => {
        if (typeof window === 'undefined') return
        const stored = safeParse(window.localStorage.getItem(storageKey))
        if (stored) {
            setLayout(mergeLayout(profile, stored))
            return
        }

        const derived = deriveStudioLayoutFromLegacy(legacyWindowLayout, profile)
        setLayout(derived)
        window.localStorage.setItem(storageKey, JSON.stringify(derived))
    }, [legacyWindowLayout, profile, storageKey])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.localStorage.setItem(storageKey, JSON.stringify(layout))
    }, [layout, storageKey])

    const updateLayout = (patch) => {
        setLayout((current) => mergeLayout(profile, {
            ...current,
            ...(typeof patch === 'function' ? patch(current) : patch)
        }))
    }

    return {
        layout,
        setLayout,
        updateLayout,
        storageKey
    }
}

export default useStudioLayoutPrefs
