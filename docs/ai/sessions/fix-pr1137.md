## Skills batch 1 fix: the release skill says a merge is a window (N1353)

Merged today's dev into the skills batch and changed the one line in `.claude/skills/release/SKILL.md` that said "a merge is a word": it now says a merge is a window, opened with `di-ask "merge …" -- di-merge`, his Enter merges (owner rule 2026-10-27). No other skill of the batch carries the old wording (grep). Lint and build green; no code touched, so no tests relate.
