import { createEntityOfType } from '../entityRegistry.js'
import {
    facingViewerYaw,
    groundPointInFront,
    poseToRay,
    restOnGround,
    standHeightForType
} from './jamPlacement.js'

// One place that answers "what did they just add, and where does it go".
//
// Studio's own creation path (StudioEditor's handleCreateEntity) places into a
// ring around the saved orbit target, which is right for an editor and wrong
// for a jam — see the note at the top of jamPlacement.js. This is the jam's
// version of the same step, and it exists as a plain function taking a pose so
// the placement it produces can be checked without a renderer, a canvas or a
// device.

/**
 * @param {string} type — an object type: one of the five shapes, or a media
 *   type when a photo is being added.
 * @param {object} pose — the walker's pose, straight off `walkerRef.current`.
 * @param {object|null} asset — an uploaded asset, for a photo.
 */
export const buildJamObject = (type, pose = {}, asset = null) => {
    const ray = poseToRay(pose)
    const ground = groundPointInFront(ray.position, ray.direction)
    const position = restOnGround(ground, { standHeight: standHeightForType(type) })
    // Only the flat-fronted types are turned to face you. A sphere has no
    // front, and rotating one is a diff that says nothing.
    const facing = ['text', 'image', 'video', 'plane'].includes(type)
        ? [0, facingViewerYaw(pose?.yaw ?? 0), 0]
        : [0, 0, 0]

    return createEntityOfType(type, {
        name: asset?.name ? asset.name.replace(/\.[^.]+$/, '') : undefined,
        components: {
            transform: { position, rotation: facing },
            ...(asset ? {
                media: {
                    assetId: asset.id,
                    autoplay: type !== 'image',
                    loop: true,
                    muted: type === 'video'
                }
            } : {})
        }
    })
}

// What a phone's camera roll can hand over. A jam is a place people photograph
// each other in; everything heavier than that belongs in the full editor, which
// is one tap away from the same screen.
export const detectJamObjectType = (file) => {
    const mime = String(file?.mimeType || file?.type || '')
    if (mime.startsWith('video/')) return 'video'
    return 'image'
}
