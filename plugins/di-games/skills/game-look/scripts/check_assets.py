#!/usr/bin/env python3
"""Checks assets.csv, the provenance file of a di-games game.

Run from the game's repo root:   python3 -I scripts/check_assets.py [path/to/assets.csv]
Standard library only. Exit 0 = every row is complete and its licence is allowed.

Rules (skill game-look): CC0 first; CC-BY needs an author; NonCommercial (NC) never; a Roblox
Creator Store asset only after docs/creator-store-terms-read.md exists (the terms were read).
"""
import csv
import re
import sys
from pathlib import Path

COLUMNS = ["id", "file", "source_url", "licence", "author", "date", "how_used"]
ALLOWED = {"CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "own", "roblox-creator-store"}
NC = re.compile(r"(^|[-_\s])NC([-_\s]|$)|non-?commercial", re.IGNORECASE)
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def check(csv_path: Path, root: Path) -> tuple[int, list[str]]:
    """Returns (number of rows, list of problems)."""
    if not csv_path.exists():
        return 0, [f"{csv_path} does not exist"]
    with csv_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))
    if not rows or [c.strip() for c in rows[0]] != COLUMNS:
        return 0, ["the header must be exactly: " + ",".join(COLUMNS)]
    problems: list[str] = []
    seen: set[str] = set()
    count = 0
    terms_read = (root / "docs" / "creator-store-terms-read.md").exists()
    for number, row in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in row):
            continue
        count += 1
        if len(row) != len(COLUMNS):
            problems.append(f"line {number}: {len(row)} fields, need {len(COLUMNS)}")
            continue
        r = dict(zip(COLUMNS, (cell.strip() for cell in row)))
        where = f"line {number} ({r['id'] or '?'})"
        for column in COLUMNS:
            if not r[column]:
                problems.append(f"{where}: {column} is empty")
        if r["id"] in seen:
            problems.append(f"{where}: id is used twice")
        seen.add(r["id"])
        licence = r["licence"]
        if NC.search(licence):
            problems.append(f"{where}: licence {licence} is NonCommercial; never")
        elif licence and licence not in ALLOWED:
            problems.append(f"{where}: licence {licence} is not one of {sorted(ALLOWED)}")
        if licence == "roblox-creator-store" and not terms_read:
            problems.append(f"{where}: Creator Store terms not read (docs/creator-store-terms-read.md is missing)")
        if r["date"] and not DATE.fullmatch(r["date"]):
            problems.append(f"{where}: date {r['date']} is not YYYY-MM-DD")
        if r["source_url"] and licence != "own" and not r["source_url"].startswith(("https://", "http://")):
            problems.append(f"{where}: source_url must be an http(s) address")
        path = r["file"]
        if path and not path.startswith("roblox:") and not (root / path).exists():
            problems.append(f"{where}: file {path} does not exist")
    return count, problems


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "assets.csv"
    count, problems = check(csv_path, root)
    if problems:
        print(f"assets: {len(problems)} problem(s) in {csv_path.name}:")
        for p in problems:
            print("  -", p)
        return 1
    print(f"assets: {count} row(s), 0 problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
