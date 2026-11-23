## 2026-11-10 — bump the pinned Docker base images (node 24-alpine, nginx-unprivileged alpine)

- Re-pinned `node:24-alpine` (root `Dockerfile` builder and `serverXR/Dockerfile`) and `nginxinc/nginx-unprivileged:alpine` to the newest registry digests; same tags, still pinned by digest.
- trivy 0.76.2 (`--scanners vuln`): node image CRITICAL 1 -> 0, HIGH 18 -> 6; nginx image CRITICAL 1 -> 1 (brotli-libs, the newest published build still carries it), HIGH 30 -> 9.
- trivy DS-0002 on the root Dockerfile is a scanner false alarm: the final stage has no USER line but the base image config sets User 101 (nginx).
- Not tested: local image build (no Docker daemon on the agent machine); CI builds it.
