## `di show count`: the read-only count that is step 1 of "a show lives in its project"
- New: `scripts/show/count.mjs` (flags, formatting, the per-browser stores, the save time of the largest document) and
  `scripts/show/lib/countCore.mjs` (the counting; Node built-ins only, one JSON object, runs piped over ssh too).
- It counts project documents (lamps, designed looks, cues, laser objects), every desk file (light show files, the laser
  desk file), what names a project, and sizes. It reads keys, counts and sizes, never a value; the `output` key of a show
  file is dropped unread and the laser rig file is only `stat`ed. It writes nothing anywhere.
- Default output has no id, path or host; `--ids` adds them (for a list kept on our own machines); `--json` prints one object.
- Tests: `scripts/show/count.test.mjs`, on a made-up home inside `TMPDIR`: exact counts, read-only (listing identical, also
  with write bits removed), no value, the core piped, the path to another machine with the transport faked.
- Undo: remove the command. Plan: `docs/architecture/SHOW_IN_THE_PROJECT.md`, step 1.
