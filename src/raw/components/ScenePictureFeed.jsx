import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { captureCanvasPicture } from '../utils/canvasPicture.js'

// Mounted INSIDE a Scene window's canvas: publishes what that canvas draws as
// the Scene's Picture output (nodeId:picture in liveOutputs). Only the live
// Scene's window mounts it (RawEditor), so one Scene has one picture. A
// window that is closed draws nothing and so gives nothing — the honesty
// rule media.video's Frame follows.
//
// onPictureChange MUST be stable (see RawEditor's handleFrameOutputChange):
// a fresh callback per render restarts the capture every render.
export default function ScenePictureFeed({ nodeId, onPictureChange }) {
    const canvas = useThree((state) => state.gl?.domElement)
    useEffect(() => {
        if (!nodeId || !onPictureChange || !canvas) return undefined
        const capture = captureCanvasPicture(canvas)
        if (!capture) return undefined
        onPictureChange(nodeId, capture.texture)
        return () => {
            onPictureChange(nodeId, null)
            capture.stop()
        }
    }, [canvas, nodeId, onPictureChange])
    return null
}
