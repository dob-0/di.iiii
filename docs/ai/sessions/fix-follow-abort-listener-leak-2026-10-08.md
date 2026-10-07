## 2026-10-08 — follow requests no longer leave an abort listener on the shared signal

- serverXR/src/httpClient.js added an 'abort' listener per request on the caller's signal and removed it only on abort. A follow shares one AbortController for its life, so 10 000 requests left 10 000 listeners (each holding its request). Now removed on the request's 'close' (helper `linkAbort`).
- New test serverXR/src/httpClientAbortLeak.test.js: 10 000 httpRequest and 10 000 httpDownloadToFile on one signal; listeners before the fix 10 000 each, after 0. Abort of an in-flight request still works.
- Hypothesis H1 of the leak hunt (di-health/leak-2026-10-08). A unit test is not proof this is the cause of the live 13-22 MB/min; measure after the owner restarts the installed di.
