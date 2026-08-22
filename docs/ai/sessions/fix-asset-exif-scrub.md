## 2026-08-22 — an image whose EXIF could not be stripped is never stored

- `SCRUBBABLE_FORMATS` had no `heif`, so an iPhone HEIC passed the mime filter, failed the
  scrubber with `unsupported-format`, and was stored byte-for-byte with its GPS
  coordinates, device serial and capture time — on URLs served to anyone who has them.
  `unsupported-format` read as benign and was in fact the leak.
- **AVIF was leaking the same way and nobody knew.** sharp reports an AVIF's format as
  `heif`, so the `avif` entry in the set was dead code and every AVIF upload kept its EXIF.
- **The two Google Drive import loops never called the scrubber at all**, writing whatever
  Drive handed them straight to the same public asset URLs. Plain JPEGs with GPS included.
- The invariant is now the other way round: anything that cannot be scrubbed is refused
  with a 415 and its temp file deleted, rather than stored verbatim. What counts as an
  image is decided by magic-byte sniffing — ISO-BMFF still-image ftyp brands included,
  video brands deliberately excluded — not by the mime type the client claims.
- Studio's asset input had no `accept` at all, so iOS never transcoded on pick; it now
  matches Raw's. A rejected import lands in the activity feed with the server's reason
  instead of being a dead button.
- The new guard was watched failing against the unfixed code: the HEIC was stored, 200
  where 415 was expected.

**Still undone, and it needs a phone.** This machine's libvips has the HEIF container but
no HEVC decoder, and there is no `.heic` file on it, so the rejection path is proven with a
genuine HEIC container header whose payload will not decode — the same state a real photo
reaches here, but an inference rather than a photograph. Put one real iPhone photo through
the upload button before relying on this.
