# The research ledger

Paid-for knowledge lives here — one file per topic, dated, updated in place.
This directory exists so research is bought once: before launching any agent
at a question, check whether a file here already answers it, and UPDATE that
file rather than opening a new one on the same topic.

Conventions (the full method: `../ai/golden_rules.md` "the home rule" and
`../ai/RESEARCH_METHOD.md`):

- `<yyyy-mm-dd>-<topic>.md` — the date is when the topic was LAST verified,
  moved forward on each update, with a line saying what changed.
- Findings carry their evidence (source URLs, screenshot names, file:line) and
  their spend (agents, model, tokens), so the next reader knows what the
  answer cost and how stale it is.
- External mirrors (claude.ai artifacts and the like) are recorded by URL at
  the top of the file they mirror. The file is the truth; the mirror is a view.
- Raw intermediate data (fleet JSON, transcripts) stays in the session that
  made it — the file here holds the distilled result worth keeping.
