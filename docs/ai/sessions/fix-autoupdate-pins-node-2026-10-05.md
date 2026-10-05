## 2026-10-05 — di autoupdate restarts di with the node it was installed with

- Measured on aylmo: after each autoupdate (15:31 → 10b1e514) the installed di stayed down. server.log:
  `listen EACCES: permission denied 127.0.0.1:443` under Node v26.10.0; autoupdate.log: `failed … pkexec setcap
  cap_net_bind_service=+ep /usr/bin/node` (a password prompt nobody was there to answer).
- Cause: `di-autoupdate.service` set no PATH. systemd's user PATH puts /usr/bin first, so the shim's
  "whatever node the machine has" became /usr/bin/node (v26, no bind capability) instead of the v22 that
  `di up` uses from a shell.
- Fix: `unitTexts` writes `Environment=PATH=<dir of the node that ran \`di autoupdate on\`>:/usr/local/bin:/usr/bin:/bin`.
  Guard test red without it (1 failed), green with it (14/14).
- To take effect on an install: `di autoupdate on` once after updating (it rewrites the unit).
- Owed (named): di still has no supervisor that restarts a crashed server (draft #733).
