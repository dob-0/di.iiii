import { useCallback, useState } from 'react'

let _id = 0
const uid = () => `vp${++_id}`

export const makeView = (viewType = '3d') => ({ id: uid(), type: 'view', viewType })

function insertSplit(node, targetId, dir, viewType) {
    if (node.id === targetId) {
        return { id: uid(), type: 'split', dir, ratio: 0.5, a: node, b: makeView(viewType) }
    }
    if (node.type !== 'split') return node
    return { ...node, a: insertSplit(node.a, targetId, dir, viewType), b: insertSplit(node.b, targetId, dir, viewType) }
}

function removeNode(node, targetId) {
    if (node.type !== 'split') return node
    if (node.a.id === targetId) return node.b
    if (node.b.id === targetId) return node.a
    return { ...node, a: removeNode(node.a, targetId), b: removeNode(node.b, targetId) }
}

function patchRatio(node, splitId, ratio) {
    if (node.id === splitId) return { ...node, ratio }
    if (node.type !== 'split') return node
    return { ...node, a: patchRatio(node.a, splitId, ratio), b: patchRatio(node.b, splitId, ratio) }
}

export function useViewportLayout() {
    const [layout, setLayout] = useState(() => makeView('3d'))

    const split = useCallback((nodeId, dir, viewType = '3d') => {
        setLayout((prev) => insertSplit(prev, nodeId, dir, viewType))
    }, [])

    const close = useCallback((nodeId) => {
        setLayout((prev) => removeNode(prev, nodeId))
    }, [])

    const setRatio = useCallback((splitId, ratio) => {
        setLayout((prev) => patchRatio(prev, splitId, ratio))
    }, [])

    return { layout, split, close, setRatio }
}
