# 0001 Toolchain: Rojo, Rokit, Lune

Date: 2026-10-28. Status: proven on game #1 (`scripts/check.sh` green at its commit 30c648d), made generic here.
Sources: game #1's decision record (2026-10-28); versions and dates from each project's GitHub release API.

## Decision

- **Rojo 7.7.1** (2026-10-02) syncs files from git to Roblox Studio and builds `.rbxl` files. Text code and
  diffs in git are the point.
- **Rokit v1.2.0** (2025-09-30) pins every tool version in `rokit.toml`. Aftman's maintainer says it is no
  longer interested in Roblox; Rokit reads `aftman.toml` files.
- **Lune 0.11.1** (2026-10-21) runs Luau outside Roblox, so the pure logic has real tests on Linux with no Studio.
- **StyLua 2.6.0** (2026-10-10) formats. **Selene 0.32.0** (2026-10-01) lints. **luau-lsp 1.70.1** (2026-09-27)
  gives editor help and types.
- **Not chosen:** Wally (last release 2023-06-05; add it when a package is needed). Jest Lua (runs only inside Roblox).

## Why tests run in Lune

Pure rules live in `src/shared/logic/` and never touch Roblox services. Lune loads them by file path; Roblox
loads them by instance. So a pure module never requires another one: hand it what it needs. Engine behaviour
(pathfinding, raycasts, lights, networking) cannot be tested this way. It needs Studio, a person, or Open Cloud
Luau Execution (its scopes and limits are unread).

## Rokit home

Rokit's source (`lib/storage/home.rs`, v1.2.0) reads `ROKIT_ROOT`; the default here is `$HOME/tools/rokit`.
`rokit self-install` edits shell profiles (`src/cli/self_install.rs`), so `scripts/setup-tools.sh` never calls
it. Tools run through `scripts/tools.sh`, which exports `ROKIT_ROOT` (the tool shims need it). The setup script
downloads Linux x86_64 only, checked against the sha256 in the Rokit release JSON.

## Pinned by version and by hash

`rokit.toml` pins each tool's version. A version does not say that the bytes are the released ones, so `tools.sha256` holds
the sha256 of each unpacked binary under `ROKIT_ROOT/tool-storage/` (`sha256sum -c` format, paths relative to `ROKIT_ROOT`).
`scripts/setup-tools.sh` writes a line when a tool and version are installed for the first time
(`scripts/verify_tools.py --record`). `scripts/check.sh` checks every line first, on every run, and fails on a binary that
differs, a tool without a line, or a lock written for another platform. The pattern is trust on first use with a checked
lock file, as in Go's `go.sum` (go.dev/ref/mod, "go.sum files"; not re-read for this change).

Limits, stated:

- The first install trusts the GitHub release and the version pin. Rokit keeps the unpacked binary, not the release
  archive, so the archive digest that GitHub publishes cannot be compared with it. Owed: pin those digests too.
- `rokit install --no-trust-check` skips Rokit's own prompt about untrusted tools; the hash lock takes the place of it.
- Rokit itself is checked against the sha256 of its release JSON when `setup-tools.sh` downloads it. A Rokit already in
  `ROKIT_ROOT/bin` is used as found, with no version or hash check.
- `scripts/tools.sh` does not verify; `scripts/check.sh` does.

## Changes from game #1's scripts

- `scripts/gen_greybox.py --check` compares the files with the plan in memory. Game #1 regenerated the files
  and ran `git diff`, which says nothing in a repo that has no commit yet.
- `scripts/check.sh` fails when the test run reports 0 tests: a gate that passes with zero tests is no gate.
- `scripts/check.sh` also runs `scripts/check_assets.py` (the provenance file; skill `game-look`).
- The plan says `areas` where game #1 said `rooms`, and has generic `zones` and `markers`.
- The generated `.model.json` files have no top-level `Name`: Rojo has ignored it since 6.0 and warned about every file. The file name is the name.
- `scripts/verify_tools.py` and `tools.sha256`: the tool binaries are pinned by hash as well as by version.

## Owed

- A type-check step (`luau-lsp analyze` needs the Roblox type definitions; not tried).
- Other platforms in `scripts/setup-tools.sh`.
- Pin the release archive digests (GitHub's `digest` field) so the first install is checked too.
- Nothing in `src/server` or `src/client` has run inside Roblox.
