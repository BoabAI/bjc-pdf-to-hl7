# Docs

Documentation for the BJC PDF-to-HL7 converter, organised by purpose. Each
top-level directory answers "what kind of thing is in here."

| Directory | What's in it | Start with |
|-----------|--------------|------------|
| [`engineering/`](engineering/) | Specs and technical research — how the system works and the constraints it's built against (HL7/Genie formats, security baseline, PAD gotchas, PHI data flow, sister-system reference, code review). | [`functional-spec.md`](engineering/functional-spec.md) |
| [`operations/`](operations/) | Runbooks — how it runs and deploys (ops-staff guide, PAD integration runbook, Amplify/Bedrock credential setup, sister PDF-to-Directory system). | [`bjc-pdf-to-hl7-operational-guide.md`](operations/bjc-pdf-to-hl7-operational-guide.md) |
| [`business/`](business/) | Commercial / client engagement — requirements, costs, emails, stakeholder Q&A, and go-to-market (`emails/`, `stakeholder-questions/`, `marketing/`). | [`bjc-pdf-to-hl7-requirements.md`](business/bjc-pdf-to-hl7-requirements.md) |
| [`meetings/`](meetings/) | BJC meeting transcripts and structured action notes (dated). | — |
| [`plans/`](plans/) | Implementation plans for features and rollouts (dated where time-bound). | — |
| [`strategy/`](strategy/) | Forward product strategy beyond the contracted BJC scope (connectors generalisation, other-client feasibility). | — |
| [`archive/`](archive/) | Historical / superseded docs (early product brief, v1 costs, pricing research, old refactor plan). Kept for reference only. | — |
| `test-pdfs/` | Test PDF fixtures used by scripts and tests. **Code-coupled** (`scripts/`, `next.config.mjs`, `.gitignore` whitelist, `app/api/test-pdfs`) — don't restructure casually. | — |
| `latest/` | Scratch area for real patient documents during testing. **Gitignored** — never committed. | — |

## Conventions

- **Filenames are stable**; documents move between directories rather than being
  renamed, so links stay predictable.
- **PHI never enters git.** Real patient PDFs live only in `latest/` (gitignored) or
  in the local `samples/` directory. `test-pdfs/` holds mock/fictional fixtures only.
- See [`../CLAUDE.md`](../CLAUDE.md) for architecture notes and the reference-doc list.
