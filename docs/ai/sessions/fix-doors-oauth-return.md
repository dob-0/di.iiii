## Sign-in returns you to where you stood

Doors audit wave A, third slice. Every OAuth sign-in dumped the person on the
landing page — destination lost, ?invite= token lost with it.

- getOAuthUrl (the one builder every sign-in button uses) sends
  returnTo=path+query; the start routes seal it into the signed anti-CSRF
  state; the callback redirects there with the ?auth=ok marker appended.
- sanitizeReturnTo admits only same-site paths (no absolute URLs, no
  //host, no backslashes, 600-char cap) — the callback cannot become an
  open redirect. Off-site values sign as if absent.
- AuthReturnNotice already mounts at RootApp level and preserves foreign
  params while stripping auth/kept, so the toast and an ?invite= token
  both work on any return path.
- Wiki: joining-a-space says sign-in brings you back, invite intact.
