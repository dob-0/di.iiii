## 2026-10-07 — the bug sweep: sources, what was confirmed and fixed, what dissolved, what is owed

- The owner asked to "analyze the di.iiii and fix all bugs". "All" is not a finite list, so the sweep took the places where a bug was already written down (open PRs, old fix branches, audit output, CI history), re-measured each on `dev`, and looked for new ones with methods that give evidence — a failing test or a measured number.
- The register is `docs/ai/audits/bug-sweep-2026-10-07.md`: confirmed and fixed (each an open PR), confirmed and waiting for the owner, dissolved (checked, not bugs), not looked at, and method notes. Nothing was merged by the sweep.
- Still owed, named in the register: the owner's decisions (Studio zoom-out ceiling in #748, #726's hosted-tiers risk), looks on a real screen (the Keeper in Raw, #726's Camera In text, #737's banner, #728 on aylmo), the merges, and a security review of the server code nobody has read yet.
