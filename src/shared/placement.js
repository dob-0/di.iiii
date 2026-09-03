// Placement — build zones for a room.
//
// A room with placement ON is not free space. Its wall is a numbered run of
// SLOTS, and anything hangable that arrives is put in one: dropped at the
// origin by a phone, dragged into the void by a visitor, imported by a script —
// it lands on the hanging line either way. The room cannot go back to cones and
// "New Text" floating at the origin, which is what happened to the Open Jam
// room after one night of thirty people editing it.
//
// The slots are not a stored list. They are a FORMULA (`layout`), so slot 200
// exists as surely as slot 1 and the wall simply grows outward as photos
// arrive — nobody has to top up a pool. Occupancy is read back from where the
// entities actually stand, so the room is self-healing: delete a photo and its
// slot is free again, with no bookkeeping to drift out of date.
//
// The server applies this to every incoming op batch (see projectRoutes), which
// is what makes it a rule rather than a suggestion. The editor may use the same
// functions to snap while dragging; both sides then agree by construction.
//
// TWIN FILE: shared/placement.cjs is the server's copy of this module and the
// two are kept identical by hand, the way the project schema's twins are —
// src/shared/placement.test.js fails if they ever disagree.

const PI_2 = Math.PI / 2

// An image plane is built 3 units tall and 3*aspect wide (ImageObject), then
// multiplied by the transform scale — so height alone fixes the scale, and only
// the width of a banner ever needs capping.
const PLANE_HEIGHT = 3

const defaultLayout = {
  kind: 'walls',
  rows: [1.15, 3.35],   // y of each hanging row, bottom row first
  gap: 3.7,             // horizontal step between slots
  slotHeight: 2.0,      // the rendered height every hung thing is scaled to
  maxWidth: 3.4,        // a wider picture is scaled down to fit this
  back: { z: -7.5 },    // the wall you face on arrival
  wings: { x: 6.2, z: -2.0 },  // the two side walls, left and right
}

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

const normalizeLayout = (source = {}) => {
  const raw = source && typeof source === 'object' ? source : {}
  const rows = Array.isArray(raw.rows) && raw.rows.length
    ? raw.rows.map((y) => num(y, 1.5))
    : [...defaultLayout.rows]
  return {
    kind: 'walls',
    rows,
    gap: Math.max(0.2, num(raw.gap, defaultLayout.gap)),
    slotHeight: Math.max(0.2, num(raw.slotHeight, defaultLayout.slotHeight)),
    maxWidth: Math.max(0.2, num(raw.maxWidth, defaultLayout.maxWidth)),
    back: { z: num(raw.back?.z, defaultLayout.back.z) },
    wings: { x: Math.abs(num(raw.wings?.x, defaultLayout.wings.x)), z: num(raw.wings?.z, defaultLayout.wings.z) },
  }
}

// Placement is OFF unless a room turns it on, and turning it off leaves every
// photo exactly where it hangs — this is a switch, never a migration.
const normalizePlacement = (source) => {
  if (!source || typeof source !== 'object') return null
  const types = Array.isArray(source.types) && source.types.length
    ? source.types.map(String)
    : ['image', 'video']
  return {
    enabled: source.enabled !== false,
    types,
    layout: normalizeLayout(source.layout),
  }
}

// Slots are dealt round-robin across the three walls and outward from the
// centre of each, so a room with four photos in it looks composed rather than
// like a queue that started at the left edge.
const offsetForColumn = (column, gap) => {
  const step = Math.ceil(column / 2)
  // + 0 turns the centre column's -0 back into 0: a negative zero survives
  // JSON, and a document that stores -0 where every other tier stores 0 reads
  // as a difference in every diff for the rest of its life.
  return (column % 2 === 0 ? -step : step) * gap + 0
}

const slotAt = (layout, index) => {
  const l = normalizeLayout(layout)
  const i = Math.max(0, Math.floor(index))
  const panel = i % 3                       // 0 back, 1 left wing, 2 right wing
  const withinPanel = Math.floor(i / 3)
  const row = withinPanel % l.rows.length
  const column = Math.floor(withinPanel / l.rows.length)
  const offset = offsetForColumn(column, l.gap)
  const y = l.rows[row]
  if (panel === 0) return { index: i, position: [offset, y, l.back.z], rotation: [PI_2, 0, 0] }
  if (panel === 1) return { index: i, position: [-l.wings.x, y, l.wings.z + offset], rotation: [PI_2, 0, -PI_2] }
  return { index: i, position: [l.wings.x, y, l.wings.z + offset], rotation: [PI_2, 0, PI_2] }
}

const distance2 = (a, b) => {
  const dx = num(a?.[0], 0) - b[0]
  const dy = num(a?.[1], 0) - b[1]
  const dz = num(a?.[2], 0) - b[2]
  return dx * dx + dy * dy + dz * dz
}

const entityList = (document) => {
  const entities = document?.entities
  if (Array.isArray(entities)) return entities
  if (entities && typeof entities === 'object') return Object.values(entities)
  return []
}

// A photo the author pinned by hand — the QR on its lectern, a sign — keeps its
// place and never takes a slot. Without this the room would swallow its own
// furniture the moment placement came on.
const isPinned = (entity) => entity?.components?.placement?.pinned === true

const isHangable = (entity, types) => !!entity && types.includes(entity.type) && !isPinned(entity)

// Which slot is this entity standing in? Near enough counts: a hand-nudged
// photo still belongs to its slot rather than freeing it for someone else.
const slotIndexOf = (layout, position, limit) => {
  for (let i = 0; i < limit; i += 1) {
    if (distance2(position, slotAt(layout, i).position) < 0.36) return i
  }
  return -1
}

const scaleFor = (layout, asset) => {
  const l = normalizeLayout(layout)
  const base = l.slotHeight / PLANE_HEIGHT
  const width = num(asset?.width, 0)
  const height = num(asset?.height, 0)
  // Width capping needs the picture's proportions, which only assets uploaded
  // since the server started recording them carry. Without them a banner hangs
  // at full width rather than being guessed at.
  if (width > 0 && height > 0) {
    const aspect = width / height
    return Math.min(base, l.maxWidth / (PLANE_HEIGHT * aspect))
  }
  return base
}

const assetIndex = (document) => {
  const assets = document?.assets
  const list = Array.isArray(assets) ? assets : (assets && typeof assets === 'object' ? Object.values(assets) : [])
  const map = new Map()
  for (const asset of list) if (asset?.id) map.set(asset.id, asset)
  return map
}

const transformOp = (entityId, slot, scale) => ({
  type: 'updateComponent',
  payload: {
    entityId,
    component: 'transform',
    patch: { position: [...slot.position], rotation: [...slot.rotation], scale: [scale, scale, scale] },
  },
})

/**
 * Rewrite an op batch so that everything hangable lands in a slot.
 *
 * Returns the ops to apply. A create keeps its own op (ids, names and media
 * must survive verbatim) and gains a transform op right behind it; a move is
 * rewritten in place. Anything else passes through untouched, and a room with
 * placement off gets its batch back unchanged.
 */
const placeOps = (document, ops) => {
  const placement = normalizePlacement(document?.worldState?.placement)
  if (!placement?.enabled || !Array.isArray(ops) || !ops.length) return ops || []
  const { layout, types } = placement
  const assets = assetIndex(document)

  // Occupancy, read back from where things actually stand.
  const entities = new Map()
  const taken = new Map()   // slot index -> entity id
  const horizon = () => entityList(document).length + ops.length + 8
  for (const entity of entityList(document)) {
    entities.set(entity.id, entity)
    if (!isHangable(entity, types)) continue
    const at = slotIndexOf(layout, entity.components?.transform?.position, horizon())
    if (at >= 0 && !taken.has(at)) taken.set(at, entity.id)
  }
  const freeSlot = (preferred = -1) => {
    if (preferred >= 0 && !taken.has(preferred)) return preferred
    for (let i = 0; i < horizon() + 64; i += 1) if (!taken.has(i)) return i
    return 0
  }
  const claim = (index, entityId) => {
    for (const [slot, owner] of taken) if (owner === entityId) taken.delete(slot)
    taken.set(index, entityId)
  }
  const assetOf = (entity) => assets.get(entity?.components?.media?.assetId) || null

  const out = []
  for (const op of ops) {
    const payload = op?.payload || {}
    if (op?.type === 'createEntity' && isHangable(payload.entity, types)) {
      const entity = payload.entity
      entities.set(entity.id, entity)
      const slot = slotAt(layout, freeSlot())
      claim(slot.index, entity.id)
      out.push(op)
      out.push(transformOp(entity.id, slot, scaleFor(layout, assetOf(entity))))
      continue
    }
    if (op?.type === 'updateComponent' && payload.component === 'transform') {
      const entity = entities.get(payload.entityId)
      if (isHangable(entity, types)) {
        const wanted = payload.patch?.position || entity.components?.transform?.position
        // Nearest free slot to where they dropped it: the drag still chooses
        // WHERE on the wall, it just cannot choose "nowhere".
        let best = -1
        let bestDistance = Infinity
        for (let i = 0; i < horizon() + 64; i += 1) {
          const owner = taken.get(i)
          if (owner && owner !== entity.id) continue
          const d = distance2(wanted, slotAt(layout, i).position)
          if (d < bestDistance) { bestDistance = d; best = i }
          if (bestDistance === 0) break
        }
        const slot = slotAt(layout, freeSlot(best))
        claim(slot.index, entity.id)
        out.push(transformOp(entity.id, slot, scaleFor(layout, assetOf(entity))))
        continue
      }
    }
    if (op?.type === 'deleteEntity' && payload.entityId) {
      for (const [slot, owner] of taken) if (owner === payload.entityId) taken.delete(slot)
    }
    out.push(op)
  }
  return out
}

export {
    PLANE_HEIGHT,
    defaultLayout,
    normalizePlacement,
    normalizeLayout,
    slotAt,
    slotIndexOf,
    scaleFor,
    placeOps,
}
