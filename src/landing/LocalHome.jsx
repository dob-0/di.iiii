/* global __APP_VERSION__ */
import { useEffect, useState } from 'react'
import './localHome.css'
import SpaceHub from '../studio/components/SpaceHub.jsx'
import StudioThemeProvider from '../studio/StudioThemeProvider.jsx'
import { listServerSpaces } from '../services/serverSpaces.js'

/**
 * What `di up` opens on your own machine.
 *
 * It used to open the landing page — a tour of a hosted product, to somebody
 * who had just finished installing it, with their own spaces two clicks away
 * behind "Already have spaces?". The first question on a local install is not
 * "what is di.iiii", it is "what have I got and where do I go", and that is
 * the surface that already answers it.
 *
 * The tour is not deleted, only moved: /?tour=1 still shows it.
 *
 * No lane is declared primary here. Studio and Raw are both doors on the same
 * bar, deliberately — MANIFESTO non-negotiable 6 says not to force that choice
 * before the unification that resolves it has landed.
 */
export default function LocalHome() {
    const [count, setCount] = useState(null)

    useEffect(() => {
        let alive = true
        listServerSpaces()
            .then((spaces) => { if (alive) setCount(Array.isArray(spaces) ? spaces.length : null) })
            .catch(() => { /* SpaceHub below says it louder and with a retry */ })
        return () => { alive = false }
    }, [])

    return (
        <StudioThemeProvider>
            <div className="lh-bar">
                <span><strong>di.iiii</strong> v{__APP_VERSION__}</span>
                <span className="lh-sep">·</span>
                <span className="lh-here">on this machine</span>
                <span className="lh-sep">·</span>
                <span>{window.location.host}</span>
                {count !== null && (
                    <>
                        <span className="lh-sep">·</span>
                        <span>{count} {count === 1 ? 'space' : 'spaces'}</span>
                    </>
                )}
                <span className="lh-doors">
                    <a href="/studio">Studio</a>
                    <a href="/raw">Raw</a>
                    <a href="/wiki">Wiki</a>
                    <a href="/?tour=1">What is di.iiii?</a>
                </span>
            </div>
            <SpaceHub />
        </StudioThemeProvider>
    )
}
