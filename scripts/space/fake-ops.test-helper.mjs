// The edits a page tool sends (pages-lib.mjs documentEdits), applied to a plain document for the fake servers in
// these tests. Raw, without the platform's normalising, so a test can still compare the document it wrote.
export function applyEdits(doc, ops = []) {
  const next = { ...doc }
  let entities = Array.isArray(doc.entities) ? [...doc.entities] : []
  let assets = Array.isArray(doc.assets) ? [...doc.assets] : []
  for (const { type, payload = {} } of ops) {
    if (type === 'createEntity') entities = [...entities.filter((e) => e.id !== payload.entity.id), payload.entity]
    else if (type === 'deleteEntity') {
      const gone = new Set([payload.entityId])
      for (let grew = true; grew;) { grew = false; for (const e of entities) if (e.parentId && gone.has(e.parentId) && !gone.has(e.id)) { gone.add(e.id); grew = true } }
      entities = entities.filter((e) => !gone.has(e.id))
    } else if (type === 'upsertAsset') assets = [...assets.filter((a) => a.id !== payload.asset.id), payload.asset]
    else if (type === 'deleteAsset') assets = assets.filter((a) => a.id !== payload.assetId)
    else if (type === 'setPresentationState') next.presentationState = { ...doc.presentationState, ...next.presentationState, ...payload.patch }
    else if (type === 'setWorldState') next.worldState = { ...next.worldState, ...payload.patch }
    else throw new Error(`fake server: ${type} is not an edit`)
  }
  if (Array.isArray(doc.entities) || entities.length) next.entities = entities
  if (Array.isArray(doc.assets) || assets.length) next.assets = assets
  return next
}
