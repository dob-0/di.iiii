import { evaluateNodeInputs } from './nodeGraphRuntime.js'

export function getBetaWorldBackgroundColor(document, graphContext = null) {
    const backgroundNode = (document?.nodes || []).find((node) => node?.typeId === 'world.background')
    const resolvedValues = backgroundNode ? evaluateNodeInputs(backgroundNode, graphContext) : null
    const nodeColor = resolvedValues?.color ?? backgroundNode?.values?.color
    if (typeof nodeColor === 'string' && nodeColor.trim()) return nodeColor
    return document?.worldState?.backgroundColor || '#0a0e16'
}
