# algovrithm assets

Drop media in this folder and it appears in the director panel's bin. Nothing
else to do — no upload, no manifest, no database row.

Recognised: `.png` `.jpg` `.jpeg` `.webp` `.gif` `.avif` · `.mp4` `.webm` `.mov`
· `.glb` `.gltf`. Anything else is ignored (this README included).

The filename becomes the asset's id, so `ritual-01.png` is `ritual-01`. An edit
list pasted back into `sequences/index.js` refers to that id — **renaming a file
orphans any clip using it**.

These files are committed to the branch on purpose. Unlike every other di.iiii
space, algovrithm's scene is code rather than a project document, and its media
follows the same rule: clone the branch and the piece is complete, with no
content to pull down from a server first.

## Compress video before adding it — and this is the recipe

The reels are shown about 1.4 m wide on a 7 m shell, so anything above ~540p is
decoded and then thrown away, thirty-one times over. The library was re-encoded
to that in August 2026: **189 MB → 65 MB**, and at the size the piece actually
displays them the two are indistinguishable — the datamosh artefacts, which are
the point, survive intact. Match it when adding a clip:

```bash
ffmpeg -i in.mp4 -vf "scale=trunc(min(540\,iw)/2)*2:-2" \
  -c:v libx264 -crf 30 -preset slow -c:a copy -movflags +faststart out.mp4
```

`-c:a copy` is not optional: the reels are muted until the first gesture and
then **unmuted** (see `reelPlayers.js`), so the audio track is part of the piece.
Video frame counts are unchanged by the above; only the trailing audio padding
is trimmed to match.

This matters beyond git: every byte here ships in `dist/`, and in the artifact
`curl … /get | sh` downloads.
