// Why the wall might be showing nothing, as a single word — mirrored into
// the tab title by MapOutput.jsx so a tool driving the output over the
// Chrome DevTools protocol can tell "nothing is mapped" from "everything is
// switched off" from "it is fine, the show is just dark right now" without a
// screenshot.
//
// A surface is switched off the same way MapStage.jsx decides what to draw
// (`!surface.enabled`, see defaultMappingSurface in src/shared/projectSchema.js)
// — never a second, invented flag.
//
// Deliberately three reasons only. Camera/stream sources can go black for
// reasons of their own (no permission, device gone), but that is a separate
// PR with a real caller behind it, not a guess added here.
export function mapOutputReason({ mapping } = {}) {
    const surfaces = mapping?.surfaces || []
    if (!surfaces.length) return 'empty'
    if (surfaces.every((surface) => !surface.enabled)) return 'all-off'
    return 'ok'
}
