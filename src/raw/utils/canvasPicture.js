import * as THREE from 'three'

// A drawn canvas as a picture on a wire. The W3C route (Media Capture from DOM
// Elements: canvas.captureStream) into a <video>, into a THREE.VideoTexture —
// the same object a webcam's Frame carries (webcamCapture.js), so every
// picture consumer that takes a webcam takes this unchanged, and so does the
// network (picturePeers.js already streams canvases this way). A texture
// can't cross WebGL contexts; a video element can.
//
// Returns null where the browser can't capture (jsdom, very old engines) —
// the port then carries null, which every consumer already reads as "no
// picture here", never a fake one.
export const SCENE_PICTURE_FPS = 30

export function captureCanvasPicture(canvas, { fps = SCENE_PICTURE_FPS, createVideo } = {}) {
    if (!canvas || typeof canvas.captureStream !== 'function') return null
    let stream
    try {
        stream = canvas.captureStream(fps)
    } catch {
        return null
    }
    const video = createVideo ? createVideo() : globalThis.document?.createElement('video')
    if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        return null
    }
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    video.play?.()?.catch(() => {})
    return {
        texture,
        // Every track stopped, the texture freed: a capture left running keeps
        // encoding a canvas nobody reads.
        stop() {
            stream.getTracks().forEach((track) => track.stop())
            texture.dispose()
            video.pause?.()
            video.srcObject = null
        },
    }
}
