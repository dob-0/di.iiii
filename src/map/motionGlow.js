// Motion glow: what moves lights up, what stays still goes black.
//
// Three textures on the GPU, because asuz's 2012 laptop has nothing to spare on
// the CPU: the camera frame NOW, the frame BEFORE it, and the glow so far. Each
// frame the glow fades by `trail`, then takes the brighter of itself and the
// new difference — so a still room fades to black and a moving body leaves a
// wake behind it. WebGL1 and 8-bit textures on purpose: it has to run on the
// oldest GPU that will ever be plugged into a projector.

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`

// Pass 1: into the glow buffer.
const ACCUMULATE = `
precision mediump float;
varying vec2 uv;
uniform sampler2D current;
uniform sampler2D previous;
uniform sampler2D glow;
uniform float threshold;
uniform float trail;
uniform float gain;
uniform float exposureShift;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
    // Camera images arrive top-down; the buffers are bottom-up.
    vec2 cam = vec2(uv.x, 1.0 - uv.y);
    // Take away what changed EVERYWHERE — the webcam re-exposing, or the
    // projector's own light filling the room it is filming. Measured on the
    // wall at asuz: without this, every exposure step lit 62% of the picture
    // for half a second, and the projector's flash then fed the next one.
    float difference = abs(luma(texture2D(current, cam).rgb) - luma(texture2D(previous, cam).rgb) - exposureShift);
    float moved = clamp((difference - threshold) * gain, 0.0, 1.0);
    // The 1/255 step matters: an 8-bit value times 0.88 rounds back up to
    // itself below about 4/255, and the wake would never quite leave.
    float faded = max(texture2D(glow, uv).r * trail - 1.0 / 255.0, 0.0);
    gl_FragColor = vec4(vec3(max(faded, moved)), 1.0);
}`

// Pass 2: to the canvas. The glow tints the live picture, so a hand reads as a
// hand made of light rather than a white blob.
const PRESENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D current;
uniform sampler2D glow;
void main() {
    float g = texture2D(glow, uv).r;
    vec3 colour = texture2D(current, vec2(uv.x, 1.0 - uv.y)).rgb;
    gl_FragColor = vec4(g * mix(vec3(1.0), colour * 1.6, 0.35), 1.0);
}`

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader did not compile')
    return shader
}

const program = (gl, fragment) => {
    const made = gl.createProgram()
    gl.attachShader(made, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(made, compile(gl, gl.FRAGMENT_SHADER, fragment))
    gl.bindAttribLocation(made, 0, 'position')
    gl.linkProgram(made)
    if (!gl.getProgramParameter(made, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(made) || 'program did not link')
    return made
}

const texture = (gl, width, height) => {
    const made = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, made)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    return made
}

const target = (gl, width, height) => {
    const colour = texture(gl, width, height)
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { colour, framebuffer }
}

/**
 * Start drawing motion glow from `video` into `canvas`.
 * Returns { setParams, stop }, or throws when the canvas has no WebGL — the
 * caller shows the reason on the surface rather than a black rectangle.
 */
export const startMotionGlow = ({ canvas, video, params }) => {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false })
    if (!gl) throw new Error('no WebGL on this machine')
    const { width, height } = canvas
    let current = { ...params }

    const accumulate = program(gl, ACCUMULATE)
    const present = program(gl, PRESENT)
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    let frameNow = texture(gl, 2, 2)
    let frameBefore = texture(gl, 2, 2)
    let glowRead = target(gl, width, height)
    let glowWrite = target(gl, width, height)
    let hasBefore = false

    // The whole picture's brightness, from a thumbnail on the CPU: 32x18 is
    // 576 pixels, nothing even for a 2012 laptop, and it is a mean, which is
    // all the shader needs.
    const probe = document.createElement('canvas')
    probe.width = 32
    probe.height = 18
    const probeContext = probe.getContext('2d', { willReadFrequently: true })
    let meanNow = null
    let meanBefore = null
    const meanLuma = () => {
        if (!probeContext) return null
        probeContext.drawImage(video, 0, 0, probe.width, probe.height)
        const pixels = probeContext.getImageData(0, 0, probe.width, probe.height).data
        let sum = 0
        for (let i = 0; i < pixels.length; i += 4) sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
        return sum / (pixels.length / 4) / 255
    }

    const bind = (prog, name, unit, tex) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(gl.getUniformLocation(prog, name), unit)
    }

    let raf = 0
    let stopped = false
    let lastVideoTime = -1
    const draw = () => {
        if (stopped) return
        raf = requestAnimationFrame(draw)
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return
        lastVideoTime = video.currentTime

        // The frame that was NOW becomes BEFORE, and the new camera frame goes
        // into the texture that just stopped being needed.
        ;[frameNow, frameBefore] = [frameBefore, frameNow]
        gl.bindTexture(gl.TEXTURE_2D, frameNow)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        meanBefore = meanNow
        meanNow = meanLuma()
        if (!hasBefore) { hasBefore = true; return }

        gl.viewport(0, 0, width, height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, glowWrite.framebuffer)
        gl.useProgram(accumulate)
        bind(accumulate, 'current', 0, frameNow)
        bind(accumulate, 'previous', 1, frameBefore)
        bind(accumulate, 'glow', 2, glowRead.colour)
        gl.uniform1f(gl.getUniformLocation(accumulate, 'threshold'), current.threshold)
        gl.uniform1f(gl.getUniformLocation(accumulate, 'trail'), current.trail)
        gl.uniform1f(gl.getUniformLocation(accumulate, 'gain'), current.gain)
        gl.uniform1f(gl.getUniformLocation(accumulate, 'exposureShift'), meanNow !== null && meanBefore !== null ? meanNow - meanBefore : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        ;[glowRead, glowWrite] = [glowWrite, glowRead]

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.useProgram(present)
        bind(present, 'current', 0, frameNow)
        bind(present, 'glow', 1, glowRead.colour)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(draw)

    return {
        setParams(next) { current = { ...current, ...next } },
        stop() {
            stopped = true
            cancelAnimationFrame(raf)
            gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
    }
}
