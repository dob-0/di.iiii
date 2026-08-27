// GETTING A PHONE PHOTOGRAPH INTO THE ROOM.
//
// This is the whole product. In two full days of camp not one child authored
// anything in a browser, and the strand's raw material — photographs of
// Dilijan — is already on their phones. So the one path that has to work is
// tap → camera roll → it is in the room.
//
// Two things were in the way, both measured rather than assumed:
//
// 1. A REAL iPhone HEIC IS REJECTED. Proven on 2026-08-26 with an actual
//    photograph (not a crafted header) against the real upload endpoint: the
//    server answers 415 with "This image could not have its location and camera
//    data removed, so it was not saved." That is serverXR/src/assetScrub.js
//    doing its job — an uploaded original is served verbatim to anyone with the
//    URL, so a photo whose EXIF it cannot strip must never reach the asset
//    store, and it cannot strip this one: the libheif in its sharp build
//    refuses the file outright ("Number of references in iref box (48) exceeds
//    the security limits of 16 references"), so `sharp().metadata()` throws and
//    the scrub reports format null. The guard is right. The outcome — a child
//    tapping their own photograph and being told no — is not.
//
// 2. A 12-megapixel photograph is four megabytes over camp wifi, and lands in
//    the room as a texture nobody needed at that size.
//
// One answer to both: decode the picture in the browser and re-encode it as a
// JPEG before it is uploaded. On an iPhone — which is the audience — Safari
// decodes HEIC natively, so the file that reaches the server is an ordinary
// JPEG the scrub is happy with. And the canvas keeps only pixels: the GPS
// coordinates of a child's home do not leave the phone at all, which is a
// better answer than stripping them server-side after they have been sent.
//
// If the browser cannot decode the file (a desktop Chrome handed a HEIC, say)
// the original is uploaded unchanged and the server gets to answer. Nothing
// here swallows a failure — it only removes the causes it can.

// Long edge, in pixels. A picture stands three metres tall in the room and is
// looked at from several metres away on a phone; past about this it is texture
// memory nobody sees. Also comfortably inside the canvas area limit iOS
// enforces, which a full 12MP photo is not.
export const MAX_EDGE = 2200
export const JPEG_QUALITY = 0.86

// Below this a re-encode is not worth the risk of making a small picture worse.
const MIN_BYTES_TO_BOTHER = 64 * 1024

const isImage = (file) => Boolean(file) && (
    String(file.type || '').startsWith('image/')
    // An iPhone .HEIC picked through Files can arrive with an empty type.
    || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(String(file.name || ''))
)

// `imageOrientation: 'from-image'` is what keeps a portrait photo upright: the
// EXIF orientation tag is applied to the pixels here, and then thrown away with
// the rest of the metadata. Without it, every photo held sideways arrives
// sideways — the classic failure of a naive metadata stripper.
const decode = async (file) => {
    if (typeof window.createImageBitmap === 'function') {
        try {
            return await window.createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch {
            // Older Safari refuses the options bag rather than the format.
            try {
                return await window.createImageBitmap(file)
            } catch {
                return null
            }
        }
    }
    return null
}

const toJpeg = (bitmap) => new Promise((resolve) => {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = window.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
        resolve(null)
        return
    }
    // A photograph has no transparency, and a JPEG has no alpha channel — a
    // canvas left unpainted composites as black, which is how a re-encode turns
    // an unfilled edge into a black band.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY)
})

/**
 * The file to actually upload: `{ file, converted }`.
 *
 * Never throws and never returns nothing — a file this cannot improve comes
 * back exactly as it arrived, so the caller has one path, not two.
 */
export const preparePhoto = async (file) => {
    if (!isImage(file)) return { file, converted: false }
    const alreadyFine = String(file.type || '').toLowerCase() === 'image/jpeg'
        && Number(file.size || 0) < MIN_BYTES_TO_BOTHER
    if (alreadyFine) return { file, converted: false }

    const bitmap = await decode(file)
    if (!bitmap) return { file, converted: false }
    try {
        const blob = await toJpeg(bitmap)
        if (!blob || !blob.size) return { file, converted: false }
        const name = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
        return {
            file: new window.File([blob], `${name}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
            }),
            converted: true
        }
    } catch {
        return { file, converted: false }
    } finally {
        bitmap.close?.()
    }
}
