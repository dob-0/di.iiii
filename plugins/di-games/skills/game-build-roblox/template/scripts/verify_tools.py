#!/usr/bin/env python3
"""Checks the sha256 of every tool binary that Rokit installed for this game against tools.sha256.

Run from anywhere:   python3 -I scripts/verify_tools.py [--record]
  (no flag)  verify. Exit 1 when tools.sha256 is missing, lacks a tool of rokit.toml, was written for another
             platform, or a binary differs from its line.
  --record   what scripts/setup-tools.sh runs after `rokit install`: verify, and add a line for each tool and
             version that tools.sha256 does not list yet. It never changes a recorded hash and writes nothing
             when anything fails, so a changed binary cannot be re-recorded by accident.

Trust: a hash is trusted on first use and checked every time after (the pattern of Go's go.sum). The first use
trusts the GitHub release that Rokit downloaded and the version pinned in rokit.toml. Rokit keeps the unpacked
binary, not the release archive that GitHub publishes a digest for, so that digest cannot be compared here
(owed: plugin README, Owed). The lock lines are `sha256sum -c` lines with paths relative to ROKIT_ROOT, so
`cd "$ROKIT_ROOT" && sha256sum -c <this game>/tools.sha256` gives the same answer. Standard library only.
"""
import hashlib
import os
import platform
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCK = ROOT / "tools.sha256"
PLATFORM = f"{platform.system().lower()}-{platform.machine()}"
TOOL = re.compile(r'^\s*([A-Za-z0-9_-]+)\s*=\s*"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)@([^"\s]+)"\s*(#.*)?$')
HEADER = [
    "# platform: " + PLATFORM,
    "# sha256 of the tool binaries Rokit installed (rokit.toml); paths are relative to ROKIT_ROOT; sha256sum -c format.",
    "# Written by scripts/setup-tools.sh (verify_tools.py --record): a tool's first install trusts the GitHub release",
    "# and the version pin. scripts/check.sh checks every binary against these lines on every run.",
]


def rokit_root() -> Path:
    return Path(os.environ.get("ROKIT_ROOT") or Path.home() / "tools" / "rokit")


def pinned_tools() -> list[tuple[str, str]]:
    """(tool name, path under ROKIT_ROOT) for every tool in rokit.toml, in file order."""
    tools: list[tuple[str, str]] = []
    in_tools = False
    for line in (ROOT / "rokit.toml").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("["):
            in_tools = s == "[tools]"
        elif in_tools and s and not s.startswith("#"):
            m = TOOL.match(line)
            if not m:
                sys.exit(f"verify_tools: cannot read this rokit.toml line: {line!r}")
            name, author, repo, version = m.group(1), m.group(2), m.group(3), m.group(4)
            tools.append((name, f"tool-storage/{author.lower()}/{repo.lower()}/{version}/{repo.lower()}"))
    return tools


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_lock() -> tuple[str, dict[str, str]]:
    """(platform named in the header, {path relative to ROKIT_ROOT: sha256})."""
    plat = ""
    entries: dict[str, str] = {}
    for line in LOCK.read_text(encoding="utf-8").splitlines():
        if line.startswith("# platform:"):
            plat = line.split(":", 1)[1].strip()
        elif line.strip() and not line.startswith("#"):
            m = re.fullmatch(r"([0-9a-f]{64})  (\S+)", line)
            if not m:
                sys.exit(f"verify_tools: cannot read this tools.sha256 line: {line!r}")
            entries[m.group(2)] = m.group(1)
    return plat, entries


def main() -> int:
    args = sys.argv[1:]
    if any(a != "--record" for a in args):
        print("usage: python3 -I scripts/verify_tools.py [--record]", file=sys.stderr)
        return 2
    record = bool(args)
    tools = pinned_tools()
    if not tools:
        print("FAIL: rokit.toml lists no tools")
        return 1
    if not LOCK.exists() and not record:
        print("FAIL: tools.sha256 does not exist. Run scripts/setup-tools.sh once: it installs the tools and records their hashes.")
        return 1
    plat, locked = read_lock() if LOCK.exists() else (PLATFORM, {})
    if plat != PLATFORM:
        print(f"FAIL: tools.sha256 was written for '{plat or 'unknown'}' and this machine is '{PLATFORM}'. "
              "Hashes differ per platform; this check does not skip itself.")
        return 1

    root = rokit_root()
    problems: list[str] = []
    lines: list[tuple[str, str]] = []  # what the lock will hold: (relative path, sha256)
    added = 0
    for name, rel in tools:
        binary = root / rel
        if not binary.is_file():
            problems.append(f"{name}: {binary} is not installed. Run scripts/setup-tools.sh.")
            continue
        digest = sha256(binary)
        if rel in locked:
            if locked[rel] != digest:
                problems.append(
                    f"{name}: CHANGED. {rel} is {digest[:16]}... and tools.sha256 says {locked[rel][:16]}.... "
                    "Do not run it. Find out why (corrupted, replaced, rebuilt release) before you trust it; if you "
                    "replaced the release on purpose, delete this line in tools.sha256 and run scripts/setup-tools.sh."
                )
                continue
            print(f"ok       {name:<10} {digest[:16]}  {rel}")
        elif record:
            added += 1
            print(f"recorded {name:<10} {digest[:16]}  {rel}  (first use: trusts the GitHub release and the version pin)")
        else:
            problems.append(f"{name}: {rel} has no line in tools.sha256. Run scripts/setup-tools.sh.")
            continue
        lines.append((rel, digest))

    stale = sorted(set(locked) - {rel for _, rel in tools})
    for rel in stale:
        print(f"{'dropped' if record else 'note'}     stale line (no longer in rokit.toml): {rel}")

    if problems:
        print(f"tools: {len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        return 1
    if record and (added or stale or not LOCK.exists()):
        LOCK.write_text("\n".join(HEADER + [f"{d}  {p}" for p, d in lines]) + "\n", encoding="utf-8")
    suffix = f" ({added} recorded just now)" if added else ""
    print(f"tools: {len(lines)} binaries match tools.sha256{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
