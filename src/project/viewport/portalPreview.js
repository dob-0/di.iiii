// A door's preview: a picture of the world behind it, drawn inside the opening (owner 2026-10-25:
// "make the preview of the portals of each world", so a visitor sees there is a place to enter).
// The door names it the way every media entity does: `components.media.assetId`.

// Centre-crop an image of `imageAspect` (w/h) into an opening of `openingAspect`, as texture
// repeat/offset: the picture fills the opening without stretching. Pure.
export function coverCrop(imageAspect, openingAspect) {
    const img = imageAspect > 0 ? imageAspect : 1
    const open = openingAspect > 0 ? openingAspect : 1
    if (img > open) {
        const rx = open / img
        return { repeat: [rx, 1], offset: [(1 - rx) / 2, 0] }
    }
    const ry = img / open
    return { repeat: [1, ry], offset: [0, (1 - ry) / 2] }
}

// How opaque the picture is: clear enough to read as a view, a little veiled when idle so the door
// still glows in its own colour; fully clear on hover (the brand's hover-fill move).
export const PREVIEW_OPACITY = { idle: 0.85, hover: 1 }

// The turn (about the ring's axis, the parent's local Y) that keeps a preview's top pointing up in the world while
// the door spins in its own plane (the 'float' animation turns a standing ring about that axis; a ring looks the
// same at any turn, a picture does not). `upLocal` is world up in the door's own frame. null when the door lies
// flat (world up is the ring's axis, so no turn in its plane is "up"). Pure.
export function uprightTurn(upLocal) {
    const [x, , z] = upLocal
    if (Math.hypot(x, z) < 1e-3) return null
    return Math.atan2(x, z)
}
