# The document show clock (plan 3.1)

## Why

`time` read each window's own `performance.now()`, so the editor, a second
window, and /out disagreed about "now" by however far apart their page loads
were — the manual even listed it as an honest limit. A show has ONE clock.

## What changed

- `document.showState.clockEpoch` (both schema mirrors + `setShowState` op
  with inverse; junk-normalized; parity-tested). Wall-clock ms, stamped once.
- `useDocumentClock(document)` wraps `useGraphClock`: with an epoch every
  window computes `Date.now() - epoch` (same value everywhere); without one
  it falls back to the old window-local clock. The rAF gate (no Time node,
  no per-frame work) is unchanged.
- RawEditor stamps the epoch ONCE, the first time a Time node exists —
  `setShowState` rides `ignoreTypes` beside `setWorkspaceState`, so the
  stamp never lands in undo history. /out never writes; a document only
  ever opened on /out keeps the fallback.
- Both clock call sites (RawEditor context, RawViewport SceneContent) now
  read `useDocumentClock`; the anatomy frame derives from the same value.
- Manual: the "two windows can be offset" honest-limit paragraph replaced
  with the shared-clock truth.

## Semantics shift (owner-facing)

Time now means "since the show clock started", not "since this window
opened". Existing documents with a running Time node get stamped on their
next editor open — Time restarts near zero at that moment, once.

## Verified

Schema 35/35 + parity 23/23, useDocumentClock 3/3, RawEditor 65/65; full
suite, lint, build, anatomy, wiki, docs checks green (see PR).
