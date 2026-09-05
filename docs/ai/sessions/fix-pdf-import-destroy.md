## 2026-09-06 — a PDF import renders every page and then throws; now it returns them

- `pdfToImageFiles` called `doc.destroy()` on the document proxy. Since pdfjs 5 that method
  does not exist — cleanup belongs to the loading task — so every PDF import rendered its
  pages and then failed on the last line, with the pages already in hand. Found by rendering
  a real 19-page PDF through the production bundle in headless Chromium after the pdfjs 6.3
  bump: identical on 6.2.108, so this predates the bump and is live on prod.
- The function keeps the loading task, destroys that, and treats cleanup as best-effort.
  Guard: `assetFormats.pdf.test.js` mocks pdfjs with a proxy that has no `destroy()`.
- Seen: four pages of a 19-page manual rendered to PNG at 2× in 560 ms, `1679×1191` each.
