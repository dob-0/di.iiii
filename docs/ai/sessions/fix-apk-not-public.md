## 2026-09-10 — the app comes back off the open web

- The signed APK was tracked at `public/chat-app/di-studio-chat.apk` for about an
  hour, which made it downloadable by anyone who guessed the path. The owner's
  correction, in his words: di.bo answers everyone, and the app is not for
  everyone. Removed.
- It lives on the console's host now (`CHAT_APK_PATH`, default
  `/var/lib/di-inner/di-studio-chat.apk`) and the inner bot — `@the_di_studio_bot`,
  "di.net" — UPLOADS it rather than linking it. The console answers the owner
  alone, so he is the one who decides who installs the studio's app; forwarding
  it in Telegram is one tap and costs no second copy.
- `/app` on the public bot is root-only, off every menu, and answers by pointing
  at the console — the mirror of `/hush`, which points the other way.
- The manifest and icons stay public: installing from a browser needs them, and
  neither of them is the app.
