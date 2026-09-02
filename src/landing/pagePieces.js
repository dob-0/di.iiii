import * as THREE from 'three'

// The page, turned into things.
//
// CSS3DRenderer got the landing standing in space, but the browser draws DOM
// in its own layer above the WebGL canvas and cannot interleave the two by
// depth — so a door could never pass in FRONT of the wordmark, however far
// into the room it was. That is the ceiling this module goes through: each
// element is drawn onto a canvas, handed to a real mesh in the room's own
// scene, and from that moment it is an object like any other. It occludes and
// is occluded, it has weight, and it lands on the floor.
//
// The swap happens at the seam. At rest the page is real HTML — identical,
// selectable, keyboard-reachable — and the pieces only exist from the frame
// the door is pressed, spawned at exactly the screen position the element
// occupied, so the handover cannot be seen.

const PIXELS_PER_CANVAS = 2

// How far in front of the eye the page hangs at the moment it becomes objects.
// Close enough that its pieces are big and legible as they leave, far enough
// that they have room to fall into the room rather than onto the lens.
export const PIECE_DISTANCE_M = 7

// The nearest a piece hangs, and the furthest. A page at 4 metres is close
// enough to read as you pass it; one at 16 is still ahead of you when you
// reach the doors.
export const PIECE_NEAR_M = 4
export const PIECE_FAR_M = 16

const parseRgb = (value) => {
    const match = /rgba?\(([^)]+)\)/.exec(value || '')
    if (!match) return null
    const parts = match[1].split(',').map((n) => parseFloat(n))
    if (parts.length < 3) return null
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

const isPainted = (value) => {
    const rgb = parseRgb(value)
    return Boolean(rgb && rgb.a > 0.02)
}

// A faithful redraw, not a screenshot. `html2canvas` and the SVG foreignObject
// trick both fall over on the webfonts this page uses, and both would ship a
// dependency to solve a problem this page only has for six elements. Reading
// the computed style and drawing it is exact where it matters — family,
// weight, size, colour, letter-spacing, the border and the fill — and it is
// the only version that cannot silently render a fallback font.
export const drawElement = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    const style = window.getComputedStyle(el)
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(rect.width * PIXELS_PER_CANVAS))
    canvas.height = Math.max(2, Math.round(rect.height * PIXELS_PER_CANVAS))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(PIXELS_PER_CANVAS, PIXELS_PER_CANVAS)

    if (isPainted(style.backgroundColor)) {
        ctx.fillStyle = style.backgroundColor
        ctx.fillRect(0, 0, rect.width, rect.height)
    }

    const borderWidth = parseFloat(style.borderTopWidth) || 0
    if (borderWidth > 0 && isPainted(style.borderTopColor)) {
        ctx.strokeStyle = style.borderTopColor
        ctx.lineWidth = borderWidth
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, rect.width - borderWidth, rect.height - borderWidth)
    }

    // Text is drawn run by run so a coloured span inside a heading — the cyan
    // dot in `di.iiii` — keeps its colour instead of flattening to the
    // parent's.
    const runs = textRuns(el)
    if (runs.length) {
        const size = parseFloat(style.fontSize) || 16
        const lineHeight = parseFloat(style.lineHeight) || size * 1.2
        const tracking = parseFloat(style.letterSpacing) || 0
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`
        ctx.textBaseline = 'middle'
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${tracking}px`

        const lines = groupIntoLines(runs)
        const blockHeight = lines.length * lineHeight
        const top = (rect.height - blockHeight) / 2 + lineHeight / 2

        lines.forEach((line, index) => {
            const width = line.reduce((sum, run) => sum + measure(ctx, run.text, tracking), 0)
            let x = style.textAlign === 'left' || style.textAlign === 'start'
                ? parseFloat(style.paddingLeft) || 0
                : (rect.width - width) / 2
            line.forEach((run) => {
                ctx.fillStyle = run.color || style.color
                ctx.fillText(run.text, x, top + index * lineHeight)
                x += measure(ctx, run.text, tracking)
            })
        })
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 4
    texture.colorSpace = THREE.SRGBColorSpace
    return { texture, rect }
}

const measure = (ctx, text, tracking) => ctx.measureText(text).width + tracking * text.length

// Walks the element for text, keeping each run's own colour and remembering
// where the line breaks were.
const textRuns = (el) => {
    const runs = []
    const walk = (node, color) => {
        node.childNodes.forEach((child) => {
            if (child.nodeType === 3) {
                const text = child.textContent.replace(/\s+/g, ' ')
                if (text.trim()) runs.push({ text, color, br: false })
                return
            }
            if (child.nodeType !== 1) return
            if (child.tagName === 'BR') { runs.push({ text: '', color, br: true }); return }
            walk(child, window.getComputedStyle(child).color)
        })
    }
    walk(el, window.getComputedStyle(el).color)
    return runs
}

const groupIntoLines = (runs) => {
    const lines = [[]]
    runs.forEach((run) => {
        if (run.br) { lines.push([]); return }
        lines[lines.length - 1].push(run)
    })
    return lines.filter((line) => line.length)
}

/**
 * Where a screen rectangle sits in the room, seen from a given camera.
 *
 * The inverse of a projection: put the plane `distance` metres in front of the
 * eye and it covers exactly the pixels the element covered, so the first frame
 * of the fall is the last frame of the page.
 */
export const placeInWorld = ({ rect, camera, viewport, distance = PIECE_DISTANCE_M }) => {
    const position = new THREE.Vector3(...camera.position)
    const target = new THREE.Vector3(...camera.target)
    const forward = target.clone().sub(position).normalize()
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
    const up = right.clone().cross(forward).normalize()

    const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const halfWidth = halfHeight * (viewport.width / viewport.height)

    const nx = ((rect.left + rect.width / 2) / viewport.width) * 2 - 1
    const ny = -(((rect.top + rect.height / 2) / viewport.height) * 2 - 1)

    return {
        position: position.clone()
            .addScaledVector(forward, distance)
            .addScaledVector(right, nx * halfWidth)
            .addScaledVector(up, ny * halfHeight),
        width: (rect.width / viewport.width) * halfWidth * 2,
        height: (rect.height / viewport.height) * halfHeight * 2,
        quaternion: new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(right, up, forward.clone().negate())
        )
    }
}

/**
 * Turn the elements a visitor can see into pieces standing in the room.
 * Returns [] rather than throwing if anything is unmeasurable — a door that
 * does nothing is worse than a door that opens on a plainer transition.
 */
export const makePagePieces = ({ elements, camera, viewport, near = PIECE_NEAR_M, far = PIECE_FAR_M }) => {
    if (!Array.isArray(elements) || !elements.length) return []
    const pieces = []
    const count = elements.length
    elements.forEach((el, index) => {
        const drawn = drawElement(el)
        if (!drawn) return
        // Each piece hangs at its OWN distance along its own view ray. It
        // still covers exactly the pixels its element covered — a ray through
        // the eye projects to the same point at any depth — but the page is
        // now spread through the room's depth before it has even started to
        // fall. Throwing them harder to achieve the same thing put them all
        // past the doors; this puts one at arm's length and one by the far
        // wall, which is what gives a walker parallax.
        const distance = count > 1 ? near + (far - near) * (index / (count - 1)) : (near + far) / 2
        const placed = placeInWorld({ rect: drawn.rect, camera, viewport, distance })
        pieces.push({
            id: `piece-${index}`,
            el,
            texture: drawn.texture,
            distance,
            ...placed
        })
    })
    return pieces
}
