# What to test with, and what it costs

Written 2026-08-05, after a session where every bug that mattered was found by
looking at the page in a browser and none of them failed a unit test.

This repo already has more testing machinery than it uses. The question is not
"what should we add" — it is "which instrument for which question", because the
wrong one is either blind or expensive.

## What is already here

| Thing | Where | What it answers |
|---|---|---|
| Vitest | `npm run test` — 1561 tests | Does the logic hold? Free, fast, and blind to everything visual. |
| Server contracts | `npm run test:server-contracts` | Does the API still behave? Spawns a real server. |
| `verify-surfaces.mjs` | `npm run verify:surfaces` | Does every surface render on desktop + 5 devices? Screenshots to `.verify-surfaces/` — **which you then have to open**. |
| `verify-algovrithm.mjs` | `npm run verify:algovrithm` | Does /algovrithm *work when used*: wheel, keys, pause, selection, touch, reduced motion. 15 checks. |
| Playwright MCP | `.mcp.json` | Exploratory driving of a browser from inside a session. |
| context7 MCP | `.mcp.json` | Library docs on demand. |

## The verdict, for this repo

**Write Playwright scripts; do not reach for Playwright MCP by default.**

The MCP is the right tool for one situation: you do not yet know what you are
looking for, and you want to poke at a page. The moment you know what you are
asserting, a script beats it on every axis — it costs no context, it is
committed, it re-runs in CI, and the assertion survives the session that
discovered it. An MCP finding is gone when the transcript is gone.

The cost is not theoretical. Every connected MCP server loads its tool schemas
into the prompt, and the community number that keeps recurring is 30–50% of a
context window consumed before anything is typed — Claude Code's deferred-tool
loading mitigates it (schemas are fetched on demand rather than up front), but
a session that actually uses six servers still pays for six.

**Add Chrome DevTools MCP if and when performance becomes the question.** It is
the only one of these with real performance tracing, plus console and network
introspection. Given this repo now ships hand-written WebGL on the front door,
that is a plausible near-future need. It is Chrome-only, which is fine here.

**Claude in Chrome is the one that sees what the artist sees.** Everything
below runs headless on SwiftShader, a software rasteriser. That is not anybody's
GPU. It proves the logic and the layout; it does not prove the picture on the
machine the work is judged on. This is the same class of error as testing at
`deviceScaleFactor: 1` — see the DPR row in `known-fixes.md`. When a report and
a headless screenshot disagree, the difference is the environment.

## The two measurement traps found the hard way

Both produced confident false failures in the session that wrote this file, and
both will do it again to the next person.

**A WebGL canvas cannot be read back.** The context is created with
`preserveDrawingBuffer: false`, so `drawImage`/`toDataURL` on it returns blank
once the frame has been composited. Read the canvas directly and every frame
looks black — including the ones plainly visible on screen. Screenshots go
through the compositor and are the only honest readback.

**Assert on pixels, not on `getBoundingClientRect`.** A scrolling statement's
box legitimately overlaps a fixed control; what must not happen is text showing
*through* it. A box-intersection test fails a page that is correct, and passes a
page where the text is a faint ghost behind the label — which is a real defect
that shipped here once.

## The rule that has not changed

A green run is not evidence that the product works, and a screenshot you never
opened is not verification. 43 of the defects in `known-fixes.md` are silent
failures and 29 are mobile-only; none of them failed a unit test. The tools
above shorten the loop. They do not replace looking.

Sources for the MCP comparison:
[Chrome DevTools vs Playwright vs Puppeteer MCP (2026)](https://mcp.directory/blog/chrome-devtools-mcp-vs-playwright-mcp-2026) ·
[Driving vs Debugging the Browser](https://stevekinney.com/writing/driving-vs-debugging-the-browser) ·
[Runtime Tools Compared](https://stevekinney.com/courses/self-testing-ai-agents/runtime-tools-compared) ·
[Claude Code MCP server token overhead](https://www.mindstudio.ai/blog/claude-code-mcp-server-token-overhead)
