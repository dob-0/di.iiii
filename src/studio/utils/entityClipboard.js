import { createEntityOfType } from '../../project/entityRegistry.js'

// Duplication and clipboard operate on whole hierarchies — a group is its
// children. Subtrees are collected parent-first so createEntity ops replay
// in an order where every parentId already exists.
export const collectSubtree = (entities, rootId) => {
    const byParent = new Map()
    for (const entity of entities) {
        if (!entity.parentId) continue
        if (!byParent.has(entity.parentId)) byParent.set(entity.parentId, [])
        byParent.get(entity.parentId).push(entity)
    }
    const byId = new Map(entities.map((e) => [e.id, e]))
    const result = []
    const walk = (id) => {
        const entity = byId.get(id)
        if (!entity) return
        result.push(entity)
        for (const child of byParent.get(id) || []) walk(child.id)
    }
    walk(rootId)
    return result
}

// Drop targets that sit inside another target's subtree, so selecting a
// group plus its children clones the group once.
export const topLevelTargets = (entities, targets) => {
    const ids = new Set(targets.map((t) => t.id))
    const byId = new Map(entities.map((e) => [e.id, e]))
    return targets.filter((t) => {
        let cursor = byId.get(t.parentId)
        while (cursor) {
            if (ids.has(cursor.id)) return false
            cursor = byId.get(cursor.parentId)
        }
        return true
    })
}

// World translation of an entity = its position plus every ancestor's, the
// same translation-only convention Group/Ungroup use (parent rotation/scale
// are not folded in anywhere in the editor).
const worldTranslation = (byId, entity) => {
    const pos = [...(entity.components?.transform?.position || [0, 0, 0])]
    let parent = byId.get(entity.parentId)
    while (parent) {
        const pp = parent.components?.transform?.position || [0, 0, 0]
        pos[0] += pp[0]
        pos[1] += pp[1]
        pos[2] += pp[2]
        parent = byId.get(parent.parentId)
    }
    return pos
}

// updateEntity patch that moves an entity under a new parent (or to root when
// newParentId is null) while keeping its world position. Returns null when the
// move is a no-op or illegal: unknown ids, non-group parent, or a cycle (the
// new parent sits inside the entity's own subtree).
export const buildReparentPatch = (entities, entityId, newParentId) => {
    const byId = new Map(entities.map((e) => [e.id, e]))
    const entity = byId.get(entityId)
    if (!entity || entityId === newParentId) return null
    if ((entity.parentId || null) === (newParentId || null)) return null
    const parent = newParentId ? byId.get(newParentId) : null
    if (newParentId && (!parent || parent.type !== 'group')) return null
    let cursor = parent
    while (cursor) {
        if (cursor.id === entityId) return null
        cursor = byId.get(cursor.parentId)
    }
    const world = worldTranslation(byId, entity)
    const base = parent ? worldTranslation(byId, parent) : [0, 0, 0]
    return {
        parentId: newParentId || null,
        components: {
            transform: {
                ...entity.components?.transform,
                position: [world[0] - base[0], world[1] - base[1], world[2] - base[2]]
            }
        }
    }
}

// Fresh ids for every clone, parentIds remapped onto the cloned parents; the
// root is nudged +0.4 x/z (children keep their parent-relative transforms).
export const cloneSubtree = (subtree) => {
    const idMap = new Map()
    return subtree.map((source, index) => {
        const isRoot = index === 0
        const sourcePosition = source.components?.transform?.position || [0, 0, 0]
        const clone = createEntityOfType(source.type, {
            name: isRoot ? `${source.name} copy` : source.name,
            parentId: isRoot ? null : (idMap.get(source.parentId) || null),
            components: {
                ...structuredClone(source.components),
                ...(isRoot ? {
                    transform: {
                        ...structuredClone(source.components?.transform),
                        position: [sourcePosition[0] + 0.4, sourcePosition[1], sourcePosition[2] + 0.4]
                    }
                } : {})
            }
        })
        idMap.set(source.id, clone.id)
        return clone
    })
}
