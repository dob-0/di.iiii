// Corner-pin: the one piece of real maths in the mapper.
//
// A projector sees a flat wall from an angle, so a rectangle of pixels lands on
// it as a general quadrilateral. Recovering that is a plane-to-plane projective
// transform — a homography — and the browser can apply one for free, because
// `transform: matrix3d(...)` on a DOM element IS a projective transform when
// the perspective terms are non-zero.
//
// That is why the whole mapper is DOM and not WebGL. An <iframe> corner-pins
// exactly like a <canvas> does, and the kids' work currently lives in pages we
// can only reach by URL — a texture-based compositor could not show it at all.

// Solve A·x = b for an n×n system by Gaussian elimination with partial
// pivoting. Returns null when the matrix is singular, which for our purposes
// means the four corners are degenerate (three collinear, or two dragged onto
// each other). Callers fall back to "draw nothing" rather than NaN the page.
export const solveLinearSystem = (matrix, vector) => {
    const n = vector.length
    const a = matrix.map((row, i) => [...row, vector[i]])

    for (let col = 0; col < n; col += 1) {
        let pivot = col
        for (let row = col + 1; row < n; row += 1) {
            if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
        }
        if (Math.abs(a[pivot][col]) < 1e-10) return null
        if (pivot !== col) { const swap = a[pivot]; a[pivot] = a[col]; a[col] = swap }

        for (let row = 0; row < n; row += 1) {
            if (row === col) continue
            const factor = a[row][col] / a[col][col]
            if (factor === 0) continue
            for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k]
        }
    }

    const solution = new Array(n)
    for (let i = 0; i < n; i += 1) solution[i] = a[i][n] / a[i][i]
    return solution.every((value) => Number.isFinite(value)) ? solution : null
}

// Four point correspondences -> the eight free coefficients of a homography
// (the ninth is fixed at 1). Each correspondence gives two rows:
//   X = (h0·x + h1·y + h2) / (h6·x + h7·y + 1)
//   Y = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
// cross-multiplied into linear form.
export const solveHomography = (source, destination) => {
    if (!Array.isArray(source) || !Array.isArray(destination)) return null
    if (source.length !== 4 || destination.length !== 4) return null

    const matrix = []
    const vector = []
    for (let i = 0; i < 4; i += 1) {
        const x = Number(source[i]?.[0])
        const y = Number(source[i]?.[1])
        const X = Number(destination[i]?.[0])
        const Y = Number(destination[i]?.[1])
        if (![x, y, X, Y].every(Number.isFinite)) return null
        matrix.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); vector.push(X)
        matrix.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); vector.push(Y)
    }
    return solveLinearSystem(matrix, vector)
}

// CSS matrix3d() takes its sixteen numbers in COLUMN-major order. Laid out as
// columns, a 2D homography is:
//   col1 = (h0, h3, 0, h6)   col2 = (h1, h4, 0, h7)
//   col3 = (0, 0, 1, 0)      col4 = (h2, h5, 0, 1)
// The w component (row 4) is what makes it projective rather than affine —
// drop it and you get a parallelogram, which is the classic wrong-looking
// "mapped" surface that never quite sits on the wall.
export const homographyToMatrix3d = (h) => {
    if (!h || h.length !== 8) return null
    const [a, b, c, d, e, f, g, i] = h
    const n = (value) => (Object.is(value, -0) ? 0 : value)
    return `matrix3d(${n(a)}, ${n(d)}, 0, ${n(g)}, ${n(b)}, ${n(e)}, 0, ${n(i)}, 0, 0, 1, 0, ${n(c)}, ${n(f)}, 0, 1)`
}

// The transform a surface's layer needs: its own unwarped w×h box pinned to
// four points given in the OUTPUT frame's pixels. Requires
// `transform-origin: 0 0` on the element, which mapSurface.css sets.
export const cornerPinTransform = (width, height, corners) => {
    if (!(width > 0) || !(height > 0)) return null
    if (!Array.isArray(corners) || corners.length !== 4) return null
    const source = [[0, 0], [width, 0], [width, height], [0, height]]
    return homographyToMatrix3d(solveHomography(source, corners))
}

// Normalised (0..1 of the output frame) corners -> pixels. Corners are stored
// normalised so a mapping made on a 1440p laptop still lands on a 1080p
// projector: the wall does not move when the output resolution changes.
export const cornersToPixels = (corners, width, height) =>
    corners.map(([x, y]) => [x * width, y * height])

// Signed area via the shoelace formula. Negative means the quad was dragged
// inside-out (mirrored), which is legal and occasionally wanted — a projector
// bouncing off a mirror — so it is reported, never corrected.
export const quadSignedArea = (corners) => {
    if (!Array.isArray(corners) || corners.length !== 4) return 0
    let area = 0
    for (let i = 0; i < 4; i += 1) {
        const [x1, y1] = corners[i]
        const [x2, y2] = corners[(i + 1) % 4]
        area += (x1 * y2) - (x2 * y1)
    }
    return area / 2
}

// A quad too small or too thin to solve. Checked before drawing so a corner
// dragged onto its neighbour blanks that one surface instead of throwing.
export const isDegenerateQuad = (corners) => Math.abs(quadSignedArea(corners)) < 1e-6

// clip-path: polygon() for a mask stored in the surface's OWN 0..1 space. The
// mask is applied in the element's local box and the corner-pin transform maps
// it afterwards, so a mask drawn on the editor preview lands on the same paper
// edge on the wall. An empty mask means the full rectangle.
export const maskToClipPath = (mask) => {
    if (!Array.isArray(mask) || mask.length < 3) return 'none'
    const points = mask
        .filter((point) => Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1])))
        .map(([x, y]) => `${(x * 100).toFixed(4)}% ${(y * 100).toFixed(4)}%`)
    return points.length < 3 ? 'none' : `polygon(${points.join(', ')})`
}

// The CSS filter chain for a surface's colour controls. Written in this order
// because it reads the way an operator thinks: brightness first (how much
// light is hitting the paper), then contrast, then the colour itself.
export const surfaceFilter = ({ brightness = 1, contrast = 1, saturation = 1, hue = 0 } = {}) => {
    const parts = []
    if (brightness !== 1) parts.push(`brightness(${brightness})`)
    if (contrast !== 1) parts.push(`contrast(${contrast})`)
    if (saturation !== 1) parts.push(`saturate(${saturation})`)
    if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`)
    return parts.length ? parts.join(' ') : 'none'
}

// Apply a solved homography to a point. Used by the desk to draw mask handles:
// a mask lives in the surface's own space, so its points have to be pushed
// through the same transform the browser applies to the pixels before a handle
// can sit on top of the right bit of wall.
export const applyHomography = (h, [x, y]) => {
    if (!h || h.length !== 8) return null
    const [a, b, c, d, e, f, g, i] = h
    const w = (g * x) + (i * y) + 1
    if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null
    return [((a * x) + (b * y) + c) / w, ((d * x) + (e * y) + f) / w]
}

// The homography that undoes another one — solved rather than inverted,
// because swapping the correspondences is the same work and cannot drift out
// of step with solveHomography's own conventions.
export const inverseHomography = (source, destination) => solveHomography(destination, source)
