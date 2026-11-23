# td_describe — read TouchDesigner projects without opening them

Writes one `<file>.md` next to every `.toe`/`.tox` under the given folders (operators by family,
technique tags, signal chains sink ← source, files used and whether they exist, first lines of
scripts), plus one `TD_INDEX.md` per folder. Nothing opens on screen.

How: each file is copied to a temp folder and expanded with Derivative's own `toeexpand.exe`
(ships with TouchDesigner), run under Wine; the expanded text network is parsed.

    python3 scripts/td/td_describe.py ~/Desktop/td-projects [more folders]

Needs: TouchDesigner 2023.11600 installed in a Wine prefix. Defaults: `TD_WINEPREFIX=~/.local/share/wineprefixes/td-soda`,
`TD_WINE=~/.local/share/td-wine/soda-9.0-1-x86_64/bin/wine` (override with those env vars).
First use (Platina, 2026-11-10): 274 files read, 0 failed. It describes how a project is BUILT; how it looks is unchecked.
