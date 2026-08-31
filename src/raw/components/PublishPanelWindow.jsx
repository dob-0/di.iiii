import { useCallback, useEffect, useState } from 'react'
import { getServerSpace } from '../../services/serverSpaces.js'
import { buildAppSpacePath, buildPublicProjectPath } from '../../utils/spaceRouting.js'

// The body of the `view.publish` panel node — what a visitor to the public
// page gets. Deliberately NOT Studio's PublishPanel imported across the lane
// boundary: that one is MUI (Stack/Card/Switch/Select) and Raw loads neither
// MUI's nor the control cluster's styles, so it would render as a column of
// unstyled text here. Same ruling as CreatePanelWindow.
//
// Everything on this panel is a DOCUMENT op, so it works for any session that
// can edit the project — including a guest holding a redeemed invite, which is
// what a workshop participant is. The space-level switches (make public, set
// live project) are owner-or-admin and 403 for exactly that person, so they
// are NOT rendered as disabled buttons here: a control that always fails reads
// as a permission bug. The space's state is reported as a sentence instead.
//
// `shareEnabled` is deliberately absent. Nothing on the published page reads
// it — grep it: the only readers are Studio's own switch and its own disabled
// state. Putting it here would be a switch wired to itself.

const ENTRY_VIEWS = [
    { id: 'scene', label: '3D room', hint: 'visitors land in the room and can walk' },
    { id: 'code', label: 'Code view', hint: 'visitors get the page this project builds' }
]

const XR_MODES = [
    { id: 'none', label: 'Off' },
    { id: 'ar', label: 'AR' },
    { id: 'vr', label: 'VR' }
]

export default function PublishPanelWindow({
    projectId = null,
    spaceId = null,
    presentationState = {},
    publishState = {},
    onPresentationPatch,
    onPublishPatch
}) {
    const [space, setSpace] = useState(null)
    const [spaceError, setSpaceError] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!spaceId) return undefined
        let cancelled = false
        getServerSpace(spaceId)
            .then((meta) => { if (!cancelled) { setSpace(meta); setSpaceError(false) } })
            .catch(() => { if (!cancelled) setSpaceError(true) })
        return () => { cancelled = true }
    }, [spaceId])

    const entryView = presentationState.entryView || 'scene'
    const xrDefaultMode = publishState.xrDefaultMode || 'none'
    const deviceAccess = Boolean(presentationState.deviceAccess)

    const isLive = Boolean(space && space.publishedProjectId && projectId && space.publishedProjectId === projectId)
    // The space address only shows THIS project when it is the live one;
    // otherwise the honest link is the per-project one, which resolves for any
    // project of a public space.
    const path = isLive ? buildAppSpacePath(spaceId) : buildPublicProjectPath(spaceId, projectId)
    const publicUrl = typeof window === 'undefined' ? path : `${window.location.origin}${path}`

    const handleCopy = useCallback(() => {
        const done = (ok) => { setCopied(ok ? 'copied' : 'failed'); setTimeout(() => setCopied(false), 1800) }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(publicUrl).then(() => done(true), () => done(false))
        } else {
            done(false)
        }
    }, [publicUrl])

    let status = 'Checking the space…'
    if (spaceError) status = 'Could not read this space right now.'
    else if (space) {
        if (!space.isPublic) status = `${buildAppSpacePath(spaceId)} is private — a visitor meets a sign-in wall, not this page.`
        else if (isLive) status = `Live. A visitor at ${buildAppSpacePath(spaceId)} sees this project.`
        else if (space.publishedProjectId) status = `${buildAppSpacePath(spaceId)} shows a different project. This one is reachable at its own address below.`
        else status = `The space is public but has no live project set. This one is reachable at its own address below.`
    }

    return (
        <div className="raw-publish-panel raw-window-stack">
            <section className="raw-publish-section">
                <h4 className="raw-publish-heading">What a visitor gets</h4>
                <div className="raw-publish-choices">
                    {ENTRY_VIEWS.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            className={`raw-publish-choice${entryView === view.id ? ' is-on' : ''}`}
                            aria-pressed={entryView === view.id}
                            onClick={() => onPresentationPatch?.({ entryView: view.id })}
                        >
                            {view.label}
                        </button>
                    ))}
                </div>
                <p className="raw-publish-hint">{ENTRY_VIEWS.find((v) => v.id === entryView)?.hint}</p>
            </section>

            <section className="raw-publish-section">
                <h4 className="raw-publish-heading">Headset entry</h4>
                <div className="raw-publish-choices">
                    {XR_MODES.map((mode) => (
                        <button
                            key={mode.id}
                            type="button"
                            className={`raw-publish-choice${xrDefaultMode === mode.id ? ' is-on' : ''}`}
                            aria-pressed={xrDefaultMode === mode.id}
                            onClick={() => onPublishPatch?.({ xrDefaultMode: mode.id })}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="raw-publish-section">
                <h4 className="raw-publish-heading">Camera and microphone</h4>
                <label className="raw-publish-toggle">
                    <input
                        type="checkbox"
                        checked={deviceAccess}
                        onChange={(event) => onPresentationPatch?.({ deviceAccess: event.target.checked })}
                    />
                    <span>Let the page use them</span>
                </label>
                <p className="raw-publish-hint">
                    The page stops being sandboxed from this site. Only turn it on for a page that needs a live camera.
                </p>
            </section>

            <section className="raw-publish-section">
                <h4 className="raw-publish-heading">The address</h4>
                <p className="raw-publish-url">{path}</p>
                <button type="button" className="raw-publish-copy" onClick={handleCopy}>
                    {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy link'}
                </button>
                <p className={`raw-publish-status${space && !space.isPublic ? ' is-warn' : ''}`}>{status}</p>
            </section>
        </div>
    )
}
