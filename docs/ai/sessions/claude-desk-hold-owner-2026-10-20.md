## the desk's holds are owned: a session's release no longer reaches the operator's channels

- `serverXR/src/lighting/holds.js` (new): every held (raw) channel carries an owner tag in `state.rawOwners`, keyed like `state.raw`. The caller names it with `owner` (a session or client id); none = `"owner"`, which is what the desk's own interface sends.
- `POST /light/api/raw`: a value takes the channel for the caller; a release (`value: -1`) of somebody else's channel is refused and the reply names the holder (`refused`); `{clear:true}` releases the caller's own (`released`, `kept` by holder); `{clear:true, all:true}` is the explicit release-all. A bad tag is a 400, never `"owner"`.
- Scene recall (route and chase) replaces the recalling hand's holds only (`engine.recallScene(scene, fadeMs, owner)`).
- `GET /light/api/raw` (new) lists every hold with value and holder; `/api/state` carries `rawOwners`. Saved in show.json; an old show loads with every hold `"owner"`.
- UI: Release all / Release held let go of the operator's own, then name other holders and ask before releasing those; a fader somebody else holds says so on hover. Wiki `lighting-desk` updated.
- Scripts tag themselves: `vis-see`, `all-colour`, `aim-test`, `la40-player`, `wheel-walk`.
- Why (ledger N1002): on 10-17 one agent "released its holds" and cleared the owner's live laser settings.
- Behaviour change: an untagged clear no longer releases a tagged caller's holds. Untagged sessions still share `"owner"` with the desk's faders — a session must tag.
- Tests: `serverXR/src/lighting/tests/test-holds.js` (new, in `lighting.test.js`), four checks in `tests/test-http.js`. Not tested: the UI confirm flow in a browser; a real rig.
