import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../services/apiClient.js'

const IDLE = 'idle'
const BUSY = 'busy'
const OK = 'ok'
const ERR = 'err'

export default function SpaceSyncPanel({ spaceId, className = '' }) {
    const [state, setState] = useState(IDLE)
    const [message, setMessage] = useState('')
    const [status, setStatus] = useState(null)
    const abortRef = useRef(null)
    const statusAbortRef = useRef(null)

    const checkStatus = useCallback(async () => {
        statusAbortRef.current?.abort()
        const controller = new AbortController()
        statusAbortRef.current = controller
        try {
            const data = await apiFetch(`/api/sync/spaces/${spaceId}/status`, { signal: controller.signal })
            setStatus(data)
        } catch (error) {
            if (error.name === 'AbortError') return
            setStatus(null)
        }
    }, [spaceId])

    useEffect(() => {
        checkStatus()
        return () => {
            statusAbortRef.current?.abort()
            abortRef.current?.abort()
        }
    }, [checkStatus])

    const run = async (action) => {
        if (action === 'push' && !canPush) {
            setState(ERR)
            setMessage('set LIVE_API_TOKEN in server .env.local to enable publishing')
            return
        }
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setState(BUSY)
        setMessage(action === 'pull' ? 'getting latest…' : 'publishing…')
        try {
            const data = await apiFetch(`/api/sync/spaces/${spaceId}/${action}`, {
                method: 'POST',
                signal: controller.signal,
                // A pull replaces this machine's whole scene, so it has to say
                // which version it means to replace. The server refuses (428)
                // without it rather than overwriting whatever arrived since.
                body: action === 'pull' ? { expectedVersion: status?.local?.version ?? 0 } : undefined,
            })
            setState(OK)
            setMessage(
                action === 'pull'
                    ? `got latest · ${data.objects} objects`
                    : `published · ${data.objects} objects`
            )
            checkStatus()
        } catch (error) {
            if (error.name === 'AbortError') return
            setState(ERR)
            // 409 is not a failure of the network or of this panel — it is the
            // other side having moved. Say that, because "something went wrong"
            // invites a retry that would overwrite someone's work.
            if (error.status === 409) {
                setMessage(
                    action === 'pull'
                        ? 'your local copy changed while you looked — nothing was written'
                        : 'live changed while you looked — nothing was published'
                )
                checkStatus()
                return
            }
            setMessage(error.message || 'something went wrong')
        }
    }

    if (!status?.configured) return null

    const { local, live, canPush } = status ?? {}

    // This used to claim "in sync" whenever the two OBJECT COUNTS matched, so
    // two entirely unrelated three-object scenes read as identical. Version
    // numbers cannot settle it either: each instance counts from its own zero,
    // so local v41 and live v13 are not comparable. Report both sides and let
    // the person decide — a wrong "in sync" is worse than no claim, because it
    // is the one that stops someone checking.
    // Two spans rather than one string: on a phone the row wraps, and it has
    // to break BETWEEN the two sides, never through a version number.
    const defaultMessage = live?.error
        ? <span className="space-sync-side">live unreachable</span>
        : live && local
        ? <>
            <span className="space-sync-side">local v{local.version} · {local.objects} obj</span>
            <span className="space-sync-side">live v{live.version} · {live.objects} obj</span>
        </>
        : <span className="space-sync-side">local v{local?.version ?? 0} · {local?.objects ?? 0} obj</span>

    return (
        <div className={`space-sync-row ${className}`} role="region" aria-label="Live sync">
            <span className={`space-sync-msg space-sync-msg--${state}`}>
                {message || defaultMessage}
            </span>
            <button
                type="button"
                className="space-sync-btn"
                onClick={() => run('pull')}
                disabled={state === BUSY}
                title="Get the latest version from the live server"
            >
                ↓ get latest
            </button>
            <button
                type="button"
                className="space-sync-btn"
                onClick={() => run('push')}
                disabled={state === BUSY}
                title="Publish your local version to the live server"
            >
                ↑ publish
            </button>
        </div>
    )
}
