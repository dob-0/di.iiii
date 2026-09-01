import { makePagePieces } from './pagePieces.js'

// Where the visit starts and where it lands.
//
// REST is the composed entry camera authored on the `main` space itself — the
// same shot `/main` opens on — so the room behind the landing is already
// framed the way it will be framed when the page is gone. WALK is where the
// walker stands the instant it takes over. The flight is the straight line
// between them, which is why the handover has nothing to cover up: the last
// frame of the flight and the first frame of walking are the same pose.
export const REST_POSE = { position: [0, 3, 14.5], target: [0, 1.2, -14], fov: 50 }

// Where the walker stands when the room authors no spawn of its own. A room
// that DOES author one reports it (`onArrivalPose`) and that wins — this
// number is the fallback, not the destination. Getting that backwards is what
// made the handover lurch: the flight landed here while the room's authored
// spawn put the walker 9 metres further back, and the camera snapped.
export const WALK_POSE = { position: [0, 1.6, 6], target: [0, 1.6, -14], fov: 50 }

// The walk camera is wider than the composed entry shot (60 against 50), and
// the swap happens on the same frame as the handover. Crossing the difference
// during the flight turns a zoom pop into part of the move.
const WALK_FOV = 60

export const FLIGHT_MS = 2200

// `?flight=<ms>` slows the entry down so it can actually be looked at, frame by
// frame, in a browser or a headless capture. Same opt-in shape as the walker's
// `?inputdebug=1`. A flight is 2.2 seconds of motion that no test can judge;
// this is how a person judges it.
const flightDuration = () => {
    if (typeof window === 'undefined') return FLIGHT_MS
    const asked = Number(new URLSearchParams(window.location.search).get('flight'))
    return Number.isFinite(asked) && asked >= 200 && asked <= 30000 ? asked : FLIGHT_MS
}

// Everything the landing can put on screen, nearest the eye first. Depth is in
// CSS pixels toward the viewer and is cancelled by a compensating scale, so
// these numbers change nothing until the camera moves — they only decide the
// order things pass you in. The wordmark leads because it is the thing the eye
// is already on.
const LIFTABLE = [
    { selector: '.lp-wordmark', depth: 190 },
    { selector: '.lp-tagline', depth: 130 },
    { selector: '.lp-hero-cta-row', depth: 70 },
    { selector: '.lp-cta-sub', depth: 20 },
    { selector: '.lp-hero-space-row', depth: -40 },
    { selector: '.lp-eyebrow', depth: -110 },
    { selector: '.lp-scroll-hint', depth: -150 },
    { selector: '.lp-section-inner', depth: 60 },
    { selector: '.lp-nav', depth: -260 }
]

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const lerp3 = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
]

const distance3 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

// Only what a visitor can actually see flies. Someone who scrolled to the
// footer and pressed the door there is looking at a section, not at the hero,
// and it is that section that has to come apart — otherwise the flight lifts
// six things nobody can see and the screen just empties.
//
// But it has to FIT, too. A section is up to 1918px tall on a 390px phone;
// pushed toward the eye it does not come apart, it smears — a wall of clipped
// display type sliding past both edges, with the same sentence drawn twice at
// two scales. Anything larger than the frame it is leaving cannot be seen
// leaving it, so it stays with the page and fades instead.
export const visibleLayers = (root, viewportHeight, viewportWidth = Infinity) => {
    if (!root) return []
    const layers = []
    LIFTABLE.forEach(({ selector, depth }) => {
        root.querySelectorAll(selector).forEach((el) => {
            const rect = el.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            if (rect.bottom <= 0 || rect.top >= viewportHeight) return
            if (rect.height > viewportHeight || rect.width > viewportWidth) return
            layers.push({ el, depth })
        })
    })
    // Nothing flies twice. `.lp-section-inner` contains a `.lp-cta-sub`, so a
    // door pressed in the closing section lifted that sentence as its own
    // layer AND again inside its ancestor — the same words drawn twice at two
    // depths, sliding apart. An outer layer carries its children with it, so
    // the outer one wins and the descendants stay inside it.
    return layers.filter(({ el }) => !layers.some((other) => other.el !== el && other.el.contains(el)))
}

/**
 * Fly from the landing into the room.
 *
 * Nothing here navigates. The room is already on screen behind the page — the
 * same `main` document, the same four doors — so stepping inside is a camera
 * move, and the only thing that "loads" is nothing at all.
 *
 * @param {object}   options
 * @param {Element}  options.root          the landing root (`.lp-root`)
 * @param {object}   options.cameraPoseRef ref the room scene reads every frame
 * @param {Function} options.onDone        called once the walker should take over
 * @param {boolean}  [options.reducedMotion]
 * @returns {Function} cancel
 */
export const flyInside = ({ root, cameraPoseRef, onDone, onPieces, reducedMotion = false, endPose = null }) => {
    // The room's own arrival if it reported one, the default if it did not.
    const destination = endPose?.position && endPose?.target
        ? { position: endPose.position, target: endPose.target, fov: WALK_FOV }
        : { ...WALK_POSE, fov: WALK_FOV }

    const finish = () => {
        cameraPoseRef.current = { ...destination }
        onDone?.()
    }

    if (!root || typeof window === 'undefined') {
        finish()
        return () => {}
    }

    // A visitor who asked for less motion is asking not to be flown anywhere.
    // They get the same destination, immediately — never a different one.
    if (reducedMotion) {
        finish()
        return () => {}
    }

    const layers = visibleLayers(root, window.innerHeight, window.innerWidth)

    // The page stops being a page here. Each element is drawn onto a canvas
    // and handed to the caller as a piece standing in the ROOM's own scene —
    // not a DOM layer above it — so from this frame on the doors can pass in
    // front of it, the fog can take it, and the floor can stop it.
    const pieces = makePagePieces({
        elements: layers.map(({ el }) => el),
        camera: REST_POSE,
        viewport: { width: window.innerWidth, height: window.innerHeight }
    })
    onPieces?.(pieces)

    // The clones are standing exactly on top of the originals at this instant,
    // so hiding the originals now is invisible. `visibility` and not `display`:
    // the layout must not reflow underneath, or the page the clones were
    // measured against stops existing while they are still quoting it.
    const hidden = layers.map(({ el }) => {
        const previous = el.style.visibility
        el.style.visibility = 'hidden'
        return { el, previous }
    })
    root.classList.add('lp-root--flying')

    let frame = 0
    let settling = 0
    const duration = flightDuration()
    const started = performance.now()

    const tick = (now) => {
        const t = Math.min(1, (now - started) / duration)
        const eased = easeInOutCubic(t)
        cameraPoseRef.current = {
            position: lerp3(REST_POSE.position, destination.position, eased),
            target: lerp3(REST_POSE.target, destination.target, eased),
            fov: REST_POSE.fov + (WALK_FOV - REST_POSE.fov) * eased
        }
        if (t < 1) {
            frame = requestAnimationFrame(tick)
            return
        }
        frame = 0
        // Hand over FIRST, tear down after. Taking the clones away before the
        // walker was rendered left one frame of bare landing between the two,
        // and putting the originals back before React had hidden them left the
        // page visible while it faded. The clones cover that commit; they are
        // removed two frames later, by which time the room owns the screen.
        finish()
        settling = requestAnimationFrame(() => {
            settling = requestAnimationFrame(cleanup)
        })
    }

    const cleanup = () => {
        if (frame) cancelAnimationFrame(frame)
        if (settling) cancelAnimationFrame(settling)
        frame = 0
        settling = 0
        hidden.forEach(({ el, previous }) => { el.style.visibility = previous })
        root.classList.remove('lp-root--flying')
    }

    frame = requestAnimationFrame(tick)

    return cleanup
}
