import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'

// The landing page, standing in the room.
//
// The page is not a picture of a page and not a redraw of one: every element
// that flies is the SAME markup, cloned with its classes intact, rendered by
// CSS3DRenderer as a real DOM element carrying a 3D transform. That is what
// makes "identical" a property of the construction rather than a claim — there
// is no second implementation of the landing to drift from the first.
//
// The whole trick is one equation. Put the camera at
//
//     D = viewportHeight / (2 · tan(fov / 2))
//
// looking down −Z at a scene measured in CSS pixels, and an object at z = 0
// lands on screen at exactly its own pixel size. So an element measured at
// rect (left, top, w, h) and placed at
//
//     x =  left + w/2 − W/2      y = −(top + h/2 − H/2)
//
// renders precisely where it already was. Frame zero of the flight is
// pixel-for-pixel the frame before it, which is the only reason a visitor
// cannot see the handover happen.
//
// Depth is free after that: an element pushed to z gets scaled by (D − z)/D,
// which cancels the perspective exactly, so it still starts where it was and
// only reveals its depth once the camera moves. The page is already spread
// through space while it still looks flat.

const DEFAULT_FOV = 50

// How far in front of the eye the page hangs, in metres. It fixes the scale
// between the two worlds: the room is measured in metres and the page in CSS
// pixels, and `metresPerPixel` below is the only bridge between them.
//
// It also decides how long the page is in the air. The flight travels a fixed
// number of METRES (the distance from the entry shot to where the walker
// stands), so a page hung close is overtaken almost at once — at 2.6m the
// camera was through it a third of the way in and the whole effect lasted
// under half a second, and at seven it was still over by the halfway mark.
// Twelve puts the crossing at about nine tenths of the flight: the page is
// still coming apart when the room takes over, which is the difference between
// a page that comes apart and a page that vanishes.
const PAGE_DISTANCE_M = 12

export const cameraDistanceForHeight = (heightPx, fov = DEFAULT_FOV) =>
    heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2))

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

/**
 * Lift a set of live page elements into the room.
 *
 * @param {object}   options
 * @param {Element}  options.container  where the CSS3D layer mounts (fixed, full-viewport)
 * @param {Array}    options.layers     [{ el, depth }] — depth in CSS px toward the eye
 * @param {number}   [options.fov]      must match the room camera's fov, or the two worlds shear
 * @returns a controller: { setProgress(t), metresPerPixel, dollyMetres, destroy() }
 */
export const liftPageIntoSpace = ({ container, layers, fov = DEFAULT_FOV, dollyMetres = 1.25 }) => {
    const width = window.innerWidth
    const height = window.innerHeight
    const distance = cameraDistanceForHeight(height, fov)
    const metresPerPixel = PAGE_DISTANCE_M / distance

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(fov, width / height, 1, distance * 40)
    camera.position.set(0, 0, distance)

    const renderer = new CSS3DRenderer()
    renderer.setSize(width, height)
    Object.assign(renderer.domElement.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '40',
        pointerEvents: 'none'
    })
    container.appendChild(renderer.domElement)

    const placed = layers.map(({ el, depth = 0 }) => {
        const rect = el.getBoundingClientRect()

        // A clone, not the node itself: the node belongs to React, and moving
        // it out from under its parent makes the next render throw when React
        // tries to remove a child that is no longer there. The clone keeps
        // every class, so the stylesheet dresses it identically — but it is
        // outside `.lp-root`, so it would lose the custom properties and the
        // inherited font. The wrapper carries `lp-root` back for that alone.
        const holder = window.document.createElement('div')
        holder.className = 'lp-root lp-in-space'
        holder.style.width = `${rect.width}px`
        holder.style.height = `${rect.height}px`

        const clone = el.cloneNode(true)
        clone.style.width = `${rect.width}px`
        clone.style.height = `${rect.height}px`
        clone.style.margin = '0'
        holder.appendChild(clone)

        const object = new CSS3DObject(holder)
        object.position.set(
            rect.left + rect.width / 2 - width / 2,
            -(rect.top + rect.height / 2 - height / 2),
            depth
        )
        // Cancel the perspective the depth just introduced, so this frame is
        // indistinguishable from the flat page it replaced.
        const scale = (distance - depth) / distance
        object.scale.setScalar(scale)
        scene.add(object)

        return {
            el,
            object,
            holder,
            depth,
            baseScale: scale,
            base: { x: object.position.x, y: object.position.y }
        }
    })

    let destroyed = false

    const setProgress = (t) => {
        if (destroyed) return
        const clamped = Math.min(1, Math.max(0, t))
        const eased = easeInOutCubic(clamped)

        // The eye moves forward; everything the page is made of slides past it.
        camera.position.z = distance - (dollyMetres / metresPerPixel) * eased

        placed.forEach(({ object, holder, depth, baseScale, base }, i) => {
            // Each layer drifts a little further out as it passes, so the page
            // opens rather than simply enlarging — the nearest leaves first.
            const lead = 0.55 + (depth + 400) / 1400
            object.position.z = depth + depth * 0.6 * eased + 90 * lead * eased
            // And drifts away from the middle of the screen, so the page
            // leaves past the edges of the frame rather than swelling until it
            // is dismissed. Centred things (the wordmark) have nowhere to go
            // and simply pass overhead, which is right — they are what the eye
            // is already fixed on.
            object.position.x = base.x * (1 + 0.4 * eased)
            object.position.y = base.y * (1 + 0.4 * eased)
            object.scale.setScalar(baseScale)
            // Fade in the order they pass the eye, never all at once, and
            // late: an element that dims while it is still small has left
            // before anyone saw it move. The window runs to the last frame
            // because the page has to be leaving right up to the moment the
            // room takes over, or the second half of the flight is an empty
            // approach with nothing happening in it.
            const start = 0.55 + (i % 4) * 0.04
            const gone = Math.min(1, Math.max(0, (clamped - start) / (1 - start)))
            holder.style.opacity = String(1 - easeOutCubic(gone))
        })

        renderer.render(scene, camera)
    }

    const destroy = () => {
        if (destroyed) return
        destroyed = true
        placed.forEach(({ holder }) => {
            if (holder.parentNode) holder.parentNode.removeChild(holder)
        })
        if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement)
        }
    }

    setProgress(0)

    // `scene` and `placed` are the seam the guards need: the contract this
    // module has to keep is about where objects sit in the scene, and a test
    // that can only read the DOM cannot see a matrix. They are also what makes
    // the thing debuggable from a console mid-flight.
    return { setProgress, destroy, metresPerPixel, dollyMetres, distance, scene, placed }
}
