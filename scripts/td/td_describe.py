#!/usr/bin/env python3
"""td_describe — read TouchDesigner .toe/.tox files headless and write one .md per project.

How: copy the file to a temp dir, run Derivative's own `toeexpand.exe` (TouchDesigner 2023.11600,
under the td-soda Wine prefix; console tool, no window), then parse the expanded text network:
every `<op>.n` file starts with `FAMILY:type` and lists its inputs; `<op>.parm` holds parameters;
DAT text sits in `<op>.text`. Nothing is opened in TouchDesigner, nothing is written next to the
source except `<file>.md`, plus one `TD_INDEX.md` per root folder.

Usage: td_describe.py ROOT [ROOT ...]   (writes <project>.md next to each project)
"""
import os, re, shutil, subprocess, sys, tempfile, collections, datetime

PREFIX = os.environ.get("TD_WINEPREFIX", os.path.expanduser("~/.local/share/wineprefixes/td-soda"))
WINE = os.environ.get("TD_WINE", os.path.expanduser("~/.local/share/td-wine/soda-9.0-1-x86_64/bin/wine"))
TOEEXPAND = os.path.join(PREFIX, "drive_c/Program Files/TouchDesigner 2023.11600/bin/toeexpand.exe")
ENV = dict(os.environ, WINEPREFIX=PREFIX, WINEDEBUG="-all")

# technique tags: (tag, any of these op types present)
TAGS = [
    ("feedback loop", {"TOP:feedback", "CHOP:feedback"}),
    ("displacement", {"TOP:displace"}),
    ("time / slit-scan / frame cache", {"TOP:cache", "TOP:cacheselect", "TOP:timemachine", "TOP:texture3d"}),
    ("freeze-capable (cache/hold)", {"TOP:cache", "CHOP:hold", "TOP:cacheselect"}),
    ("live camera in", {"TOP:videodevin", "TOP:ndiin", "TOP:syphonspoutin", "TOP:kinect", "TOP:kinectazure"}),
    ("video file in", {"TOP:moviefilein"}),
    ("audio-reactive", {"CHOP:audiofilein", "CHOP:audiodevin", "CHOP:audiospectrum", "CHOP:analyze", "CHOP:audioband"}),
    ("GLSL shader", {"TOP:glsl", "TOP:glslmulti", "MAT:glsl", "POP:glsl"}),
    ("particles", {"SOP:particle", "TOP:particlesgpu", "COMP:particlesgpu", "POP:particle"}),
    ("3D render", {"TOP:render", "COMP:geometry", "COMP:camera"}),
    ("edge / outline", {"TOP:edge"}),
    ("keying / matte", {"TOP:chromakey", "TOP:rgbkey", "TOP:matte", "TOP:nvidiabackground"}),
    ("optical flow", {"TOP:opticalflow", "TOP:nvidiaflow"}),
    ("pixel sort / remap", {"TOP:remap", "TOP:lookup"}),
    ("noise generators", {"TOP:noise", "CHOP:noise", "SOP:noise"}),
    ("text / typography", {"TOP:text", "SOP:text"}),
    ("recording out", {"TOP:moviefileout"}),
    ("MIDI / OSC control", {"CHOP:midiin", "CHOP:midiinmap", "DAT:oscin", "CHOP:oscin"}),
    ("python scripts", {"DAT:execute", "DAT:chopexec", "DAT:datexec", "DAT:panelexec", "DAT:parexec", "DAT:script"}),
]
FILE_PARMS = {"file", "moviefile", "filename", "externaltox", "path"}


def expand(src, work):
    dst = os.path.join(work, "p" + os.path.splitext(src)[1].lower())
    shutil.copy2(src, dst)
    r = subprocess.run([WINE, TOEEXPAND, os.path.basename(dst)], cwd=work, env=ENV,
                       capture_output=True, text=True, timeout=120)
    d = dst + ".dir"
    return d if os.path.isdir(d) else None, (r.stdout + r.stderr).strip()[-300:]


def parse(d):
    ops = {}
    for root, _, files in os.walk(d):
        for fn in files:
            if not fn.endswith(".n"):
                continue
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, d)[:-2]
            try:
                lines = open(path, errors="replace").read().splitlines()
            except OSError:
                continue
            if not lines or ":" not in lines[0]:
                continue
            optype = lines[0].strip()
            inputs, i = [], 0
            while i < len(lines):
                if lines[i].strip() == "inputs":
                    i += 2
                    while i < len(lines) and lines[i].strip() != "}":
                        parts = lines[i].split()
                        if len(parts) >= 2:
                            inputs.append(parts[-1])
                        i += 1
                i += 1
            parms, files_ref = {}, []
            pf = path[:-2] + ".parm"
            if os.path.exists(pf):
                for ln in open(pf, errors="replace"):
                    m = re.match(r"(\w+)\s+\d+\s+(.*)", ln.strip())
                    if m:
                        parms[m.group(1)] = m.group(2)
                        if m.group(1) in FILE_PARMS:
                            q = re.match(r'"([^"]*)"', m.group(2))  # first quoted string = the stored value
                            val = q.group(1) if q else m.group(2).split()[0]
                            if val.strip():
                                files_ref.append(val.strip())
            text = path[:-2] + ".text"
            ops[rel] = dict(type=optype, inputs=inputs, parms=parms, files=files_ref,
                            text=open(text, errors="replace").read() if os.path.exists(text) else "")
    return ops


def chains(ops):
    """For each op nobody consumes (a sink) in the same folder, walk inputs back to sources."""
    by_dir = collections.defaultdict(dict)
    for rel, o in ops.items():
        dirn, name = os.path.split(rel)
        by_dir[dirn][name] = o
    out = []
    for dirn, group in by_dir.items():
        used = {i for o in group.values() for i in o["inputs"]}
        fam_ok = lambda t: t.split(":")[0] in ("TOP", "CHOP", "SOP", "POP")
        sinks = [n for n, o in group.items() if n not in used and o["inputs"] and fam_ok(o["type"])]
        for s in sorted(sinks)[:6]:
            seen, path, cur = set(), [], s
            while cur in group and cur not in seen:
                seen.add(cur)
                path.append(f"{cur} ({group[cur]['type'].split(':')[1]})")
                cur = group[cur]["inputs"][0] if group[cur]["inputs"] else None
            out.append(((dirn or "/") , " ← ".join(path)))
    return out


def resolve(ref, src_dir):
    v = ref.strip('"')
    if not v or v.startswith(("'", "me.", "op(", "parent")) or "+" in v:
        return v, "expression"
    cand = v if os.path.isabs(v) else os.path.join(src_dir, v)
    if re.match(r"^[A-Za-z]:[\\/]", v):
        return v, "Windows path (other machine)"
    return v, "found" if os.path.exists(cand) else "MISSING"


def describe(src):
    work = tempfile.mkdtemp(prefix="tdx-")
    try:
        d, log = expand(src, work)
        if not d:
            return None, f"toeexpand failed: {log}"
        ops = parse(d)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    types = collections.Counter(o["type"] for o in ops.values())
    fams = collections.Counter(t.split(":")[0] for t in types.elements())
    present = set(types)
    tags = [t for t, need in TAGS if present & need]
    refs = sorted({resolve(f, os.path.dirname(src)) for o in ops.values() for f in o["files"]})
    scripts = [(r, o["text"]) for r, o in ops.items() if o["type"].startswith("DAT:") and o["text"].strip()]
    res = [o["parms"].get("resolutionw", "") + "x" + o["parms"].get("resolutionh", "") for o in ops.values()
           if o["parms"].get("resolutionw")]
    info = dict(n=len(ops), fams=fams, types=types, tags=tags, refs=refs, scripts=scripts,
                chains=chains(ops), res=collections.Counter(res).most_common(3))
    return info, ""


def write_md(src, info, err):
    name = os.path.basename(src)
    md = [f"# {name}", "",
          f"Read headless on {datetime.date.today()} by `td_describe.py` (TouchDesigner's own toeexpand, no window). "
          "Built from the file's network, not from running it: how it LOOKS is unchecked.", ""]
    if err:
        md += [f"**Could not read:** {err}", ""]
    else:
        fam = ", ".join(f"{k} {v}" for k, v in info["fams"].most_common())
        md += [f"**Operators:** {info['n']} ({fam})", "",
               f"**Techniques:** {', '.join(info['tags']) or 'none matched'}", ""]
        if info["res"]:
            md += ["**Resolutions set:** " + ", ".join(f"{r} ×{c}" for r, c in info["res"]), ""]
        md += ["## How it is built (signal chains, sink ← … ← source)", ""]
        md += [f"- `{d}`: {c}" for d, c in info["chains"][:12]] or ["- no chains found"]
        md += ["", "## Operators used", ""]
        byfam = collections.defaultdict(list)
        for t, c in sorted(info["types"].items()):
            f, n = t.split(":", 1)
            byfam[f].append(f"{n} ×{c}" if c > 1 else n)
        md += [f"- **{f}**: {', '.join(v)}" for f, v in sorted(byfam.items())]
        md += ["", "## Files it uses", ""]
        md += [f"- `{v}` — {s}" for v, s in info["refs"]] or ["- none"]
        if info["scripts"]:
            md += ["", "## Scripts (DAT text, first lines)", ""]
            for r, t in info["scripts"][:6]:
                first = " / ".join(l.strip() for l in t.splitlines() if l.strip())[:160]
                md += [f"- `{r}`: {first}"]
    with open(src + ".md", "w") as f:
        f.write("\n".join(md) + "\n")


def main(roots):
    for root in roots:
        rows = []
        for dp, dn, fns in os.walk(root):
            dn.sort()
            for fn in sorted(fns):
                if fn.startswith("._") or not fn.lower().endswith((".toe", ".tox")):
                    continue
                src = os.path.join(dp, fn)
                try:
                    info, err = describe(src)
                except Exception as e:  # loud, per file, never silent
                    info, err = None, f"{type(e).__name__}: {e}"
                write_md(src, info, err)
                rel = os.path.relpath(src, root)
                if info:
                    miss = sum(1 for _, s in info["refs"] if s == "MISSING")
                    rows.append(f"| [{rel}]({rel.replace(' ', '%20')}.md) | {info['n']} | {', '.join(info['tags'][:4])} | {miss} |")
                else:
                    rows.append(f"| {rel} | — | FAILED: {err[:60]} | — |")
                print(("ok  " if info else "FAIL") + " " + src, flush=True)
        with open(os.path.join(root, "TD_INDEX.md"), "w") as f:
            f.write(f"# TouchDesigner projects in {os.path.basename(os.path.abspath(root))}\n\n"
                    f"{len(rows)} files, read headless {datetime.date.today()} by td_describe.py. One .md sits next to each file.\n\n"
                    "| file | operators | techniques | missing files |\n|---|---|---|---|\n" + "\n".join(rows) + "\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
