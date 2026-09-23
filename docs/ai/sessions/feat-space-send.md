## 2026-09-21 — one command for the content line: `npm run send -- <space>`

The code line has always had one way up: branch, pull request, dev, the owner's word.
The content line had ten — Studio by hand on each tier, `tier-sync`, `space-sync`,
`space-push`/`space-pull`, `space-bundle` export/import, `local-mirror`, `project-pull`,
`promote-space-projects`, `project-move`, Follow, and raw op writes. That asymmetry is
what makes di.iiii feel hard to manage, and it is the thing this closes.

`scripts/send.mjs` owns no logic of its own. It exports the space from the machine you
are on (`space-bundle.mjs`) and posts the file to the target tier's proposal endpoint
(`space-proposal.mjs`, PR #486), then prints the two addresses to go and look at. The
server decides what happens to it: someone on the space's trusted list has it applied
after a restore point, anyone else has it held as a `content.apply` approval the inner
bot shows with Apply and Reject. **Who you are is not a flag you pass** — that is why
this is one command and not two, and why an artist and an agent type the same thing.

Refusals, all before anything is exported: no space named, a space id that is not one,
an unknown tier, and the public site unless `--allow-production` is on the line. Tier
aliases people actually type (`staging`, `rehearsal`, `live`) resolve rather than fail.
`--dry-run` prints the summary and writes nothing; `--as-proposal` gives up the right to
apply, for when you would rather be read first.

**Walked for real, not only unit-tested.** A throwaway serverXR on port 4123 over a
temporary data root seeded with one space: the dry run printed the summary and created
nothing, and the real send applied with a named restore point. Both printed the address
to look at. 12 tests, two of which spawn the script itself so a refusal cannot live only
in a pure function.

This branch is stacked on `feat/bundle-proposal` — it cannot land before #486 does.

Still to do, and deliberately not here: `di send` in the installed CLI (`scripts/di/`),
which needs the install's own link key rather than a token file, and is the door an
artist on their own machine would use. The other nine paths stay as they are until this
one has been used for a while — retiring them is a separate, reversible pass.
