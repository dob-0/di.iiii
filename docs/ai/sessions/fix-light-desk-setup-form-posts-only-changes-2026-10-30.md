## Light desk: the Setup form posts only what changed (2026-10-30)
- Fault: a desk page loaded with Art-Net in its form posted the whole output over the live USB (enttec) output at 21:00, silently.
- Fix: the form follows the live output on every poll; a change posts only its key (`ui/outputPatch.js`); POST equal to current = no save, no restart; driver flips log `old -> new`.
- Tests: `outputPatch.test.js` (8), `tests/test-http.js` (+1: enabled alone keeps driver; equal POST leaves show.json mtime); `test:http` is not an npm script here, run as `node serverXR/src/lighting/tests/test-http.js`.
- Not tested: the live Mac; the lead ships a test copy. Note: this worktree's node_modules link was empty, re-pointed to di.iiii-agent-door's.
