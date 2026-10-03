import { useEffect } from 'react'

import RouteSurfaceFallback from '../components/RouteSurfaceFallback.jsx'

// Forward to the desk's Touch tab (touchRouting.js). A full page load: the desk is its own page.
export default function TouchForward({ to }) {
    useEffect(() => {
        window.location.replace(to)
    }, [to])
    return <RouteSurfaceFallback label="Opening the desk's Touch tab" detail="" />
}
