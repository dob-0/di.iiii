## 2026-11-04 — three written rules enforced in CI: session notes on dev/main, "room" case-insensitive, tools/lint-words.sh

- check-agent-docs.mjs: on CI's detached HEAD the branch now comes from GITHUB_HEAD_REF (pull_request) or GITHUB_REF (push); merge-queue runs are skipped. dev/main fail on a session note not in docs/ai/sessions-baseline.txt (the 242 existing notes are untouched and listed there).
- copyVocabulary.test.js: Room is case-insensitive; 268 hits (249 distinct strings) at widening time are in src/copyVocabulary.room-baseline.json, new ones fail, fixed ones must leave the baseline.
- tools/lint-words.sh added (node, not Vale: reason in its header), wired as `npm run lint:words` in ci.yml.
- Owed: fold the 242 notes; turn the 249 baselined strings into Scene/space wording (owner's pass on the wiki).
