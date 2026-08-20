import { useCallback, useEffect, useRef, useState } from 'react'
import { KEEPER_STATUS, askKeeper } from '../utils/keeperClient.js'

const STATUS_LABEL = {
    [KEEPER_STATUS.IDLE]: 'Ready',
    [KEEPER_STATUS.ASKING]: 'Asking the keeper…',
    [KEEPER_STATUS.ANSWERED]: 'Answered',
    [KEEPER_STATUS.UNREACHABLE]: 'Not answering',
    [KEEPER_STATUS.ERROR]: 'Error'
}

export default function KeeperPanelWindow({ node, values, onReplyChange, onConfigChange, askImpl = askKeeper }) {
    const endpoint = values?.endpoint ?? node.values?.endpoint ?? ''
    const model = values?.model ?? node.values?.model ?? ''
    const system = values?.system ?? node.values?.system ?? ''
    // A wired `prompt` port wins over what was typed, so a graph can drive the
    // keeper; the box is the fallback when nothing is connected.
    const wiredPrompt = values?.prompt ?? ''

    const [typedPrompt, setTypedPrompt] = useState('')
    const [status, setStatus] = useState(KEEPER_STATUS.IDLE)
    const [reply, setReply] = useState('')
    const [message, setMessage] = useState('')
    const [truncated, setTruncated] = useState(false)
    const abortRef = useRef(null)

    const prompt = wiredPrompt || typedPrompt
    const configured = Boolean(String(endpoint).trim() && String(model).trim())

    // Held in a ref, and the cleanup below depends only on node.id. The parent
    // passes this as an inline arrow, so its identity changes on every render of
    // the editor; with it in the dependency list the cleanup ran on every one of
    // those renders, aborting whatever request was in flight. The panel then sat
    // on "Asking…" for ever, because the aborted branch returns before it can
    // set a status. Unit tests could not see it — it needs a parent that
    // re-renders.
    const onReplyChangeRef = useRef(onReplyChange)
    useEffect(() => { onReplyChangeRef.current = onReplyChange })

    // Clear this node's live ports on unmount, exactly as the capture panels do
    // — a stale reply must not keep feeding the graph after the window closes.
    useEffect(() => () => {
        abortRef.current?.abort()
        onReplyChangeRef.current?.(node.id, null, null)
    }, [node.id])

    const ask = useCallback(async () => {
        if (!configured || !String(prompt).trim()) return
        abortRef.current?.abort()
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        abortRef.current = controller

        setStatus(KEEPER_STATUS.ASKING)
        setMessage('')
        setTruncated(false)
        // The last answer is still the last answer while a new one is in
        // flight; `busy` is what tells downstream that a fresher one is coming.
        // Passing null here would clear the port (see handleLiveOutputChange).
        onReplyChangeRef.current?.(node.id, reply || null, true)

        const result = await askImpl({ endpoint, model, system, prompt, signal: controller?.signal })

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
    }, [askImpl, configured, endpoint, model, node.id, prompt, reply, system])

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
                        network, or one on this machine.
                    </div>
                    <label className="raw-keeper-panel-field">
                        <span className="raw-keeper-panel-label">Endpoint</span>
                        <input
                            className="raw-keeper-panel-input"
                            type="text"
                            value={endpoint}
                            placeholder="http://localhost:11434"
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
                    onClick={ask}
                    disabled={busy || !configured || !String(prompt).trim()}
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
