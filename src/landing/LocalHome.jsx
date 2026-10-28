/* global __APP_VERSION__ */
import { useEffect, useState } from 'react'
import './localHome.css'
import SpaceHub from '../studio/components/SpaceHub.jsx'
import JoinMachine from '../sync/JoinMachine.jsx'
import StudioThemeProvider from '../studio/StudioThemeProvider.jsx'
import { listServerSpaces } from '../services/serverSpaces.js'
import WifiPanel from './WifiPanel.jsx'

// `#join` opens the Wifi panel straight away, so the address can
// be handed to a screen (di-show http://diiii.localhost/#join) or a wiki link.
const JOIN_HASH = '#join'

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
 * No lane is declared primary here. Studio and Nodes are both doors on the same
 * bar, deliberately — MANIFESTO non-negotiable 6 says not to force that choice
 * before the unification that resolves it has landed.
 */
export default function LocalHome() {
    const [count, setCount] = useState(null)
    const [joining, setJoining] = useState(false)
    const [joinOpen, setJoinOpen] = useState(() => typeof window !== 'undefined' && window.location.hash === JOIN_HASH)

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
                    <button
                        type="button"
                        className="lh-door-button"
                        aria-expanded={joinOpen}
                        aria-controls="lh-guest"
                        onClick={() => setJoinOpen((open) => !open)}
                    >
                        Wifi
                    </button>
                    <a href="/tools">Tools</a>
                    <a href="/studio">Studio</a>
                    <a href="/raw">Nodes</a>
                    <a href="/wiki">Wiki</a>
                    {/* The other half of "Invite a machine": four words from another di.iiii. */}
                    <button type="button" className="lh-join" aria-expanded={joining} onClick={() => setJoining((open) => !open)}>Join</button>
                    <a href="/?tour=1">What is di.iiii?</a>
                </span>
            </div>
            {joining && (
                <div className="sjoin-wrap">
                    <JoinMachine onClose={() => setJoining(false)} />
                </div>
            )}
            {joinOpen && (
                <div id="lh-guest">
                    <WifiPanel onClose={() => setJoinOpen(false)} />
                </div>
            )}
            <SpaceHub />
        </StudioThemeProvider>
    )
}
