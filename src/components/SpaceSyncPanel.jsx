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

    const checkStatus = useCallback(async () => {
        try {
            const data = await apiFetch(`/api/sync/spaces/${spaceId}/status`)
            setStatus(data)
        } catch {
            setStatus(null)
        }
    }, [spaceId])

    useEffect(() => {
        checkStatus()
        return () => abortRef.current?.abort()
    }, [checkStatus])

    const run = async (action) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setState(BUSY)
        setMessage(action === 'pull' ? 'getting latest…' : 'publishing…')
        try {
            const data = await apiFetch(`/api/sync/spaces/${spaceId}/${action}`, {
                method: 'POST',
                signal: controller.signal,
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
            setMessage(error.message || 'something went wrong')
        }
    }

    if (!status?.configured) return null

    const { local, live, canPush } = status ?? {}
    const behind = live && local && live.objects > local.objects
    const ahead = live && local && local.objects > live.objects
    const inSync = live && local && local.objects === live.objects

    const defaultMessage = live?.error
        ? `live unreachable`
        : inSync
        ? `in sync · ${local?.objects ?? 0} objects`
        : behind
        ? `local is behind live`
        : ahead
        ? `local is ahead of live`
        : `local · ${local?.objects ?? 0} objects`

    return (
        <div className={`beta-hub-sync-row ${className}`} role="region" aria-label="Live sync">
            <span className={`beta-hub-sync-msg beta-hub-sync-msg--${state}`}>
                {message || defaultMessage}
            </span>
            <button
                type="button"
                className="beta-hub-sync-btn"
                onClick={() => run('pull')}
                disabled={state === BUSY}
                title="Get the latest version from the live server"
            >
                ↓ get latest
            </button>
            <button
                type="button"
                className="beta-hub-sync-btn"
                onClick={() => run('push')}
                disabled={state === BUSY || !canPush}
                title={canPush ? 'Publish your local version to the live server' : 'LIVE_API_TOKEN not set in server .env.local'}
            >
                ↑ publish
            </button>
        </div>
    )
}
