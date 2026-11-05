#!/usr/bin/env python3
"""Build the xr-docs space: the XR handbook, one page per source document.

Run from the repo root:
    python3 spaces/xr-docs/build.py          # write pages + manifests
    python3 spaces/xr-docs/build.py --check  # exit 1 if a page is stale

The repo files stay the one source. Every page here is GENERATED from the
markdown named in PAGES; nothing in pages/ or code/ is edited by hand. Change
the source document, run this, commit both, sync the space.

Rendering: Python-Markdown (BSD, https://python-markdown.github.io/), the
Arch package `python-markdown`; extensions tables, fenced_code, toc,
sane_lists — all bundled with it. No script runs in any page.

The door (code/index.html) also lists every OTHER markdown file in the repo
that talks about XR, found by the same search every build, so the list cannot
drift from the repo underneath it.
"""
import html
import json
import os
import re
import subprocess
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
REL = os.path.relpath(HERE, ROOT).replace(os.sep, '/')
SPACE = 'xr-docs'
REPO = 'https://github.com/dob-0/di.iiii/blob/dev/'
TREE = 'https://github.com/dob-0/di.iiii/tree/dev/'

# Reading order. slug -> (source, title, one line on what it is for)
PAGES = [
    ('production-cycle', 'docs/architecture/XR_PRODUCTION_CYCLE.md', 'The XR production cycle',
     'From a real place to a show that connects in one click, and back: stages, the connect script, the virtual environment, scanning.'),
    ('scene-authoring', '.github/skills/dii-xr-scene-authoring/SKILL.md', 'Authoring an XR scene',
     'How objects, assets and the inspector fit together in a scene, and what to check before XR.'),
    ('xr-creator', 'docs/ai/roles/xr-creator.md', 'The XR creator role',
     'What the role owns and must never touch; WebXR standards, spatial UX, locomotion, AR and VR design.'),
    ('headsets-and-phones', 'docs/ai/one-local-address.md', 'Headsets and phones join',
     'One local address, how a device joins, the guest path for devices without di, and the limits.'),
    ('network-name', 'docs/ai/team-sync-by-network-name.md', 'Every install gets a name',
     'The network name and its own certificate, the wifi door, following a peer by name.'),
    ('ar-scan', 'docs/ai/decisions/2026-10-23-scan-ar-guidance.md', 'The AR scan on Android',
     'Decision record: live guidance while scanning, sources, measurements, the camera-vs-4K tension.'),
]

CODE = [
    ('src/xr/', 'The XR runtime: ExperienceXr, SceneContentXr, availability check'),
    ('src/hooks/useXrAr.js', 'Entering AR / VR from the app'),
    ('src/components/xrFlyControl.js', 'Flying in a headset'),
    ('src/algoVrithm/xrStandpoint.js', 'Where the visitor stands'),
    ('src/scan/ar/xrSource.js', 'The AR scan source'),
    ('scripts/dev-xr.mjs', 'Local HTTPS for headsets (with dev-xr-cert.mjs)'),
    ('serverXR/README.md', 'The server every space runs on'),
]

SEARCH = r'webxr|immersive-(vr|ar)|headset|quest ?[23]|\bvision pro\b|\bXR\b|dev-xr|xr session|enter vr|enter ar'
SKIP = ('docs/ai/sessions/', 'docs/ai/agent-reports', 'spaces/xr-docs/')


def git(*args):
    return subprocess.run(['git', '-C', ROOT, *args], check=True, capture_output=True, text=True).stdout


def content_id(path):
    """A fingerprint of the source text, not of git history: a commit, a
    squash-merge or a shallow clone must not make --check call a page stale."""
    import hashlib
    with open(os.path.join(ROOT, path), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:10]


def strip_frontmatter(text):
    m = re.match(r'---\n(?:.*?\n)?---\n', text, re.S)
    return text[m.end():] if m else text


def page_href(slug):
    return f'/{SPACE}/{slug}'


SRC_TO_SLUG = {src: slug for slug, src, _, _ in PAGES}


def fix_links(body_html, source):
    """Relative links in a source doc point into the repo. Inside a published
    page they would resolve against the srcdoc frame, so: a link to another
    handbook source goes to its page here, any other repo path goes to GitHub,
    and every link gets target=_top (a sandboxed frame strands the visitor
    otherwise — see spaces/main/pages/landing)."""
    base = os.path.dirname(source)

    def resolve(url):
        if url.startswith('#') or url.startswith('//') or re.match(r'^[a-z][a-z0-9+.-]*:', url, re.I):
            return url
        path, _, frag = url.partition('#')
        target = path.lstrip('/') if path.startswith('/') else os.path.join(base, path)
        target = os.path.normpath(target).replace(os.sep, '/')
        if target.startswith('..'):
            return url  # outside the repo: leave it as written
        if target in SRC_TO_SLUG:
            return page_href(SRC_TO_SLUG[target]) + (f'#{frag}' if frag else '')
        return REPO + target + (f'#{frag}' if frag else '')

    def href(m):
        url = html.unescape(m.group(2))
        if url.startswith('#'):
            return f'href="{html.escape(url)}"'
        return f'href="{html.escape(resolve(url))}" target="_top" rel="noopener"'

    def src(m):
        url = resolve(html.unescape(m.group(2)))
        if url.startswith(REPO):  # an image in the repo: the raw file, not the GitHub page
            url = url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/', 1)
        return f'src="{html.escape(url)}"'

    body_html = re.sub(r'href=(["\'])(.*?)\1', href, body_html)
    return re.sub(r'src=(["\'])(.*?)\1', src, body_html)


CSS = """
:root{
  --paper:#f7f7f5; --paper-2:#efefec;
  --ink:#111214; --ink-2:#55595e; --ink-3:#63686d; --rule:#dededa;
  --accent:#0097a3; --accent-ink:#00757f; --accent-soft:rgba(0,151,163,.07);
  --mono:ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --sans:'Inter',-apple-system,'Segoe UI',sans-serif;
}
@font-face{font-family:'Inter';src:url('/fonts/inter-regular.woff') format('woff');font-weight:400 800;font-display:swap;}
*{box-sizing:border-box;border-radius:0 !important;}
html,body{background:var(--paper);}
body{margin:0;color:var(--ink);font:400 16px/1.65 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden;}
a{color:var(--accent-ink);text-underline-offset:2px;}
a:hover{text-decoration-thickness:2px;}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;}
.bar{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;padding:14px clamp(16px,5vw,56px);border-bottom:1px solid var(--rule);
  font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);}
.bar a{color:var(--ink);text-decoration:none;}
.bar .dot{color:var(--accent);}
.bar nav{display:flex;gap:14px;flex-wrap:wrap;}
.bar nav a{color:var(--ink-3);}
.bar nav a[aria-current]{color:var(--accent-ink);box-shadow:inset 0 -2px 0 var(--accent);}
@media (max-width:700px){.bar nav{flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:4px;scrollbar-width:none;}.bar nav a{white-space:nowrap;}}
main{max-width:860px;padding:28px clamp(16px,5vw,56px) 72px;}
.eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0 0 8px;}
h1{font-size:clamp(26px,4vw,38px);font-weight:700;letter-spacing:-0.02em;line-height:1.1;margin:0 0 12px;}
h1 .dot{color:var(--accent);}
h2{font-size:22px;font-weight:700;letter-spacing:-0.01em;margin:44px 0 10px;padding-top:14px;border-top:1px solid var(--rule);}
h3{font-size:17px;font-weight:700;margin:28px 0 8px;}
h4{font-size:15px;margin:22px 0 6px;}
.dek{color:var(--ink-2);font-size:17px;margin:0 0 18px;max-width:62ch;}
.source{font-family:var(--mono);font-size:12px;color:var(--ink-3);border:1px solid var(--rule);background:var(--paper-2);padding:10px 12px;margin:0 0 28px;}
code{font-family:var(--mono);font-size:.88em;background:var(--paper-2);padding:1px 4px;overflow-wrap:anywhere;}
pre{background:var(--paper-2);border:1px solid var(--rule);padding:12px 14px;overflow-x:auto;font-size:13px;line-height:1.5;}
pre code{background:none;padding:0;overflow-wrap:normal;}
blockquote{margin:16px 0;padding:2px 0 2px 16px;box-shadow:inset 2px 0 0 var(--accent);color:var(--ink-2);}
.tablewrap{overflow-x:auto;margin:16px 0;}
table{border-collapse:collapse;font-size:14px;min-width:100%;}
th,td{border:1px solid var(--rule);padding:6px 9px;text-align:left;vertical-align:top;}
th{background:var(--paper-2);font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;}
hr{border:0;border-top:1px solid var(--rule);margin:32px 0;}
img{max-width:100%;}
ol.read{list-style:none;padding:0;margin:0 0 8px;counter-reset:n;}
ol.read li{counter-increment:n;border-top:1px solid var(--rule);padding:14px 0 14px 44px;position:relative;}
ol.read li::before{content:counter(n,decimal-leading-zero);position:absolute;left:0;top:15px;font-family:var(--mono);font-size:13px;color:var(--accent-ink);}
ol.read a{font-weight:700;font-size:17px;text-decoration:none;color:var(--ink);}
ol.read a:hover{color:var(--accent-ink);}
ol.read p{margin:4px 0 0;color:var(--ink-2);}
ol.read .src{font-family:var(--mono);font-size:12px;color:var(--ink-3);}
ul.more{list-style:none;padding:0;margin:0;}
ul.more li{border-top:1px solid var(--rule);padding:8px 0;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;}
ul.more .n{font-family:var(--mono);font-size:12px;color:var(--ink-3);white-space:nowrap;}
footer{font-family:var(--mono);font-size:12px;color:var(--ink-3);border-top:1px solid var(--rule);margin-top:56px;padding-top:14px;}
"""


def shell(title, current, body):
    nav = ''.join(
        f'<a href="{page_href(s)}" target="_top"{" aria-current=\"page\"" if s == current else ""}>{html.escape(t)}</a>'
        for s, _, t, _ in PAGES)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(title)} — XR · di.iiii</title>
<!-- GENERATED by {REL}/build.py — edit the source document, then rebuild. -->
<style>{CSS}</style></head><body>
<header class="bar"><a href="/{SPACE}" target="_top">di<span class="dot">.</span>iiii · XR</a><nav>{nav}</nav></header>
<main>
{body}
<footer>Generated from the di.iiii repo by {REL}/build.py. The repo is the one source: change the document there, not here.</footer>
</main></body></html>
"""


def render_page(slug, src, title, dek):
    text = strip_frontmatter(open(os.path.join(ROOT, src), encoding='utf-8').read())
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists'],
                           extension_configs={'toc': {'permalink': False}})
    body = md.convert(text)
    # The document's own first heading is the page's h1.
    body = re.sub(r'<h1[^>]*>.*?</h1>\s*', '', body, count=1, flags=re.S)
    body = body.replace('<table>', '<div class="tablewrap"><table>').replace('</table>', '</table></div>')
    body = fix_links(body, src)
    # space-sync retargets every bare "diiii.xyz" in a page to the tier it
    # syncs into (step 3b), which is right for a surface's back end and wrong
    # for prose: on dev, "the zone diiii.xyz" would read "dev.diiii.xyz". The
    # entity renders the same text and the sync's pattern does not match it.
    body = re.sub(r'(?<![\w.-])(di-studio|diiii)\.xyz', r'\1&#46;xyz', body)
    head = (f'<p class="eyebrow">XR handbook · {PAGES.index(next(p for p in PAGES if p[0] == slug)) + 1:02d}</p>'
            f'<h1>{html.escape(title)}<span class="dot">.</span></h1><p class="dek">{html.escape(dek)}</p>'
            f'<p class="source">source <a href="{REPO}{src}" target="_top" rel="noopener">{html.escape(src)}</a>'
            f' · text {html.escape(content_id(src))}</p>')
    return shell(title, slug, head + body)


def other_docs():
    core = set(SRC_TO_SLUG)
    out = subprocess.run(['git', '-C', ROOT, 'grep', '-ciE', SEARCH, '--', '*.md'],
                         capture_output=True, text=True).stdout
    rows = []
    for line in out.splitlines():
        path, _, n = line.rpartition(':')
        if path in core or path.startswith(SKIP):
            continue
        rows.append((int(n), path))
    rows.sort(key=lambda r: (-r[0], r[1]))
    sessions = subprocess.run(['git', '-C', ROOT, 'grep', '-liE', SEARCH, '--', 'docs/ai/sessions'],
                              capture_output=True, text=True).stdout.split()
    return rows, len(sessions)


def render_door():
    read = ''.join(
        f'<li><a href="{page_href(s)}" target="_top">{html.escape(t)}</a><p>{html.escape(d)}</p>'
        f'<span class="src">{html.escape(src)}</span></li>' for s, src, t, d in PAGES)
    code = ''.join(
        f'<li><a href="{(TREE if p.endswith("/") else REPO) + p}" target="_top" rel="noopener"><code>{html.escape(p)}</code></a>'
        f'<span class="n">{html.escape(d)}</span></li>' for p, d in CODE)
    rows, n_sessions = other_docs()
    more = ''.join(
        f'<li><a href="{REPO}{p}" target="_top" rel="noopener">{html.escape(p)}</a><span class="n">{n} lines on XR</span></li>'
        for n, p in rows)
    body = f"""<p class="eyebrow">space · {SPACE}</p>
<h1>XR in di.iiii<span class="dot">.</span></h1>
<p class="dek">Everything we have written about XR — headsets, phones, AR and VR, from a real place to a show — gathered in one space for the team. Start at 01 and read down.</p>
<h2>Read in this order</h2>
<ol class="read">{read}</ol>
<h2>Where it lives in the code</h2>
<ul class="more">{code}</ul>
<h2>Everything else that mentions XR</h2>
<p class="dek">Found by searching the repo each time this space is built ({len(rows)} files). Plus {n_sessions} session notes in
<a href="{TREE}docs/ai/sessions" target="_top" rel="noopener">docs/ai/sessions</a>, which record how the work went rather than how it works.</p>
<ul class="more">{more}</ul>"""
    return shell('XR in di.iiii', None, body)


def manifest(project_id, slug, label, entry, publish, note=None):
    m = {
        '$schema': 'https://diiii.xyz/schemas/di-space.schema.json',
        'spaceId': SPACE, 'projectId': project_id, 'label': label, 'mode': 'code',
        'entry': entry, 'include': [], 'assets': [], 'publish': publish,
    }
    if slug:
        m = {**m, 'slug': slug}
        m = {k: m[k] for k in ['$schema', 'spaceId', 'projectId', 'slug', 'label', 'mode', 'entry', 'include', 'assets', 'publish']}
    if note:
        m['note'] = note
    return json.dumps(m, indent=2, ensure_ascii=False) + '\n'


def outputs():
    files = {f'{REL}/code/index.html': render_door(),
             f'{REL}/di-space.index.json': manifest(SPACE, None, 'XR in di.iiii', f'{REL}/code/index.html', True,
                                                    "The door: reading order, code anchors, everything else. Generated by build.py.")}
    for slug, src, title, dek in PAGES:
        files[f'{REL}/pages/{slug}.html'] = render_page(slug, src, title, dek)
        files[f'{REL}/di-space.{slug}.json'] = manifest(f'{SPACE}-{slug}', slug, title, f'{REL}/pages/{slug}.html', False,
                                                       f'Generated from {src} by build.py.')
    return files


def main():
    check = '--check' in sys.argv
    stale = []
    for rel, content in outputs().items():
        path = os.path.join(ROOT, rel)
        old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
        if old != content:
            stale.append(rel)
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, 'w', encoding='utf-8').write(content)
    if check:
        if stale:
            print('stale:', *stale, sep='\n  ')
            sys.exit(1)
        print('xr-docs: every page matches its source')
    else:
        print(f'xr-docs: wrote {len(stale)} file(s)')


if __name__ == '__main__':
    main()
