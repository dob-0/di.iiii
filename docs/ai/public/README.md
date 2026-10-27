# The public bundle

What di.iiii tells any assistant that has no key: the **public** level of the one context
(levels: owner > core > crew > partner > registered > public). serverXR serves these files
(`serverXR/src/aiPublic.js`):

- `llms.txt` at `/llms.txt`, per [llmstxt.org](https://llmstxt.org): an H1, a blockquote, then H2
  lists of `- [name](url): note`. The route refuses to serve a file that does not parse
  (`serverXR/src/llmsTxt.js`), and a test reads this one.
- every `name.md` here (lower case, digits, dashes) at `/ai/name.md`, as `text/markdown`.
  Anything else under `/ai/` is a 404. This README is not served (capital letters).

Only words and positioning belong here, never state: no names of people, no open work, nothing
about who is signed in. Every link in `llms.txt` to `/ai/…` must name a file in this folder
(`serverXR/src/aiPublic.test.js`), and every word on `words.md` must be a row of
`docs/ai/vocabulary.md`.

For now the files are written by hand in this repo. When the context build exists (di-atlas
`tools/di-context`), it writes this folder and nothing else should.
