## di on PATH for login and script shells on Arch (2026-11-22)
- bootstrap.mjs: on Linux bash the PATH block also goes to .bash_profile when it exists (else .profile, as before).
- Why: Arch's .bash_profile sources .bashrc, which returns for a non-interactive shell before the block; .profile is skipped. On studio-laptop `bash -lc 'command -v di'` found nothing.
- Tested: sandbox HOME with Arch's files: login and interactive shells find di.
- Not tested: a full bootstrap run (no unit test for this function).
