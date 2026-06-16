import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 900px)'
const COMPACT_PHONE_QUERY = '(max-width: 560px)'

const readMatch = (query) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia(query).matches
}

export function useViewportMode() {
    const [isMobile, setIsMobile] = useState(() => readMatch(MOBILE_QUERY))
    const [isPhoneCompact, setIsPhoneCompact] = useState(() => readMatch(COMPACT_PHONE_QUERY))

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return undefined
        }

        const mobileQuery = window.matchMedia(MOBILE_QUERY)
        const compactQuery = window.matchMedia(COMPACT_PHONE_QUERY)

        const handleChange = () => {
            setIsMobile(mobileQuery.matches)
            setIsPhoneCompact(compactQuery.matches)
        }

        handleChange()

        mobileQuery.addEventListener('change', handleChange)
        compactQuery.addEventListener('change', handleChange)
        return () => {
            mobileQuery.removeEventListener('change', handleChange)
            compactQuery.removeEventListener('change', handleChange)
        }
    }, [])

    return {
        viewportMode: isMobile ? 'mobile' : 'desktop',
        isPhoneCompact
    }
}

export default useViewportMode
