import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { workForSegment } from './segments.js'
import { buildAppSpacePath, getAppLocationState } from '../utils/spaceRouting.js'
import { buildStudioHubPath } from '../studio/utils/studioRouting.js'
import { isPreviewRequest, signalPreviewStub } from '../utils/previewMode.js'

/**
 * What a work's route renders under DI_LOCAL_SLIM=1.
 *
 * The slim profile (vite.config.js) resolves every entry in the works registry
 * to THIS file, so the piece is not in the artifact at all. Nothing imports it
 * by name: it is reached only through that resolve, and neither the hosted
 * build nor a plain `DI_PROFILE=local` one bundles it.
 *
 * It used to be what every local install showed, which is how the owner ended
 * up unable to open his own WCC exhibition on his own machine. A local install
 * carries the works now; this is for someone who asked for the small download
 * on purpose, and who therefore knows what is missing.
 *
 * It used to be one sentence with no way out. On the festival machine the
 * front room's WCC and algovrithm doors landed here, and the only way back was
 * the browser's own button. So: which piece this is, where it lives, and two
 * doors — the spaces, and this space's own page in Studio, which IS on the
 * machine even though the piece is not.
 *
 * The space card's thumbnail loads this route with ?preview=1 too. The paint
 * watcher waits for a canvas or a frame, and there is neither here, so the
 * stub reports itself instead (dii:preview-stub) and the card draws its own
 * line rather than a 1024px page of text scaled down to nothing.
 */

const HOSTED_HOST = 'https://di-studio.xyz'

const styles = {
    page: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: '2rem', boxSizing: 'border-box',
        font: '400 0.95rem/1.6 system-ui, sans-serif',
        color: 'rgba(255,255,255,0.72)', background: '#0a0a0a'
    },
    body: { maxWidth: '30rem', margin: 0, textAlign: 'center' },
    name: { margin: '0 0 0.75rem', font: '500 1.1rem/1.4 system-ui, sans-serif', color: '#fff' },
    line: { margin: 0 },
    doors: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1.5rem', margin: '1.5rem 0 0', padding: 0, listStyle: 'none' },
    door: { color: '#4df9ff', textDecoration: 'none', borderBottom: '1px solid rgba(77,249,255,0.35)' }
}

export default function HostedPieceStub() {
    const location = useLocation()
    const { spaceId } = getAppLocationState(location)
    const work = workForSegment(spaceId)
    const id = work?.id || spaceId || ''
    const label = work?.label || id || 'This piece'
    const preview = isPreviewRequest(location.search)

    useEffect(() => {
        if (preview) signalPreviewStub(id)
    }, [preview, id])

    // target="_top": the one place this renders inside a frame is a space
    // card made live, and a way back that only moved the thumbnail would be
    // no way back at all.
    return (
        <main style={styles.page} data-hosted-piece-stub={id}>
            <div style={styles.body}>
                <h1 style={styles.name}>{label}</h1>
                <p style={styles.line}>
                    This piece is part of di-studio.xyz, not of di.iiii itself, so it was left out of this copy.
                    Everything else is here.
                    {id ? <> It lives at <a style={styles.door} href={`${HOSTED_HOST}${work?.path || buildAppSpacePath(id)}`} target="_blank" rel="noreferrer">di-studio.xyz{work?.path || buildAppSpacePath(id)}</a>.</> : null}
                </p>
                <ul style={styles.doors}>
                    <li><a style={styles.door} href={buildAppSpacePath('')} target="_top">← the spaces</a></li>
                    {id ? <li><a style={styles.door} href={buildStudioHubPath(id)} target="_top">the {id} space in Studio</a></li> : null}
                </ul>
            </div>
        </main>
    )
}
