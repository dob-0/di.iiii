## 2026-10-07 — a follow carries a project's trash, restore, rename and move (item 6a)

- Design first, in `docs/architecture/SPEC_follow.md` "A project trashed, restored, renamed or moved": a base (the
  last agreed state, Unison's archive) tells which side changed; host wins; a project is trashed here only from the
  host's trash row, never from an absence; a pass never trashes every project this copy holds, nor more than 5.
- Space settings (label, isPublic, front door) were already carried host to this install since 2026-10-05; measured here.
- Work in progress — see the commits that follow.
