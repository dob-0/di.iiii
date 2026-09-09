const { getDb } = require('./db')

/**
 * Collections — the shelf inside a space.
 *
 * Owner, 2026-09-10, after an audit counted 74 of 200 projects flat inside one
 * space: "we need right packing and organaizing so the projects not mess".
 * There was no container between "a space" and "a project", so a group of
 * related works had to become either a whole new space (a place, with a public
 * address and its own access) or a pile of siblings. This is the middle.
 *
 * A collection is deliberately thin: an id, a name, an order, and the space it
 * belongs to. It holds projects by reference (projects.collection_id), so
 * moving a work between shelves never touches the work.
 */

// Same shape as a project id: a slug, unique across the estate, so an id in a
// url is unambiguous without carrying its space with it.
const normalizeCollectionId = (value) => {
    const raw = String(value ?? '').trim().toLowerCase()
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
    return slug || null
}

const collectionIdFromLabel = (spaceId, label) => {
    const base = normalizeCollectionId(label) || 'shelf'
    return normalizeCollectionId(`${spaceId}-${base}`)
}

const rowToCollection = (row) => !row ? null : ({
    id: row.id,
    spaceId: row.space_id,
    label: row.label,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
})

let cache = null
const s = () => {
    const db = getDb()
    if (cache?.db === db) return cache
    cache = {
        db,
        selectById: db.prepare('SELECT * FROM collections WHERE id = ?'),
        selectBySpace: db.prepare('SELECT * FROM collections WHERE space_id = ? ORDER BY position ASC, created_at ASC'),
        maxPosition: db.prepare('SELECT MAX(position) AS top FROM collections WHERE space_id = ?'),
        insert: db.prepare('INSERT INTO collections (id, space_id, label, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
        rename: db.prepare('UPDATE collections SET label = ?, updated_at = ? WHERE id = ?'),
        reorder: db.prepare('UPDATE collections SET position = ?, updated_at = ? WHERE id = ?'),
        remove: db.prepare('DELETE FROM collections WHERE id = ?'),
        // Emptying a shelf leaves its works in the space, loose. Deleting a
        // shelf must never delete work — that is the whole point of a container
        // that is not a place.
        loosenProjects: db.prepare('UPDATE projects SET collection_id = NULL, updated_at = ? WHERE collection_id = ?'),
        countProjects: db.prepare('SELECT COUNT(*) AS cnt FROM projects WHERE collection_id = ? AND deleted_at IS NULL'),
    }
    return cache
}

const listCollections = (spaceId) => s().selectBySpace.all(spaceId).map(rowToCollection)

const getCollection = (id) => rowToCollection(s().selectById.get(id))

const createCollection = (spaceId, label) => {
    const clean = String(label ?? '').trim()
    if (!clean) throw Object.assign(new Error('A shelf needs a name.'), { status: 400 })
    let id = collectionIdFromLabel(spaceId, clean)
    // Two shelves may legitimately be called the same thing in two spaces, and
    // a person may name two shelves the same thing in one. The id gets a
    // number; the name they typed is left exactly as they typed it.
    let attempt = 1
    while (s().selectById.get(id)) {
        attempt += 1
        id = normalizeCollectionId(`${collectionIdFromLabel(spaceId, clean)}-${attempt}`)
    }
    const now = Date.now()
    const position = (s().maxPosition.get(spaceId)?.top ?? -1) + 1
    s().insert.run(id, spaceId, clean, position, now, now)
    return getCollection(id)
}

const renameCollection = (id, label) => {
    const clean = String(label ?? '').trim()
    if (!clean) throw Object.assign(new Error('A shelf needs a name.'), { status: 400 })
    s().rename.run(clean, Date.now(), id)
    return getCollection(id)
}

// The order is given whole, not as a swap: a drag is one intent, and applying it
// as a series of pairwise moves is how two people reordering at once produce an
// order neither of them asked for.
const reorderCollections = (spaceId, ids = []) => {
    const known = new Set(listCollections(spaceId).map(c => c.id))
    const now = Date.now()
    ids.filter(id => known.has(id)).forEach((id, index) => s().reorder.run(index, now, id))
    return listCollections(spaceId)
}

const deleteCollection = (id) => {
    const existing = getCollection(id)
    if (!existing) return null
    s().loosenProjects.run(Date.now(), id)
    s().remove.run(id)
    return existing
}

const countProjectsIn = (id) => s().countProjects.get(id)?.cnt ?? 0

module.exports = {
    normalizeCollectionId,
    collectionIdFromLabel,
    listCollections,
    getCollection,
    createCollection,
    renameCollection,
    reorderCollections,
    deleteCollection,
    countProjectsIn,
}
