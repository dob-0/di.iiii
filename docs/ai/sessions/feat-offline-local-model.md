## Offline: the festival machine — a model on the table, and three things that reached out

The situation: power, no internet, one machine, everything on hand. Walked on a real
`di` install with every outbound request refused (headless, `page.route` abort). The
app itself loads nothing from anywhere else; the faults were around it.

### The agent node answers from the model on this machine

- `serverXR/src/localModelClient.js` — streams OpenAI-style `/v1/chat/completions`
  from `LLM_BASE_URL` (llama.cpp, Ollama, LM Studio), model `LLM_MODEL`. Same contract
  as the Anthropic client. `<think>` blocks are dropped even when a tag is split across
  two chunks. Connection failures reject as 503 with the code kept.
- `routes/aiChatRoutes.js` — `/api/ai/providers` adds `localModel: {baseUrl, model} | null`,
  local operator only (loopback + `DI_LOCAL=1` or non-production). Order: API key →
  local `claude` → local model. When Claude cannot be reached at all (`ENOTFOUND`,
  `ECONNREFUSED`, …) and nothing has streamed yet, the turn is answered by the local
  model after a `notice` event. A refused key (401) never falls back. Tests:
  `aiChatRoutes.test.js` (fake router, SSE frames read back).
- Agent panel: a local model counts as connected; replies are labelled by the model
  that answered; the notice is shown. `aiChatApi` carries `onNotice`.
- Keeper node: a bare host tries Ollama's `/api/chat` and then `/v1/chat/completions`.
- On a `di` install: `LLM_BASE_URL=http://127.0.0.1:8090` and `LLM_MODEL=…` in
  `~/.di/di.env`. Proven on aylmo: no key, no claude on PATH, a turn answered by
  qwen3-4b through the install's own API.

### Three offline faults, fixed

- **The house font never reached a published page on a local install.** express.static's
  `setHeaders` is `(res, path, stat)` — the helper read the stat as the request and
  matched nothing, so every `/fonts` request from origin "null" came back without
  `Access-Control-Allow-Origin`. Reads the request off `res.req` now; contract test
  boots a server with `CLIENT_DIR`.
- **Armenian 3D text fetched from jsdelivr at render time.** troika's unicode-font-resolver
  defaults to the CDN. `public/unicode-fonts/` vendors the Armenian block and two weights
  of Noto Sans Armenian (36 KB); `troikaFont.js` calls `configureTextBuilder({ unicodeFontsURL })`;
  `troika-three-text` is now a declared dependency; the local-profile include-list
  carries the directory.
- **`di update` died on a data root that is a symlink** (an install pointed at the shared
  local tier): `fs.cp` refused to lay the link over the rehearsal copy. Copies the
  realpath with `dereference` now; test in `updateSafety.test.js`.

Still reaching out, by design or by data: `the-light-put-back`'s page loads three.js and
Google Fonts from CDNs (a work, re-cut owed); `hosq`'s page loads Google Fonts; `/wcc` is
left out of a local build on purpose.
