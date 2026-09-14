import { useCallback, useEffect, useRef, useState } from 'react'
import { KEEPER_STATUS, askKeeper } from '../utils/keeperClient.js'
import { clearFeedReport, reportFeed, useFeedReport } from '../utils/feedReports.js'

const STATUS_LABEL = {
    [KEEPER_STATUS.IDLE]: 'Ready',
    [KEEPER_STATUS.ASKING]: 'Asking the keeper…',
    [KEEPER_STATUS.ANSWERED]: 'Answered',
    [KEEPER_STATUS.UNREACHABLE]: 'Not answering',
    [KEEPER_STATUS.ERROR]: 'Error'
}

// The keeper's conversation, held for as long as the Keeper NODE exists. A
// question asked and a window closed mid-answer still lands: the reply keeps
// feeding the graph wherever the window is. The window (below) asks through
// the feed's ask() and shows what it reports.
export function KeeperFeed({ node, values, onReplyChange, askImpl = askKeeper }) {
    const endpoint = values?.endpoint ?? node.values?.endpoint ?? ''
    const model = values?.model ?? node.values?.model ?? ''
    const system = values?.system ?? node.values?.system ?? ''

    const [status, setStatus] = useState(KEEPER_STATUS.IDLE)
    const [reply, setReply] = useState('')
    const [message, setMessage] = useState('')
    const [truncated, setTruncated] = useState(false)
    const abortRef = useRef(null)

    // Held in refs: the parent passes inline arrows, and with their identity in
    // an effect's dependencies every editor render aborted the request in
    // flight and left the keeper on "Asking…" for ever.
    const onReplyChangeRef = useRef(onReplyChange)
    const latest = useRef({ endpoint, model, system, reply, askImpl })
    useEffect(() => {
        onReplyChangeRef.current = onReplyChange
        latest.current = { endpoint, model, system, reply, askImpl }
    })

    // Cleared when the NODE goes (the feed unmounts) — a stale reply must not
    // keep feeding the graph after the keeper is deleted.
    useEffect(() => () => {
        abortRef.current?.abort()
        onReplyChangeRef.current?.(node.id, null, null)
        clearFeedReport(node.id)
    }, [node.id])

    const ask = useCallback(async (prompt) => {
        const { endpoint: to, model: using, system: brief, reply: before, askImpl: asking } = latest.current
        if (!String(to).trim() || !String(using).trim() || !String(prompt ?? '').trim()) return
        abortRef.current?.abort()
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        abortRef.current = controller

        setStatus(KEEPER_STATUS.ASKING)
        setMessage('')
        setTruncated(false)
        // The last answer is still the last answer while a new one is in
        // flight; `busy` is what tells downstream that a fresher one is coming.
        // Passing null here would clear the port (see handleLiveOutputChange).
        onReplyChangeRef.current?.(node.id, before || null, true)

        const result = await asking({ endpoint: to, model: using, system: brief, prompt, signal: controller?.signal })

        // A superseded request must not overwrite the reply that replaced it.
        if (controller && controller.signal.aborted) return

        setStatus(result.status)
        setTruncated(Boolean(result.truncated))
        if (result.status === KEEPER_STATUS.ANSWERED) {
            setReply(result.text)
            setMessage('')
            onReplyChangeRef.current?.(node.id, result.text, false)
        } else {
            setMessage(result.error || '')
            // Clear the port on failure. Leaving the previous answer wired up
            // would present a stale reply to everything downstream as though it
            // were the response to this prompt — the silent-failure class.
            setReply('')
            onReplyChangeRef.current?.(node.id, null, false)
        }
    }, [node.id])

    useEffect(() => {
        reportFeed(node.id, { status, reply, message, truncated, ask })
    }, [node.id, status, reply, message, truncated, ask])

    return null
}

// The Keeper window: set it up, type a question, read the answer — all of it
// through the feed above, so closing the window loses nothing.
export default function KeeperPanelWindow({ node, values, onConfigChange }) {
    const endpoint = values?.endpoint ?? node.values?.endpoint ?? ''
    const model = values?.model ?? node.values?.model ?? ''
    // A wired `prompt` port wins over what was typed, so a graph can drive the
    // keeper; the box is the fallback when nothing is connected.
    const wiredPrompt = values?.prompt ?? ''

    const [typedPrompt, setTypedPrompt] = useState('')
    const { status = KEEPER_STATUS.IDLE, reply = '', message = '', truncated = false, ask = null } = useFeedReport(node.id)

    const prompt = wiredPrompt || typedPrompt
    const configured = Boolean(String(endpoint).trim() && String(model).trim())

    const busy = status === KEEPER_STATUS.ASKING

    return (
        <div className="raw-keeper-panel">
            {/* Static guidance, not a live region — the one live status is the
                state label below, and two competing status roles make a screen
                reader announce the same panel twice. */}
            {!configured && (
                <div className="raw-keeper-panel-setup">
                    <div className="raw-keeper-panel-status raw-keeper-panel-status-setup">
                        Point the keeper at a model to wake it &mdash; a box on this
                        network, or one on this machine. A bare host is enough:
                        llama.cpp and LM Studio answer at :8090, Ollama at :11434,
                        and both chat paths are tried.
                    </div>
                    <label className="raw-keeper-panel-field">
                        <span className="raw-keeper-panel-label">Endpoint</span>
                        <input
                            className="raw-keeper-panel-input"
                            type="text"
                            value={endpoint}
                            placeholder="http://127.0.0.1:8090 or :11434"
                            onChange={(event) => onConfigChange?.(node.id, { endpoint: event.target.value })}
                        />
                    </label>
                    <label className="raw-keeper-panel-field">
                        <span className="raw-keeper-panel-label">Model</span>
                        <input
                            className="raw-keeper-panel-input"
                            type="text"
                            value={model}
                            placeholder="qwen3"
                            onChange={(event) => onConfigChange?.(node.id, { model: event.target.value })}
                        />
                    </label>
                </div>
            )}

            <label className="raw-keeper-panel-field">
                <span className="raw-keeper-panel-label">Prompt</span>
                <textarea
                    className="raw-keeper-panel-input"
                    value={wiredPrompt || typedPrompt}
                    onChange={(event) => setTypedPrompt(event.target.value)}
                    readOnly={Boolean(wiredPrompt)}
                    rows={2}
                    placeholder={wiredPrompt ? '' : 'Ask the keeper…'}
                />
            </label>
            {wiredPrompt && (
                <div className="raw-keeper-panel-note">Driven by whatever is wired into the prompt port.</div>
            )}

            <div className="raw-keeper-panel-actions">
                <button
                    type="button"
                    className="raw-keeper-panel-ask"
                    onClick={() => ask?.(prompt)}
                    disabled={busy || !ask || !configured || !String(prompt).trim()}
                >
                    {busy ? 'Asking…' : 'Ask'}
                </button>
                <span
                    className={`raw-keeper-panel-state raw-keeper-panel-state-${status}`}
                    role="status"
                >
                    {STATUS_LABEL[status]}
                </span>
            </div>

            {message && (
                <div className="raw-keeper-panel-status raw-keeper-panel-status-error" role="alert">
                    {message}
                </div>
            )}

            {reply && (
                <div className="raw-keeper-panel-reply">
                    {reply}
                    {truncated && (
                        <div className="raw-keeper-panel-note">
                            The keeper ran out of room mid-sentence.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
