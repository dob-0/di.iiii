/**
 * Device detection and responsive sizing utilities
 */

export const DEVICE_TYPES = {
    MOBILE: 'mobile',
    TABLET: 'tablet',
    DESKTOP: 'desktop',
    VR: 'vr'
}

/**
 * Detect current device type
 */
export function detectDeviceType() {
    // Check for VR
    if (navigator.xr?.isSessionSupported?.('immersive-vr')) {
        return DEVICE_TYPES.VR
    }

    // Check for touch and screen size (mobile/tablet)
    const isTouchDevice = () => {
        return (
            (typeof window !== 'undefined' &&
                ('ontouchstart' in window ||
                    (navigator.maxTouchPoints > 0) ||
                    (navigator.msMaxTouchPoints > 0)))
        )
    }

    if (!isTouchDevice()) {
        return DEVICE_TYPES.DESKTOP
    }

    // Tablet vs mobile based on viewport width
    const viewportWidth = Math.min(window.innerWidth, window.innerHeight)
    return viewportWidth >= 768 ? DEVICE_TYPES.TABLET : DEVICE_TYPES.MOBILE
}

/**
 * Get default node scale based on device type
 */
export function getDefaultNodeScale(deviceType) {
    const scaleMap = {
        [DEVICE_TYPES.MOBILE]: 0.875,
        [DEVICE_TYPES.TABLET]: 1.0,
        [DEVICE_TYPES.DESKTOP]: 1.0,
        [DEVICE_TYPES.VR]: 1.25
    }
    return scaleMap[deviceType] || 1.0
}

/**
 * Available density levels for node sizing.
 * Each entry: { value: number, label: string, density: 'compact'|'normal'|'large' }
 */
export function getAvailableScales() {
    return [
        { value: 0.75, label: 'Compact', density: 'compact' },
        { value: 0.875, label: 'Small', density: 'compact' },
        { value: 1.0, label: 'Normal', density: 'normal' },
        { value: 1.25, label: 'Large', density: 'large' },
        { value: 1.5, label: 'XL', density: 'large' },
    ]
}

/**
 * Resolve density class from a scale value
 */
export function getDensityFromScale(scale) {
    if (scale <= 0.875) return 'compact'
    if (scale >= 1.25) return 'large'
    return 'normal'
}
