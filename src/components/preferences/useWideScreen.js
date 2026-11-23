import { useEffect, useState } from 'react'

// True above 900 px, where the Monitor map has its own height and the plain wheel may zoom it; below, the page scrolls.
export const WIDE_PX = 900
const isWide = () => typeof window === 'undefined' || window.innerWidth > WIDE_PX
export function useWideScreen() {
    const [wide, setWide] = useState(isWide)
    useEffect(() => {
        const on = () => setWide(isWide())
        window.addEventListener('resize', on)
        return () => window.removeEventListener('resize', on)
    }, [])
    return wide
}
