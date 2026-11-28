// SCREENS AND THE WALL PICTURE.
//
// The desk used to have one idea: a surface, which was both a place on the
// wall AND the thing playing there. A show with ten visuals became ten
// surfaces stacked on one rectangle, switched by cues that copied every
// surface's source — and a cue recorded before a fix put the old visual back
// mid-show (Jam Discipline #4, 2026-10-14).
//
// Now the two are apart, the way Resolume keeps slices apart from clips:
//
//   - a SCREEN is a surface whose source is `wall`. It shows its own piece of
//     the wall picture: `input` [x, y, w, h], normalised to the output, is the
//     rectangle it takes, and its corners are where that rectangle lands.
//     No `input` means "the box my corners make", so a screen nobody has
//     warped shows exactly the pixels under it.
//   - a VISUAL lives in `mapping.visuals`, and `mapping.playing` names the one
//     on the wall. A screen can also play one visual by itself (source kind
//     `visual`, ref = visual id), fitted to that screen.

const EPSILON = 1e-4

export const isScreenKind = (kind) => kind === 'wall' || kind === 'visual'

export const boundsOfCorners = (corners = []) => {
    const xs = corners.map(([x]) => x)
    const ys = corners.map(([, y]) => y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]
}

// The rectangle of the wall picture a screen shows.
export const screenInput = (surface) => {
    const input = surface?.input
    if (Array.isArray(input) && input.length === 4 && input.every(Number.isFinite) && input[2] > 0 && input[3] > 0) return input
    const bounds = boundsOfCorners(surface?.corners || [])
    return bounds.every(Number.isFinite) && bounds[2] > 0 && bounds[3] > 0 ? bounds : [0, 0, 1, 1]
}

export const rectCorners = ([x, y, w, h]) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

// A screen whose corners sit exactly on its own input rectangle shows the
// wall's pixels unmoved — an LED panel, or a projector nobody has keystoned.
export const isUnwarped = (surface, input = screenInput(surface)) => {
    const target = rectCorners(input)
    return (surface?.corners || []).length === 4
        && surface.corners.every(([x, y], index) => Math.abs(x - target[index][0]) < EPSILON && Math.abs(y - target[index][1]) < EPSILON)
}

// Unwarped wall screens with nothing of their own (no mask, no dimming, no
// colour, no blend) can all look through ONE copy of the wall picture. That
// matters: a web-page visual is an iframe, an iframe cannot be sampled and
// copied, and five copies of a 3200x1440 page cost five times the frame. A
// warped screen still gets its own copy, because it has to be drawn bent.
export const sharesWallLayer = (surface, input = screenInput(surface)) => (
    surface?.source?.kind === 'wall'
    && isUnwarped(surface, input)
    && !(surface.mask?.length)
    && (surface.opacity ?? 1) >= 1
    && (surface.brightness ?? 1) === 1
    && (surface.contrast ?? 1) === 1
    && (surface.saturation ?? 1) === 1
    && (surface.hue ?? 0) === 0
    && (!surface.blend || surface.blend === 'normal')
    && (!surface.flip || surface.flip === 'none')
    && !surface.isKey
    && surface.blackBg !== false
    && !surface.red && !surface.green && !surface.blue
    && !surface.softEdge?.enabled
    && !surface.inputRotation
)

// The union of rectangles as a CSS path(), in pixels of a width x height box.
// Same winding for every rectangle, so overlaps add instead of cancelling.
export const rectsToClipPath = (rects, width, height) => {
    const round = (value) => Math.round(value * 100) / 100
    const parts = rects.map(([x, y, w, h]) => {
        const left = round(x * width)
        const top = round(y * height)
        const right = round((x + w) * width)
        const bottom = round((y + h) * height)
        return `M${left} ${top}H${right}V${bottom}H${left}Z`
    })
    return parts.length ? `path('${parts.join('')}')` : 'none'
}

// What a crossfade compares: change the visual, or what the visual points at,
// and the wall fades to the new picture. Rename it and nothing happens.
export const visualKey = (visual, mode = 'wall') => (
    visual ? `${mode}|${visual.id}|${visual.source?.kind || ''}|${visual.source?.ref || ''}` : ''
)

// Ready-made walls, picked from "Add screens". Each returns screens with
// corners equal to their input, so they start unwarped and share one layer.
export const screenPresets = [
    { id: 'one', label: 'One screen (whole wall)', count: 1, columns: 1, rows: 1 },
    { id: 'row2', label: '2 side by side', count: 2, columns: 2, rows: 1 },
    { id: 'row3', label: '3 side by side', count: 3, columns: 3, rows: 1 },
    { id: 'row4', label: '4 side by side', count: 4, columns: 4, rows: 1 },
    { id: 'row5', label: '5 side by side', count: 5, columns: 5, rows: 1 },
    { id: 'grid2x2', label: '2 × 2 grid', count: 4, columns: 2, rows: 2 },
    { id: 'grid3x2', label: '3 × 2 grid', count: 6, columns: 3, rows: 2 },
    { id: 'grid3x3', label: '3 × 3 grid', count: 9, columns: 3, rows: 3 },
    { id: 'grid8x2', label: '8 × 2 grid', count: 16, columns: 8, rows: 2 }
]

export const presetScreens = (preset, output = { width: 1920, height: 1080 }, startNumber = 1) => {
    const { columns, rows } = preset
    const screens = []
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const input = [column / columns, row / rows, 1 / columns, 1 / rows].map((value) => Math.round(value * 1e6) / 1e6)
            screens.push({
                name: `Screen ${startNumber + screens.length}`,
                corners: rectCorners(input),
                input,
                source: { kind: 'wall', ref: '' },
                resolution: [
                    Math.max(1, Math.round(input[2] * output.width)),
                    Math.max(1, Math.round(input[3] * output.height))
                ]
            })
        }
    }
    return screens
}

// What a dropped file becomes. HTML is a single-file page: a sketch, a
// shader toy, a generative piece — the kind of visual a jam is made of.
export const visualKindForFile = (file) => {
    const type = String(file?.type || '').toLowerCase()
    const name = String(file?.name || '').toLowerCase()
    if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/.test(name)) return 'video'
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)) return 'image'
    if (type === 'text/html' || /\.html?$/.test(name)) return 'html'
    return ''
}

export const visualNameForFile = (file) => String(file?.name || 'Visual').replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || 'Visual'
