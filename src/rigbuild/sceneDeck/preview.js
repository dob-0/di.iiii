// THE SCENE DECK — layer 2: what the small 2D preview and the timeline draw (docs/architecture/RIG_BUILD.md §22).
// Pure: no DOM, no canvas. The canvas code in ScenesDeck.jsx only paints what these return.
import { intensityOf } from './model.js'

/** The preview never flashes faster than this (WCAG 2.3.1: at most three flashes in any one second). */
export const MAX_PREVIEW_FLASHES_PER_S = 3
const FLASH_MS = 70

/** The hex the preview paints a scene in: its first lit group's colour, else white. */
export const previewColour = (scene) => {
    const lit = Object.entries(scene?.levels || {}).filter(([, v]) => v > 0).map(([g]) => g).sort()
    for (const g of lit) if (scene?.colours?.[g]) return scene.colours[g]
    return '#ffffff'
}

/** Is the preview's strobe flash on at `timeMs`? Off when the scene has no strobe or motion is reduced. */
export const previewFlashOn = (scene, timeMs, { reducedMotion = false } = {}) => {
    if (reducedMotion || !scene?.flags?.strobe) return false
    const period = 1000 / MAX_PREVIEW_FLASHES_PER_S
    return ((timeMs % period) + period) % period < FLASH_MS
}

/** Everything the preview needs of a scene: colour, brightness 0..1, strobe flash. */
export const previewOf = (scene, timeMs, options) => ({
    colour: previewColour(scene),
    brightness: intensityOf(scene),
    flash: previewFlashOn(scene, timeMs, options)
})

/** The loop as a timeline: each in-loop scene's start and share of the loop (holds; a hold 0 is a stop). */
export const timelineOf = (scenes) => {
    const loop = (scenes || []).filter((s) => s.inLoop)
    const total = loop.reduce((sum, s) => sum + Math.max(0, Number(s.hold) || 0), 0)
    let at = 0
    return {
        total,
        cues: loop.map((s, i) => {
            const hold = Math.max(0, Number(s.hold) || 0)
            const cue = { id: s.id, n: i + 1, name: s.name, start: at, hold, share: total ? hold / total : 0 }
            at += hold
            return cue
        })
    }
}

/**
 * The in-loop scene playing `elapsedMs` after PLAY was pressed (a preview on this page only, never the hall's
 * clock). With `loop` off it holds the last scene. Null when there is no loop to play.
 */
export const playingAt = (scenes, elapsedMs, { loop = true } = {}) => {
    const { total, cues } = timelineOf(scenes)
    if (!cues.length || !total) return null
    const totalMs = total * 1000
    const t = loop ? ((elapsedMs % totalMs) + totalMs) % totalMs : Math.min(Math.max(0, elapsedMs), totalMs - 1)
    return cues.find((c) => t < (c.start + c.hold) * 1000)?.id ?? cues[cues.length - 1].id
}
