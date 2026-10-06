## 2026-10-06 — serverXR: proxy-addr 2.0.7 → 2.0.8 (critical advisory blocked every dev deploy)

- Dev deploys of #787 and #788 failed at "Audit dependencies (serverXR)": `npm audit --omit=dev` reported
  GHSA-jqcg-44mw-7w3h (critical, proxy-addr ≤ 2.0.7: IP spoofing via IPv4-mapped IPv6 trust subnet), published
  overnight. The gate did its job.
- Fix: `npm audit fix --package-lock-only --omit=dev` in serverXR — only proxy-addr moves (2.0.7 → 2.0.8, lockfile
  only). `npm audit --omit=dev` after: 0 vulnerabilities.
