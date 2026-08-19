# fix/ci-playwright-bound2 — the bound was tighter than a cold install, and the retry tripped over its own corpse

## What changed

Two lessons from #184's first version, both learned on live runs:

1. **150s per attempt was tighter than an honest install.** `--with-deps`
   apt-installs on the fresh runner and a cold cache downloads ~160MB — the
   bound failed the very deploy it was protecting (run 32305518130). Now 300s
   per attempt, `timeout-minutes: 11` on the step.
2. **Killing npx orphans the apt-get underneath it**, which keeps holding
   `/var/lib/dpkg/lock-frontend`, so a naive retry dies instantly on the lock
   (run 32306276793: "held by process 2863 (apt-get)"). The retry now buries
   the orphan first: `pkill` apt/dpkg, wait for the lock to clear,
   `dpkg --configure -a`, then reinstall.

A true stall still self-heals once or goes red in eleven minutes; slow honest
installs finish.
