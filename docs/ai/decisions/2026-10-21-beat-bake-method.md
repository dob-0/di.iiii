# 2026-10-21 — Beat Grid: the baked format and the bake method (UNVALIDATED)

Owner 2026-10-21: "yes build all 12" — item "Beat: music to wires (beats, bars and bands)".
This note is written before the code, as the task asked. The node it backs is
`signal.beatgrid` **Beat Grid** (`src/project/nodes/signal.beatgrid/`), a READER only.

## Why baked, not live

Two seekable pieces in the works read per-track arrays (three bands and a list of
beat times) instead of an AnalyserNode, so that the picture at second *t* is the same
every time *t* is played or seeked to. A live analyser cannot be seeked. Beat Grid
follows the same rule: its outputs are a pure function of (analysis, seconds).
The live side stays where it is: Sound and Microphone already give Volume and
Low/Mid/High of whatever is playing now.

## The format (version 1, JSON)

```json
{
  "beats": [0.512, 1.021, 1.530],
  "bands": { "rate": 30, "low": [0, 0.4], "mid": [0.1, 0.2], "high": [0, 0.05] },
  "beatsPerBar": 4,
  "downbeat": 0,
  "strong": [0, 4, 8]
}
```

- `beats` (required): seconds into the track, strictly rising. A list that does not
  rise is refused whole (the node says "no analysis"), never sorted.
- `bands` (optional): `rate` frames per second; `low`/`mid`/`high` arrays of 0..1, read
  linearly between frames and held at the end. Missing → Low/Mid/High read 0.
- `beatsPerBar` (optional, 1..32, default 4) and `downbeat` (optional, index of the
  first bar's first beat, default 0) give Beat (1..beatsPerBar) and Bar.
- `strong` (optional): beat indices that count as strong. Missing → the bar downbeats.

Not matched: the exact field names inside the two seekable pieces were not readable from
this cloud session (they are project content, not in the repo); the works compute strong
beats as "top 15 % gaps, else every 4th beat", and only the "every 4th" half is the
default here. A converter from their arrays to this format is owed.

## The bake method (chosen, not yet implemented, not yet measured)

Onset strength plus tempo plus dynamic-programming beat placement:
D. P. W. Ellis, "Beat Tracking by Dynamic Programming", Journal of New Music Research
36(1), 2007, pp. 51–60.

1. Mono, resample to 8 kHz; STFT 32 ms window, 4 ms hop; 40-band mel spectrogram in dB.
2. Onset strength: half-wave rectified first difference over time, summed across bands,
   high-passed, normalised to unit standard deviation.
3. Global tempo: autocorrelation of the onset envelope weighted by a log-Gaussian
   centred on 120 bpm (σ = 1.4 octaves); the peak gives the target beat period τ.
4. Beats: dynamic programming maximising onset strength at beats minus α·(log(gap/τ))²
   (α = 680 in the paper); backtrace from the best end.
5. Bands: RMS energy of the 20–250 Hz, 250–2000 Hz and 2–8 kHz ranges at `rate` frames per
   second, each scaled to 0..1 by its own 99th percentile over the track.

An existing implementation of steps 1–4 is `librosa.beat.beat_track` (ISC licence).
Where a DJ library already holds a beat grid (rekordbox, read with pyrekordbox 0.4.4,
MIT), that grid is preferred to a bake: a human checked it.

## Status: UNVALIDATED

Not measured. Before any piece depends on a bake: hand-tap beats on 3 tracks of
different kinds, and report for each the share of baked beats within ±70 ms of a tapped
beat (the F-measure window used in MIREX beat tracking). Until then only the reader is
built; its tests use made-up grids.
