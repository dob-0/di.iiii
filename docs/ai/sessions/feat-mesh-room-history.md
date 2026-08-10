# Session — feat/mesh-room-history

## 2026-08-11 — the room keeps its chat (hub side)

- The owner's ask after his br_id_ge walk: the room becomes a persistent group
  conversation — same history on every device, crossed speak, everyone reads.
- meshHub gains durable per-room lines in SQLite (`mesh_room_lines`,
  `meshRoomHistoryStore`): persistent channels append on publish with a
  hub-minted stable line id (same id live and in replay — dedupe by identity,
  not text+time); replay is strictly OPT-IN via `{type:'control',
  cmd:'history'}` and arrives only as `mesh:history` envelopes, never
  `mesh:event` — a listener that never asks can never mistake history for a
  live line (fails closed; di bo's flag, same failure shape as broadcast([])).
- Chunks stay under a 6KB budget (mesh payload cap is 8KB — the robot's eye).
- Persistence is OFF until `MESH_HISTORY_CHANNELS` is set (compose allow-list
  entries added both tiers, the #134 lesson): the room's own wording promises
  impermanence until the field surface changes that promise, and the hub must
  not start keeping words first. No backfill by design — history begins at
  switch-on.
- Guards: 3 store tests + 4 hub tests (replay ordering + stable ids, ephemeral
  channels excluded, store-loss keeps the room alive, unconfigured hub answers
  empty done). Persistence guard mutation-tested — watched 1 failing with the
  append removed.
- NOT here: the field.html render + the room's new wording + ink design pass
  (br_id_ge side, next), the keeper-mind budget reserve (di bo's side).
