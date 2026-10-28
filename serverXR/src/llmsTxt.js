// A reader for llms.txt, per the proposal at https://llmstxt.org (read
// 2026-10-27). Its order, which is the whole format:
//
//   1. an H1 with the name of the site — "the only required section"
//   2. a blockquote with a short summary
//   3. zero or more paragraphs or lists, no headings
//   4. zero or more H2 sections, each a "file list": every item is
//      `- [name](url)`, optionally followed by `: notes`
//   An H2 named exactly "Optional" holds what may be skipped.
//
// Used by the tests to prove the file we serve is one, and by the route to
// refuse to serve a bundle that is not (a broken file is worse than a 404: a
// reader cannot tell it is broken).

const LINK_ITEM = /^- \[([^\]]+)\]\(([^)\s]+)\)(?::\s*(.*))?$/

const parseLlmsTxt = (text) => {
  const errors = []
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  let i = 0
  const skipBlank = () => { while (i < lines.length && lines[i].trim() === '') i += 1 }

  skipBlank()
  const h1 = /^# (\S.*)$/.exec(lines[i] || '')
  if (!h1) {
    errors.push(`line ${i + 1}: the file must open with an H1 ("# Name")`)
    return { ok: false, errors, title: null, summary: null, sections: [] }
  }
  const title = h1[1].trim()
  i += 1
  skipBlank()

  let summary = null
  if ((lines[i] || '').startsWith('>')) {
    const quote = []
    while (i < lines.length && lines[i].startsWith('>')) {
      quote.push(lines[i].replace(/^>\s?/, ''))
      i += 1
    }
    summary = quote.join(' ').trim() || null
  }
  if (!summary) errors.push(`line ${i + 1}: an H1 should be followed by a blockquote summary ("> …")`)

  // Detail: anything but a heading, until the first H2.
  while (i < lines.length && !lines[i].startsWith('## ')) {
    if (/^#{1,6} /.test(lines[i])) errors.push(`line ${i + 1}: no headings between the summary and the first H2 ("${lines[i]}")`)
    i += 1
  }

  const sections = []
  let current = null
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue
    const h2 = /^## (\S.*)$/.exec(line)
    if (h2) {
      current = { name: h2[1].trim(), links: [] }
      sections.push(current)
      continue
    }
    if (/^#{1,6} /.test(line)) {
      errors.push(`line ${i + 1}: only H2 sections after the summary ("${line}")`)
      continue
    }
    const item = LINK_ITEM.exec(line)
    if (!item) {
      errors.push(`line ${i + 1}: a section holds a file list, "- [name](url): notes" ("${line}")`)
      continue
    }
    current.links.push({ name: item[1], url: item[2], notes: item[3]?.trim() || null })
  }
  sections.forEach((section) => {
    if (section.links.length === 0) errors.push(`section "${section.name}" lists no links`)
  })
  const optional = sections.findIndex((section) => section.name === 'Optional')
  if (optional !== -1 && optional !== sections.length - 1) errors.push('"## Optional" should be the last section')

  return { ok: errors.length === 0, errors, title, summary, sections }
}

module.exports = { parseLlmsTxt }
