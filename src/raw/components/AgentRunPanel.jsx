import { useEffect, useRef, useState } from 'react'
import { fetchAgentRun, startAgentRun, stopAgentRun } from '../../services/workApi.js'

const POLL_INTERVAL_MS = 1500

// `tail` is a slice of `claude -p --output-format stream-json` — one JSON
// object per line. The tail is truncated to its last N bytes (see
// TAIL_MAX_BYTES in agentRunRoutes.js), so the first line may be a partial
// object; skip lines that fail to parse rather than treating them as data.
function summarizeTail(tail) {
    if (!tail) return { transcript: [], final: null }
    const transcript = []
    let final = null
    for (const line of tail.split('\n')) {
        if (!line.trim()) continue
        let event
        try {
            event = JSON.parse(line)
        } catch {
            continue
        }
        if (event.type === 'assistant') {
            const text = (event.message?.content || [])
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('')
            if (text) transcript.push(text)
        } else if (event.type === 'result') {
            final = { text: event.result, costUsd: event.total_cost_usd, isError: event.is_error }
        }
    }
    return { transcript, final }
}

// `trigger` is a signal port (see nodeRegistry PORT_TYPES): consumers fire on
// the value CHANGING, not on it being truthy — same contract as time.beat, so
// a re-render or an unrelated re-evaluation of the graph never re-launches a run.
export default function AgentRunPanel({ node, prompt, trigger, onValuesChange }) {
    const [localPrompt, setLocalPrompt] = useState('')
    const [run, setRun] = useState(null)
    const [error, setError] = useState(null)
    const lastTriggerRef = useRef(trigger)
    const pollRef = useRef(null)

    const effectivePrompt = prompt || localPrompt

    const launch = async () => {
        if (!effectivePrompt.trim()) return
        try {
            setError(null)
            const { runId } = await startAgentRun(effectivePrompt, node.values?.cwd)
            const started = await fetchAgentRun(runId)
            setRun(started)
        } catch (err) {
            setError(err)
        }
    }

    useEffect(() => {
        if (trigger !== undefined && trigger !== lastTriggerRef.current) {
            lastTriggerRef.current = trigger
            launch()
        } else {
            lastTriggerRef.current = trigger
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trigger])

    useEffect(() => {
        clearInterval(pollRef.current)
        if (!run || run.status !== 'running') return
        pollRef.current = setInterval(async () => {
            try {
                const next = await fetchAgentRun(run.id)
                setRun(next)
            } catch (err) {
                setError(err)
                clearInterval(pollRef.current)
            }
        }, POLL_INTERVAL_MS)
        return () => clearInterval(pollRef.current)
        // Re-arm only when the run identity or its terminal state changes —
        // not on every tail update the poll itself produces, or this would
        // tear down and restart the interval on each poll response.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run?.id, run?.status])

    useEffect(() => {
        onValuesChange?.(node.id, 'status', run?.status || 'idle')
        onValuesChange?.(node.id, 'running', run?.status === 'running')
        onValuesChange?.(node.id, 'result', run?.tail || null)
    }, [run, node.id, onValuesChange])

    useEffect(() => () => {
        onValuesChange?.(node.id, 'status', null)
        onValuesChange?.(node.id, 'running', null)
        onValuesChange?.(node.id, 'result', null)
    }, [node.id, onValuesChange])

    const handleStop = async () => {
        if (!run) return
        try {
            const next = await stopAgentRun(run.id)
            setRun(next)
        } catch (err) {
            setError(err)
        }
    }

    return (
        <div className="raw-agent-run-panel">
            {!prompt && (
                <textarea
                    className="raw-agent-run-panel-input"
                    placeholder="Prompt for a headless run…"
                    value={localPrompt}
                    onChange={(event) => setLocalPrompt(event.target.value)}
                />
            )}
            <div className="raw-agent-run-panel-controls">
                <button type="button" onClick={launch} disabled={run?.status === 'running' || !effectivePrompt.trim()}>
                    Run
                </button>
                <button type="button" onClick={handleStop} disabled={run?.status !== 'running'}>
                    Stop
                </button>
                <span className={`raw-agent-run-panel-status raw-agent-run-panel-status-${run?.status || 'idle'}`}>
                    {run?.status || 'idle'}
                </span>
            </div>
            {error && (
                <div className="raw-agent-run-panel-error" role="status">
                    {error.status === 404
                        ? 'Not available — this only works on a dev server running on your own machine.'
                        : `Error: ${error.message}`}
                </div>
            )}
            {run?.tail && (() => {
                const { transcript, final } = summarizeTail(run.tail)
                return (
                    <div className="raw-agent-run-panel-output">
                        {transcript.map((text, index) => (
                            <p key={index} className="raw-agent-run-panel-message">{text}</p>
                        ))}
                        {final && (
                            <p className={`raw-agent-run-panel-result${final.isError ? ' raw-agent-run-panel-result-error' : ''}`}>
                                {final.text}
                                {typeof final.costUsd === 'number' && (
                                    <span className="raw-agent-run-panel-cost"> · ${final.costUsd.toFixed(3)}</span>
                                )}
                            </p>
                        )}
                        <details className="raw-agent-run-panel-raw">
                            <summary>Full output</summary>
                            <pre className="raw-agent-run-panel-tail">{run.tail}</pre>
                        </details>
                    </div>
                )
            })()}
        </div>
    )
}
