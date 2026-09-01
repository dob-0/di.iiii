import { liftPageIntoSpace } from './pageInSpace.js'

// Where the visit starts and where it lands.
//
// REST is the composed entry camera authored on the `main` space itself — the
// same shot `/main` opens on — so the room behind the landing is already
// framed the way it will be framed when the page is gone. WALK is where the
// walker stands the instant it takes over. The flight is the straight line
// between them, which is why the handover has nothing to cover up: the last
// frame of the flight and the first frame of walking are the same pose.
export const REST_POSE = { position: [0, 3, 14.5], target: [0, 1.2, -14], fov: 50 }
export const WALK_POSE = { position: [0, 1.6, 6], target: [0, 1.6, -14], fov: 50 }

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
    { selector: '.lp-space-row-label', depth: -30 },
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
export const visibleLayers = (root, viewportHeight) => {
    if (!root) return []
    const layers = []
    LIFTABLE.forEach(({ selector, depth }) => {
        root.querySelectorAll(selector).forEach((el) => {
            const rect = el.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            if (rect.bottom <= 0 || rect.top >= viewportHeight) return
            layers.push({ el, depth })
        })
    })
    return layers
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
export const flyInside = ({ root, cameraPoseRef, onDone, reducedMotion = false }) => {
    const finish = () => {
        cameraPoseRef.current = { ...WALK_POSE }
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

    const layers = visibleLayers(root, window.innerHeight)
    const dollyMetres = distance3(REST_POSE.position, WALK_POSE.position)
    const stage = liftPageIntoSpace({
        container: window.document.body,
        layers,
        fov: REST_POSE.fov,
        dollyMetres
    })

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
    const duration = flightDuration()
    const started = performance.now()

    const tick = (now) => {
        const t = Math.min(1, (now - started) / duration)
        const eased = easeInOutCubic(t)
        stage.setProgress(t)
        cameraPoseRef.current = {
            position: lerp3(REST_POSE.position, WALK_POSE.position, eased),
            target: lerp3(REST_POSE.target, WALK_POSE.target, eased),
            fov: REST_POSE.fov
        }
        if (t < 1) {
            frame = requestAnimationFrame(tick)
            return
        }
        cleanup()
        finish()
    }

    const cleanup = () => {
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        stage.destroy()
        hidden.forEach(({ el, previous }) => { el.style.visibility = previous })
        root.classList.remove('lp-root--flying')
    }

    frame = requestAnimationFrame(tick)

    return cleanup
}
