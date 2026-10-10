## 2026-10-10 — MCP SDK 2.3.0 with its licence record corrected (replaces #832)

- Dependabot's #832 failed because the stack table said MIT and 2.3.0 says Apache-2.0 (checked in the package.json and LICENSE of the 2.3.0 tarball). This branch carries the same serverXR bump plus the corrected record in `src/kit/kitStack.js`.
- Apache-2.0 is compatible with this repo's AGPL-3.0 (FSF licence list: Apache-2.0 is compatible with GPLv3; AGPLv3 §13).
- Owed: the root `package.json` still pins the SDK at 2.1.0 (MIT) for `sdk/mcp.mjs`; bump it separately. #832 can be closed once this merges.
