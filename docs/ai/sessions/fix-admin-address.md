## 2026-08-21 — the space stops being a query parameter

The last layer gap reachable without a signature. `/admin?space=wcc` put the one level that
**owns** everything being administered into a parameter you could delete and still be left
with a valid address. Now:

    /{space}/admin          the space's ops        NEW, canonical
    /{space}/preferences    same, via the alias    NEW
    /admin?space={id}       still parses           unchanged, forever
    /admin                  no space               unchanged

`buildPreferencesPath(spaceId)` emits the new shape, so all four of its callers moved
together; the old form is still read by the parser, so nothing already in the wild rots.

**Checked before claiming the word,** the same way as `spaces` and `projects`: no space and
no project on production or staging answers to `admin`, `preferences`, or either of the two
historical misspellings the aliases carry. `admin` was already reserved as a SPACE slug but
**not** as a project slug — so a project could have taken it and shadowed the console. Added
to `PROJECT_RESERVED_SLUGS` alongside `preferences`.

Only the bare two-segment form is the console: `/{space}/admin/extra` deliberately does not
match, leaving the deeper path free.

**Verified in a browser, all five cases:** `/atlas/admin` and `/atlas/preferences` render
the console and stay at their own address with the space chip reading `atlas`;
`/admin?space=atlas` still works; `/admin` still defaults; `/atlas/admin/extra` is not the
console.

Three tests pinned the old URL and were updated — they asserted the shape, not the
behaviour, so this is a deliberate change of contract rather than a regression. Suite back
to baseline: 2428 passing, the 12 serverXR files that cannot import `express` here.

**Still open after this:** the editor addresses, `/{space}/{tool}/projects/{id}`. That is
§7.1 of `SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04, and it
is the last inversion left.
