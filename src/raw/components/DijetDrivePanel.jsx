import { useCallback, useEffect, useRef, useState } from 'react'
import { DIJET_DEFAULT_HOST, DIJET_STATUS, clamp, useDijetLink } from '../utils/dijetCapture.js'

// Driving a real machine from a node graph, with the same safety the robot's
// own panel has. Three properties, all deliberate:
//
//   1. ARMING IS NOT A GRAPH INPUT. It is a switch in this window that a person
//      throws. A graph can decide how fast to go; it cannot decide to go. That
//      is the difference between a robot you can wire up and one that wanders
//      off because an edge got connected.
//   2. It is a DEAD-MAN: /cmd_vel is republished ~10x a second while armed, and
//      the robot's driver stops on its own when the stream stops. Closing the
//      tab, hiding it, deleting the node or losing the link all stop the robot
//      because they stop the heartbeat -- nothing has to reach it to make it
//      halt.
//   3. THE CEILING IS ENFORCED HERE. Read Mcnamu_driver.py: the robot's driver
//      clamps nothing at all, and /driver_node/set_parameters changes no
//      behaviour. A speed limit that is not applied client-side does not exist.

const STATUS_MESSAGE = {
    [DIJET_STATUS.IDLE]: 'Give it the robot’s address to start.',
    [DIJET_STATUS.CONNECTING]: 'Reaching the robot…',
    [DIJET_STATUS.UNREACHABLE]: 'No answer. This page has to be on the same network as the robot.'
}

const HEARTBEAT_MS = 100

export default function DijetDrivePanel({ node, values, inputs, onConfigChange }) {
    const host = values?.host ?? node.values?.host ?? DIJET_DEFAULT_HOST
    const maxLinear = Number(values?.maxLinear ?? node.values?.maxLinear ?? 0.30)
    const maxAngular = Number(values?.maxAngular ?? node.values?.maxAngular ?? 1.20)

    const [armed, setArmed] = useState(false)
    const [draft, setDraft] = useState(host)
    useEffect(() => { setDraft(host) }, [host])

    const { status, linkRef } = useDijetLink(host)

    // The live numbers from the graph, read by the heartbeat without making it
    // a dependency — a re-render per sample would restart the timer.
    const cmdRef = useRef({ x: 0, y: 0, wz: 0 })
    cmdRef.current = {
        x: clamp(inputs?.forward, maxLinear),
        y: clamp(inputs?.strafe, maxLinear),
        wz: clamp(inputs?.turn, maxAngular)
    }
    const [sent, setSent] = useState({ x: 0, y: 0, wz: 0 })

    const publishTwist = useCallback((x, y, wz) => {
        const link = linkRef.current
        if (!link) return
        link.advertise('/cmd_vel', 'geometry_msgs/Twist')
        link.publish('/cmd_vel', {
            linear: { x, y, z: 0 },
            angular: { x: 0, y: 0, z: wz }
        })
    }, [linkRef])

    const stop = useCallback(() => {
        // Three zeros, not one: a single packet can be the one that is dropped,
        // and this is the message that must not be.
        for (let i = 0; i < 3; i += 1) publishTwist(0, 0, 0)
        setSent({ x: 0, y: 0, wz: 0 })
    }, [publishTwist])

    const disarm = useCallback(() => {
        setArmed(false)
        stop()
    }, [stop])

    // Hiding the tab disarms. A robot must not keep driving because a phone
    // went into a pocket.
    useEffect(() => {
        if (!armed) return undefined
        const onHide = () => { if (document.hidden) disarm() }
        document.addEventListener('visibilitychange', onHide)
        window.addEventListener('pagehide', disarm)
        return () => {
            document.removeEventListener('visibilitychange', onHide)
            window.removeEventListener('pagehide', disarm)
        }
    }, [armed, disarm])

    // Losing the link disarms too, so coming back does not resume motion.
    useEffect(() => {
        if (armed && status !== DIJET_STATUS.ACTIVE) setArmed(false)
    }, [armed, status])

    useEffect(() => {
        if (!armed) return undefined
        const beat = setInterval(() => {
            const { x, y, wz } = cmdRef.current
            publishTwist(x, y, wz)
            setSent({ x, y, wz })
        }, HEARTBEAT_MS)
        return () => {
            clearInterval(beat)
            // unmount, disarm, host change -- all end with the robot stopped
            for (let i = 0; i < 3; i += 1) publishTwist(0, 0, 0)
        }
    }, [armed, publishTwist])

    const commitHost = () => {
        const next = draft.trim()
        if (next !== host) {
            if (armed) disarm()
            onConfigChange?.(node.id, { host: next })
        }
    }

    const canArm = status === DIJET_STATUS.ACTIVE
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
                    disabled={armed}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitHost}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitHost() }}
                />
            </label>

            <div className={`raw-dijet-drive-arm${armed ? ' is-armed' : ''}`}>
                <button
                    type="button"
                    className={`raw-dijet-arm-button${armed ? ' is-armed' : ''}`}
                    disabled={!canArm && !armed}
                    aria-pressed={armed}
                    onClick={() => (armed ? disarm() : setArmed(true))}
                >
                    {armed ? 'Stop' : 'Arm'}
                </button>
                <span className="raw-dijet-arm-hint">
                    {armed
                        ? 'Driving. Closing or hiding this tab stops it.'
                        : 'Nothing moves until you arm it here — a graph cannot.'}
                </span>
            </div>

            <dl className="raw-dijet-panel-readout">
                <dt>Forward</dt><dd>{sent.x.toFixed(2)} m/s</dd>
                <dt>Strafe</dt><dd>{sent.y.toFixed(2)} m/s</dd>
                <dt>Turn</dt><dd>{sent.wz.toFixed(2)} rad/s</dd>
            </dl>

            <div className="raw-dijet-panel-note">
                Ceiling {maxLinear.toFixed(2)} m/s · {maxAngular.toFixed(2)} rad/s, applied here
                — the robot’s own driver enforces no limit.
            </div>
        </div>
    )
}
