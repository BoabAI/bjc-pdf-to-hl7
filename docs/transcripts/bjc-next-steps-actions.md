# BJC Health — PDF to Genie: Next Steps & Actions

**Meeting:** 28 Apr 2026, 02:00–02:47 PM (MS Teams)
**Attendees:** Sean O'Reilly (SMEC AI), Andrew Lai (SMEC AI), Nicole Pyne (BJC), Amy Johnson (BJC), Errol Lim (BJC), Steven Hill (Medihost)

## Status update
- First implementation running smoothly since Feb — **882 documents processed in 3 months**, on track to clear 1,000 by end of April.

## Action items

### SMEC AI (Sean)
- **Investigate expanding converter to handle results** (pathology, radiology, vascular, etc.) coming through 3 fax-to-email inboxes — adds ~200 docs/week. Nicole's testing showed PDFs read OK but HL7 didn't ingest into Genie correctly; likely an HL7 format issue for results.
  - Request a sample HL7 file (not just PDF) from Nicole to diagnose.
- **Re-price the proposal** to consider including results processing within the existing $11k implementation (BJC's ask: don't charge extra for the additional document types).
- **Add manual drag-and-drop ingest path** as a feature request — either web portal upload or watched network folder (TBD during testing).
- **Update agreement to include IP/source-code escrow clause** — if either party terminates, BJC receives a full copy of the codebase so another provider can stand it up. Nicole flagged this as essential given 95% of their docs would flow through it.
- **Send revised costings document** to Nicole.
- **Send Monday 2 PM meeting invite** for follow-up (Sean + Nicole minimum).

### SMEC AI (Andrew)
- Send Errol the **free Business Dashboard** info pack discussed (Claude-based dashboard connecting MS Office + CRM + Genie, with optional AI opportunity audit).
- Consider deploying **Hamel** to run the dashboard / opportunity-audit engagement with BJC in parallel to this project.

### Medihost (Steven) — for go-live
- Confirm BJC server has sufficient compute for Power Automate Desktop + API calls.
- Provide **Genie import folder** access/path to the PAD service account.
- Whitelist outbound connectivity from BJC server to SMEC AI's API (details to come from Sean).
- Set up **service account permissions** (mirroring existing PAD setup).
- Confirm **Genie REF flag enabled** so HL7 referrals route to Incoming Letters (results route to pathology/radiology by default — no extra flag needed).

### BJC (Nicole)
- Re-test results upload into Genie once Sean comes back with HL7 fixes.
- Provide example HL7 file from a results test to Sean.

### Open / parked
- Errol's broader question: long-term roadmap and per-build cost model for future automations — to be addressed via Andrew's dashboard + opportunity audit pathway, separately from this project so it doesn't block go-live.

## Next meeting
**Monday 2 PM** — Sean + Nicole, to confirm results-handling feasibility and lock in implementation timeline.
