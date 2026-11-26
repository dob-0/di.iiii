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

import { softEdgeCurve } from './sliceGeometry.js'

export const MESH_STEPS = 32

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
        state = { program, uniforms, position, local, count: indices.length, textures: new Map(), edges: new Map() }
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
            record = { texture, tick: -1, version: -1, has: false }
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
    const draw = ({ target, width, height, positions, locals, entry, colour, mapping, blackBg, softEdge }) => {
        if (!state || !target || !(width > 0) || !(height > 0)) return false
        // Grow only, in steps, so a dragged slice does not reallocate every frame.
        if (canvas.width < width || canvas.height < height) {
            canvas.width = Math.max(canvas.width, Math.ceil(width / 256) * 256)
            canvas.height = Math.max(canvas.height, Math.ceil(height / 256) * 256)
        }
        const { uniforms } = state
        const y = canvas.height - height
        gl.viewport(0, y, width, height)
        gl.scissor(0, y, width, height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        const record = colour ? null : textureFor(entry)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, record?.texture || null)
        gl.uniform1f(uniforms.u_useColour, colour ? 1 : 0)
        gl.uniform4fv(uniforms.u_colour, colour ? hexToRgba(colour) : [0, 0, 0, 1])
        gl.uniform1f(uniforms.u_hasPicture, record?.has ? 1 : 0)
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
            const record = state?.textures.get(key)
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
