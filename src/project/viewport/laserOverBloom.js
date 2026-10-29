// LASERS ARE DRAWN AFTER THE BLOOM (2026-10-15, the owner: "the lasers don't even look like lasers").
// A laser line in haze is a thin line far above white; three's UnrealBloomPass blurs every bright pixel back over its
// neighbours, so the six lines of a cube, a few pixels apart, came out as one green slab. A lens's veil is a few % of a
// source's light (CIE 146), but it does not merge lines an eye resolves. So the laser meshes (laserLineMaterial.js: the
// lines and their end spots) register here, are left out of the room's render pass, and are drawn over the picture once
// the glow has been added — into the same HDR buffer, against the same depth, before the exposure and the tone mapping.
// The pattern is three.js's selective bloom (examples/webgl_postprocessing_unreal_bloom_selective.html: objects kept out
// of the bloom input, the picture composited after), done here as an over-pass so nothing renders the room twice.
// The lamps' bloom is unchanged. Without a composer (a headset, a room without bloom) the lasers draw as any mesh.
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'

const lasers = new Set()

/** A laser mesh joins the over-bloom draw; returns its leave. */
export const registerLaserMesh = (mesh) => {
    if (!mesh) return () => {}
    lasers.add(mesh)
    return () => lasers.delete(mesh)
}

export const laserMeshCount = () => lasers.size

const shown = (o) => {
    for (let x = o; x; x = x.parent) if (!x.visible) return false
    return true
}

/** Before the room's render pass: hide the shown lasers of this scene; returns them (the over-pass draws them). */
export const holdLasers = (scene) => {
    const held = []
    for (const mesh of lasers) {
        let root = mesh
        while (root.parent) root = root.parent
        if (root !== scene || !shown(mesh)) continue
        mesh.visible = false
        held.push(mesh)
    }
    return held
}

/** After the frame: give the held lasers back their visibility. */
export const releaseLasers = (held) => {
    for (const mesh of held) mesh.visible = true
}

/** The over-pass: draws the held lasers into the buffer the room (and its glow) went to, no clear, same depth. */
export class LaserOverPass extends Pass {
    constructor() {
        super()
        this.needsSwap = false
        this.camera = null
        this.held = []
    }

    render(renderer, writeBuffer, readBuffer) {
        if (!this.camera || !this.held.length) return
        const autoClear = renderer.autoClear
        const autoReset = renderer.info.autoReset
        renderer.autoClear = false
        renderer.info.autoReset = false
        renderer.setRenderTarget(this.renderToScreen ? null : readBuffer)
        for (const mesh of this.held) {
            mesh.visible = true
            renderer.render(mesh, this.camera)
            mesh.visible = false
        }
        renderer.info.autoReset = autoReset
        renderer.autoClear = autoClear
    }
}
