// The desk a first visit finds already set. /open/raw used to open on an
// empty grid with one hint line — honest zen, but a stranger's first sight of
// the platform was a blank page. This builds the starter constellation for a
// BRAND-NEW local workspace only (RawEditor seeds it as the document's origin,
// so undo unwinds to nothing rather than deleting it node by node, and the
// projectId guard upstream makes it structurally unable to touch any server
// space — see RawEditor.initialStoreState).
//
// The constellation is three ideas, not a museum:
//   - the World window, open: a live three.js room on the surface
//   - a Sky color node WIRED into it: the wire is real (evaluateNodeInput
//     drives the rendered background), so the first thing a visitor sees is
//     cause and effect, not decoration
//   - the Studio container: the room you can step into
// plus one text window that carries the onboarding the empty-state hint used
// to (both hints go silent once nodes exist).
import { createEdge, createNode } from '../../nodeRegistry.js'
import { buildNodeValues } from '../nodeGraphAuthoring.js'
import { buildStudioContainerWithInterior } from '../studioNode.js'

// Deep teal, deliberately not the World default '#0a0e16' — the Sky node must
// visibly be the one driving the room, or the wire reads as decoration.
export const STARTER_SKY_COLOR = '#062126'

export const STARTER_WELCOME_TEXT = [
    'a workspace, not a file.',
    'Sky is wired into World — change the color, the room follows.',
    'double-tap for the palette. enter Studio › for the room.'
].join('\n\n')

const clamp = (min, value, max) => Math.min(max, Math.max(min, value))

/**
 * Build the first-visit document for a blank local workspace.
 * Viewport dimensions decide the two visible window frames — the seed runs
 * client-side, so the caller passes the real ones.
 *
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildStarterWorkspaceDocument({
    workspaceTop = 168,
    viewportWidth = 1280,
    viewportHeight = 800
} = {}) {
    const narrow = viewportWidth < 640
    const pad = narrow ? 12 : 24

    // The seed opens in zen (no topbar), so windows sit high; if the visitor
    // summons the chrome they can drag them — the first impression wins.
    const windowTop = narrow ? 88 : 96

    const worldWidth = narrow
        ? viewportWidth - pad * 2
        : clamp(320, Math.round(viewportWidth * 0.42), 560)
    const worldHeight = narrow
        ? clamp(200, Math.round(viewportHeight * 0.3), 280)
        : Math.round(worldWidth * 0.7)
    const worldFrame = {
        x: narrow ? pad : viewportWidth - worldWidth - pad,
        y: windowTop,
        width: worldWidth,
        height: worldHeight
    }

    const textWidth = narrow ? viewportWidth - pad * 2 : clamp(280, Math.round(viewportWidth * 0.26), 340)
    const textHeight = narrow ? 390 : 380
    const textFrame = {
        x: pad,
        y: narrow
            ? worldFrame.y + worldHeight + 12
            : Math.max(windowTop, viewportHeight - textHeight - 72),
        width: textWidth,
        height: textHeight
    }

    // The graph surface auto-fits and CENTRES the card cluster in the visible
    // area, so the cards' absolute coordinates matter less than their spread:
    // a wide grid gets centred back under the floating windows. One narrow
    // column (200px cards) stays in the corridor between the welcome window
    // (lower-left) and the World window (right) on a desktop, and simply sits
    // beneath both windows on a phone.
    const cardTop = narrow ? textFrame.y + textHeight + 40 : workspaceTop
    const positions = {
        sky: [0, cardTop],
        world: [0, cardTop + 140],
        studio: [0, cardTop + 280],
        text: [0, cardTop + 420]
    }

    const skyNode = createNode('value.color', {
        label: 'Sky',
        graphX: positions.sky[0],
        graphY: positions.sky[1],
        values: { value: STARTER_SKY_COLOR }
    })

    const worldValues = buildNodeValues(
        'universe.world',
        { title: 'World' },
        { clientX: worldFrame.x, clientY: worldFrame.y },
        { workspaceTop }
    )
    worldValues.frame = { ...worldValues.frame, ...worldFrame, visible: true }
    const worldNode = createNode('universe.world', {
        label: 'World',
        graphX: positions.world[0],
        graphY: positions.world[1],
        values: worldValues
    })

    const textValues = buildNodeValues(
        'view.text',
        { content: STARTER_WELCOME_TEXT },
        { clientX: textFrame.x, clientY: textFrame.y },
        { workspaceTop }
    )
    textValues.frame = { ...textValues.frame, ...textFrame, visible: true, title: 'welcome' }
    const textNode = createNode('view.text', {
        label: 'welcome',
        graphX: positions.text[0],
        graphY: positions.text[1],
        values: textValues
    })

    const studio = buildStudioContainerWithInterior({
        graphX: positions.studio[0],
        graphY: positions.studio[1],
        workspaceTop
    })

    const nodes = [skyNode, worldNode, textNode, studio.container, ...studio.interior].filter(Boolean)
    const edges = (skyNode && worldNode)
        ? [createEdge(skyNode.id, 'out', worldNode.id, 'bgColor')].filter(Boolean)
        : []

    return { nodes, edges }
}
