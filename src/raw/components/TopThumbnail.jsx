import { useEffect, useRef } from 'react'
import { registerTopThumbnail } from '../../project/tops/topThumbnails.js'
import { TOP_PICTURE_HEIGHT, TOP_PICTURE_WIDTH } from '../utils/cardGeometry.js'

// The live picture on a picture operator's card. It draws nothing itself: it
// hands its canvas to the network runner, which copies this operator's output
// in a few times a second — so a card that is scrolled away or zoomed out of
// sight unregisters and costs the GPU nothing.
export default function TopThumbnail({ nodeId, top }) {
    const canvasRef = useRef(null)
    useEffect(() => {
        const context = canvasRef.current?.getContext('2d')
        return registerTopThumbnail(nodeId, context)
    }, [nodeId])
    return (
        <canvas
            ref={canvasRef}
            className="raw-top-picture"
            width={TOP_PICTURE_WIDTH}
            height={TOP_PICTURE_HEIGHT}
            style={{ top }}
            aria-hidden="true"
        />
    )
}
