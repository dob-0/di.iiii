import { useMemo } from 'react'
import { qrModules, qrPathData } from '../utils/qrCode.js'

/**
 * A scannable QR code for `value` (src/utils/qrCode.js). Dark on white with
 * its quiet zone inside the square, so it reads on any page theme. Square
 * corners: the house draws rectangles only.
 */
export default function QrCode({ value, size = 200, label }) {
    const qr = useMemo(() => qrModules(value), [value])
    if (!qr) return null
    return (
        <svg
            className="qr-code"
            role="img"
            aria-label={label || `QR code: ${value}`}
            data-qr-value={value}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${qr.size} ${qr.size}`}
            width={size}
            height={size}
            shapeRendering="crispEdges"
        >
            <rect width={qr.size} height={qr.size} fill="#ffffff" />
            <path d={qrPathData(qr.data)} fill="#000000" />
        </svg>
    )
}
