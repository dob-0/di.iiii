---
name: game-release
description: "Stage 6 of the di-games routine. Use when playtests are done and a Roblox game goes from private to public: private release, playtesters, the maturity questionnaire, the public release, and which ID, age and money steps belong to a person. Rules read 2026-10-28; re-read them on release day."
---

# game-release: stage 6, private first, then public (Roblox)

- **Makes:** the game live on Roblox with its content label set, and `docs/release.md` with each step and its date.
- **Gate (done when):** the label is set; the game is live; the owner's money, age-check and ID steps are done.
- **Who:** the owner and game-builder. The owner does anything with money, an ID or a consent click.
- **Needs:** stage 4 passed, and the provenance check of stage 5 green (`scripts/check.sh`).

Source of every rule below: the research job's file `roblox-route.md` (2026-10-28), which read the pages
named under "Sources". This plugin did not fetch them again. Most Roblox pages show no date, only the
year. They change: re-read before you release and write the date. HYPOTHESIS means not checked.

## Steps

1. **People first.** An experience is owned by a person or a group; a group the team controls is the better
   owner (HYPOTHESIS). In a user-owned experience Edit access goes only to Roblox friends; a group role
   with "Edit experiences" gives edit rights. Team Create needs an age check before you work with others.
   The account needs 2FA. (Sources 1.)
2. **Publish privately.** Studio, File > Publish; icon, thumbnail, name, genre, description. A new
   experience starts private: only you, users with Edit access, and group members with rights. (2.)
3. **Publish from a script (owed).** Open Cloud Place Publishing: `POST
   https://apis.roblox.com/universes/v1/{universeId}/places/{placeId}/versions?versionType=Published`,
   header `x-api-key`, body `.rbxl` (`application/octet-stream`) or `.rbxlx` (`application/xml`); the key
   needs the universe-places scope with Write for that experience. It does NOT update SurfaceAppearance,
   EditableMesh, PartOperation, BaseWrap or EditableImage: publish from Studio after changing those. (3.)
   The key lives outside git, chat and logs; a safe key store is owed.
4. **Playtesters.** On the Playtest tab add early testers. "Playtesters" limits play to them and to
   Edit/Playtest users; "Friends" on the Public tab limits play to friends. (2.)
5. **Maturity questionnaire.** To go public: File > Publish > Continue, answer the first question, then
   Publish. You answer for the most mature content in the game. You can retake it; a Restricted label can
   never be lowered. With no maturity information Roblox restricts playability for all players. (4.)
   - Labels: Minimal and Mild reach Kids (5-8) and Select (9-15); Moderate reaches Select and standard
     accounts (16+); Content May Vary needs age-checked 16+; Restricted needs age-verified 18+.
   - Fear at the Mild level, in Roblox's list: loud or heavy breathing, a pounding heart, shrieking or
     screaming, creepy-looking NPCs, jump scares, ominous music. How often matters. Moderate fear is, for
     example, characters with disfigured mouths and realistic blood. Blood has its own question; heavy
     blood is 18+ only.
   - A chase game with jump scares and no blood probably comes out Mild (HYPOTHESIS: the questionnaire
     needs a login and was not run).
6. **Public release, all ages.** Account in good standing, at least 2 days old, age check done, 2FA, and
   either Plus or Premium for two months in a row or a refundable fee of 1,000 Robux. Limit: 5
   never-released experiences per day. (2.)
7. **Reach under 16 (Kids 5-8, Select 9-15).** Extra steps: creators under 18 do face age estimation, 18+
   use a government ID; 2FA; a trial limited to age-checked 16+ players until 250 unique plays by highly
   engaged age-checked users in a 60-day window; or a refundable fee of 50,000 Robux, or Plus/Premium for
   two months. (5.)
8. **Check what was never checked:** device settings and phone controls (PC, phone, tablet, console, VR);
   Roblox's IP policy; the Creator Store terms if a store asset is in (game-look).
9. **Record** each step, its date and its page in `docs/release.md`.

Cashing out later (DevEx): age 13+ and at least 30,000 Earned Robux at 0.0038 USD each (6). The owner decides.

## Rules

- Private first, always. Public only after the label is set and the owner says yes.
- A step that costs money or needs an ID is the owner's: say it once, as a short list.
- Never put an API key in git, a chat or a log.
- Do not copy another game's characters, art, music or names.

## Sources (all create.roblox.com/docs/)

1. projects/collaboration
2. production/publishing/publish-experiences-and-places
3. cloud/open-cloud/usage-place-publishing
4. production/promotion/content-maturity (en-us)
5. production/publishing/kids-and-select
6. production/monetization/developer-exchange
