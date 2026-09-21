## 2026-09-21 — the front door pulled 12.84 MB of its 13.04 MB over one 3.2 MB file

Measured on dev.diiii.xyz at real device pixel ratios (1440×900@2, 390×844@3) before
anything was touched: 74 requests, 13.04 MB, and four of those requests were the same
STL. Two causes, one code and one data — both fixed, and both measured again after.

**The code half (this branch).** Every asset fetch picked `cache: 'no-store'` when the
id was not a sha256. The reasoning was right — a legacy id is mutable, so its bytes
cannot be trusted unchecked — but `no-store` forbids *storing* the response, so there
is nothing to revalidate against and each mount re-downloads the whole file. The server
has been sending `etag` and `last-modified` on these all along and answers a conditional
GET with a 0-byte 304. `assetFetchCacheMode()` now makes the choice in one place:
`default` for content-addressed, `no-cache` for legacy — stored, and checked with the
server before every reuse, so a replaced asset still arrives fresh. Five call sites
(`ModelObject` ×2, `assetSources`, `useAssetRestore`, `useSceneApply`). Proved in
Chromium against dev: three fetches of the same legacy asset, 9.63 MB → 3.21 MB.
`contentAddressedAsset.test.js` fails the build if any mode returns `no-store` again.

**The data half (not in this branch — it is room data).** The front room held two
entities named `model`, at (-6,0,0) and (-2,0,3), each carrying its own copy of
`Yeva skulpture (heart).stl` — the two assets are byte-identical (same md5, two uuid
ids from before content addressing), and neither is inside the arrival camera's view.
The owner said remove both. Applied as `deleteEntity` ops on local (v166 → 168) and on
staging (v238 → 240), the room looked at on both afterwards: wordmark, line and all
four doors intact. **dev.diiii.xyz/ is now 0.20 MB / 70 requests on desktop**, from
13.04 MB. Prod was not touched.

Still open on the front door, untouched by this: the arrival frame still cuts the outer
two doors on a phone (the hardcoded `0.8,0.45,1` auto-frame), and the two orphaned
3.2 MB assets are still in the space's storage — loose files nothing references.
