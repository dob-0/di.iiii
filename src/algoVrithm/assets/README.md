# algovrithm assets

Drop media in this folder and it appears in the director panel's bin. Nothing
else to do — no upload, no manifest, no database row.

Recognised: `.png` `.jpg` `.jpeg` `.webp` `.gif` `.avif` · `.mp4` `.webm` `.mov`
· `.glb` `.gltf`. Anything else is ignored (this README included).

The filename becomes the asset's id, so `ritual-01.png` is `ritual-01`. An edit
list pasted back into `sequences/index.js` refers to that id — **renaming a file
orphans any clip using it**.

**Video is NOT committed — `.mp4`/`.webm`/`.mov` here are gitignored.** The reel
footage is ~190MB and its licensing is not settled, and a public repo is the
wrong place to be wrong about either: a clone is forever, and so is a fork of
one. Small own-work assets are still tracked (`scan.glb` is the photogrammetry
scan the scan beat reads), so a fresh clone builds, lints and runs — the reel
globe simply finds an empty bin and draws no cells.

To work on the footage beats, drop your clips in this folder. They are picked up
by the same glob, they just never leave your machine.
