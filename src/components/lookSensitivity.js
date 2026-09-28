// Mouse-look sensitivity in the units players already know.
//
// The model is the one every PC shooter engine and every sensitivity
// converter uses: the engine turns the view by a fixed angle ("yaw", degrees)
// per mouse COUNT, multiplied by the in-game sensitivity number. The physical
// feel is then the mouse travel for one full turn:
//
//     degrees per count = sens × yaw
//     cm/360            = 360 / (sens × yaw × DPI) × 2.54
//
// Sources for the formula and the per-game yaw constants:
// - Source engine / CS2 `m_yaw` and `m_pitch` default 0.022 (Valve Developer
//   Community, "List of CS:GO Cvars" / "List of CS2 Cvars").
// - Per-game yaw table (CS2/Apex 0.022, Valorant 0.07, Overwatch 2 0.0066,
//   Fortnite 0.5555 at config sensitivity 1.0) as used by the public
//   sensitivity converters: mouse-sensitivity.com, KovaaK's in-game sensitivity presets,
//   3daimtrainer.com/mouse-sensitivity-converter, aiming.pro — all of them
//   convert with new sens = old sens × (old yaw ÷ new yaw), which is exactly
//   "keep the same cm/360" (checked 2026-09-28).
// - Published check pair used in the tests: CS2 sens 1 at 800 DPI =
//   360 / (0.022 × 800) × 2.54 = 51.95 cm/360.
//
// Valorant's and Overwatch's constants are not published by Riot or Blizzard;
// they are the values the converter community measured and agrees on. They
// are marked that way in GAME_PRESETS below.
//
// This file is PURE: no DOM, no storage, no React. The browser-specific part
// (how many mouse counts one `movementX` unit is) is `countsPerMovementUnit`
// below, and it carries the measurement it is based on.

export const CM_PER_INCH = 2.54

// In-game sensitivity presets. `yaw` is degrees per count at sens 1.
// `published: false` = community-agreed constant, not published by the studio.
export const GAME_PRESETS = Object.freeze({
    cs2: { label: 'CS2 / CS:GO', yaw: 0.022, published: true },
    apex: { label: 'Apex Legends', yaw: 0.022, published: false },
    source: { label: 'Source / Half-Life 2', yaw: 0.022, published: true },
    valorant: { label: 'Valorant', yaw: 0.07, published: false },
    overwatch: { label: 'Overwatch 2', yaw: 0.0066, published: false },
    // Fortnite's number here is the CONFIG value (GameUserSettings.ini
    // MouseX/MouseY). The in-game slider shows it as a percentage, so
    // "6.4%" on the slider is 0.064 here.
    fortnite: { label: 'Fortnite (config value)', yaw: 0.5555, published: false },
    // For people who think in the angle itself: sens IS degrees per count.
    degrees: { label: 'Degrees per count', yaw: 1, published: true }
})

export const DEFAULT_GAME = 'cs2'

export function presetYaw(game) {
    return (GAME_PRESETS[game] || GAME_PRESETS[DEFAULT_GAME]).yaw
}

export function degreesPerCount(sens, yaw) {
    return sens * yaw
}

export function radiansPerCount(sens, yaw) {
    return (sens * yaw * Math.PI) / 180
}

// Mouse travel for one full 360° turn, in centimetres.
export function cmPer360(sens, yaw, dpi) {
    const perInch = sens * yaw * dpi // degrees per inch of travel
    if (!(perInch > 0)) return Infinity
    return (360 / perInch) * CM_PER_INCH
}

// The inverse: the in-game sens that gives `cm` per 360 at this DPI.
export function sensForCmPer360(cm, yaw, dpi) {
    if (!(cm > 0) || !(yaw > 0) || !(dpi > 0)) return NaN
    return (360 * CM_PER_INCH) / (cm * yaw * dpi)
}

// Same physical feel in another game (the converter formula).
export function convertSens(sens, fromYaw, toYaw) {
    return (sens * fromYaw) / toYaw
}

// eDPI: the single number players compare (sens × DPI, same game).
export function edpi(sens, dpi) {
    return sens * dpi
}

// How many mouse counts one unit of a pointer-locked `movementX` stands for.
//
// Measured, not assumed (2026-09-28, Chromium 153.0.8010.52 flatpak, X11,
// Xft.dpi 144 → devicePixelRatio 1.5): 200 X server pixels of relative motion
// (xdotool, 20 × 10 px) arrived as ΣmovementX = 133, i.e. device px ÷ 1.5 —
// Chromium reports movementX in CSS pixels and carries the fraction (the
// per-event values ran 6,7,7,6,7,7…). So on this path counts = movementX × DPR,
// given the OS maps one count to one pixel (flat acceleration profile).
//
// With `unadjustedMovement` granted (Pointer Lock 2.0; Chromium implements it
// on Windows and ChromeOS — it REJECTED it with NotSupportedError on the
// Linux X11 build above) movementX is the raw device delta: one unit is one
// count. That branch follows the spec and Chromium's documentation; it was
// not measured on a Windows machine here.
export function countsPerMovementUnit({ raw = false, dpr = 1 } = {}) {
    if (raw) return 1
    return dpr > 0 ? dpr : 1
}

// Radians the view turns per movementX unit — what the look handler applies.
export function radiansPerMovementUnit({ sens, yaw, raw = false, dpr = 1 }) {
    return radiansPerCount(sens, yaw) * countsPerMovementUnit({ raw, dpr })
}
