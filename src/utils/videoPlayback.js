export const isRemoteMediaUrl = (value) => /^https?:\/\//i.test(value || '')

export const configureVideoElement = (video, sourceUrl, { preload = 'auto' } = {}) => {
    if (!video) return video
    video.loop = true
    video.muted = true
    video.defaultMuted = true
    video.volume = 0
    video.autoplay = true
    video.playsInline = true
    video.preload = preload
    video.setAttribute?.('muted', '')
    video.setAttribute?.('playsinline', '')
    video.setAttribute?.('webkit-playsinline', '')
    if (isRemoteMediaUrl(sourceUrl)) {
        video.crossOrigin = 'anonymous'
    }
    video.src = sourceUrl
    video.load?.()
    return video
}

export const attachVideoPlaybackRetry = (video, { onBlockedChange } = {}) => {
    if (!video) return () => {}

    let disposed = false
    let retryAttached = false

    const clearRetryListeners = () => {
        if (!retryAttached || typeof window === 'undefined') return
        retryAttached = false
        window.removeEventListener('pointerdown', handleRetry)
        window.removeEventListener('keydown', handleRetry)
        window.removeEventListener('touchstart', handleRetry)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
    }

    const markBlocked = (value) => {
        onBlockedChange?.(Boolean(value))
    }

    const attemptPlayback = async () => {
        if (disposed) return false
        try {
            const result = video.play?.()
            if (result && typeof result.then === 'function') {
                await result
            }
            markBlocked(false)
            clearRetryListeners()
            return true
        } catch {
            markBlocked(true)
            if (!retryAttached && typeof window !== 'undefined') {
                retryAttached = true
                window.addEventListener('pointerdown', handleRetry, { passive: true })
                window.addEventListener('keydown', handleRetry)
                window.addEventListener('touchstart', handleRetry, { passive: true })
                document.addEventListener('visibilitychange', handleVisibilityChange)
            }
            return false
        }
    }

    function handleRetry() {
        void attemptPlayback()
    }

    function handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            void attemptPlayback()
        }
    }

    const handleCanPlay = () => {
        void attemptPlayback()
    }

    video.addEventListener?.('canplay', handleCanPlay)
    video.addEventListener?.('loadeddata', handleCanPlay)
    video.addEventListener?.('playing', () => markBlocked(false))
    void attemptPlayback()

    return () => {
        disposed = true
        clearRetryListeners()
        video.removeEventListener?.('canplay', handleCanPlay)
        video.removeEventListener?.('loadeddata', handleCanPlay)
    }
}
