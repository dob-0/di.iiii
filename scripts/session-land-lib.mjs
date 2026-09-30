// Pure logic for `npm run land` (scripts/session-land.mjs) -- folding branch-local
// session notes (docs/ai/sessions/*.md, see its README) into PROGRESS.md and
// CURRENT.md at merge time. Kept side-effect free so it can be unit tested without
// touching the filesystem or git; the CLI wrapper owns all I/O.
//
// Why CURRENT.md's "Last session" becomes a title list, not the full note text:
// concatenating N notes' full prose would blow the file's 50-line budget the moment
// more than one branch lands in a batch, and trying to auto-summarize prose well is
// its own hard problem. The full text always goes to PROGRESS.md unconditionally --
// CURRENT.md just points there. This is a deliberate trade (less at-a-glance detail)
// for a guarantee (never exceeds budget, regardless of how much landed).

const PROGRESS_INSERT_MARKER = '\n---\n\n'

export const extractNoteTitle = (noteContent) => {
  const m = /^##\s+(.+)$/m.exec(noteContent)
  if (!m) return null
  // "2026-08-06 — a title" -> "a title" (the date is redundant once it's one bullet
  // among others under a dated CURRENT.md session heading)
  return m[1].replace(/^\d{4}-\d{2}-\d{2}\s*—\s*/, '').trim()
}

// Inserts every note's full text into PROGRESS.md, newest-first, right after the
// file's own header/separator and before whatever was already the top entry.
// Notes are joined in the order given -- callers should pass them in the order they
// want to read top-to-bottom (typically: the order docs/ai/sessions/ was read in is
// fine, since a batch landing has no inherent ordering between branches anyway).
export const foldNotesIntoProgress = (progressContent, notes) => {
  if (!notes.length) return progressContent
  const markerIndex = progressContent.indexOf(PROGRESS_INSERT_MARKER)
  const insertAt = markerIndex >= 0 ? markerIndex + PROGRESS_INSERT_MARKER.length : progressContent.length
  const before = progressContent.slice(0, insertAt)
  const after = progressContent.slice(insertAt)
  const combined = notes.map((n) => n.trim()).join('\n\n')
  const separator = after.trim() ? '\n\n' : '\n'
  return `${before}${combined}${separator}${after}`
}

// Replaces CURRENT.md's "## Last session" section (everything from that heading up to
// the next "## " heading) with a compact title list pointing at PROGRESS.md. Leaves
// the rest of the file untouched. If no "## Last session" heading exists, the new
// section is inserted right after the file's "---" divider (matches every real
// CURRENT.md seen in this repo's history).
// CURRENT.md is capped at 50 lines and is rewritten in place on every landing, so this section
// must not grow with the number of notes: a batch of ~30 notes once made it 88 lines and stopped
// the dev deploy at the docs gate (three times on 2026-09-30/10-01). At most this many bullets,
// the last one saying how many titles were left out (PROGRESS.md keeps every note in full).
export const MAX_LAST_SESSION_BULLETS = 6

export const buildLastSessionSection = (notes) => {
  const titles = notes.map(extractNoteTitle).filter(Boolean)
  const lines = ['## Last session', '']
  if (titles.length) {
    const shown = titles.length > MAX_LAST_SESSION_BULLETS ? titles.slice(0, MAX_LAST_SESSION_BULLETS - 1) : titles
    for (const title of shown) lines.push(`- ${title}`)
    if (shown.length < titles.length) lines.push(`- …and ${titles.length - shown.length} more notes, each in full in PROGRESS.md`)
  } else {
    lines.push('- (no session notes were staged for this landing)')
  }
  lines.push('')
  lines.push('Full detail: `PROGRESS.md`.')
  return lines.join('\n')
}

export const replaceLastSessionSection = (currentMdContent, newSectionContent) => {
  const headingPattern = /^## Last session.*$/m
  const match = headingPattern.exec(currentMdContent)
  if (!match) {
    const dividerIndex = currentMdContent.indexOf('\n---\n')
    if (dividerIndex < 0) return `${currentMdContent.trim()}\n\n${newSectionContent}\n`
    const insertAt = dividerIndex + '\n---\n'.length
    return `${currentMdContent.slice(0, insertAt)}\n${newSectionContent}\n${currentMdContent.slice(insertAt)}`
  }
  const sectionStart = match.index
  const nextHeadingMatch = /^## /m.exec(currentMdContent.slice(sectionStart + match[0].length))
  const sectionEnd = nextHeadingMatch
    ? sectionStart + match[0].length + nextHeadingMatch.index
    : currentMdContent.length
  return `${currentMdContent.slice(0, sectionStart)}${newSectionContent}\n\n${currentMdContent.slice(sectionEnd)}`
}
