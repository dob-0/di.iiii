# No account chip over /out (plan PR 1.2)

## What was wrong

The whole Raw route — /out included — is wrapped in ProtectedSurface, whose
AuthGate renders the floating account chip by default. A projector page with
a login chip hanging over the image.

## What changed

RootApp passes `showAccountButton={rawState.page !== RAW_PAGE_OUT}` on the
Raw ProtectedSurface. The auth gate itself stays — a stranger still meets
the gate, never content.

## Verified

RootApp route tests: /gallery/raw/out renders RawApp with no chip;
/gallery/raw keeps it. Full suite 2438/2438, lint, build. Staging /out
checked as guest after deploy.
