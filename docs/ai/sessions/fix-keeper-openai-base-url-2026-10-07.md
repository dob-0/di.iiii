## 2026-10-07 — The Keeper accepts the OpenAI base URL a local server prints, and the palette finds it by "local llm"

- **What was wrong (measured on dev, 2026-10-07).** A Keeper node pointed at `http://127.0.0.1:8090/v1` — the
  address llama.cpp, vLLM and LM Studio give their clients — POSTed to `/v1` itself, got a 404 from a healthy
  server and said "The keeper answered 404 Not Found." Only a bare host or a full `/v1/chat/completions` path worked.
  Separately, the palette matched a node on its label, id, category and `keywords`; `agent.keeper` had no keywords,
  so "local llm", "llama" and "openai" found nothing.
- **Why it is here.** Both were fixed on a branch (`fix/keeper-openai-endpoint`) cut on 2026-08-11 that never got a
  PR. The bare-host fallback that landed since (Ollama's path first, the OpenAI path second) did not cover a pasted
  `/v1`. Nothing on that branch was applied blind: the tests were re-written against today's `askKeeper`, run on
  unfixed dev, and watched fail before the fix.
- **What changed.** `resolveKeeperEndpoints` completes a path ending in `/v1` to `/v1/chat/completions`; a bare host
  and a full path behave exactly as before. `agent.keeper` carries search keywords (the same words as the
  keeper-node wiki article's tags). The wiki article says both, and its `updated` is bumped.
  Guards: `keeperClient.test.js`, `nodeRegistry.test.js`; ledger row in `docs/ai/known-fixes.md`.
- **Not ported, on purpose.** The old branch also swapped the setup placeholders to one machine's llama.cpp port
  and model tag (`:8090/v1`, `qwen3-4b`). That is one install's setup, not a default; the placeholders stay as
  they are.
- **Undone / owed.** Not seen in a browser (this lane may not start one). To look: Raw → add a Keeper from the
  palette by typing "llama" → point it at a llama.cpp or `di keeper get` server written as `http://127.0.0.1:<port>/v1`
  → Ask; the reply should appear instead of a 404. A URL with a query string after `/v1` is not handled (the bare-host
  path has the same limit); nobody has pasted one.
