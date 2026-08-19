// Edge validation for incoming op batches. Pure module — no I/O — so the
// contract is unit-testable and shared by every route that accepts ops.

// Create/upsert ops whose payload carries no id are non-deterministic. The
// server mints one via normalizeEntity/normalizeProjectNode/normalizeAsset when
// it applies the op, persists THAT id, then broadcasts the ORIGINAL id-less op
// — so every connected client re-applies it through the same shared code and
// mints a DIFFERENT id. The peers silently hold divergent documents (the same
// entity under different ids) until a full reload, and the sender's optimistic
// id never matches the server's. invertSingleOp already refuses to invert
// id-less creates, acknowledging the hazard; apply still accepts them.
//
// First-party clients always supply ids, so this closes a contract hole rather
// than changing any shipped behavior.
const ID_BEARING_CREATE_OPS = {
  createEntity: 'entity',
  createNode: 'node',
  createEdge: 'edge',
  upsertAsset: 'asset'
}

const hasUsableId = (value) => typeof value === 'string' && value.trim() !== ''

// Returns the first offending op, or null when the batch is fine.
const findIdlessCreateOp = (ops = []) => (Array.isArray(ops) ? ops : []).find((op) => {
  const payloadKey = ID_BEARING_CREATE_OPS[op?.type]
  if (!payloadKey) return false
  return !hasUsableId(op?.payload?.[payloadKey]?.id)
}) || null

module.exports = { ID_BEARING_CREATE_OPS, findIdlessCreateOp }
