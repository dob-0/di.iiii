import { useEffect, useRef, useState } from 'react'
import { DIJET_DEFAULT_HOST, DIJET_STATUS, useDijetLink } from '../utils/dijetCapture.js'

// The robot speaks. /tts takes plain text or a JSON envelope with voice
// settings; this sends plain text, which the robot's tts_node caps at 300
// characters and hands to spd-say.
//
// It speaks on a TRIGGER, not on every text change. Wired to a string that
// updates continuously, "speak whenever the text differs" would queue an
// utterance per keystroke and the robot would still be talking about something
// that stopped being true minutes ago.

const STATUS_MESSAGE = {
    [DIJET_STATUS.IDLE]: 'Give it the robot’s address to start.',
    [DIJET_STATUS.CONNECTING]: 'Reaching the robot…',
    [DIJET_STATUS.UNREACHABLE]: 'No answer. This page has to be on the same network as the robot.'
}

const MAX_CHARS = 300

export default function DijetSayPanel({ node, values, inputs, onConfigChange }) {
    const host = values?.host ?? node.values?.host ?? DIJET_DEFAULT_HOST
    const { status, linkRef } = useDijetLink(host)
    const [draft, setDraft] = useState(host)
    useEffect(() => { setDraft(host) }, [host])
    const [spoken, setSpoken] = useState(null)

    const text = String(inputs?.text ?? node.values?.text ?? '')
    const trigger = Number(inputs?.trigger ?? 0)
    const lastTriggerRef = useRef(null)

    useEffect(() => {
        const link = linkRef.current
        if (!link || status !== DIJET_STATUS.ACTIVE) return
        // The first reading arms rather than speaks: mounting a node should not
        // make the robot announce itself.
        if (lastTriggerRef.current === null) { lastTriggerRef.current = trigger; return }
        if (trigger === lastTriggerRef.current) return
        lastTriggerRef.current = trigger
        const say = text.trim().slice(0, MAX_CHARS)
        if (!say) return
        link.advertise('/tts', 'std_msgs/String')
        link.publish('/tts', { data: say })
        setSpoken(say)
    }, [trigger, text, status, linkRef])

    const commitHost = () => {
        const next = draft.trim()
        if (next !== host) onConfigChange?.(node.id, { host: next })
    }

    const showStatus = status !== DIJET_STATUS.ACTIVE

    return (
        <div className="raw-dijet-panel">
            {showStatus && (
                <div className="raw-dijet-panel-status" role="status">
                    {STATUS_MESSAGE[status]}
                </div>
            )}

            <label className="raw-dijet-panel-field">
                <span className="raw-dijet-panel-label">Robot</span>
                <input
                    className="raw-dijet-panel-input"
                    value={draft}
                    spellCheck={false}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitHost}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitHost() }}
                />
            </label>

            <div className="raw-dijet-say-last">
                {spoken ? `“${spoken}”` : 'Nothing said yet.'}
            </div>

            <div className="raw-dijet-panel-note">
                Speaks when Trigger changes, not when the text does — otherwise a
                live string would queue an utterance per keystroke.
            </div>
        </div>
    )
}
