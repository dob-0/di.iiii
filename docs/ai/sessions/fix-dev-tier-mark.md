# The second tier wears a mark at dev.diiii.xyz

The addresses were settled on 2026-09-11 and the tier mark was not told. It
matched a first label of `staging*` and nothing else, so the rehearsal tier
reached at `dev.diiii.xyz` fell through to `MODE_HOSTED` — and hosted wears no
mark on purpose, so the audience sees exactly what it saw before the mark
existed. The result is the one thing `deployMode.js` was written to prevent:
two di.iiii that look identical.

Measured on the real servers before touching anything, same machine, same
minute:

| address | before | after |
|---|---|---|
| `staging.di-studio.xyz` | `STAGING` | `STAGING` |
| `dev.diiii.xyz` | **no mark at all** | `DEV` |
| `diiii.xyz` | no mark | no mark |

Two decisions worth keeping:

- **Exact first label, not a prefix.** `staging*` can afford to be loose because
  the word is rare in a hostname. `dev` cannot: `developers.example.com` is
  somebody's website, and marking it amber would make the mark a thing you learn
  to ignore.
- **The chip prints the name you typed.** One tier answers to two addresses, and
  a chip reading STAGING over an address bar reading `dev.diiii.xyz` argues with
  the address — which is the one thing a mark that exists to answer "where am I"
  must never do. `deployModeMark()` takes the hostname for that and nothing else;
  the mode itself is still one value.

Verified by building and serving the real bundle under each hostname through a
resolver rule, then looking: amber frame around the page, `DEV dev.diiii.xyz`
bottom-left. A unit test would have passed either way.

The wiki passage describing the mark named only `staging.di-studio.xyz` and
`di-studio.xyz`. It names both tiers and the platform's current address now.

## The other half: a sync that renamed the space

`spaces/network/di-space.space.json` carried `"label": "network"` — the bare id —
so every `--all` run rewrote the space label from whatever a human had set. Prod
still read "The network"; the second tier had already been flattened by an
earlier push and nobody noticed, because a label is not something you check.

The manifest holds the human label now. The general lesson is in
`known-fixes.md`: a `would SET space label` line in a dry run means the manifest
disagrees with the live tier, and the manifest is not automatically the one that
is right.
