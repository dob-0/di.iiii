import { NODE_ANATOMY } from 'virtual:node-anatomy'
import { CONTAINER_TYPE_IDS, getNodeType, isNodeTypeImplemented } from '../../../project/nodeRegistry.js'
import { isTopType } from '../../../project/tops/topOperators.js'

// MADE OF: which tabs a node has, and the real text behind each.
//
// Which tabs exist is read off the small manifest the main bundle already
// carries; the TEXT is `virtual:node-source`, imported on the first open only,
// and whole component files are their own lazy chunks behind that. Nothing is
// pattern-matched in the browser: every line range was measured by the build
// that shipped these files.

const TAB_LABELS = {
    computes: 'computes',
    draws: 'draws',
    window: 'window',
    door: 'door',
    shader: 'shader',
    script: 'script'
}

const baseName = (file) => String(file || '').slice(String(file || '').lastIndexOf('/') + 1)

/** @returns {{ id: string, label: string, caption: string }[]} */
export function madeOfTabs(node) {
    const typeId = node?.typeId
    const type = getNodeType(typeId)
    if (!type || !isNodeTypeImplemented(typeId)) return []
    const entry = NODE_ANATOMY[typeId] || {}
    const tabs = []
    if (entry.computes) {
        const shared = (entry.computes.sharedWith || []).map((id) => getNodeType(id)?.label).filter(Boolean)
        tabs.push({
            id: 'computes',
            caption: [
                'Works out what it gives, every time the graph is read. Built in: read it here, not change it.',
                shared.length ? `The same lines answer for ${shared.length} other ${shared.length === 1 ? 'node' : 'nodes'} too.` : '',
                entry.alsoNeeds?.sentence || ''
            ].filter(Boolean).join(' ')
        })
    }
    if (entry.draws) {
        tabs.push({ id: 'draws', caption: 'Draws it in the room. Built in: read it here, not change it.' })
    }
    if (entry.panel || entry.feed) {
        const file = entry.panel?.component?.file || entry.feed?.file
        tabs.push({
            id: 'window',
            caption: entry.panel
                ? `Its own window — ${baseName(file)}. What it puts on its outputs arrives from here, while the window is open.`
                : `Runs beside the graph, unseen — ${baseName(file)}.`
        })
    }
    if (CONTAINER_TYPE_IDS.has(typeId)) {
        tabs.push({ id: 'door', caption: 'Every container answers its doors with these lines, before its own kind is asked.' })
    }
    if (isTopType(typeId)) {
        tabs.push({ id: 'shader', caption: 'GLSL, compiled on the machine it runs on. Yours to change.' })
    }
    tabs.push({ id: 'script', caption: '' })
    return tabs.map((tab) => ({ ...tab, label: TAB_LABELS[tab.id] }))
}

let sourceModule = null
export const loadNodeSourceModule = () => {
    if (!sourceModule) {
        sourceModule = import('virtual:node-source').catch((error) => {
            sourceModule = null
            throw error
        })
    }
    return sourceModule
}

/**
 * The code behind one tab, as places: `{ file, fromLine, text }`. Line numbers
 * are the file's own, so "line 212" here is line 212 in an editor.
 */
export async function readMadeOf(typeId, tabId) {
    const source = await loadNodeSourceModule()
    const entry = source.NODE_SOURCE?.[typeId]
    if (!entry && tabId !== 'door') return []
    const slice = (place) => (place ? { file: place.file, fromLine: place.fromLine, text: source.SOURCE_TEXTS[place.text] ?? '' } : null)
    const whole = async (file) => {
        const load = file ? source.FILE_LOADERS?.[file] : null
        if (!load) return null
        const loaded = await load()
        return { file, fromLine: 1, text: loaded?.default ?? '' }
    }
    switch (tabId) {
        case 'computes': return [slice(entry.computes)].filter(Boolean)
        case 'draws': return [slice(entry.draws)].filter(Boolean)
        case 'window': return (await Promise.all([whole(entry.component), slice(entry.branch), whole(entry.feed)])).filter(Boolean)
        case 'door': return [slice(source.DOORWAY_SOURCE)].filter(Boolean)
        default: return []
    }
}
