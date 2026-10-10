## 2026-10-10 — the 404 cards no longer talk about "doors"

- Audit A9 said a visitor's first 404 still reads "step through one of your own doors". Re-checked on dev: the visitor (sign-in offered) already gets the uniform card ("Nothing is open at ... it may not exist, or it may be private. Check the spelling, or sign in with an account that has access.", P13). The phrase survived on two other cards in `AuthGate.jsx`: the local-install not-found card and the restricted card.
- Both now drop the phrase ("Check the spelling." / "Sign in with an account that has access."); the visible buttons stay the way in. `AuthGate.test.jsx` pins the visitor text and forbids "door" on both.
- Not done: the audit's "link to the public spaces list" on the visitor card. It was not added: the uniform card must give nothing away about whether a private space exists, and a separate link is a product call for the owner.
