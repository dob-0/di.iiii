import { useEffect, useState } from 'react'
import { getApiSession } from '../services/apiClient.js'
import './authReturnNotice.css'

const AUTO_HIDE_MS = 6000

// OAuth is a full-page redirect, so the moment of return is the only chance
// to confirm the outcome. The server marks it with ?auth=ok / ?auth=error;
// this reads the marker once, shows a toast, and strips it from the URL.
export default function AuthReturnNotice() {
    const [notice, setNotice] = useState(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const marker = params.get('auth')
        if (marker !== 'ok' && marker !== 'error') return undefined

        params.delete('auth')
        const query = params.toString()
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)

        let cancelled = false
        if (marker === 'error') {
            setNotice({ tone: 'error', text: 'Sign-in failed — please try again.' })
        } else {
            setNotice({ tone: 'ok', text: 'Signed in.' })
            getApiSession()
                .then((session) => {
                    if (cancelled || !session?.authenticated) return
                    setNotice({ tone: 'ok', text: `Signed in as ${session.label || session.subject}.` })
                })
                .catch(() => {})
        }
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(null), AUTO_HIDE_MS)
        return () => clearTimeout(timer)
    }, [notice])

    if (!notice) return null

    return (
        <div className={`auth-return-notice auth-return-notice--${notice.tone}`} role="status">
            <span className="auth-return-notice-mark" aria-hidden="true">{notice.tone === 'ok' ? '◈' : '⚠'}</span>
            {notice.text}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
        </div>
    )
}
