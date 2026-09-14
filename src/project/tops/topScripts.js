// JavaScript written inside an operator.
//
// A script is the body of a module-like function. It may define:
//
//   function frame({ time, params, numbers })  → { name: value, … }
//       every frame, before the operator draws; what it returns overrides the
//       operator's settings (and any `uniform float p_<name>` its shader declares)
//
//   async function open({ constraints, deviceId, mediaDevices })  → MediaStream
//       Camera In only: open the camera yourself
//
// It runs on the machine the operator runs on, and only if that machine allows
// desk scripts (DI_DESK_SCRIPTS=1 in its own di.env) — code saved on one
// machine running on another is exactly what that switch is for.

const cache = new Map()

// frame() runs on the page, inside the render loop, so nothing can interrupt
// it. What CAN be done: a frame() that took longer than this throws once it
// returns, and useTopNetwork's catch stops it until the code changes (its
// failedScripts set). A true infinite loop still never returns — node scripts
// (src/project/graph/nodeScripts.js) run in a worker for exactly that reason.
export const TOP_FRAME_BUDGET_MS = 20

const clock = () => globalThis.performance?.now?.() ?? Date.now()

export const guardFrame = (frame, { budgetMs = TOP_FRAME_BUDGET_MS, now = clock } = {}) => {
    if (typeof frame !== 'function') return undefined
    return (...args) => {
        const began = now()
        const out = frame(...args)
        const took = now() - began
        if (took > budgetMs) {
            throw new Error(`stopped: frame() took ${Math.round(took)} ms (the limit is ${budgetMs} ms) — change the script to run it again`)
        }
        return out
    }
}

/** @returns {{ frame?: Function, open?: Function, error?: string }} */
export const compileTopScript = (source) => {
    const text = String(source || '').trim()
    if (!text) return {}
    if (cache.has(text)) return cache.get(text)
    let result
    try {
        const factory = new Function(`"use strict";\n${text}\n;return {
            frame: typeof frame === 'function' ? frame : undefined,
            open: typeof open === 'function' ? open : undefined
        }`)
        const made = factory()
        result = { frame: guardFrame(made.frame), open: made.open }
    } catch (error) {
        result = { error: String(error?.message || error) }
    }
    cache.set(text, result)
    return result
}

export const SCRIPT_EXAMPLE = {
    any: `// Runs every frame on the machine this operator runs on.
// Return settings to override them — here, a slow pulse.
function frame({ time, params }) {
  return { opacity: 0.6 + 0.4 * Math.sin(time / 500) }
}
`,
    camera: `// Open the camera yourself. \`constraints\` is what the Camera
// section asks for; add anything the device supports.
async function open({ constraints, mediaDevices }) {
  return mediaDevices.getUserMedia({
    video: { ...constraints, frameRate: { ideal: 30 } },
    audio: false
  })
}
`
}
