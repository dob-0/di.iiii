// The haze machines' values per look (owner N3949, 2026-11-12: "do haze how you suggest"). Pure.
// Magma Prime 5ch chart (library magmatic-magma-prime, EXACT): fog 0-5 off, 6-255 on; volume 0-255 = 0-100 %;
// fan 0-255 = 20-100 %; duration / interval 0-5 = none. A look the policy does not name writes ALL channels 0 (OUT).
// PROPOSED values: the crew sets the real volume against the room, the air handling and the smoke detectors (11-13).
export const HAZE_OFF_LOOKS = new Set(['black', 'work-light', 'doors', 'wait', 'entry', 'blackout', 'house', 'bow'])
export const HAZE_STEADY = Object.freeze({ fog: 255, volume: 51, fan: 0, duration: 0, interval: 0 }) // about 20 % volume, fan at its lowest (20 %)
export const HAZE_BURST = Object.freeze({ fog: 255, volume: 128, fan: 0, duration: 0, interval: 0 }) // about 50 % on the drop
export const HAZE_BURST_LOOKS = new Set(['drop-hit'])
export const HAZE_OUT = Object.freeze({ fog: 0, volume: 0, fan: 0, duration: 0, interval: 0 })

/** The raw channel values a haze machine gets in the look `lookId` (`rig-<name>` or `<name>`). */
export const hazeFor = (lookId) => {
    const id = String(lookId || '').replace(/^rig-/, '')
    if (id.startsWith('stress-') || HAZE_OFF_LOOKS.has(id)) return { ...HAZE_OUT }
    return { ...(HAZE_BURST_LOOKS.has(id) ? HAZE_BURST : HAZE_STEADY) }
}
