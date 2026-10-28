## show-checkpoint guards (2026-10-20)

Two safety fixes in `scripts/rigbuild/show-checkpoint.mjs`: the default token file only goes to the default api (else `--token-file` is required, refused before any call), and restore refuses a project newer than the saved version unless `--force-overwrite`. Tests 6 -> 8 (2 new failed on dev first). Not tested live against a real serverXR; the rule is covered with the fake client. RESTORE.md text and known-fixes updated.
