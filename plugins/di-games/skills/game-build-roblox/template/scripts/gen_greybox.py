#!/usr/bin/env python3
"""Turn map/plan.json into Rojo .model.json files: plain anchored blocks, no art.

Run:    python3 -I scripts/gen_greybox.py           writes map/*.model.json
Check:  python3 -I scripts/gen_greybox.py --check   writes nothing; exit 1 if a file differs from the plan
Standard library only. The plan is checked first and the script stops on a mistake.
Units are studs. x runs east, z runs south, y is up.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map"

WALL_COLOR = [0.55, 0.55, 0.52]
FLOOR_COLOR = [0.30, 0.28, 0.26]
CEIL_COLOR = [0.22, 0.22, 0.22]
LAMP_COLOR = [1, 0.95, 0.8]
REQUIRED = ["wall_height", "thickness", "door_width", "door_height", "areas", "walls", "doors", "spawn"]


def part(name, pos, size, color, **extra):
    props = {
        "Anchored": True,
        "Size": [round(v, 3) for v in size],
        "Position": [round(v, 3) for v in pos],
        "Color": color,
        "Material": "Concrete",
    }
    props.update(extra)
    return {"Name": name, "ClassName": "Part", "Properties": props}


def marker(name, pos, size, **extra):
    """Invisible, no collision, ignored by raycasts (CanQuery false)."""
    props = {"Transparency": 1, "CanCollide": False, "CanQuery": False, "CanTouch": False}
    props.update(extra)
    return part(name, pos, size, [1, 1, 1], **props)


def inside(pt, area):
    """pt is [x, z] or [x, y, z]; only x and z count."""
    return area["min"][0] <= pt[0] <= area["max"][0] and area["min"][1] <= pt[-1] <= area["max"][1]


def on_wall(pt, w):
    (ax, az), (bx, bz) = w["a"], w["b"]
    return (ax == bx == pt[0] and min(az, bz) <= pt[1] <= max(az, bz)) or (
        az == bz == pt[1] and min(ax, bx) <= pt[0] <= max(ax, bx)
    )


def check(plan):
    problems = [f"plan.json has no '{key}'" for key in REQUIRED if key not in plan]
    if problems:
        return problems
    areas = plan["areas"]
    names = [a["name"] for a in areas]
    if len(set(names)) != len(names):
        problems.append("two areas have the same name")
    for a in areas:
        if not (a["min"][0] < a["max"][0] and a["min"][1] < a["max"][1]):
            problems.append(f"area {a['name']}: min must be below max on both axes")
    for w in plan["walls"]:
        if w["a"][0] != w["b"][0] and w["a"][1] != w["b"][1]:
            problems.append(f"wall {w} is not axis-aligned")
    for d in plan["doors"]:
        if not any(on_wall(d["at"], w) for w in plan["walls"]):
            problems.append(f"door {d['name']} is not on a wall")
    if not any(inside(plan["spawn"], a) for a in areas):
        problems.append("spawn is outside every area")
    for z in plan.get("zones", []):
        if not any(inside(z["min"], a) and inside(z["max"], a) for a in areas):
            problems.append(f"zone {z['name']} is not inside one area")
    for m in plan.get("markers", []):
        if not any(inside(m["at"], a) for a in areas):
            problems.append(f"marker {m['name']} is outside every area")
    used = [z["name"] for z in plan.get("zones", [])] + [m["name"] for m in plan.get("markers", [])]
    if len(set(used)) != len(used):
        problems.append("two zones or markers have the same name")
    return problems


def build_walls(plan):
    h, t = plan["wall_height"], plan["thickness"]
    dw, dh = plan["door_width"], plan["door_height"]
    gaps = [(d["at"], dw, dh) for d in plan["doors"]]
    parts = []
    n = 0
    for w in plan["walls"]:
        (ax, az), (bx, bz) = w["a"], w["b"]
        horizontal = az == bz
        lo, hi = (min(ax, bx), max(ax, bx)) if horizontal else (min(az, bz), max(az, bz))
        fixed = az if horizontal else ax
        cuts = []
        for at, width, height in gaps:
            if on_wall(at, w):
                c = at[0] if horizontal else at[1]
                cuts.append((c - width / 2, c + width / 2, height))
        cuts.sort()
        cursor = lo
        pieces = []  # (start, end, y0, y1)
        for s, e, height in cuts:
            if s > cursor:
                pieces.append((cursor, s, 0, h))
            if height < h:
                pieces.append((s, e, height, h))  # lintel over the door
            cursor = e
        if cursor < hi:
            pieces.append((cursor, hi, 0, h))
        for s, e, y0, y1 in pieces:
            n += 1
            length, height = e - s, y1 - y0
            mid, ymid = (s + e) / 2, (y0 + y1) / 2
            if horizontal:
                pos, size = [mid, ymid, fixed], [length, height, t]
            else:
                pos, size = [fixed, ymid, mid], [t, height, length]
            parts.append(part(f"Wall_{n:03d}", pos, size, WALL_COLOR))
    return parts


def build(plan):
    """Returns {path: file text} for every map file the plan makes."""
    h = plan["wall_height"]
    out = {}

    def add(name, children):
        out[MAP / f"{name}.model.json"] = json.dumps({"ClassName": "Folder", "Children": children}, indent=2) + "\n"

    add("Walls", build_walls(plan))

    floors, ceilings, lights = [], [], []
    for a in plan["areas"]:
        (x0, z0), (x1, z1) = a["min"], a["max"]
        size = [x1 - x0, 1, z1 - z0]
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        floors.append(part(f"Floor_{a['name']}", [cx, -0.5, cz], size, FLOOR_COLOR))
        ceilings.append(part(f"Ceiling_{a['name']}", [cx, h + 0.5, cz], size, CEIL_COLOR))
        lamp = part(
            f"Light_{a['name']}", [cx, h - 0.5, cz], [2, 0.4, 2], LAMP_COLOR, Material="Neon", CanCollide=False
        )
        lamp["Children"] = [
            {
                "Name": "Lamp",
                "ClassName": "PointLight",
                "Properties": {"Color": LAMP_COLOR, "Range": 26, "Brightness": 1},
            }
        ]
        lights.append(lamp)
    add("Floors", floors)
    add("Ceilings", ceilings)
    add("Lights", lights)

    spawn = {
        "Name": "PlayerSpawn",
        "ClassName": "SpawnLocation",
        "Properties": {
            "Anchored": True,
            "Neutral": True,
            "Duration": 0,
            "Size": [6, 1, 6],
            "Position": plan["spawn"],
            "Transparency": 0.5,
        },
    }
    add("Markers", [spawn] + [marker(m["name"], m["at"], [1, 1, 1]) for m in plan.get("markers", [])])

    zones = []
    for z in plan.get("zones", []):
        (x0, z0), (x1, z1) = z["min"], z["max"]
        zh = z.get("height", 8)
        zones.append(
            marker(z["name"], [(x0 + x1) / 2, zh / 2, (z0 + z1) / 2], [x1 - x0, zh, z1 - z0], CanTouch=True)
        )
    add("Zones", zones)
    return out


def main():
    args = sys.argv[1:]
    if any(a != "--check" for a in args):
        print(__doc__)
        return 2
    plan = json.loads((MAP / "plan.json").read_text())
    problems = check(plan)
    if problems:
        print("plan.json has problems:")
        for p in problems:
            print("  -", p)
        return 1
    expected = build(plan)
    stale = sorted(p for p in MAP.glob("*.model.json") if p not in expected)
    if "--check" in args:
        bad = [p.name for p, text in expected.items() if not p.exists() or p.read_text() != text]
        bad += [f"{p.name} (not in the plan)" for p in stale]
        if bad:
            print("map/ differs from map/plan.json:", ", ".join(bad))
            print("run: python3 -I scripts/gen_greybox.py   and commit the files")
            return 1
        print(f"ok: {len(expected)} map files match plan.json")
        return 0
    for path, text in expected.items():
        path.write_text(text)
    print(f"ok: wrote {len(expected)} files in map/")
    for path in expected:
        print("  ", path.relative_to(ROOT), len(json.loads(path.read_text())["Children"]), "instances")
    for p in stale:
        print("  stale (not in the plan, delete it):", p.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
