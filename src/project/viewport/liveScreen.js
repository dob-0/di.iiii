// A SCREEN IN THE ROOM. Step 5 of "one project is one stage"
// (di-atlas/decisions/2026-09-20-one-project-one-stage.md).
//
// A plane with `components.surface = { surfaceId }` shows one of the project's
// own mapping surfaces (document.mappingState.surfaces) as its picture. This
// file is the pure half: given a surface, what does the plane show, and how
// often does its texture need re-uploading? No DOM, no three.js — so it can be
// tested on its own and read in one sitting. The DOM half is
// src/studio/components/LiveScreens.jsx.

// What can be a texture and what cannot. A texture is made from a DOM element
// the map lane already draws — a <video>, an <img>, a <canvas>, an <svg> — and
// the map lane draws `project` and `url` surfaces as IFRAMES. A browser will
// not hand a page's pixels to WebGL (it would be a cross-origin read), so those
// two kinds cannot be a screen. They get a dim named plate instead.
export const PLATE_KINDS = Object.freeze(['project', 'url'])

// How often each kind's texture is re-uploaded to the GPU. An upload is a
// full-frame copy; a 1280x720 video at 60 would cost more than the room around
// it. A number is a cap on one shared clock (LiveScreens.jsx): the picture
// network at 15 (it is already scaled to 640 wide and its operators run at
// their own pace), an NDI® <img> at 30, a still image and a test pattern once.
// 'frame' is a <video>: three.js's VideoTexture uploads once per frame the
// browser presents (requestVideoFrameCallback), never faster than the source's
// own rate — a plain Texture cannot read a <video> at all (three sizes it from
// image.width, which a <video> reports as 0, and the GPU gets nothing).
export const LIVE_SCREEN_RATES = Object.freeze({
    video: 'frame',
    camera: 'frame',
    stream: 'frame',
    ndi: 30,
    network: 15,
    image: 0,
    test: 0
})

// The rate for a texture, by the element the map lane produced for it. The
// element wins when it is a <video> (a stream is a video whatever its kind)
// or a <canvas> (a camera with the motion glow on is a canvas, still moving);
// otherwise the kind decides; an unknown kind's still element uploads once.
export const liveScreenRate = (kind, tag = '') => {
    if (tag === 'video') return 'frame'
    if (tag === 'canvas') return Object.prototype.hasOwnProperty.call(LIVE_SCREEN_RATES, kind) && typeof LIVE_SCREEN_RATES[kind] === 'number' ? LIVE_SCREEN_RATES[kind] : 30
    if (Object.prototype.hasOwnProperty.call(LIVE_SCREEN_RATES, kind)) return LIVE_SCREEN_RATES[kind]
    return 0
}

// What a plane with `surfaceId` shows.
//   { mode: 'live', kind, name }         mount the map lane's source; its element is the texture
//   { mode: 'colour', colour, name }     a flat colour needs no texture at all
//   { mode: 'plate', title, detail }     a dim named plate: an iframe kind, or a surface that is gone
export const liveScreenPlan = (surface, surfaceId = '') => {
    if (!surface) {
        return { mode: 'plate', title: `surface · ${surfaceId || '?'}`, detail: 'that surface is gone' }
    }
    const kind = surface.source?.kind || 'test'
    const name = surface.name || surface.id || ''
    if (PLATE_KINDS.includes(kind)) {
        return { mode: 'plate', title: `${kind} · ${name}`, detail: 'a page, not a picture', kind, name }
    }
    if (kind === 'colour') {
        return { mode: 'colour', colour: surface.source?.ref || '', kind, name }
    }
    return { mode: 'live', kind, name }
}

// The ids every screen in the room points at, each once, in document order —
// one source is mounted per SURFACE, not per plane, so two screens showing the
// same wall cost one decode.
export const referencedSurfaceIds = (entities = []) => {
    const seen = []
    for (const entity of entities) {
        if (entity?.type !== 'plane') continue
        const id = entity.components?.surface?.surfaceId
        if (typeof id === 'string' && id && !seen.includes(id)) seen.push(id)
    }
    return seen
}

// Which element inside a mounted map source is THE picture. In order: the
// network's or the motion glow's canvas, a playing video, a painted <img>, a
// test pattern's svg. The placeholder comes last: it is what every unfinished
// source shows, and it becomes a plate.
export const PICTURE_SELECTORS = Object.freeze([
    'canvas.map-source-media',
    'video.map-source-media',
    'img.map-source-media',
    'svg.map-source-svg',
    '.map-source-placeholder'
])

export const pickPictureElement = (host) => {
    if (!host?.querySelector) return null
    for (const selector of PICTURE_SELECTORS) {
        const found = host.querySelector(selector)
        if (found) return found
    }
    return null
}
