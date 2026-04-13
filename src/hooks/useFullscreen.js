import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
    const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement))
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
        }
    }, [])

    const handleEnterFullscreen = useCallback(() => {
        document.documentElement.requestFullscreen?.()
    }, [])

    return { isFullscreen, handleEnterFullscreen }
}

export default useFullscreen
