// The engine that runs a network of image operators (topOperators.js).
//
// One WebGL context, one render target per operator, evaluated in wiring order
// every frame. An operator's output from the PREVIOUS frame is kept for the two
// kinds that need time — Feedback reads its own last frame, Difference reads
// its input's — which is what makes a trail or a motion mask possible at all.
//
// A network is plain data, the same shape wherever it comes from:
//   nodes: [{ id, type, values }]          type is a key of TOP_OPERATORS
//   wires: [{ from, to, port }]            port is the input name, 'a' or 'b'
// so the Raw editor, the projector page and a test all drive it identically.
//
// Nothing here knows about React, the project document or the network sync.

import { TOP_OPERATORS, isTopType, measurePixels, resolveTopParams } from './topOperators.js'

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`

const PREAMBLE = `
precision mediump float;
varying vec2 uv;
uniform sampler2D a;
uniform sampler2D b;
uniform vec2 texel;
`

const PRESENT = `${PREAMBLE}
void main() { gl_FragColor = vec4(texture2D(a, uv).rgb, 1.0); }`

const MEASURE_W = 32
const MEASURE_H = 18
// Readback stalls the GPU a little; numbers do not need 60 a second.
const MEASURE_EVERY_MS = 100

/** Operators in an order where every input is computed before its reader. */
export const orderNetwork = (nodes = [], wires = []) => {
    const ids = new Set(nodes.map(node => node.id))
    const inputsOf = new Map(nodes.map(node => [node.id, []]))
    for (const wire of wires) {
        if (ids.has(wire.from) && ids.has(wire.to) && wire.from !== wire.to) inputsOf.get(wire.to).push(wire.from)
    }
    const order = []
    const state = new Map()
    // A cycle is not an error in a patch — it is a feedback loop somebody drew
    // — so the edge that closes it simply reads last frame's value.
    const visit = (id) => {
        if (state.get(id) === 'done' || state.get(id) === 'visiting') return
        state.set(id, 'visiting')
        for (const from of inputsOf.get(id)) visit(from)
        state.set(id, 'done')
        order.push(id)
    }
    for (const node of nodes) visit(node.id)
    return order
}

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(log || 'shader did not compile')
    }
    return shader
}

const link = (gl, fragment) => {
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
    gl.bindAttribLocation(program, 0, 'position')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program did not link')
    return { program, uniforms: new Map() }
}

const uniform = (gl, compiled, name) => {
    if (!compiled.uniforms.has(name)) compiled.uniforms.set(name, gl.getUniformLocation(compiled.program, name))
    return compiled.uniforms.get(name)
}

const makeTexture = (gl, width, height) => {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    return texture
}

const makeTarget = (gl, width, height) => {
    const texture = makeTexture(gl, width, height)
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { texture, framebuffer, width, height }
}

const freeTarget = (gl, target) => {
    if (!target) return
    gl.deleteFramebuffer(target.framebuffer)
    gl.deleteTexture(target.texture)
}

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas  the engine draws into this; shown directly on an output page
 * @param {number} options.width   processing resolution (every operator)
 * @param {number} options.height
 * @param {(nodeId: string, numbers: object) => void} [options.onMeasure]  Analyze results
 */
export const createTopEngine = ({ canvas, width = 640, height = 360, onMeasure = null } = {}) => {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, alpha: false })
    if (!gl) throw new Error('no WebGL on this machine')

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const black = makeTexture(gl, 1, 1)
    const programs = new Map()
    const programFor = (type) => {
        if (!programs.has(type)) {
            const source = type === '__present' ? PRESENT : `${PREAMBLE}${TOP_OPERATORS[type].fragment}`
            programs.set(type, link(gl, source))
        }
        return programs.get(type)
    }
    const present = programFor('__present')

    // Per operator: its output now and last frame, plus what the kinds that
    // need more keep (camera source texture, difference history).
    const slots = new Map()
    const videos = new Map()
    const measureTarget = makeTarget(gl, MEASURE_W, MEASURE_H)
    const measurePixelsBuffer = new Uint8Array(MEASURE_W * MEASURE_H * 4)

    let network = { nodes: [], wires: [] }
    let order = []
    let byId = new Map()
    let inputsFor = new Map()
    let errors = new Map()

    const slotFor = (node) => {
        let slot = slots.get(node.id)
        if (!slot || slot.type !== node.type) {
            if (slot) { freeTarget(gl, slot.now); freeTarget(gl, slot.before); freeTarget(gl, slot.history); if (slot.source) gl.deleteTexture(slot.source) }
            slot = { type: node.type, now: makeTarget(gl, width, height), before: makeTarget(gl, width, height), history: null, source: null, lastMeasure: 0, mean: null, meanBefore: null, lastVideoTime: -1 }
            if (TOP_OPERATORS[node.type].history) slot.history = makeTarget(gl, width, height)
            if (TOP_OPERATORS[node.type].source) slot.source = makeTexture(gl, 2, 2)
            slots.set(node.id, slot)
        }
        return slot
    }

    const setNetwork = (next) => {
        const nodes = (next?.nodes || []).filter(node => node?.id && isTopType(node.type))
        const wires = (next?.wires || []).filter(wire => wire?.from && wire?.to)
        network = { nodes, wires }
        byId = new Map(nodes.map(node => [node.id, node]))
        order = orderNetwork(nodes, wires)
        inputsFor = new Map(nodes.map(node => [node.id, {}]))
        for (const wire of wires) {
            if (!byId.has(wire.from) || !byId.has(wire.to)) continue
            inputsFor.get(wire.to)[wire.port || 'a'] = wire.from
        }
        for (const [id, slot] of slots) {
            if (byId.has(id)) continue
            freeTarget(gl, slot.now); freeTarget(gl, slot.before); freeTarget(gl, slot.history)
            if (slot.source) gl.deleteTexture(slot.source)
            slots.delete(id)
        }
    }

    const draw = (compiled, target) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null)
        gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height)
        gl.useProgram(compiled.program)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const bindTexture = (compiled, name, unit, texture) => {
        const location = uniform(gl, compiled, name)
        if (location === null) return
        // A sampler uniform belongs to one program; setting it while another
        // is current is an INVALID_OPERATION that silently binds nothing.
        gl.useProgram(compiled.program)
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, texture || black)
        gl.uniform1i(location, unit)
    }

    // Whole-picture brightness of a texture, for Difference's room-light
    // compensation: rendered down to 32x18 and read back. Cheap at that size.
    const meanOf = (texture) => {
        const compiled = present
        bindTexture(compiled, 'a', 0, texture)
        draw(compiled, measureTarget)
        gl.readPixels(0, 0, MEASURE_W, MEASURE_H, gl.RGBA, gl.UNSIGNED_BYTE, measurePixelsBuffer)
        return measurePixels(measurePixelsBuffer, MEASURE_W, MEASURE_H, 1).brightness
    }

    // An input's latest picture is always in its `now`: an operator earlier in
    // the order wrote it this frame, and one later in the order (a loop drawn
    // back to an earlier operator) has not been swapped yet, so `now` still
    // holds its last frame. Either way it is the right thing to read.
    const latest = (id) => slots.get(id)?.now.texture || null

    const frame = (now = performance.now()) => {
        for (let index = 0; index < order.length; index += 1) {
            const node = byId.get(order[index])
            const operator = TOP_OPERATORS[node.type]
            const slot = slotFor(node)
            // Swap first: `before` now holds last frame, `now` is written below.
            ;[slot.now, slot.before] = [slot.before, slot.now]

            let compiled
            try {
                compiled = programFor(node.type)
                errors.delete(node.id)
            } catch (error) {
                errors.set(node.id, String(error?.message || error))
                continue
            }

            if (operator.source === 'camera') {
                const video = videos.get(node.id)
                if (video && video.readyState >= 2 && video.currentTime !== slot.lastVideoTime) {
                    slot.lastVideoTime = video.currentTime
                    gl.bindTexture(gl.TEXTURE_2D, slot.source)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
                }
                bindTexture(compiled, 'source', 3, slot.source)
            }

            const inputs = inputsFor.get(node.id) || {}
            const readA = inputs.a ? latest(inputs.a) : null
            const readB = inputs.b ? latest(inputs.b) : null
            const params = resolveTopParams(node.type, node.values)

            bindTexture(compiled, 'a', 0, readA)
            bindTexture(compiled, 'b', 1, readB)
            bindTexture(compiled, 'self', 2, slot.before.texture)
            if (operator.history) bindTexture(compiled, 'history', 4, slot.history.texture)

            let shift = 0
            if (operator.history && params.compensate > 0.5 && readA) {
                // meanOf draws with another program; the textures bound above
                // stay bound to their units.
                slot.meanBefore = slot.mean
                slot.mean = meanOf(readA)
                shift = slot.meanBefore === null ? 0 : slot.mean - slot.meanBefore
                bindTexture(compiled, 'a', 0, readA)
            }

            gl.useProgram(compiled.program)
            gl.uniform2f(uniform(gl, compiled, 'texel'), 1 / width, 1 / height)
            const shiftLocation = uniform(gl, compiled, 'shift')
            if (shiftLocation !== null) gl.uniform1f(shiftLocation, shift)
            for (const [name, value] of Object.entries(params)) {
                const location = uniform(gl, compiled, `p_${name}`)
                if (location !== null) gl.uniform1f(location, value)
            }
            draw(compiled, slot.now)

            // Difference keeps this frame's input for the next frame.
            if (operator.history) {
                bindTexture(present, 'a', 0, readA)
                draw(present, slot.history)
            }

            if (operator.measure && onMeasure && now - slot.lastMeasure >= MEASURE_EVERY_MS) {
                slot.lastMeasure = now
                const threshold = params.threshold ?? 0.2
                bindTexture(present, 'a', 0, slot.now.texture)
                draw(present, measureTarget)
                gl.readPixels(0, 0, MEASURE_W, MEASURE_H, gl.RGBA, gl.UNSIGNED_BYTE, measurePixelsBuffer)
                onMeasure(node.id, measurePixels(measurePixelsBuffer, MEASURE_W, MEASURE_H, threshold))
            }
        }
    }

    /** Draw one operator's current output onto the engine canvas (the projector). */
    const show = (nodeId) => {
        const slot = slots.get(nodeId)
        bindTexture(present, 'a', 0, slot?.now.texture || black)
        draw(present, null)
    }

    /**
     * Copy each operator's picture into a small 2D canvas — the thumbnail on its
     * node card. Drawn into the corner of the engine canvas and copied out in
     * the same task, before the browser composites, so the canvas never shows it.
     */
    const thumbnails = (targets) => {
        const cw = canvas.width
        const ch = canvas.height
        for (const [nodeId, context] of targets) {
            const slot = slots.get(nodeId)
            if (!slot || !context) continue
            const tw = Math.min(context.canvas.width, cw)
            const th = Math.min(context.canvas.height, ch)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.viewport(0, 0, tw, th)
            gl.useProgram(present.program)
            bindTexture(present, 'a', 0, slot.now.texture)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
            context.drawImage(canvas, 0, ch - th, tw, th, 0, 0, context.canvas.width, context.canvas.height)
        }
    }

    return {
        gl,
        width,
        height,
        setNetwork,
        setVideo: (nodeId, video) => { if (video) videos.set(nodeId, video); else videos.delete(nodeId) },
        frame,
        show,
        thumbnails,
        errorFor: (nodeId) => errors.get(nodeId) || null,
        get network() { return network },
        dispose() {
            for (const slot of slots.values()) {
                freeTarget(gl, slot.now); freeTarget(gl, slot.before); freeTarget(gl, slot.history)
                if (slot.source) gl.deleteTexture(slot.source)
            }
            slots.clear()
            freeTarget(gl, measureTarget)
            for (const compiled of programs.values()) gl.deleteProgram(compiled.program)
            gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
    }
}
