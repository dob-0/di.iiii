import * as THREE from 'three'

// A renderer that does not give up on a power hint.
//
// `powerPreference` is a HINT (WebGL 2.0 spec, WebGLContextAttributes): a browser
// may honour it, ignore it — or, as Chromium does on a Linux laptop with an NVIDIA
// card under ANGLE/Vulkan, return NO context at all for 'high-performance' while
// 'default' and 'low-power' work (measured on aylmo, 2026-10-01: the owner's own
// browser drew nothing on the front room). React Three Fiber asks for
// 'high-performance' unless told otherwise, and three.js throws when getContext
// returns null, so the whole canvas went black.
//
// Use as R3F's `gl` prop: `gl={rendererWithFallback({ antialias })}`. It builds the
// renderer R3F would build (same defaults), and if that throws it tries once more
// with 'default' — the attributes of a canvas are only fixed by a SUCCESSFUL
// getContext, so the same canvas can be asked again.
export const FALLBACK_POWER_PREFERENCE = 'default'

export function rendererWithFallback(options = {}, { create = (attributes) => new THREE.WebGLRenderer(attributes), warn = console.warn } = {}) {
    return (canvas) => {
        // R3F v8's own defaults for a renderer it makes (createRendererInstance).
        const attributes = { powerPreference: 'high-performance', antialias: true, alpha: true, ...options, canvas }
        try {
            return create(attributes)
        } catch (error) {
            if (attributes.powerPreference === FALLBACK_POWER_PREFERENCE) throw error
            warn?.(`[viewport] no WebGL context with powerPreference "${attributes.powerPreference}" — retrying with "${FALLBACK_POWER_PREFERENCE}" (${error?.message || error})`)
            return create({ ...attributes, powerPreference: FALLBACK_POWER_PREFERENCE })
        }
    }
}
