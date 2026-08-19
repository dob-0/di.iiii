import { useEffect, useRef } from 'react'

// A wired texture port carries whatever the upstream produced — for
// source.webcam that is a live VideoTexture whose .image is the panel's own
// <video> element. A DOM node cannot be mounted twice, so the frame is copied
// to a canvas instead of the element being re-parented. Shared by every
// window that watches a texture (Image, Monitor).
export const isLiveTexture = (value) => Boolean(value && typeof value === 'object' && value.image)

export default function LiveTextureView({ texture, label, className = 'raw-image-panel-media' }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const media = texture?.image
        if (!canvas || !media) return undefined
        const context = canvas.getContext('2d')
        if (!context) return undefined

        let frame = null
        const draw = () => {
            const width = media.videoWidth || media.width || 0
            const height = media.videoHeight || media.height || 0
            if (width && height) {
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width
                    canvas.height = height
                }
                // A source that has not decoded its first frame throws rather
                // than drawing nothing; the next tick usually succeeds.
                try { context.drawImage(media, 0, 0, width, height) } catch { /* not ready */ }
            }
            frame = requestAnimationFrame(draw)
        }
        frame = requestAnimationFrame(draw)
        return () => { if (frame !== null) cancelAnimationFrame(frame) }
    }, [texture])

    return <canvas ref={canvasRef} className={className} aria-label={label} />
}
