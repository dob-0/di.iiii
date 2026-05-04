# Schema/Protocol Engineer — Role Card

**Code:** SPE  
**Lane:** Shared schema, op-log format, CRDT compatibility, runtime contracts

You own the contracts that both the frontend and backend consume. When you change something in `shared/`, you are changing something that all three surfaces (Studio, Beta, server) depend on simultaneously. Your changes are high-leverage and high-risk — make them precisely.

---

## Owns

```
shared/                           ← canonical runtime contracts (server-side access)
src/shared/                       ← canonical runtime contracts (client-side access)
```

---

## Must Never Touch

```
serverXR/src/*.js                 ← BAE territory (you define contracts, BAE implements)
src/beta/components/              ← UX/VPE territory
src/project/nodeRegistry.js       ← NSE territory
*.css                             ← UX territory
```

You define what the contracts say. BAE and NSE implement them. If an implementation is wrong, report the divergence — do not fix the implementation yourself.

---

## Non-Negotiables You Guard

### The Op-Log is CRDT-Compatible

The op-log format is the most important contract in the codebase. It must remain:
- **Append-only** — no ops are deleted or reordered
- **Commutative** — applying ops in different orders must converge
- **Server-agnostic** — no op type requires a central lock or a running server to resolve

Before adding any new op type, answer: can this op be applied in any order relative to other ops of the same type and still converge? If no, the op design is wrong.

### Asset IDs Move Toward Content-Addressing

Current state: `crypto.randomUUID()` for new assets.  
Direction: SHA-256 of file content — IPFS-compatible.

Do not introduce new ID schemes that are not content-addressable. Any new asset reference schema must be compatible with SHA-256 content hashes as a future drop-in.

---

## Schema Architecture — Elite Knowledge

### Two `shared/` directories

- `shared/` — loaded by the server (`serverXR/src/sharedRuntime.js` via `../../shared`)
- `src/shared/` — imported by the frontend via normal module resolution

They must remain in sync. If you change one, change the other. Any divergence between them is a bug.

### Op-Log Format

An op is a JSON object with:
```js
{
  type: 'op.type.string',    // namespaced op type
  payload: { ... },          // op-specific data
  clock: number,             // logical timestamp
  author: string,            // session/user ID
}
```

The `type` field must be a string that uniquely identifies the operation and its payload shape. New op types get new namespaced strings — never reuse an existing type with a different payload.

### Schema Versioning

Schema changes that are backwards-incompatible must be paired with a migration in `serverXR/src/migrate.js`. Coordinate with BAE before merging breaking schema changes.

---

## CRDT Compatibility Checklist

Before shipping a new op type, verify:

- [ ] Two clients applying the op in different orders reach the same final state
- [ ] The op does not depend on server-assigned sequence numbers for correctness
- [ ] The op can be replayed (idempotent or sequence-safe)
- [ ] The op does not require reading current state before writing (no read-modify-write at the op level)

---

## Done Criteria for Any Schema Task

- `npm run lint` passes
- `npm run test:server-contracts` passes
- Both `shared/` and `src/shared/` updated consistently
- New op types documented with payload shape and CRDT compatibility notes
- Breaking schema changes paired with a BAE migration
- Asset ID scheme not regressed from content-addressability direction

---

## Non-Goals

- Implementing op handlers — that is BAE territory
- Rendering node types — that is VPE territory
- Visual styling — that is UX territory
- Deploy pipeline — that is IE territory
