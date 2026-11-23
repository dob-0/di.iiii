---
name: crew-channel
description: Run a production's crew communications as their own role (the crew desk), not from the lead chat — one-line intents from the lead logged as approvals, the event feed, a status card that says when the next update comes, the PACE tiers per production with their drill, and the crew's onboarding the day before. Use whenever a show night has a crew group.
---

# crew-channel

**Needs:** di.bo's crew door (slice S05: post, edit, delete, pin, the outbox), its event feed (S06), the production's roster (S07), the venue profile (`crew` names no secret; the group id lives in di.bo's roster). Rule sources (owner's hard rules): "Send only with him present" 2026-10-22, quiet hours 23:00–08:00 (no messages to people), "Every message reaches the work" 2026-10-14, "Usage — no brainless usage" 2026-09-30. Method: communications is its own role that reports to command and posts with command's approval (Google SRE book ch. 14, the Communications role; FEMA ICS, the Public Information Officer; PagerDuty, the customer liaison). Every production is an example, never a default. Words: `docs/ai/vocabulary.md`.

## 1. The crew desk is a role, not the lead
- A small executor (Sonnet) runs it. Its context: the card, the roster, the last 50 crew lines. At most 80 tool calls, then a hand-over file and a fresh desk.
- The lead sends one-line intents ("tell the crew: doors move to 22:30"). The desk logs each as `approved by lead at hh:mm` and posts through di.bo's door; it never posts what the lead did not intend.
- Measured per post: tokens (target under 30 k) and the time from ask to delivered (target p50 under 30 s). Both targets are ours, unvalidated. Baseline, 31 Oct from the lead chat: median 2.8 min, p90 7.2 min (n = 12), 38.8 % of the lead's tokens.

## 2. The card and the cadence
- One status card per production, edited in place, ending with "next update by hh:mm" (PagerDuty: always say when the next update comes; avoid content-less updates).
- The interval is the owner's number (PagerDuty's 20 min is for customer incidents: a reference only, unvalidated here).
- Crew lines reach the desk through the event feed (S06), never an ssh poll.

## 3. PACE per production
Written in the production record before the day, each tier with the trigger that moves to the next (Indiana DHS PACE template; the triggers and the drill are ours):
- **Primary:** the group card.
- **Alternate:** a DM card to each crew member.
- **Contingency:** the venue-LAN page (the card served on the place's own network).
- **Emergency:** voice, or the paper call sheet.

Drill before doors: the desk moves one tier down on purpose, every crew member answers, the time is written.

## 4. Onboarding the day before
Each crew member presses /start through the production's invite, gets the card and says their role. The desk checks the roster against who answered and names the missing ones to the lead in one line.

## 5. Rules that stand
No message to a person without the owner present or his word. Nothing from 23:00 to 08:00 unless his show-mode word for this production says so (gap G03: his decision). A failed send alerts the owner once (the outbox, S05). Every message he sends reaches the work.

## Not validated, stated
The cadence, the targets and the drill's pass time are ours. The desk role ran once by hand (1 Nov, from 01:53); its cost is not measured yet.
