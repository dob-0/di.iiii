import { useCallback, useEffect, useState } from 'react'

// A blob URL for a file the person picked, held in this browser only. Each URL
// pins the whole file in memory until it is revoked, so the previous one is
// revoked when a new file replaces it and the last one when the owner unmounts.
export function useLocalFileUrl() {
    const [url, setUrl] = useState('')
    const setFile = useCallback((file) => {
        setUrl(file ? URL.createObjectURL(file) : '')
    }, [])
    useEffect(() => {
        if (!url) return undefined
        return () => URL.revokeObjectURL(url)
    }, [url])
    return [url, setFile]
}

export default useLocalFileUrl
