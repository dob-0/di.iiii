# `di show-ready` — is the show complete, here and in the cloud, with no internet?

Rule (owner, 2026-11-13, N4283/N4288): everything for a show lives in the cloud
(dev.diiii.xyz; each user has a private and a public part) AND every show machine
keeps a full local copy that runs with no internet. On 2026-11-12 one machine was
switched off and the others could not get the work: some scenes were only on it.

    di show-ready SPACE [PROJECT] [--host URL] [--json]

Reads only. Writes nothing, prints no token and no file contents.

## What it checks

| Check | How | Reported as |
|---|---|---|
| The show's list | this install's database (projects of the space, deleted ones left out) and each project's `document.json`; assets = everything in the project's `assets/` folder plus every `assetId` / `asset` / `assetRef` / `/assets/<hash>` the document names (the same files `di save` reads) | |
| Local | the bytes exist (project folder or the space's `blobs/`), sha256 equals the asset id, size equals the reference | DIFFERENT |
| Cloud | with the stored `di login` (token read from `~/.config/di/credentials.json`, header only): space and project exist, same visibility (private stays private), every asset is there with the same size | ONLY HERE, ONLY CLOUD, DIFFERENT |
| Offline | any `http(s)` address in a document that is not localhost, `*.localhost`, the host, or an XML namespace | NEEDS INTERNET |

A private project the cloud does not list, or a space the cloud gives this login no
access to, is **ONLY HERE**: lost if this machine is lost.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | nothing missing: READY |
| 1 | a problem (any group above, or the space/project is not on this machine) |
| 2 | the cloud could not be asked: host down, no login, login refused. The result is UNKNOWN, never READY |

`--json` prints the same result for a script (`exit`, `ready`, and the groups as lists).

## Before a show, on each show machine

1. `di login` once (the session is kept; `di whoami` shows it). Without it the result is exit 2.
2. `di show-ready <space>` while online. Fix every line: ONLY HERE means carry it to the
   cloud (`di open FILE --to https://dev.diiii.xyz`, or follow it from dev); ONLY CLOUD
   means follow the space (`di follow`) so the copy lands here.
3. Run it again until it prints `READY`, exit 0. Then the machine can be taken offline.

## Not covered (v1)

- Light show (`lighting/show.json`), space scene (`scene.json`), laser looks and other
  files outside project documents are not listed; only project documents and their assets.
- Cloud asset check compares size, not bytes (an asset id is its sha256 for hash ids; the
  host is not asked to re-hash).
- The offline scan reads project documents, not the app's own code or fonts.
- Needs a login that is a member of the space to see its private projects.

Code: `scripts/di/showReady.mjs`; tests: `scripts/di/showReady.test.js`.
