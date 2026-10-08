# The "dev copy" label

Gap from the 2026-10-02 hosting audit: ~24 tabs on different addresses, and a dev copy looked exactly like the owner's real di.
Decision: `~/work/di-atlas-hosting/decisions/2026-10-02-local-hosting.md`.

- `di-dev` (di-atlas `tools/di-dev`) starts each dev copy with exactly `VITE_DI_TREE=<tree>` and `VITE_DI_MODE=<frontend|scratch>`.
- When `VITE_DI_TREE` is set, `src/components/TreeChip.jsx` (mounted once in `RootApp`, beside `ModeMark`) shows a fixed bottom-right label:
  `dev copy · <tree> · your di's data` (frontend) or `dev copy · <tree> · SCRATCH data, thrown away` (scratch, danger colour).
- Unset or blank `VITE_DI_TREE` (installed di, production build) renders nothing. An unknown `VITE_DI_MODE` reads as frontend.
- Hidden in `?preview=1`, iframes and the projector output, like `ModeMark`. Logic: `src/utils/devTree.js`. Tests: `src/components/TreeChip.test.jsx`.
- Rectangle, 0 px radius, bottom 10 px: inside the 44 px strip pages keep free for `ModeMark`, below the account button.
