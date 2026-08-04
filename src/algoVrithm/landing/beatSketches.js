// 2D stand-ins for the beats of the piece.
//
// These are NOT the sequences. Each one is a few lines of canvas drawn from the
// same description the beat is built on — enough that scrubbing the timeline
// tells you what changes and in what order, and dishonest to pretend otherwise:
// the piece is raymarched, stereo, and surrounds you, and none of that survives
// a rectangle. The page says so in as many words next to the frame.
//
// Every sketch takes (ctx, view) and paints the FULL frame; the caller sets
// globalAlpha to the beat's cross-fade weight and draws the live beats in edit
// order, which is the same compositing the piece does at a seam.
//
// view = { width, height, progress (0..1 through the beat), elapsed (sec into
// the piece), ink, world }

// The piece's pulse, copied from WhiteTunnel.jsx — 0.85 Hz swelled by pow(,2),
// which Halo and TestPattern also run on so the whole work has one heartbeat.
// This was 2.4 Hz and flat, invented here: the poster breathed at nearly three
// times the rate of the thing it is a poster for, and twice as bright, because
// an unsquared sine averages 0.5 where the squared one averages 0.25.
//
// COPIED, not imported: WhiteTunnel.jsx pulls @react-three/fiber, and importing
// it here would drag 1.6 MB of renderer into a page that deliberately has none.
// Same trade as the edit list in beatCards.js, and kept honest the same way, by
// a test that reads both files.
const STROBE_HZ = 0.85
const STROBE_SHARPNESS = 2

const strobe = (elapsed) => Math.pow(0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 * STROBE_HZ), STROBE_SHARPNESS)

const fill = (ctx, view, color) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, view.width, view.height)
}

// Beat 01 — the corridor, in perspective, rushing the eye. Ends by crushing
// flat against the viewer, which in 2D is the bore swallowing the frame.
const tunnel = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#000000')
    const cx = width / 2
    const cy = height / 2
    const contact = Math.max(0, (progress - 0.86) / 0.14)
    const rush = progress * 6

    ctx.lineWidth = Math.max(1, height / 220)
    for (let i = 0; i < 22; i += 1) {
        // Each ring travels toward the viewer on its own phase; the modulo is
        // what makes it a loop rather than 22 rings that run out.
        const phase = (i / 22 + rush) % 1
        const radius = Math.pow(phase, 2.2) * height * (0.9 + contact * 6)
        if (radius < 1) continue
        const swell = 0.35 + 0.65 * strobe(elapsed - i * 0.02)
        ctx.strokeStyle = ink
        ctx.globalAlpha = view.alpha * swell * (1 - phase) * 0.9
        ctx.beginPath()
        ctx.ellipse(cx, cy, radius * 0.62, radius, 0, 0, Math.PI * 2)
        ctx.stroke()
    }
    ctx.globalAlpha = view.alpha

    if (contact > 0) {
        ctx.fillStyle = ink
        ctx.globalAlpha = view.alpha * Math.min(1, contact * 1.4)
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = view.alpha
    }
}

// Beat 01b — rings born at the tunnel's own bore, expanding away and dying.
const halo = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#000000')
    const cx = width / 2
    const cy = height / 2
    const born = Math.floor(progress * 10)

    ctx.lineWidth = Math.max(1, height / 260)
    for (let i = 0; i <= born; i += 1) {
        const age = progress * 10 - i
        if (age < 0 || age > 3) continue
        const radius = (0.08 + age * 0.22) * height
        ctx.strokeStyle = ink
        ctx.globalAlpha = view.alpha * Math.max(0, 1 - age / 3) * (0.5 + 0.5 * strobe(elapsed))
        ctx.beginPath()
        ctx.ellipse(cx, cy, radius * 1.15, radius, 0, 0, Math.PI * 2)
        ctx.stroke()
    }
    ctx.globalAlpha = view.alpha
}

// Beat 02 — hairline bars quantised to three widths, switching on a 6 Hz tick,
// with a scan plane crossing the volume three times.
const scan = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#000000')
    const tick = Math.floor(elapsed * 6)
    const widths = [1, 2, 4]

    ctx.fillStyle = ink
    let x = 0
    let seed = tick * 9973
    while (x < width) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        const w = widths[seed % 3] * Math.max(1, width / 480)
        const gap = ((seed >> 5) % 5 + 1) * Math.max(1, width / 480)
        ctx.globalAlpha = view.alpha * (0.25 + ((seed >> 9) % 5) * 0.15)
        // Full height. The bars sit on cylindrical shells AROUND the
        // standpoint, so they run past the top and bottom of any frame — a
        // band with dark above and below would draw a rectangle the beat has
        // no edge for, and at a seam it reads as a letterbox.
        ctx.fillRect(x, 0, w, height)
        x += w + gap
    }

    const sweep = (progress * 3) % 1
    ctx.globalAlpha = view.alpha * 0.9
    ctx.fillStyle = ink
    ctx.fillRect(0, sweep * height, width, Math.max(1, height / 180))
    ctx.globalAlpha = view.alpha
}

// Beat 03 — black slabs on a cell grid streaming past, upper and lower halves
// stepping in opposite directions, one fifth of the cells lit.
const pattern = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#FFFFFF')
    const cols = 26
    const rows = 14
    const cw = width / cols
    const ch = height / rows
    const step = Math.floor(elapsed * 2.6)
    const drift = progress * cw * 8

    ctx.fillStyle = ink
    for (let r = 0; r < rows; r += 1) {
        const upper = r < rows / 2
        const shift = upper ? drift : -drift
        for (let c = -1; c <= cols; c += 1) {
            const seed = ((r * 31 + c * 17 + step * (upper ? 3 : 5)) * 2654435761) & 0x7fffffff
            if (seed % 5 !== 0) continue
            const x = ((c * cw + shift) % (width + cw) + width + cw) % (width + cw) - cw
            // Depth: ranks nearer the horizon wash toward the world colour,
            // which is the fog doing the work in the real beat.
            const depth = Math.abs(r - rows / 2) / (rows / 2)
            ctx.globalAlpha = view.alpha * (0.25 + depth * 0.75)
            ctx.fillRect(x, r * ch, cw * (1 + (seed >> 7) % 2), ch * 0.86)
        }
    }
    ctx.globalAlpha = view.alpha
}

// Beat 04 — pairs fusing and parting, then welding into one wall with a portal
// in it. The smooth minimum is faked with radial gradients: a metaball look
// without a raymarcher, which is all a poster needs.
const metaball = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#FFFFFF')
    const close = Math.max(0, (progress - 0.66) / 0.34)
    const swell = 1 + close * 2.6

    ctx.fillStyle = ink
    for (let p = 0; p < 9; p += 1) {
        const angle = (p / 9) * Math.PI * 2 + elapsed * 0.18
        const orbit = (0.16 + (p % 3) * 0.09) * height * (1 - close * 0.55)
        const pull = Math.sin(elapsed * (Math.PI * 2 / 2.67) + p) * 0.5 + 0.5
        for (let s = -1; s <= 1; s += 2) {
            const spread = orbit * 0.55 * (1 - pull)
            const x = width / 2 + Math.cos(angle) * orbit + Math.cos(angle + Math.PI / 2) * spread * s
            const y = height / 2 + Math.sin(angle) * orbit * 0.7 + Math.sin(angle + Math.PI / 2) * spread * s
            const r = height * 0.075 * swell
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
            grad.addColorStop(0, 'rgba(0,0,0,1)')
            grad.addColorStop(0.72, 'rgba(0,0,0,0.92)')
            grad.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = grad
            ctx.globalAlpha = view.alpha
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    if (close > 0.55) {
        const weld = (close - 0.55) / 0.45
        ctx.fillStyle = ink
        ctx.globalAlpha = view.alpha * weld
        ctx.fillRect(0, 0, width, height)
        // The portal, with the next beat already visible through it.
        ctx.globalCompositeOperation = 'destination-out'
        ctx.globalAlpha = weld
        ctx.beginPath()
        ctx.arc(width / 2, height / 2, height * 0.34 * weld, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
    }
    ctx.globalAlpha = view.alpha
}

// Beat 05 — a closed shell of 9:16 reels on a lat/long grid, seen from inside.
const globe = (ctx, view) => {
    const { width, height, progress, elapsed, ink } = view
    fill(ctx, view, '#04050A')
    const cols = 18
    const rows = 9
    // Held still, then swiped, then accelerating into noise — the three
    // movements of the beat, in its own real seconds.
    const swipe = progress < 0.28 ? 0 : Math.pow((progress - 0.28) / 0.72, 2.4) * 14
    const cw = width / cols
    const ch = height / rows

    for (let r = 0; r < rows; r += 1) {
        // Latitude squeeze: cells shrink toward the poles, which is what makes
        // it read as a shell rather than a wall.
        const lat = (r + 0.5) / rows
        const squeeze = Math.sin(lat * Math.PI)
        for (let c = -1; c <= cols; c += 1) {
            const x = ((c * cw + swipe * cw) % (width + cw) + width + cw) % (width + cw) - cw
            const seed = ((r * 131 + c * 71) * 2654435761) & 0x7fffffff
            const flicker = 0.35 + 0.65 * (((seed >> 3) % 100) / 100)
            ctx.globalAlpha = view.alpha * flicker * (0.35 + squeeze * 0.65)
            ctx.fillStyle = (seed % 7 === 0) ? ink : '#1B2430'
            const h = ch * squeeze * 0.92
            ctx.fillRect(x + cw * 0.06, r * ch + (ch - h) / 2, cw * 0.88, h)
        }
    }

    if (progress > 0.86) {
        // Noise, at the runaway.
        const noise = (progress - 0.86) / 0.14
        ctx.globalAlpha = view.alpha * noise * 0.5
        ctx.fillStyle = ink
        for (let i = 0; i < 160; i += 1) {
            const seed = ((i * 2654435761) ^ Math.floor(elapsed * 60)) & 0x7fffffff
            ctx.fillRect((seed % width), ((seed >> 9) % height), width / 60, height / 90)
        }
    }
    ctx.globalAlpha = view.alpha
}

// Beat 06 — the monument: a vast sphere with an iridescent fluid surface, eight
// columns strobing outward in sequence in the piece's own white.
const sphere = (ctx, view) => {
    const { width, height, progress, elapsed } = view
    fill(ctx, view, '#0D1114')
    const cx = width / 2
    const cy = height * 0.52
    const r = height * (0.2 + progress * 0.08)

    for (let i = 0; i < 8; i += 1) {
        const t = i / 8
        const x = width * (0.06 + t * 0.88)
        const lit = Math.max(0, Math.sin(elapsed * Math.PI * 2 * 0.9 - i * 0.5))
        ctx.globalAlpha = view.alpha * (0.12 + lit * 0.85)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(x - width * 0.012, height * 0.1, width * 0.024, height * 0.82)
    }

    // Three wandering sources welling colour out of the surface.
    const grad = ctx.createRadialGradient(
        cx - r * 0.35 * Math.sin(elapsed * 0.6),
        cy - r * 0.3 * Math.cos(elapsed * 0.4),
        r * 0.05,
        cx,
        cy,
        r
    )
    grad.addColorStop(0, '#CFE3EC')
    grad.addColorStop(0.45, '#3B6C8F')
    grad.addColorStop(0.8, '#141C24')
    grad.addColorStop(1, '#0D1114')
    ctx.globalAlpha = view.alpha
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
}

export const BEAT_SKETCHES = { tunnel, halo, scan, pattern, metaball, globe, sphere }

// One frame of the preview: every live beat painted in edit order at its
// cross-fade weight, over the lead beat's world colour so a seam never flashes
// through to the page background.
export const paintFrame = (ctx, { width, height, elapsed, live }) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.fillStyle = live.length ? live[live.length - 1].beat.world : '#000000'
    ctx.fillRect(0, 0, width, height)

    live.forEach(({ beat, weight }) => {
        const draw = BEAT_SKETCHES[beat.sketch]
        if (!draw) return
        const span = Math.max(0.001, beat.endSec - beat.startSec)
        ctx.save()
        ctx.globalAlpha = weight
        draw(ctx, {
            width,
            height,
            elapsed,
            alpha: weight,
            ink: beat.ink,
            world: beat.world,
            progress: Math.max(0, Math.min(1, (elapsed - beat.startSec) / span))
        })
        ctx.restore()
    })
}
