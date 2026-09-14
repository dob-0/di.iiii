// The inside of the node-script worker — pure, so vitest can drive it
// without a Worker (nodeScriptsHost.test.js). nodeScripts.worker.js is only
// the two lines that plug this into `self`.
//
// A node script is the body of a module-like function that defines
//
//   function compute({ inputs, time, values, memory })  -> { <outputPortId>: value, ... }
//
// It runs HERE, in a Web Worker, never on the page: an infinite loop in one
// Number node would otherwise freeze the editor and the projector's /out. The
// page cannot interrupt a loop inside the worker either — it can only kill the
// whole worker — so the host says out loud which script it is in before it
// runs it ('start') and when it came back ('result'). The page's budget
// (nodeScripts.js) reads those two messages to name the one that never did.
//
// Messages in:
//   { type: 'run', batch, items: [{ nodeId, text, inputs, time, values }] }
//   { type: 'check', id, text }        syntax only — the text is compiled, never called
//   { type: 'forget', nodeIds }        drop compiled code + memory for these nodes
// Messages out:
//   { type: 'ready' }                  posted by the worker file once loaded
//   { type: 'start', batch, nodeId }
//   { type: 'result', batch, nodeId, outputs, error, ms }
//   { type: 'done', batch }
//   { type: 'checked', id, error }

const COMPUTE_NAME = /\bcompute\b/

const describe = (error) => String(error?.message || error || 'the script failed')

// What may travel back to the page: numbers, booleans, strings, null, and
// short arrays of numbers (a vector). Anything else — a function, a DOM-less
// object, a Map — is dropped here rather than failing the structured clone
// and taking the whole batch down with it.
export const plainValue = (value) => {
    if (value === null) return null
    const kind = typeof value
    if (kind === 'number') return Number.isFinite(value) ? value : undefined
    if (kind === 'boolean' || kind === 'string') return value
    if (Array.isArray(value) && value.length <= 16 && value.every((entry) => typeof entry === 'number')) {
        return value.map((entry) => (Number.isFinite(entry) ? entry : 0))
    }
    return undefined
}

export const plainOutputs = (returned) => {
    if (!returned || typeof returned !== 'object' || Array.isArray(returned)) return {}
    const outputs = {}
    for (const [portId, value] of Object.entries(returned)) {
        const plain = plainValue(value)
        if (plain !== undefined) outputs[portId] = plain
    }
    return outputs
}

export const compileNodeScript = (text) => {
    // "use strict" so a stray assignment cannot write a worker global that
    // the next node's script would then read.
    const factory = new Function(`"use strict";\n${text}\n;return typeof compute === 'function' ? compute : undefined`)
    const compute = factory()
    if (typeof compute !== 'function') throw new Error('the script defines no compute() function')
    return compute
}

/** A syntax check that never runs a line of the script. */
export const checkNodeScriptText = (text) => {
    const source = String(text || '')
    if (!source.trim()) return null
    try {
        // Constructing a Function parses its body; only calling it would run it.
        new Function(`"use strict";\n${source}`)
    } catch (error) {
        return describe(error)
    }
    if (!COMPUTE_NAME.test(source)) return 'define function compute({ inputs, time, values, memory }) and return { port: value }'
    return null
}

const freeze = (value) => Object.freeze({ ...(value && typeof value === 'object' ? value : {}) })

/**
 * @param {(message: object) => void} post
 * @param {{ clock?: () => number }} [options]
 */
export const createNodeScriptHost = (post, { clock = () => globalThis.performance?.now?.() ?? Date.now() } = {}) => {
    // nodeId -> { text, compute, memory }. `memory` lives as long as the text
    // does: edit the script and it starts from a clean slate.
    const scripts = new Map()

    const entryFor = (nodeId, text) => {
        const known = scripts.get(nodeId)
        if (known && known.text === text) return known
        const entry = { text, compute: null, memory: {} }
        scripts.set(nodeId, entry)
        // Compiling runs the script's top level — which is exactly why it
        // happens between 'start' and 'result', inside the budget.
        entry.compute = compileNodeScript(text)
        return entry
    }

    const runOne = (batch, item) => {
        const nodeId = String(item?.nodeId || '')
        const text = String(item?.text || '')
        post({ type: 'start', batch, nodeId })
        const began = clock()
        let outputs = null
        let error = null
        try {
            const entry = entryFor(nodeId, text)
            const returned = entry.compute({
                inputs: freeze(item.inputs),
                time: Number.isFinite(item.time) ? item.time : 0,
                values: freeze(item.values),
                memory: entry.memory
            })
            outputs = plainOutputs(returned)
        } catch (caught) {
            // A compile error leaves a half-made entry; forget it so the same
            // text is not treated as compiled next time.
            if (scripts.get(nodeId)?.compute === null) scripts.delete(nodeId)
            error = describe(caught)
        }
        post({ type: 'result', batch, nodeId, outputs, error, ms: clock() - began })
    }

    const handle = (message) => {
        if (!message || typeof message !== 'object') return
        if (message.type === 'run') {
            for (const item of message.items || []) runOne(message.batch, item)
            post({ type: 'done', batch: message.batch })
            return
        }
        if (message.type === 'check') {
            post({ type: 'checked', id: message.id, error: checkNodeScriptText(message.text) })
            return
        }
        if (message.type === 'forget') {
            for (const nodeId of message.nodeIds || []) scripts.delete(nodeId)
        }
    }

    return { handle, has: (nodeId) => scripts.has(nodeId) }
}
