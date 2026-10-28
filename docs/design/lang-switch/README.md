# One Armenian/English switch for di.iiii: three concepts

Owner, 2026-10-21: "i think better to have one global button for armenian we need to concepts and sketchs about that".

Today a few pages carry Armenian and English side by side (one space's front page), and the rest of di.iiii is English only. These are **designs, not builds**: three static sketches, each showing the switch on the landing page header, inside a space's front page, inside the Studio, and on a phone. Each one also answers the same six questions.

| | [A: the corner word](concept-a.html) | [B: the address carries it](concept-b.html) | [C: in the account button, `?lang=`](concept-c.html) |
| --- | --- | --- | --- |
| Where it sits | Top-right of every header, left of the account | Top-left, right after the name di.iiii | Bottom-right, on the floating account button; a new light chip on public routes, which do not load that button today |
| Remembers, per visitor | Account (serverXR preferences) when signed in | The address; account for emails and invitations | Account when signed in |
| Remembers, per device | `localStorage["di.lang"]` | Cookie `di_lang` (1 year, `SameSite=Lax`), read only at `/`, to *offer* Armenian, never to redirect | `localStorage["di.lang"]` |
| Address | Unchanged | `/hy/…` prefix; English stays unprefixed | `?lang=hy` added by share/copy-link only |
| Search (Google Search Central, "localized versions") | Armenian never indexed; hreflang impossible (one URL) | Subdirectory per language; hreflang `en` / `hy` / `x-default` on every public page, listed both ways | URL parameters: listed by Google as "not recommended"; hreflang works but every internal link must carry the parameter |
| A page with no Armenian yet | Frame in Armenian, body in English under one line: "Այս էջը դեռ հայերեն չունի։ Ստորև՝ անգլերեն։" | Same, and `/hy/` page left out of hreflang with its canonical on the English address | Same, and `hy` left out of hreflang |
| The work | Never told the language; container `translate="no"`; artist's own `lang` | Same; served byte-for-byte the same under both addresses | Same; `lang` stripped before the work loads; the only concept whose button floats *over* the work |
| A link you send | Opens in the receiver's language | Opens in the sender's language | Opens in the sender's language |
| Cost to build | Lowest: one component, one preference | Highest: router strips a segment on every route; `hy` becomes a reserved space name | Medium: a MUI-free chip for public routes; every link the frame draws carries `lang` |

Screenshots of each sketch at 1440×900 and 390×844 (full page) are in [`shots/`](shots/), taken with Playwright's Chromium in the session. At 390 px wide none of the three scrolls sideways (`scrollWidth` = 390 on all three).

## Pick

**B: the address carries it.** It is the only concept where Armenian can be found by search at all. A gives search nothing, and C uses the URL shape Google marks "not recommended". B is also the only one where a link keeps its language when it is sent on: "here it is in Armenian" stays true for the person who opens it. Its two costs are real and bounded. `hy` has to be reserved as a space name, which must be checked against the live spaces table first. And the router must strip one segment, once, in the frame, before anything resolves a space or a work. That same place is where the work is guaranteed to come out identical. A's corner placement is easy to borrow if the owner prefers the switch at the right, since placement and mechanism are independent.

## The same in all three

- **The frame switches, never the work** (owner's rule). The switch translates only strings the platform owns: headers, menus, buttons, Studio panels, the wiki. A space's page, scene or iframe gets no message, parameter or attribute from it. Its container carries `translate="no"` so a browser's translate button cannot rewrite it, and its `lang` is whatever the artist declared. A bilingual front page stays as made.
- **No guessing.** No language is picked from the browser's language or the visitor's country. Google advises against automatic redirects between language versions, and a visitor who cannot read the other script would have no way back.

## Limits, plainly

- These are designs. Nothing in `src/` changed, and no strings are translated.
- **Typeface.** The platform's Inter (`public/fonts/inter-latin-wght-normal.woff2`, 48,256 bytes) is a latin subset with no Armenian glyphs, so Armenian falls back to the system font, in these sketches and on the live site. An Armenian subset (Noto Sans Armenian, 31,580 bytes for the Armenian range) exists only inside a work (`src/wccSite/`), and the works boundary forbids importing it. Any build needs its own copy in `public/fonts/`.
- **Armenian copy** in the sketches was not checked by a native speaker.
- The sketches use the live tokens from `src/styles/base.css` and square corners. `scripts/lang-switch-sketches.test.mjs` fails if a sketch drifts from those tokens, loads anything external, rounds a corner, drops a surface or a question, or leaves the work unfenced.
