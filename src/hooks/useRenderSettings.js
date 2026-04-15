import { useEffect, useState } from 'react'
import * as THREE from 'three'

export const DEFAULT_RENDER_SETTINGS = {
    dpr: [1, 2],
    toneMapping: 'ACESFilmic',
    toneMappingExposure: 1,
    shadows: true,
    shadowType: THREE.PCFSoftShadowMap,
    antialias: true,
    powerPreference: 'high-performance'
}

const clampDpr = (value, devicePixelRatio) => {
    const [minDpr, maxDpr] = Array.isArray(value) ? value : [value, value]
    const device = devicePixelRatio || 1
    return Math.max(minDpr || 1, Math.min(maxDpr || device, device))
}

const applyRenderSettings = (renderer, renderSettings) => {
    if (!renderer || !renderSettings) return
    renderer.toneMapping = renderSettings.toneMapping === 'None'
        ? THREE.NoToneMapping
        : THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = renderSettings.toneMappingExposure ?? 1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = !!renderSettings.shadows
    renderer.shadowMap.type = renderSettings.shadowType ?? THREE.PCFSoftShadowMap
    if (renderSettings.dpr) {
        const device = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
        const clamped = clampDpr(renderSettings.dpr, device)
        renderer.setPixelRatio(clamped)
    }
}

export function useRenderSettings({ rendererRef } = {}) {
    const [renderSettings, setRenderSettings] = useState(DEFAULT_RENDER_SETTINGS)

    useEffect(() => {
        if (!rendererRef?.current) return
        applyRenderSettings(rendererRef.current, renderSettings)
    }, [renderSettings, rendererRef])

    return {
        renderSettings,
        setRenderSettings
    }
}
