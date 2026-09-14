import { useEffect, useMemo, useRef, useState } from 'react'
import { getNodeInputs, getNodeOutputs } from '../nodeRegistry.js'
import { isTopType } from '../tops/topOperators.js'
import { apiFetch } from '../../services/apiClient.js'
import { createFrameMemory, createNodeGraphContext, evaluateNodeInput } from './nodeGraphRuntime.js'
import { checkNodeScriptText, plainValue } from './nodeScriptsHost.js'

// Scripts in every node, safely.
//
// Any node may carry JavaScript in node.values.__script:
//
//   function compute({ inputs, time, values, memory }) {
//     return { out: inputs.value * 2 }
//   }
//
// What it returns overrides those outputs; every port it does not return keeps
// its built-in answer. The script runs in ONE shared Web Worker
// (nodeScripts.worker.js) — never on the page — so a loop in a Number node can
// never freeze the editor or a projector's /out. The page:
//
//   1. once per animation frame, when the worker is idle, resolves each
//      scripted node's declared inputs (collectScriptItems) and posts them;
//   2. keeps the worker's LAST answer per node (buildScriptResults);
//   3. hands that map to createNodeGraphContext({ scriptResults }), where
//      computeNodeOutput reads it synchronously.
//
// So a script's output is ONE FRAME LATE (or a few, if its batch is slow).
// That is the price of never blocking the page, and it is the same lateness a
// live feed (a webcam, a MIDI knob) already has.
//
// Budget: a batch that has not come back in SCRIPT_BUDGET_MS gets the worker
// terminated. The host announces each script before running it ('start') and
// after ('result'), so the one that was running is named, stopped until its
// text changes, and the worker restarts without it. A restart forgets every
// other script's `memory` too — a killed worker keeps nothing.
//
// A script that throws (or does not compile) reports its message and its node
// falls back to the built-in output until the text changes — a script that
// throws sixty times a second would bury the page.
//
// Gate: like picture-operator scripts (topScripts.js), only on a machine whose
// own di.env says DI_DESK_SCRIPTS=1 (serverXR machineIdentity.js, read here
// through /api/config's `machine.scripts`). Elsewhere every scripted node keeps
// its built-in outputs and says "this machine does not run desk scripts".
//
// Card previews and the anatomy sheet build their contexts without
// `scriptResults`, so they show the built-in: probes must stay script-free.

export const SCRIPT_BUDGET_MS = 250
export const SCRIPTS_BLOCKED_MESSAGE = 'this machine does not run desk scripts — DI_DESK_SCRIPTS=1 in its di.env turns them on'
export const scriptStoppedMessage = (budgetMs = SCRIPT_BUDGET_MS) =>
    `stopped: took too long (no answer in ${budgetMs} ms) — change the script to run it again`

export const SCRIPT_EXAMPLE_COMPUTE = `// Runs in a worker, about once a frame, on machines that allow desk scripts.
// inputs  this node's inputs, as they arrive (pictures and shapes are null)
// time    seconds on the show clock
// values  this node's own settings
// memory  an object that is still here next frame
// Return only the outputs you want to change; the rest stay as built.
function compute({ inputs, time, values, memory }) {
  memory.count = (memory.count || 0) + 1
  return { out: Math.sin(time) * 0.5 + 0.5 }
}
`

// --- status, per node, for the inside view's Script tab ---------------------
//
//   error      the script's compile/throw message, or null
//   stopped    why the budget stopped it, or null
//   blocked    SCRIPTS_BLOCKED_MESSAGE when this machine does not run scripts
//   lastRunMs  how long its last run took in the worker

const reports = new Map()
const listeners = new Map()

export const reportNodeScript = (nodeId, patch) => {
    if (!nodeId || !patch) return
    const before = reports.get(nodeId) || {}
    const next = { ...before, ...patch }
    if (JSON.stringify(before) === JSON.stringify(next)) return
    reports.set(nodeId, next)
    for (const listener of listeners.get(nodeId) || []) listener(next)
}

export const readNodeScriptStatus = (nodeId) => reports.get(nodeId) || {}

/** Tests only. */
export const clearNodeScriptStatus = () => reports.clear()

export function useNodeScriptStatus(nodeId) {
    const [status, setStatus] = useState(() => readNodeScriptStatus(nodeId))
    useEffect(() => {
        if (!nodeId) return undefined
        setStatus(readNodeScriptStatus(nodeId))
        const set = listeners.get(nodeId) || new Set()
        set.add(setStatus)
        listeners.set(nodeId, set)
        return () => set.delete(setStatus)
    }, [nodeId])
    return status
}

// --- what goes to the worker ----------------------------------------------

/** The node's script text, or '' — picture operators' __script is frame()/open(), not this. */
export const nodeScriptText = (node) => {
    if (!node || isTopType(node.typeId)) return ''
    const text = node.values?.__script
    return typeof text === 'string' && text.trim() ? text : ''
}

const NOT_SENT = new Set(['texture', 'geometry'])

const plainSettings = (values) => {
    const out = {}
    for (const [key, value] of Object.entries(values || {})) {
        if (key.startsWith('__')) continue
        const plain = plainValue(value)
        if (plain !== undefined) out[key] = plain
    }
    return out
}

/**
 * One item per scripted node: only the inputs it declares, resolved.
 *
 * Resolved in a context of its OWN, never the pass the room draws with:
 * reading every declared input eagerly would pull ports nobody reads into that
 * pass's loop detection and poison loops that are fine (nodeGraphRuntime's
 * cyclePoison). It still sees other scripts' last results, so scripted nodes
 * can feed scripted nodes.
 */
export const collectScriptItems = (document, { now = 0, liveOutputs = null, scriptResults = null, frameMemory = null } = {}) => {
    const scripted = (document?.nodes || []).filter((node) => nodeScriptText(node))
    if (!scripted.length) return []
    const context = createNodeGraphContext(document, { now, liveOutputs, frameMemory, scriptResults })
    const time = (Number.isFinite(now) ? now : 0) / 1000
    return scripted.map((node) => {
        const inputs = {}
        for (const port of getNodeInputs(node)) {
            if (NOT_SENT.has(port.type)) { inputs[port.id] = null; continue }
            const plain = plainValue(evaluateNodeInput(node, port.id, context))
            inputs[port.id] = plain === undefined ? null : plain
        }
        return { nodeId: node.id, text: nodeScriptText(node), inputs, time, values: plainSettings(node.values) }
    })
}

// --- what comes back ------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i

const coerce = (type, value) => {
    switch (type) {
        case 'number':
        case 'signal':
            if (typeof value === 'boolean') return value ? 1 : 0
            return typeof value === 'number' && Number.isFinite(value) ? value : undefined
        case 'boolean':
            if (typeof value === 'number') return value !== 0
            return typeof value === 'boolean' ? value : undefined
        case 'string':
            return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : undefined
        case 'color':
            return typeof value === 'string' && HEX.test(value) ? value : undefined
        case 'vec3':
            return Array.isArray(value) && value.length >= 3 ? value.slice(0, 3) : undefined
        case 'texture':
        case 'geometry':
            return undefined
        default:
            return value
    }
}

/** A node's returned object, kept only where it names a real output and fits its type. */
export const coerceScriptOutputs = (node, outputs) => {
    const kept = {}
    if (!node || !outputs) return kept
    for (const port of getNodeOutputs(node)) {
        if (!Object.prototype.hasOwnProperty.call(outputs, port.id)) continue
        const value = coerce(port.type, outputs[port.id])
        if (value !== undefined) kept[port.id] = value
    }
    return kept
}

/** The runner's raw results → the map createNodeGraphContext takes. */
export const buildScriptResults = (document, raw) => {
    const byId = new Map((document?.nodes || []).map((node) => [node.id, node]))
    const map = new Map()
    for (const [nodeId, entry] of raw || []) {
        const node = byId.get(nodeId)
        if (!node || nodeScriptText(node) !== entry.text) continue
        map.set(nodeId, coerceScriptOutputs(node, entry.outputs))
    }
    return map
}

// --- the runner: one worker, one batch at a time, a budget -----------------

const defaultClock = () => globalThis.performance?.now?.() ?? Date.now()
const LAST_RUN_REPORT_EVERY_MS = 500

/**
 * @param {object} options
 * @param {() => Worker} options.createWorker   anything with postMessage / terminate / onmessage
 * @param {number} [options.budgetMs]
 * @param {() => number} [options.clock]
 * @param {(nodeId, patch) => void} [options.report]
 */
export const createNodeScriptRunner = ({ createWorker, budgetMs = SCRIPT_BUDGET_MS, clock = defaultClock, report = reportNodeScript } = {}) => {
    let worker = null
    let ready = false
    let broken = null
    let batchSeq = 0
    let pending = null
    let checkSeq = 0
    let changed = false
    const results = new Map()   // nodeId -> { text, outputs }
    const stopped = new Map()   // nodeId -> text the budget stopped
    const failed = new Map()    // nodeId -> text that threw
    const checks = new Map()    // id -> { resolve, text }
    const lastReported = new Map()
    const subscribers = new Set()

    const emit = () => {
        if (!changed) return
        changed = false
        for (const listener of subscribers) listener(results)
    }

    const receive = (message) => {
        if (!message || typeof message !== 'object') return
        if (message.type === 'ready') {
            ready = true
            // The budget counts from when the worker could first read the batch.
            if (pending) pending.sentAt = clock()
            return
        }
        if (message.type === 'checked') {
            const waiting = checks.get(message.id)
            checks.delete(message.id)
            waiting?.resolve(message.error || null)
            return
        }
        if (!pending || message.batch !== pending.batch) return
        if (message.type === 'start') {
            pending.running = message.nodeId
            return
        }
        if (message.type === 'result') {
            const { nodeId } = message
            const text = pending.texts.get(nodeId)
            pending.running = null
            pending.finished.add(nodeId)
            const ms = Number.isFinite(message.ms) ? Math.round(message.ms * 10) / 10 : null
            if (message.error) {
                failed.set(nodeId, text)
                if (results.delete(nodeId)) changed = true
                report(nodeId, { error: message.error, stopped: null, blocked: null, lastRunMs: ms })
                return
            }
            const before = results.get(nodeId)
            const outputs = message.outputs || {}
            if (!before || before.text !== text || JSON.stringify(before.outputs) !== JSON.stringify(outputs)) {
                results.set(nodeId, { text, outputs })
                changed = true
            }
            const now = clock()
            const fresh = readNodeScriptStatus(nodeId)
            if (fresh.error || fresh.stopped || fresh.blocked || !(now - (lastReported.get(nodeId) ?? -Infinity) < LAST_RUN_REPORT_EVERY_MS)) {
                lastReported.set(nodeId, now)
                report(nodeId, { error: null, stopped: null, blocked: null, lastRunMs: ms })
            }
            return
        }
        if (message.type === 'done') {
            pending = null
            emit()
        }
    }

    const start = () => {
        worker = createWorker()
        ready = false
        worker.onmessage = (event) => receive(event?.data)
        worker.onerror = (event) => {
            // The worker file itself failed (a browser without module workers).
            // Nothing runs; every node keeps its built-in and says why.
            broken = `scripts could not start: ${event?.message || 'the worker failed to load'}`
            for (const nodeId of pending?.order || []) report(nodeId, { error: broken })
            pending = null
        }
    }

    const kill = () => {
        const offender = pending.running ?? pending.order.find((nodeId) => !pending.finished.has(nodeId))
        if (offender) {
            stopped.set(offender, pending.texts.get(offender))
            if (results.delete(offender)) changed = true
            report(offender, { stopped: scriptStoppedMessage(budgetMs), error: null })
        }
        try { worker?.terminate() } catch { /* already gone */ }
        worker = null
        ready = false
        pending = null
        for (const waiting of checks.values()) waiting.resolve(checkNodeScriptText(waiting.text))
        checks.clear()
        emit()
    }

    /** True when a batch is out and still inside its budget; kills it if it is past. */
    const busy = () => {
        if (!pending) return false
        if (ready && clock() - pending.sentAt > budgetMs) { kill(); return false }
        return true
    }

    /**
     * Call once a frame. `items` (or a function returning them, called only
     * when a batch will actually be sent) — see collectScriptItems.
     */
    const tick = (items) => {
        if (busy()) return false
        const list = (typeof items === 'function' ? items() : items) || []
        const texts = new Map(list.map((item) => [item.nodeId, item.text]))
        // A node whose script was removed or edited drops its last answer at
        // once — the built-in shows until the new text has run — and an
        // edited script that was stopped or threw gets another go.
        for (const [nodeId, entry] of results) {
            if (texts.get(nodeId) !== entry.text) { results.delete(nodeId); changed = true }
        }
        for (const book of [stopped, failed]) {
            for (const [nodeId, text] of book) {
                if (texts.get(nodeId) === text) continue
                book.delete(nodeId)
                if (texts.has(nodeId)) report(nodeId, { error: null, stopped: null })
            }
        }
        emit()
        const runnable = list.filter((item) => stopped.get(item.nodeId) !== item.text && failed.get(item.nodeId) !== item.text)
        if (!runnable.length || broken) return false
        if (!worker) start()
        pending = {
            batch: ++batchSeq,
            sentAt: clock(),
            texts: new Map(runnable.map((item) => [item.nodeId, item.text])),
            order: runnable.map((item) => item.nodeId),
            finished: new Set(),
            running: null
        }
        try {
            worker.postMessage({ type: 'run', batch: pending.batch, items: runnable })
        } catch {
            pending = null
            return false
        }
        return true
    }

    /** Syntax check in the worker; never runs the script. Resolves the message or null. */
    const check = (text) => new Promise((resolve) => {
        const source = String(text || '')
        if (!worker) start()
        const id = ++checkSeq
        checks.set(id, { resolve, text: source })
        try {
            worker.postMessage({ type: 'check', id, text: source })
        } catch {
            checks.delete(id)
            resolve(checkNodeScriptText(source))
        }
    })

    /** Give this node a clean slate: its stop/throw is forgiven, its memory dropped. */
    const forget = (nodeId) => {
        stopped.delete(nodeId)
        failed.delete(nodeId)
        if (results.delete(nodeId)) changed = true
        try { worker?.postMessage({ type: 'forget', nodeIds: [nodeId] }) } catch { /* next run recompiles */ }
        emit()
    }

    return {
        tick,
        busy,
        check,
        forget,
        results,
        subscribe: (listener) => { subscribers.add(listener); return () => subscribers.delete(listener) },
        /** Tests + the budget: is a batch out right now? */
        get pending() { return pending },
        dispose() {
            try { worker?.terminate() } catch { /* gone */ }
            worker = null
            pending = null
            subscribers.clear()
        }
    }
}

// --- this page's one runner ------------------------------------------------

let sharedRunner = null
export const getSharedNodeScriptRunner = () => {
    if (sharedRunner) return sharedRunner
    if (typeof Worker === 'undefined') return null
    sharedRunner = createNodeScriptRunner({
        createWorker: () => new Worker(new URL('./nodeScripts.worker.js', import.meta.url), { type: 'module' })
    })
    return sharedRunner
}

/**
 * For the Script tab's Apply: a syntax check (in the worker, never run) and a
 * clean slate for the node — a stopped or failed script gets another go, its
 * memory starts empty. Saving the text is the caller's op, as for any value.
 *
 * @returns {Promise<{ ok: boolean, error: string|null }>}
 */
export const applyNodeScript = async (nodeId, text) => {
    const runner = getSharedNodeScriptRunner()
    const error = runner ? await runner.check(text) : checkNodeScriptText(text)
    if (runner && nodeId) runner.forget(nodeId)
    if (nodeId) reportNodeScript(nodeId, { error: error || null, stopped: null })
    return { ok: !error, error: error || null }
}

// --- the machine gate ------------------------------------------------------

let machineAnswer = null
/** Whether this page's machine runs desk scripts: /api/config's machine.scripts. */
export const readMachineRunsScripts = () => {
    if (machineAnswer) return machineAnswer
    const asking = apiFetch('/api/config')
        .then((data) => data?.config?.machine?.scripts === true)
        .catch(() => {
            // Not remembered: a server that was restarting answers next time.
            machineAnswer = null
            return false
        })
    machineAnswer = asking
    return asking
}

const showClockMs = (document) => {
    const now = defaultClock()
    const epoch = document?.showState?.clockEpoch || 0
    return epoch > 0 && globalThis.performance?.timeOrigin ? performance.timeOrigin + now - epoch : now
}

/**
 * Run this document's node scripts on this page and hand back the map for
 * createNodeGraphContext({ scriptResults }). null while nothing is scripted,
 * the machine does not allow it, or no answer has arrived yet.
 *
 * @param {object} document
 * @param {object} [options]
 * @param {Map|null} [options.liveOutputs]
 * @param {boolean} [options.scriptsAllowed]  omitted: ask this page's server
 */
export function useNodeScripts(document, { liveOutputs = null, scriptsAllowed } = {}) {
    const scripted = useMemo(() => (document?.nodes || []).filter((node) => nodeScriptText(node)), [document?.nodes])
    const hasScripts = scripted.length > 0
    const [machineAllows, setMachineAllows] = useState(null)
    const [results, setResults] = useState(null)
    const documentRef = useRef(document)
    const liveRef = useRef(liveOutputs)
    const resultsRef = useRef(results)
    useEffect(() => {
        documentRef.current = document
        liveRef.current = liveOutputs
        resultsRef.current = results
    })

    const asksServer = scriptsAllowed === undefined
    useEffect(() => {
        if (!hasScripts || !asksServer) return undefined
        let cancelled = false
        readMachineRunsScripts().then((allowed) => { if (!cancelled) setMachineAllows(allowed) })
        return () => { cancelled = true }
    }, [hasScripts, asksServer])
    const allowed = asksServer ? machineAllows : scriptsAllowed === true

    useEffect(() => {
        if (!hasScripts || allowed === null) return
        for (const node of scripted) reportNodeScript(node.id, { blocked: allowed ? null : SCRIPTS_BLOCKED_MESSAGE })
    }, [hasScripts, allowed, scripted])

    const runner = hasScripts && allowed === true ? getSharedNodeScriptRunner() : null
    useEffect(() => {
        if (!runner) return undefined
        const memory = createFrameMemory()
        const off = runner.subscribe((raw) => setResults(buildScriptResults(documentRef.current, raw)))
        let raf = 0
        const loop = () => {
            raf = requestAnimationFrame(loop)
            runner.tick(() => collectScriptItems(documentRef.current, {
                now: showClockMs(documentRef.current),
                liveOutputs: liveRef.current,
                scriptResults: resultsRef.current,
                frameMemory: memory
            }))
        }
        raf = requestAnimationFrame(loop)
        return () => {
            cancelAnimationFrame(raf)
            off()
            setResults(null)
        }
    }, [runner])

    return runner ? results : null
}
