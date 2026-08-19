import { describe, expect, it } from 'vitest'

import {
  extractNoteTitle,
  foldNotesIntoProgress,
  buildLastSessionSection,
  replaceLastSessionSection
} from './session-land-lib.mjs'

describe('extractNoteTitle', () => {
  it('strips a leading date from a "## <date> — <title>" heading', () => {
    expect(extractNoteTitle('## 2026-08-06 — a one-line title\n\n- stuff')).toBe('a one-line title')
  })

  it('keeps a heading with no date as-is', () => {
    expect(extractNoteTitle('## just a title\n')).toBe('just a title')
  })

  it('returns null when there is no "## " heading at all', () => {
    expect(extractNoteTitle('no heading here, just text')).toBeNull()
  })
})

describe('foldNotesIntoProgress', () => {
  const progress = () => [
    '# di.iiii Progress Log',
    '',
    'Developer work journal. One entry per session, newest at top.',
    'Read this before starting work. Update it before stopping.',
    '',
    '---',
    '',
    '## 2026-08-05 — an older entry',
    '',
    '- old stuff'
  ].join('\n')

  it('inserts new notes right after the --- divider, before the existing top entry', () => {
    const result = foldNotesIntoProgress(progress(), ['## 2026-08-06 — new entry\n\n- new stuff'])
    const lines = result.split('\n')
    const dividerIdx = lines.indexOf('---')
    // the new entry's heading must appear before the old one, both after the divider
    const newIdx = lines.findIndex((l) => l.includes('new entry'))
    const oldIdx = lines.findIndex((l) => l.includes('an older entry'))
    expect(dividerIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeGreaterThan(dividerIdx)
    expect(newIdx).toBeLessThan(oldIdx)
  })

  it('joins multiple notes with a blank line between them, in the order given', () => {
    const result = foldNotesIntoProgress(progress(), ['## first\n\n- a', '## second\n\n- b'])
    const firstIdx = result.indexOf('## first')
    const secondIdx = result.indexOf('## second')
    expect(firstIdx).toBeGreaterThan(-1)
    expect(secondIdx).toBeGreaterThan(firstIdx)
  })

  it('returns the input unchanged when there are no notes', () => {
    expect(foldNotesIntoProgress(progress(), [])).toBe(progress())
  })

  it('falls back to appending at the end if there is no --- divider (malformed input, never crash)', () => {
    const result = foldNotesIntoProgress('# No divider here\n', ['## a note\n\n- x'])
    expect(result).toContain('# No divider here')
    expect(result).toContain('## a note')
  })
})

describe('buildLastSessionSection', () => {
  it('lists one bullet per note title, dates stripped', () => {
    const section = buildLastSessionSection([
      '## 2026-08-06 — first thing\n\n- detail',
      '## 2026-08-06 — second thing\n\n- detail'
    ])
    expect(section).toContain('- first thing')
    expect(section).toContain('- second thing')
    expect(section).toContain('PROGRESS.md')
  })

  it('says plainly when nothing was staged, rather than an empty bullet list', () => {
    const section = buildLastSessionSection([])
    expect(section).toContain('no session notes were staged')
  })
})

describe('replaceLastSessionSection', () => {
  const currentMd = () => [
    '# Current State',
    '',
    'active_branch: dev',
    '',
    '---',
    '',
    '## Last session',
    '',
    '- old content that should be replaced',
    '',
    '## What works',
    '',
    'stuff that must survive untouched'
  ].join('\n')

  it('replaces only the Last session section, leaving What works intact', () => {
    const result = replaceLastSessionSection(currentMd(), '## Last session\n\n- new content')
    expect(result).toContain('new content')
    expect(result).not.toContain('old content that should be replaced')
    expect(result).toContain('## What works')
    expect(result).toContain('stuff that must survive untouched')
  })

  it('inserts after the --- divider when no Last session heading exists yet', () => {
    const noSection = '# Current State\n\nactive_branch: dev\n\n---\n\n## What works\n\nstuff'
    const result = replaceLastSessionSection(noSection, '## Last session\n\n- new content')
    expect(result).toContain('## Last session')
    expect(result).toContain('new content')
    expect(result).toContain('## What works')
    expect(result.indexOf('## Last session')).toBeLessThan(result.indexOf('## What works'))
  })

  it('does not corrupt a heading whose title happens to start with "Last session" as a substring elsewhere', () => {
    const result = replaceLastSessionSection(currentMd(), '## Last session\n\n- x')
    // "What works" heading and its body must be byte-identical to the input
    expect(result.slice(result.indexOf('## What works'))).toBe(currentMd().slice(currentMd().indexOf('## What works')))
  })
})
