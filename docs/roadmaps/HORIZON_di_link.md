# Horizon: di link — a machine joins through di.iiii and is reachable

Owner, 2026-11-13 (rows N4262, N4280, N4281): guests like Eter, Kiara and Ed have no Tailscale and no ssh. He wants the tailnet's job
covered by di.iiii itself: a machine logs in only through di.iiii, and from then on we can reach it (ssh, its screens), see its show
status, and sync to it. "The next layer for di.iiii that covers the sync part."

A horizon is a layer of the platform written ahead of its build: the goal, the pick, the steps in order, what is built first, what is
owed. This is the first one; the format is this file.

## Today (checked 2026-11-13 on aylmo)
- Tailnet has aylmo, studio-mac, di, r-di, ponyo-1 and others; `ponyo` and Eter/Kiara machines are not reachable (tailscale status; ssh alias list).
- A machine joins a space with four words ("Invite a machine", `docs/architecture/SPEC_follow.md` part C) — that is sync, not reach.
- A show machine can push its status to the di.bo door (`serverXR/src/stage/showStatus.js`, off unless `DI_SHOW_STATUS_PUSH_URL` is set).
- The Monitor (PR #1289) reads machines from `tailscale status`, so a machine off the tailnet is invisible to it.

## Goal
One login, through di.iiii. After it a machine is: (1) in the Monitor, (2) reachable by ssh from our machines, (3) viewable (screen),
(4) syncing its projects from dev. No second account, no Tailscale login for the guest.

## Pick (advised) and runner-up
- **Pick: di issues the tailnet key.** The di join (four words) also asks dev for a tagged, expiring, ACL-limited Tailscale auth key and
  runs `tailscale up --authkey … --ssh` through one di command on the guest machine. Login stays di; reach is Tailscale's, which we run now.
  Cost: nothing new to host; limit: the guest machine still runs the Tailscale client, and our tailnet plan's device and tag limits apply (unchecked).
- **Runner-up: Headscale** (open-source Tailscale control server) with di.iiii as its sign-in, so di owns the whole layer. Cost: one server to run and
  back up; limit: we carry its upgrades and keep Tailscale clients compatible (unchecked).
- Not picked: NetBird (own clients, nothing of ours reuses it today).
- Undo: `tailscale logout` on the guest and delete its key; the di join stays.

## Steps
1. Status over di, no ssh (cheapest, owner's answer 11-13 "over di only"): the show machine runs di with the push on; the Monitor reads it. Owed: where the door's status is read from (di.bo API, unchecked).
2. `di link join`: the four words, then the key request. Server side: dev route that mints a tagged expiring key for a signed-in member (admin only, audited).
3. ACL: guests get ssh from our machines only, never to each other; screens only on loopback through a tunnel (as studio-mac 5900 today).
4. Monitor reads di-joined machines from dev, not from `tailscale status` only.
5. Rehearse on r-di, then a real guest machine with the owner's consent on it.

## Owed
- A consent step on each guest machine (install client, accept). That is a human step: one window, not a hand-back chain.
- Which tailnet limits apply (devices, tags, key lifetime): read the plan, then fix step 2.
