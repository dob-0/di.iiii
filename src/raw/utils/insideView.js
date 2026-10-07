import { CONTAINER_TYPE_IDS, getNodeType } from '../../project/nodeRegistry.js'
import { isTopType } from '../../project/tops/topOperators.js'

// What going inside a node opens (audit 2026-10-05 §3.6): its substance, at
// once, decided by kind. Never an empty canvas with a sentence explaining why
// it is empty — that was the dead end (B3).
//
//   graph    a container: its sub-graph
//   picture  a picture operator: the live picture and its source (TopInsidePanel)
//   list     a List: an editable table
//   text     a Text: a text editor
//   tool     any other panel-2d node: the tool itself, filling the canvas
//   spatial  a spatial node that is not a container: its children above, its code below
//   code     everything else: inputs · the runtime's lines (read-only) · outputs
export const insideViewKind = (typeId) => {
    if (!typeId) return 'graph'
    if (CONTAINER_TYPE_IDS.has(typeId)) return 'graph'
    if (isTopType(typeId)) return 'picture'
    if (typeId === 'view.list') return 'list'
    if (typeId === 'view.text') return 'text'
    const render = getNodeType(typeId)?.render
    if (render === 'panel-2d') return 'tool'
    if (render === 'spatial-3d') return 'spatial'
    return 'code'
}

// Whether the inside view still shows a canvas of child cards.
export const insideShowsGraph = (kind) => kind === 'graph' || kind === 'spatial'

// The settings column, top to bottom (§3.5), for one selected node. The main
// field is typed in the card, so it is never a section here; settings are
// left out when the type has none beyond it. Name, ports, Open and Delete are
// always there — which is why the column is never empty.
export const columnSections = ({ hasSettings = false, hasPorts = true, canOpen = true } = {}) => [
    'header',
    ...(hasSettings ? ['settings'] : []),
    ...(hasPorts ? ['ports'] : []),
    ...(canOpen ? ['open'] : []),
    'delete'
]
