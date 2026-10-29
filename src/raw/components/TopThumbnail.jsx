import { useEffect, useRef } from 'react'
import { registerTopThumbnail } from '../../project/tops/topThumbnails.js'
import { useTopReport } from '../../project/tops/topReports.js'
import { TOP_PICTURE_HEIGHT, TOP_PICTURE_WIDTH } from '../utils/cardGeometry.js'

// The live picture on a picture operator's card. It draws nothing itself: it
// hands its canvas to the network runner, which copies this operator's output
// in a few times a second — so a card that is scrolled away or zoomed out of
// sight unregisters and costs the GPU nothing.
//
// A camera that cannot open says why ON the card, over the black: black alone
// reads as "still loading" forever (2026-10-02, a Camera In opened over plain
// http from another machine). The reason arrives through topReports, from this
// page or from the machine the camera runs on.
export default function TopThumbnail({ nodeId, top }) {
    const canvasRef = useRef(null)
    const camera = useTopReport(nodeId).camera
    useEffect(() => {
        const context = canvasRef.current?.getContext('2d')
        return registerTopThumbnail(nodeId, context)
    }, [nodeId])
    return (
        <>
            <canvas
                ref={canvasRef}
                className="raw-top-picture"
                width={TOP_PICTURE_WIDTH}
                height={TOP_PICTURE_HEIGHT}
                style={{ top }}
                aria-hidden="true"
            />
            {camera?.blocked && camera.error ? (
                <p
                    className="raw-top-picture-refusal"
                    role="status"
                    style={{ top, width: TOP_PICTURE_WIDTH, height: TOP_PICTURE_HEIGHT }}
                >
                    {camera.error}
                </p>
            ) : null}
        </>
    )
}
