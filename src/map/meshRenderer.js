// ONE WebGL CONTEXT FOR EVERY SLICE ON THE PAGE.
//
// Each slice draws its picture through a triangle mesh (sliceGeometry.js), but
// a browser allows only about sixteen WebGL contexts per page and drops the
// oldest past that — a 3×3 grid of slices mid-crossfade is eighteen. So one
// hidden WebGL canvas does all the drawing: per slice, per frame, it draws the
// mesh into a corner of itself and the slice copies that corner onto its own
// plain 2D canvas, which carries the slice's CSS filter, opacity and blend
// exactly as a DOM surface would. Textures are cached per media-rack source
// and uploaded once per frame however many slices show them, so slices of one
// video or page are always on the same frame.

//
// EFFECTS (2026-11-10). A visual with clip or composition effects
// (visualEffects.js) is first drawn, cover-fitted, into a frame-shaped
// texture of its own, then run through one shader per effect, ping-ponging
// between two textures. The slices then sample that result instead of the
// source. The chain runs at most once per frame per (stage, source, visual),
// however many slices show it — sixteen cubes of one effected visual cost
// one chain.

import { softEdgeCurve } from './sliceGeometry.js'
import { glslFor } from './visualEffects.js'

export const MESH_STEPS = 32

const FX_VERTEX = `
attribute vec2 a_quad;
varying vec2 v_uv;
void main() {
    v_uv = (a_quad * 0.5) + 0.5;
    gl_Position = vec4(a_quad, 0.0, 1.0);
}`

const FX_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_input;
uniform vec2 u_size;
uniform vec4 u_a;
uniform vec4 u_b;
uniform float u_pass;
vec4 pick(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
    return texture2D(u_input, uv);
}
vec2 fold(vec2 uv) { return 1.0 - abs(mod(uv, 2.0) - 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`

const FX_MAIN = `
void main() { gl_FragColor = effect(v_uv); }`

// The first pass: the source, cover-fitted to the frame (or a flat colour),
// times the visual's opacity. Straight alpha in, straight alpha out.
const FIT_FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_input;
uniform vec2 u_fitOrigin;
uniform vec2 u_fitScale;
uniform vec4 u_colour;
uniform float u_useColour;
uniform float u_opacity;
void main() {
    vec4 c = vec4(0.0);
    if (u_useColour > 0.5) {
        c = u_colour;
    } else {
        vec2 p = u_fitOrigin + (v_uv * u_fitScale);
        if (p.x >= 0.0 && p.y >= 0.0 && p.x <= 1.0 && p.y <= 1.0) c = texture2D(u_input, p);
    }
    gl_FragColor = vec4(c.rgb, c.a * u_opacity);
}`

const VERTEX = `
attribute vec2 a_position;
attribute vec2 a_local;
varying vec2 v_local;
void main() {
    v_local = a_local;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`

// uv = origin + local.x * axisX + local.y * axisY carries the input piece, its
// rotation, the flip and the source's cover-fit in one affine step.
const FRAGMENT = `
precision mediump float;
varying vec2 v_local;
uniform sampler2D u_texture;
uniform vec2 u_origin;
uniform vec2 u_axisX;
uniform vec2 u_axisY;
uniform vec4 u_colour;
uniform float u_useColour;
uniform float u_hasPicture;
uniform float u_blackBg;
uniform sampler2D u_edge;
uniform float u_useEdge;
uniform vec4 u_edgeWidths;
float edgeAt(float x, float w) {
    if (w <= 0.0) return 1.0;
    return texture2D(u_edge, vec2(clamp(x / w, 0.0, 1.0), 0.5)).r;
}
void main() {
    vec2 uv = u_origin + v_local.x * u_axisX + v_local.y * u_axisY;
    vec4 colour = vec4(0.0, 0.0, 0.0, u_blackBg);
    if (u_useColour > 0.5) {
        colour = u_colour;
    } else if (u_hasPicture > 0.5 && uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
        vec4 picture = texture2D(u_texture, uv);
        colour = vec4(picture.rgb * picture.a, max(picture.a, u_blackBg));
    }
    if (u_useEdge > 0.5) {
        float k = edgeAt(v_local.x, u_edgeWidths.x) * edgeAt(1.0 - v_local.x, u_edgeWidths.y)
                * edgeAt(v_local.y, u_edgeWidths.z) * edgeAt(1.0 - v_local.y, u_edgeWidths.w);
        colour *= k;
    }
    gl_FragColor = colour;
}`

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader')
    return shader
}

const hexToRgba = (hex = '#ffffff') => {
    const clean = String(hex).replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0')
    const n = Number.parseInt(full.slice(0, 6), 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

const textureParams = (gl) => {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
}

// The lattice's triangles, the same for every slice.
const latticeIndices = (steps) => {
    const indices = []
    const row = steps + 1
    for (let j = 0; j < steps; j += 1) {
        for (let i = 0; i < steps; i += 1) {
            const a = (j * row) + i
            indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row)
        }
    }
    return new Uint16Array(indices)
}

function createMeshRenderer() {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    let gl = null
    let state = null
    let tick = 0
    let frameId = 0
    const layers = new Set()

    const init = () => {
        gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: false })
        if (!gl) { state = null; return }
        const program = gl.createProgram()
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
        gl.linkProgram(program)
        gl.useProgram(program)
        const uniforms = {}
        ;['u_texture', 'u_origin', 'u_axisX', 'u_axisY', 'u_colour', 'u_useColour', 'u_hasPicture', 'u_blackBg', 'u_edge', 'u_useEdge', 'u_edgeWidths']
            .forEach((name) => { uniforms[name] = gl.getUniformLocation(program, name) })
        gl.uniform1i(uniforms.u_texture, 0)
        gl.uniform1i(uniforms.u_edge, 1)
        const position = gl.createBuffer()
        const local = gl.createBuffer()
        const index = gl.createBuffer()
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index)
        const indices = latticeIndices(MESH_STEPS)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
        const bindAttribute = (buffer, name) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            const location = gl.getAttribLocation(program, name)
            gl.enableVertexAttribArray(location)
            gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
        }
        bindAttribute(position, 'a_position')
        bindAttribute(local, 'a_local')
        gl.enable(gl.SCISSOR_TEST)
        const quad = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, quad)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        state = {
            program,
            uniforms,
            position,
            local,
            quad,
            attributes: { position: gl.getAttribLocation(program, 'a_position'), local: gl.getAttribLocation(program, 'a_local') },
            count: indices.length,
            textures: new Map(),
            edges: new Map(),
            fxPrograms: new Map(),
            fx: new Map(),
            maxSize: Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096)
        }
    }

    // --- the effect pass -------------------------------------------------

    const linkProgram = (fragment, names) => {
        const fxProgram = gl.createProgram()
        gl.attachShader(fxProgram, compile(gl, gl.VERTEX_SHADER, FX_VERTEX))
        gl.attachShader(fxProgram, compile(gl, gl.FRAGMENT_SHADER, fragment))
        gl.linkProgram(fxProgram)
        if (!gl.getProgramParameter(fxProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(fxProgram) || 'link')
        const uniforms = {}
        names.forEach((name) => { uniforms[name] = gl.getUniformLocation(fxProgram, name) })
        return { program: fxProgram, uniforms, quad: gl.getAttribLocation(fxProgram, 'a_quad') }
    }

    // Compiled the first time an effect is used. A shader that will not
    // compile is remembered as null and that effect is skipped, never retried
    // sixty times a second.
    const fxProgram = (type) => {
        if (state.fxPrograms.has(type)) return state.fxPrograms.get(type)
        let made = null
        try {
            if (type === '@fit') {
                made = linkProgram(FIT_FRAGMENT, ['u_input', 'u_fitOrigin', 'u_fitScale', 'u_colour', 'u_useColour', 'u_opacity'])
            } else {
                const body = glslFor(type)
                if (body) made = linkProgram(`${FX_HEAD}\n${body}\n${FX_MAIN}`, ['u_input', 'u_size', 'u_a', 'u_b', 'u_pass'])
            }
        } catch (error) {
            console.warn(`[map] effect ${type} did not compile`, error)
            made = null
        }
        state.fxPrograms.set(type, made)
        return made
    }

    const makeTarget = (width, height) => {
        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        textureParams(gl)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        const framebuffer = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        return { texture, framebuffer }
    }

    const dropFx = (key) => {
        const record = state?.fx.get(key)
        if (!record) return
        record.targets.forEach(({ texture, framebuffer }) => { gl.deleteTexture(texture); gl.deleteFramebuffer(framebuffer) })
        state.fx.delete(key)
    }

    const drawQuad = (made) => {
        gl.disableVertexAttribArray(state.attributes.position)
        gl.disableVertexAttribArray(state.attributes.local)
        gl.bindBuffer(gl.ARRAY_BUFFER, state.quad)
        gl.enableVertexAttribArray(made.quad)
        gl.vertexAttribPointer(made.quad, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.disableVertexAttribArray(made.quad)
    }

    // Run a visual's effects; returns the texture its slices should sample,
    // or null when there is nothing to draw yet.
    //   fx = { key, sourceKey, passes, signature, animated, frame, scale, fit, opacity }
    const runEffects = (fx, record, colour) => {
        const width = Math.max(1, Math.min(state.maxSize, Math.round(fx.frame.width * fx.scale)))
        const height = Math.max(1, Math.min(state.maxSize, Math.round(fx.frame.height * fx.scale)))
        let target = state.fx.get(fx.key)
        if (target && (target.width !== width || target.height !== height)) { dropFx(fx.key); target = null }
        if (!target) {
            target = { width, height, sourceKey: fx.sourceKey, targets: [makeTarget(width, height), makeTarget(width, height)], out: -1, tick: -1, signature: '', uploads: -1 }
            state.fx.set(fx.key, target)
        }
        target.used = tick
        if (target.tick === tick && target.out >= 0) return target.targets[target.out].texture
        const uploads = record ? record.uploads : 0
        if (!fx.animated && target.out >= 0 && target.signature === fx.signature && target.uploads === uploads) {
            target.tick = tick
            return target.targets[target.out].texture
        }
        const fit = fxProgram('@fit')
        if (!fit) return null

        gl.viewport(0, 0, width, height)
        gl.scissor(0, 0, width, height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.targets[0].framebuffer)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(fit.program)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, record?.texture || null)
        gl.uniform1i(fit.uniforms.u_input, 0)
        gl.uniform2fv(fit.uniforms.u_fitOrigin, fx.fit.origin)
        gl.uniform2fv(fit.uniforms.u_fitScale, fx.fit.scale)
        gl.uniform4fv(fit.uniforms.u_colour, colour ? hexToRgba(colour) : [0, 0, 0, 0])
        gl.uniform1f(fit.uniforms.u_useColour, colour ? 1 : 0)
        gl.uniform1f(fit.uniforms.u_opacity, fx.opacity)
        drawQuad(fit)

        let current = 0
        fx.passes.forEach((pass) => {
            const made = fxProgram(pass.type)
            if (!made) return
            gl.useProgram(made.program)
            gl.uniform1i(made.uniforms.u_input, 0)
            gl.uniform2fv(made.uniforms.u_size, [fx.frame.width, fx.frame.height])
            gl.uniform4fv(made.uniforms.u_a, pass.a)
            gl.uniform4fv(made.uniforms.u_b, pass.b)
            for (let step = 0; step < pass.passes; step += 1) {
                const next = 1 - current
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.targets[next].framebuffer)
                gl.clear(gl.COLOR_BUFFER_BIT)
                gl.bindTexture(gl.TEXTURE_2D, target.targets[current].texture)
                gl.uniform1f(made.uniforms.u_pass, step)
                drawQuad(made)
                current = next
            }
        })
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.useProgram(state.program)
        target.out = current
        target.tick = tick
        target.signature = fx.signature
        target.uploads = uploads
        return target.targets[current].texture
    }

    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); state = null })
    canvas.addEventListener('webglcontextrestored', () => { init(); layers.forEach((layer) => layer.invalidate?.()) })
    init()

    // A source's texture, uploaded at most once per frame.
    const textureFor = (entry) => {
        if (!state || !entry) return null
        let record = state.textures.get(entry.key)
        if (!record) {
            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            textureParams(gl)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
            record = { texture, tick: -1, version: -1, has: false, uploads: 0 }
            state.textures.set(entry.key, record)
        }
        const live = entry.kind === 'video' || entry.kind === 'camera'
        const picture = entry.kind === 'html' ? entry.bitmap : entry.element
        const stale = live ? record.tick !== tick : record.version !== entry.version
        if (picture && entry.ready && stale) {
            const usable = !live || picture.readyState >= 2
            if (usable) {
                try {
                    gl.bindTexture(gl.TEXTURE_2D, record.texture)
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture)
                    record.has = true
                    record.uploads += 1
                } catch {
                    // A frame that is not ready, or a bitmap already replaced: keep the last one.
                }
            }
            record.tick = tick
            record.version = entry.version
        }
        return record
    }

    const edgeTexture = (softEdge) => {
        const key = `${softEdge?.power ?? 2}|${softEdge?.luminance ?? 0.5}|${softEdge?.gamma ?? 1}`
        let texture = state.edges.get(key)
        if (!texture) {
            texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            textureParams(gl)
            const data = new Uint8Array(256 * 4)
            for (let i = 0; i < 256; i += 1) {
                const value = Math.round(softEdgeCurve(i / 255, softEdge || {}) * 255)
                data.set([value, value, value, 255], i * 4)
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
            state.edges.set(key, texture)
        }
        return texture
    }

    // Draw one slice into the corner of the shared canvas, then copy it onto
    // the slice's own 2D canvas. Returns false if nothing could be drawn.
    //   fx (optional): the visual's effect chain — see runEffects. With it,
    //   `mapping` must address the FRAME (no cover-fit): the effect pass has
    //   already fitted the source into a frame-shaped texture.
    const draw = ({ target, width, height, positions, locals, entry, colour, mapping, blackBg, softEdge, fx = null }) => {
        if (!state || !target || !(width > 0) || !(height > 0)) return false
        // Grow only, in steps, so a dragged slice does not reallocate every frame.
        if (canvas.width < width || canvas.height < height) {
            canvas.width = Math.max(canvas.width, Math.ceil(width / 256) * 256)
            canvas.height = Math.max(canvas.height, Math.ceil(height / 256) * 256)
        }
        const { uniforms } = state
        const record = colour ? null : textureFor(entry)
        // The effect pass, before this slice touches the canvas: it binds its
        // own framebuffers, program and attributes, and hands back a texture.
        let picture = record?.texture || null
        let hasPicture = Boolean(record?.has)
        let flatColour = colour
        if (fx && (colour || record?.has)) {
            const effected = runEffects(fx, record, colour)
            if (effected) {
                picture = effected
                hasPicture = true
                flatColour = null
            }
        }
        gl.useProgram(state.program)
        gl.bindBuffer(gl.ARRAY_BUFFER, state.position)
        gl.enableVertexAttribArray(state.attributes.position)
        gl.vertexAttribPointer(state.attributes.position, 2, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, state.local)
        gl.enableVertexAttribArray(state.attributes.local)
        gl.vertexAttribPointer(state.attributes.local, 2, gl.FLOAT, false, 0, 0)

        const y = canvas.height - height
        gl.viewport(0, y, width, height)
        gl.scissor(0, y, width, height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, picture)
        gl.uniform1f(uniforms.u_useColour, flatColour ? 1 : 0)
        gl.uniform4fv(uniforms.u_colour, flatColour ? hexToRgba(flatColour) : [0, 0, 0, 1])
        gl.uniform1f(uniforms.u_hasPicture, hasPicture ? 1 : 0)
        gl.uniform2fv(uniforms.u_origin, mapping.origin)
        gl.uniform2fv(uniforms.u_axisX, mapping.axisX)
        gl.uniform2fv(uniforms.u_axisY, mapping.axisY)
        gl.uniform1f(uniforms.u_blackBg, blackBg ? 1 : 0)
        const edgeOn = Boolean(softEdge?.enabled)
        gl.uniform1f(uniforms.u_useEdge, edgeOn ? 1 : 0)
        gl.uniform4fv(uniforms.u_edgeWidths, edgeOn ? [softEdge.left || 0, softEdge.right || 0, softEdge.top || 0, softEdge.bottom || 0] : [0, 0, 0, 0])
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, edgeOn ? edgeTexture(softEdge) : null)
        gl.activeTexture(gl.TEXTURE0)

        gl.bindBuffer(gl.ARRAY_BUFFER, state.position)
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
        gl.bindBuffer(gl.ARRAY_BUFFER, state.local)
        gl.bufferData(gl.ARRAY_BUFFER, locals, gl.DYNAMIC_DRAW)
        gl.drawElements(gl.TRIANGLES, state.count, gl.UNSIGNED_SHORT, 0)

        // Same task as the draw, so the drawing buffer still holds it. GL
        // counts rows from the bottom: a viewport at y = height-from-top is
        // the canvas's TOP-left corner in image rows, so the copy reads 0, 0.
        target.clearRect(0, 0, width, height)
        target.drawImage(canvas, 0, 0, width, height, 0, 0, width, height)
        return true
    }

    const loop = () => {
        frameId = 0
        if (!layers.size) return
        tick += 1
        layers.forEach((layer) => layer.frame())
        // An effect chain nobody has drawn for ~5 s (a visual taken off, a
        // preview closed) gives its two frame-sized textures back.
        if (state && tick % 60 === 0) {
            state.fx.forEach((record, key) => { if (tick - (record.used ?? tick) > 300) dropFx(key) })
        }
        frameId = requestAnimationFrame(loop)
    }

    return {
        get ok() { return Boolean(state) },
        get tick() { return tick },
        draw,
        add(layer) {
            layers.add(layer)
            if (!frameId) frameId = requestAnimationFrame(loop)
            return () => layers.delete(layer)
        },
        // A source the page no longer holds: drop its texture.
        forget(key) {
            if (!state) return
            state.fx.forEach((fxRecord, fxKey) => { if (fxRecord.sourceKey === key) dropFx(fxKey) })
            const record = state.textures.get(key)
            if (!record) return
            gl.deleteTexture(record.texture)
            state.textures.delete(key)
        }
    }
}

let shared = null
export const getMeshRenderer = () => {
    if (!shared) shared = createMeshRenderer()
    return shared
}
