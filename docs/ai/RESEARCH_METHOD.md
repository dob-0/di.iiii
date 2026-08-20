# The smart research method (credit-managed)

Research can eat any budget. This is the standing method that keeps it
bounded, useful, and never repeated. It is how the 2026-08-21 UX audit ran.

## The five rules

1. **Questions before agents.** Write the question list first. An agent
   without a question returns an essay; an agent with one returns an answer.
   If a question can be answered from the repo or memory, it never reaches
   an agent at all.

2. **Scouts are cheap, deep dives are earned.** First wave is always small
   models (sonnet), medium effort, hard caps in the prompt ("5-10 mechanics,
   ranked, best first"). Only what the synthesis ranks HIGH earns a second,
   deeper agent — most topics die after one scout.

3. **Structured returns only.** Every agent returns against a schema
   (mechanic / finding / gesture-cost), never prose. Schemas force ranking
   and concreteness, and they make results mergeable without a re-read.

4. **Every result lands in a file, dated, with sources.** Research that
   lives only in a conversation is spent twice. Results go to
   `docs/research/<topic>.md` (or the scratchpad ledger during a run) so the
   NEXT session updates instead of re-researching. An update names what
   changed since the stamp — it never starts over.

5. **State the spend.** Before a fleet launches: how many agents, which
   model, what cap. After: what it actually cost. The owner decides scale
   with numbers, not vibes ("+200k for a deep pass on X?" is a real
   question; "should I research more?" is not).

## The shape of a run

    questions → one Workflow: N cheap scouts in parallel (schema'd)
              → synthesis by the MAIN session (never delegated — ranking
                against the project's values is the expensive judgement)
              → ledger file + owner-facing plan
              → only then: earned deep dives or build waves

## Anti-patterns

- Re-researching what a ledger file already holds (check first).
- A "research everything about X" prompt — unanswerable, unbounded.
- Delegating the synthesis — scouts propose, the session ranks.
- Research without a decision attached. Every run ends in a ranked list
  someone can say yes/no to, or it was tourism.
