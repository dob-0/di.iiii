// Strokes a look's lit stretches on a 2D context: consecutive lit segments of one colour are ONE path and one stroke(),
// the order of the runs as the points come. (Before 2026-10-30 every segment was its own path with its own colour
// string: up to 240 stroke() calls per tile per frame, which kept the browser's gpu-process at a full core.)
// Loaded by the page as a plain script (window.DiLaserDraw) and by its test as a CommonJS module.
'use strict'
;((root, factory) => {
    const api = factory()
    if (typeof module === 'object' && module.exports) module.exports = api
    else root.DiLaserDraw = api
})(typeof window !== 'undefined' ? window : globalThis, () => {
    // X and Y map a field coordinate to canvas pixels. A segment is lit by its END point's colour, as a blank move is
    // not drawn.
    const strokeLitRuns = (g, points, X, Y) => {
        let colour = null // the open run's colour string; null = no open path
        for (let i = 1; i < points.length; i += 1) {
            const b = points[i]
            if (!(b[2] > 0 || b[3] > 0 || b[4] > 0)) {
                if (colour !== null) { g.stroke(); colour = null }
                continue
            }
            const r = Math.round(b[2] * 255)
            const gr = Math.round(b[3] * 255)
            const bl = Math.round(b[4] * 255)
            const same = colour !== null && r === colour[0] && gr === colour[1] && bl === colour[2]
            if (!same) {
                if (colour !== null) g.stroke()
                colour = [r, gr, bl]
                g.strokeStyle = `rgb(${r},${gr},${bl})`
                g.beginPath()
                g.moveTo(X(points[i - 1][0]), Y(points[i - 1][1]))
            }
            g.lineTo(X(b[0]), Y(b[1]))
        }
        if (colour !== null) g.stroke()
    }
    return { strokeLitRuns }
})
