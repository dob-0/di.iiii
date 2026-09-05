## 2026-09-06 — Continue with Telegram, on every card that already offers GitHub

- The server half (#282) has been live since 2026-09-05 with nothing to press. This
  is the door: `providers.telegram` plus `providers.telegramBot` renders a
  "Continue with Telegram" button next to the two that were already there.
- It is a link, not an OAuth start. Telegram is not an OAuth client here — the bot
  is the only party that can assert a Telegram id, so the button opens
  `https://t.me/<bot>?start=login`, di.bo mints the single-use link and the person
  taps it out of the chat. One helper, `src/utils/telegramSignIn.js`, builds that
  URL and is the only place the shape is written down.
- Four surfaces render provider buttons, not one: `AuthGate.jsx` (the sign-in card
  and the out-of-scope card, both through `ProviderSignInButtons`),
  `AccountButton.jsx` (the guest popover), `SpaceHub.jsx` (Spaces page) and
  `StudioShellPanels.jsx` (the guest Share window). All four got it, each in its own
  existing markup and styling — nothing restyled.
- `telegram: true` with no `telegramBot` shows NO button. The server only carries
  the username when `TELEGRAM_BOT_USERNAME` is set, and a button with no bot to
  open is a dead end; a test holds that case.
- Every "No sign-in providers configured." fallback now counts Telegram, so a tier
  with only Telegram configured does not claim it has nothing.
- Wiki: `guest-and-sandbox-modes` gains the sentence — what the button does, that
  the link is single-use and ten minutes, and that guest work comes along.
- Not done here, on purpose: the bot's `/login` command lives in the di-bo repo and
  ships as its own PR. Until both are deployed AND `TELEGRAM_LOGIN_SECRET` /
  `TELEGRAM_BOT_USERNAME` are set on the tier, `providers.telegram` is false and
  this change renders nothing at all.
- Seen, not assumed: the sign-in card screenshotted at 1440x900 DPR2 and 390x844
  DPR3 against a stubbed providers response — the Telegram button sits third, same
  outline, same left-aligned icon and label, same width.
