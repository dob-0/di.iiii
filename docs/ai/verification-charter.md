# Verification Charter

**A green test run is not evidence that the product works.**

This is the standard for calling anything "done" in di.iiii. It is not a style
preference — it is derived from what has actually broken here.

## The evidence

`docs/ai/known-fixes.md` holds **134 recorded defects**. Classified:

| Class | Rows | Would a green unit run have caught it? |
|---|---|---|
| Silent failure — swallowed catch, hardcoded fallback, 200 with wrong bytes | 43 | No |
| Auth / identity — guest treated as account, scope confusion | 43 | Rarely |
| Sync / data loss — dropped op batch, vanished edit | 40 | Rarely |
| Deploy / environment — wrong image, wrong env, nginx | 39 | No |
| Keyboard / input — shortcut swallowed, cursor dead | 33 | No |
| **Mobile / touch / phone** | **29** | **No** |
| Render — blank, invisible, covered, never revealed | 24 | No |
| Only-on-prod — "works on localhost" | 9 | No |

The single largest class is *things that look fine*. The second-largest thing
this project ships is *things that look fine on a desktop*. Neither is visible
to `npm run test`.

## The rule

> **Anything that can change what a person sees or does must be verified in a
> real browser, on desktop AND on a phone, by looking at it — before it is
> called done.**

Automated assertions prove the code does what you told it to. They cannot tell
you the heading is behind the space chip, the cores never became visible, or
the cursor vanished. Only looking does that.

### What "as a human" means, concretely

1. **Run it.** `npm run verify:surfaces -- --base <url>` — desktop + 5 device
   profiles, every reachable surface.
2. **Open the screenshots.** All of them. `.verify-surfaces/*.png`. A clean
   report with an unopened screenshot is an unverified surface — the chip
   covering the field's heading was found by eye first, and only then taught to
   the tool.
3. **Use the thing.** Move the mouse. Tap. Rotate. Press the shortcut the help
   dialog advertises. Arrive at the URL a visitor would actually arrive at —
   including the bare one with no query string, which is how the field's hidden
   cores went unnoticed.
4. **Check the quiet paths.** Did anything get swallowed? Is that 200 really the
   asset, or the SPA shell wearing its clothes?

### Mobile is not optional

29 recorded defects are touch/phone-specific. A phone is not a narrow desktop:

- `(pointer: coarse)` changes behaviour — hover states, custom cursors, and
  `cursor: none` all mean something different or nothing at all.
- 320px CSS width still exists (iPhone SE). Landscape is a separate layout.
- Fixed platform chrome overlaps project content far sooner than on desktop.
- Tap targets under ~32px are missable; under 24px they fail WCAG 2.5.8.
- `100vh` is not the visible height on iOS.

The device matrix in `scripts/verify-surfaces.mjs` is the floor, not the ceiling.

## What the harness checks

`scripts/verify-surfaces.mjs`, per page × per device:

- page errors, console errors, HTTP ≥ 400
- **asset responses whose content-type is HTML** — encodes the "blank prod
  images" class directly: nginx's SPA fallback answers 200 `text/html` for an
  unmatched path, and every `response.ok` check in the codebase passes it
- horizontal overflow, and any element escaping the viewport
- **cross-document occlusion** — platform chrome painted over a published
  project's iframe, which neither document can detect on its own
- tap-target sizes
- published-project iframes, read across the opaque-origin boundary
- one screenshot per combination

### Two techniques that do NOT work here — do not re-invent them

- **`elementFromPoint` for occlusion.** It answers "what would receive this
  click", not "what is painted on top". Any element with `pointer-events: none`
  reports the canvas *behind* it as its cover. It produced only false positives
  on this codebase and was removed.
- **Filtering chrome by "positioned AND painted".** The space chip's positioned
  wrapper is transparent; the pill is painted by a descendant. Filter on painted
  alone and exclude the iframe's ancestors instead.

### The browser extension cannot do this job

Claude's Chrome extension drives a tab that reports `document.hidden === true`.
Chrome freezes `requestAnimationFrame` and CSS transitions in hidden tabs, so
**every WebGL surface and every animated reveal appears blank**, and a real
rendering bug is indistinguishable from the harness. This produced a false
"production is broken" report once. Use Playwright for anything that animates
or renders 3D; the extension is fine for static DOM and for clicking through a
flow you are watching.

## Done criteria

A change to anything user-facing is done when:

- `npm run lint` — 0 errors, and no new warnings
- `npm run test`, `npm run test:server-contracts` — pass, count never decreases
- `npm run verify:surfaces` — clean, **and the screenshots have been looked at**
- every fixed bug has a regression guard that was **observed to fail without the
  fix** (a guard never seen red is decoration)
- `docs/ai/known-fixes.md` has a row, and the Wiki is updated if behaviour changed

## Agents

`.claude/agents/` holds three verifiers built on this charter:

- **human-verifier** — drives the real browser across the device matrix and
  reports what a careful person would notice
- **silent-failure-hunter** — hunts the largest defect class: swallowed errors,
  hardcoded fallbacks, success-shaped failures
- **release-verifier** — post-deploy truth check: is the right build actually
  live, and do the surfaces still work
