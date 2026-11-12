import { buildPerformPath } from '../perform/performRouting.js'
import { layerReached, surfaceDestinations } from '../components/SurfaceBar.jsx'
import { openLayersFromCounts } from './layers.js'

/**
 * The doors of ONE project, wherever projects are listed.
 *
 * Audit of 2026-11-12: the VJ deck took many steps to reach, and "Nodes" at
 * space level opened a projects list. Every list of projects (the space page,
 * the Studio hub, the Nodes list) offered its own few doors, so a project had
 * a different way in on each of them. This is the one function that says what
 * they are, so a project's doors are the same wherever it is listed.
 *
 * Perform is built here; Studio, Nodes, Projection and Light are taken from
 * the top bar's own list (surfaceDestinations) by key, so the words and the
 * addresses have one source. A door names no layout: Perform opens whatever
 * the show or the device already chose (src/perform/presets.js).
 *
 * Pure: no state, no fetch, no React.
 */

// Always, in this order. map and light follow only when the project's layers
// are known and reach them.
const TOOL_KEYS = ['studio', 'raw']
const LAYERED_KEYS = ['map', 'light']

export const projectDoors = ({
    space,
    project,
    projectLabel = null,
    mode = 'scene',
    layers = null,
    isLocalInstall = false,
    from = 'studio',
    allTools = false
} = {}) => {
    // A page that is read has no desk; a project with no space has no address.
    if (!space || !project || mode === 'code') return []

    const destinations = surfaceDestinations({ isLocalInstall, space, project, projectLabel, layers: null })
    const door = (key) => {
        const found = destinations.find(d => d.key === key)
        return found ? { key, label: found.label, href: found.href } : null
    }

    const keys = [...TOOL_KEYS]
    // "All tools" (the top bar's own switch, useAllTools) shows every tool
    // whatever the project holds, so the doors do too. Otherwise `layers` null
    // means "not known yet": offer no more than the sure ones.
    if (allTools) {
        keys.push(...LAYERED_KEYS)
    } else if (layers && typeof layers === 'object') {
        for (const key of LAYERED_KEYS) {
            if (layerReached(key, layers)) keys.push(key)
        }
    }

    return [
        { key: 'perform', label: 'Perform', href: buildPerformPath(space, project, { from }) },
        ...keys.map(door).filter(Boolean)
    ]
}

/**
 * The doors of a project as a LIST ROW says it (GET /api/spaces/:id/projects:
 * the project's meta plus `layers`, the counts of shared/layers.cjs; or a row
 * of GET /api/spaces/:id/contents, which carries `mode`). This is the one place
 * that reads a list row, so the space page and the Studio hub cannot disagree:
 *   - project = row.id, projectLabel = row.title
 *   - mode = row.mode, else 'code' when the counts say the project is a page
 *     (layers.page), else 'scene'
 *   - layers = what the top bar would receive for this project, worked out from
 *     the counts by the same rule (openLayersFromCounts); null when the row has
 *     no counts, which offers the sure doors only
 * [] for no row, or a row with no id.
 */
export const doorsForListRow = (row, { space, isLocalInstall = false, from = 'studio', allTools = false } = {}) => {
    if (!row || !row.id) return []
    const counts = row.layers && typeof row.layers === 'object' ? row.layers : null
    return projectDoors({
        space,
        project: row.id,
        projectLabel: row.title,
        mode: row.mode || (counts?.page ? 'code' : 'scene'),
        layers: counts ? openLayersFromCounts(counts) : null,
        isLocalInstall,
        from,
        allTools
    })
}
