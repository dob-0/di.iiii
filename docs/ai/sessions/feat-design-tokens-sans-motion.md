# The design system was colour-only (2026-08-25)

Auditing all surfaces as one suite turned up the reason type, spacing and
motion had never been unified: **there were no tokens for them.** `base.css`
defines 11 colour tokens and a mono stack; that is the whole system. So:

- the sans stack existed as **24 copy-pasted literals** in two incompatible
  spellings — `'Inter','SF Pro Text',-apple-system,Blink…` (preferences,
  wiki, legal) vs `'Inter','Segoe UI'` (landing, raw) — which fall back
  differently per OS, and a typeface change meant 24 edits
- the mono stack was written out 45 more times, in four spellings, three of
  them byte-identical to `--di-mono`
- `html, body, #root` set colour, background and size but **no font-family**,
  so the document's inherited default was the browser serif. Every surface
  only looked right because its own root container re-set a font.

Added `--di-sans` (the union of both stacks, in preference order),
`--di-motion-fast`/`--di-motion-base`, and a base font on the document.
Pointed 73 duplicated literals at the tokens. Left `wcc` and `algoVrithm`
alone — they are independent by documented decision.

Verified: nothing visible rendered in serif before the change (checked live
on /, /wiki, /spaces), and after it `body`, headings and body copy resolve to
Inter on landing/wiki/privacy/terms at both phone and desktop. Guards pass
(contrast, colourRoles, cssBraceBalance).
