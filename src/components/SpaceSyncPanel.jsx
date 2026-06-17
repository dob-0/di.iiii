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
                disabled={state === BUSY}
                title="Publish your local version to the live server"
            >
                ↑ publish
            </button>
        </div>
    )
}
