import { navigateInApp } from '../components/SurfaceBar.jsx'
import { buildMapPath } from '../map/mapRouting.js'
import { buildRawProjectPath } from '../raw/utils/rawRouting.js'
import { buildStudioProjectPath } from '../studio/utils/studioRouting.js'
import { buildPerformPath } from './performRouting.js'

// Desk | Perform — the second way into the Perform line (the owner, 2026-09-24:
// both ways in). It sits in the bar's one surface-specific slot on
// Projection, Studio and Nodes, and on Perform itself. Same project, same
// place; only the windows change. Written with the bar's own classes, so it
// adds no chrome of its own: two of the bar's words with its separator.

export const deskPathFor = (from, space, project) => {
    if (from === 'map') return buildMapPath(space, project)
    if (from === 'studio') return buildStudioProjectPath(project, space)
    return buildRawProjectPath(project, space)
}

/**
 *   current  'desk' on Projection / Studio / Nodes, 'perform' on Perform
 *   from     on a desk: which desk this is ('map' | 'studio' | 'raw');
 *            on Perform: the desk the person came from
 */
export default function DeskPerformSwitch({ current = 'desk', space, project, from = 'raw' }) {
    if (!space || !project) return null
    const deskHref = deskPathFor(from, space, project)
    const performHref = buildPerformPath(space, project, { from })
    const onDesk = current !== 'perform'
    return (
        <span className="sbar-switch" role="group" aria-label="Desk or Perform">
            <a
                className={`sbar-link${onDesk ? ' is-here' : ''}`}
                href={deskHref}
                aria-current={onDesk ? 'page' : undefined}
                onClick={onDesk ? (event) => event.preventDefault() : (event) => navigateInApp(event, deskHref)}
            >Desk</a>
            <span className="sbar-sep" aria-hidden="true"> | </span>
            <a
                className={`sbar-link${onDesk ? '' : ' is-here'}`}
                href={performHref}
                aria-current={onDesk ? undefined : 'page'}
                onClick={onDesk ? (event) => navigateInApp(event, performHref) : (event) => event.preventDefault()}
            >Perform</a>
        </span>
    )
}
