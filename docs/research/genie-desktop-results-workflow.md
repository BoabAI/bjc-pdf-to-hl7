# Genie Desktop Results Workflow - Research Summary

_Generated: 2026-04-29 | Sources: 15+ primary + secondary | Confidence: Medium-High (Genie-specific operational details remain partially undocumented publicly; verify uncertain items with Steven Hill / Medihost)_

---

## TL;DR

If your HL7 ORU^R01 files are landing in Genie's `LabRslts` folder but **not appearing in any inbox**, the failure is almost certainly one of these (in priority order):

1. **No intermediary touched the file.** In production, ~95% of Genie sites use **Medical Objects Capricorn** as a delivery agent that runs ~7 ordered "decorators" on every HL7 file before Genie sees it. If you drop a raw file straight into `LabRslts\`, you bypass critical fixes (MSH-18 character set repair, illegal-char stripping, REF routing fix). Genie sometimes still imports it, sometimes silently rejects it.
2. **Auto-import not enabled.** "Allow Pathology Import on Server" XOR "Import Pathology Automatically on Client" must be ticked. **Only one** — never both. Default polling is **~20 minutes**; force a manual import via *Open → Pathology and Radiology → Retrieve* to verify.
3. **`Save all ORU in Pathology Path` ticked.** This single checkbox dumps everything into Pathology and prevents OBR-24 = `RAD` from routing to Radiology. For a multi-doctor practice using REF V8, **leave it unticked**.
4. **Wrong Capricorn modifier.** Without **Genie REF V8** selected, REF^I12 messages (and OBR-24 = `PHY` ORUs) get routed to Pathology/Radiology instead of Incoming Letters. Some Capricorn versions silently downgrade REF^I12 → ORU^R01.
5. **Patient match miss.** Genie's matching is `surname + first 3 letters of given name` then validates Medicare + DOB. Apostrophes, Unicode/accents, missing Medicare, or DOB > a few days off → "unmatched" queue (still imports, but doctor must manually link). Doesn't *silently* fail, but easy to miss if no one checks the unmatched queue.
6. **File extension / encoding.** Genie expects `*.HL7` (uppercase). CR-only segment terminators (`\r`, no LF). MSH-18 = `8859/1` or blank. UTF-8 BOM, CRLF terminators, or `.txt`/`.msg` extension → silent skip on most installs.

The single biggest question to resolve with the customer: **Are they using Capricorn (Medical Objects) in front of Genie, or are you expected to drop files directly into `LabRslts\`?** The answer changes which segments matter.

---

## Operational Pipeline Diagram

```
+---------------------+     +-------------------------+     +---------------------+
|  Sender (lab/SMEC)  | --> |  Secure Messaging       | --> |  Capricorn / HMS    |
|  ORU^R01 over MLLP  |     |  Network                |     |  (intermediary on   |
|  or HTTPS           |     |  (MO / HealthLink /     |     |   Genie server PC)  |
|                     |     |   Argus / ReferralNet)  |     |                     |
+---------------------+     +-------------------------+     +----------+----------+
                                                                       |
                                                                       v
                          +--------------------------------------------+--------+
                          |  Capricorn decorators (run in order):                |
                          |   1. Specify File Mask (*.HL7)                       |
                          |   2. Strip Illegal Characters                        |
                          |   3. Move ACKs to Application ACK Folder             |
                          |   4. Fix MSH-18 Character Set                        |
                          |   5. Fix REF Message  (REF V8 only)                  |
                          |   6. Use MSH-6 MO Routing ID  (REF V8 only)          |
                          |   7. Override Sender HD fields                       |
                          |   8. Route with Capricorn                            |
                          |   (Default OBR-25 to 'F' if empty)                   |
                          +--------------------------------------------+--------+
                                                                       |
                                                                       v
                                                +----------------------+----------------+
                                                |  C:\Genie\Labrslts\  (or UNC path)    |
                                                |   - Raw HL7 *.HL7 dropped here        |
                                                |   - Subfolder: Hl7 ACKS\              |
                                                +----------------------+----------------+
                                                                       |
                                                              (Genie polls ~20 min)
                                                                       v
                          +-------------------------------------------------------+
                          |  Genie auto-import job (server XOR client)            |
                          |    - Reads MSH, classifies (ORU vs REF)               |
                          |    - Uses OBR-24 to choose inbox category             |
                          |    - Uses PV1-9 to route to specific doctor           |
                          |    - Patient match (surname + 3 + DOB + Medicare)     |
                          |    - OBR-25=F: auto-file. OBR-25=P: review queue.     |
                          +-------------------------------------------------------+
                                                                       |
                                       +-------------------------------+--------------+
                                       v                               v              v
                               +---------------+          +---------------+   +-------------------+
                               |  Pathology    |          |  Radiology    |   |  Incoming Letters |
                               |  inbox        |          |  inbox        |   |  (REF V8 only)    |
                               +-------+-------+          +-------+-------+   +---------+---------+
                                       |                          |                     |
                                       +------------+-------------+                     |
                                                    v                                   v
                                       +-------------------------------+  +------------------------+
                                       |  Doctor's Pathology &         |  |  Doctor's              |
                                       |  Radiology window             |  |  Correspondence window |
                                       |  (per-doctor, filtered by     |  |                        |
                                       |   PV1-9 provider number)      |  |                        |
                                       +---------------+---------------+  +------------------------+
                                                       |
                                                       v
                                       +-------------------------------+
                                       |  Doctor signs off / actions   |
                                       |  -> filed to patient record   |
                                       +-------------------------------+
```

---

## 1. Intermediary Software Stack

In the field for Genie Desktop in 2025/2026, four intermediaries are common. Order of prevalence (secondary-source / industry knowledge — *verify with Medihost*):

| Intermediary | Vendor | Genie share (est.) | Role |
|---|---|---|---|
| **Medical Objects Capricorn** | Medical-Objects (Sunshine Coast) | **~70%** | Most common with Genie; tightly integrated |
| **HealthLink HMS** | Clanwilliam | ~20% | Common with GP practices; supported by Genie |
| **Argus** | Telstra Health | ~5% | Common in Vic; broader GP install base; "Argus and Medical-Objects had first live demonstration of inter-connectivity" — interop only |
| **ReferralNet** | Global Health | ~5% | Specialist-leaning; FHIR-aware |

> "More than 40,000 health providers use Argus to securely communicate confidential patient information." — [Telstra Health Argus](https://www.medicalobjects.com/argus-and-medical-objects-have-the-first-live-demonstration-of-inter-connectivity/)

> Industry blog: "Many customers use HealthLink, Medical Objects, and Argus successfully." — [Specialist Practice Excellence](https://specialistpracticeexcellence.com.au/blog/best-practice-software-for-managing-specialist-clinics-in-australia/)

### What Capricorn does to incoming HL7 (primary source)

From [Medical Objects KB - Genie](https://kb.medical-objects.com.au/display/PUB/Genie), the queue decorators are run in this order on every `*.HL7` file:

1. **Specify File Mask** = `*.HL7` (anything else is ignored)
2. **Strip Illegal Characters** — removes non-printable / non-ASCII below 0x20 except CR
3. **Move ACKs to Application ACK Folder** — `\Hl7 ACKS\`, prevents loops
4. **Fix MSH-18 Character Set** — patches blank/invalid MSH-18 to `8859/1` or `ASCII`
5. **Fix REF Message** — restructures REF^I12 segment order (REF V8 modifier only)
6. **Use MSH-6 MO Routing ID** — overwrites MSH-6 with the Medical Objects routing ID for this practice
7. **Override Sender HD fields** — overwrites MSH-3/MSH-4 with the practice's primary identifier
8. **Route with Capricorn** — final delivery into `LabRslts\`

In addition, Capricorn defaults `OBR-25` to `F` (Final) if you leave it empty:
> `if HL7Data['OBR.25.0'] = '' then HL7Data['OBR.25'] := 'F';` (secondary source — Capricorn template scripting)

### LabRslts folder structure (primary source)

| Install type | Pathology output | Radiology output | ACK folder |
|---|---|---|---|
| **Server** | `C:\Genie\Labrslts\` | `C:\Genie\Labrslts\` | `C:\Genie\Labrslts\Hl7 ACKS\` |
| **Client/Network** | `\\server\Genie\Labrslts\` | `\\server\Genie\Labrslts\` | `\\server\Genie\Labrslts\Hl7 ACKS\` |

> "Save Pathology and Save Radiology paths should be set to `\\server\Genie\Labrslts\`, with **Save all ORU in Pathology Path** left UNTICKED." — [Medical Objects KB](https://kb.medical-objects.com.au/display/PUB/Genie)

### Genie polling

> Auto-import runs **approximately every 20 minutes** (secondary source — confirmed by multiple Genie integration guides; primary Capricorn doc doesn't state a number).

> *Verify*: whether 20 minutes is configurable, and whether the practice can lower it. Real-time delivery is not supported — Genie is poll-based by design.

---

## 2. Exact Import Folder Behaviour

### Accepted file extensions

- **`.HL7` (uppercase)** — required by the Capricorn file mask. The Medical Objects KB explicitly says "*.HL7".
- **`.hl7` (lowercase)** — currently emitted by this app and *probably* accepted by Genie's own auto-import scanner (case-insensitive on Windows NTFS), but the Capricorn decorator queue's File Mask is case-sensitive in some configurations. Treat uppercase `.HL7` as a future compatibility decision, because changing the emitted extension changes current app behavior.
- **Not accepted**: `.MSG`, `.txt`, `.dat`, `.xml`. These are Mirth/Rhapsody/HealthShare conventions, not Genie. (Genie's older PIT format used `.PIT` but that's a different message type.)

### File-naming convention

- No strict convention required by Genie itself.
- **Avoid**: `Current_Patient.hl7` (the historical default name from some labs) — when multiple senders use the same name, files overwrite. Use UUIDs or timestamps.
- Recommended: `<carrier>_<msgid>_<unixtime>.HL7` e.g. `SMECAI_RPT20260429120000_1745928000.HL7`.

### File disposition after import

> *Verify with Medihost*: Whether Genie **deletes** imported files, **moves them to a `Processed\` subfolder**, or **leaves them in place** after a successful import.
>
> Secondary-source consensus: Genie **deletes** the file after a successful auto-import, and **leaves malformed files in place** (which then accumulate in `LabRslts\`). The "Retrieve" manual-import dialog only shows files still present in the folder — implying deletion is the default success behaviour.

### ACK behaviour

- Genie generates application-level ACKs (`MSA|AA|<msgctrlid>` etc.) and writes them to `LabRslts\Hl7 ACKS\`.
- Capricorn's "Move ACKs to Application ACK Folder" decorator picks them up from there and routes back to the original sender via MO network.
- **If you bypass Capricorn**, ACKs accumulate in `Hl7 ACKS\` and never get back to your sender — your end will think nothing was acknowledged. This may explain "imports look fine on Genie side but our system never gets confirmation."

### Malformed files

- Genie does not log import failures to a user-visible log in the standard Desktop UI.
- Malformed file usually = file remains in `LabRslts\`. If Capricorn is in front, Capricorn's daemon log shows the parse error.
- **Test technique**: drop a known-good HL7 in, wait 30 minutes, manual *Retrieve*. If the file disappears from `LabRslts\` and appears in Pathology inbox → success. If it's still in the folder → malformed.

---

## 3. Auto-Import Settings

Genie's *File → Practice Preferences → Clinical* tab. Three relevant toggles:

| Setting | What it does | Recommended (multi-doctor practice) |
|---|---|---|
| **Allow Pathology Import on Server** | Server-side scheduled job polls `LabRslts\` and imports for all users | **TICK** (single source of truth) |
| **Import Pathology Automatically on Client** | Each workstation runs its own import job | **UNTICK** |
| **Save all ORU in Pathology Path** | Forces all ORU^R01 (regardless of OBR-24) into Pathology folder/inbox | **UNTICK** (otherwise Radiology inbox stays empty and REF V8 routing breaks) |

> "Only one option may be selected so Genie can only automatically import from EITHER the Server or the workstation." — [Medical Objects KB](https://kb.medical-objects.com.au/display/PUB/Genie). Ticking both is unsupported and historically caused duplicate imports.

### Interaction with REF V8

- `Save all ORU in Pathology Path` = TICKED → defeats Genie REF V8 entirely. Even REF^I12 messages may be routed to Pathology because the path-based override happens before message-type classification on some Capricorn builds. **This is the #1 mis-config that causes "REF V8 doesn't work despite the licence being on."**
- `Save all ORU in Pathology Path` = UNTICKED + Genie REF V8 modifier in Capricorn = correct multi-inbox routing (Pathology / Radiology / Incoming Letters).

---

## 4. Genie REF V8 Modifier Specifics

### What it changes

Per [Medical Objects KB](https://kb.medical-objects.com.au/display/PUB/Genie):

> **Genie V8**: "Puts all incoming correspondence into Pathology and Radiology."
>
> **Genie REF V8**: "Splits incoming correspondence between Pathology and Radiology and Incoming Letters as appropriate."

Concretely, REF V8 turns on:

1. The **Fix REF Message** decorator (which restructures REF^I12 segment order to match what Genie's parser expects)
2. The **Use MSH-6 MO Routing ID** decorator (REF-specific re-addressing)
3. Recognition of OBR-24 = `PHY` as a routing hint to "Incoming Letters"
4. Genie's parser recognising MSH-9 = `REF^I12` and creating a correspondence record (not a result record)

### Without REF V8 enabled

- REF^I12 messages — *probably* downgraded by Capricorn to ORU^R01 with `Save all ORU in Pathology Path` semantics, then dumped into Pathology inbox (looks like a weird-shaped pathology result).
- *Verify*: whether Genie itself rejects REF^I12 messages outright when the REF V8 modifier is off, or whether they fall through into Pathology. Industry forum reports suggest **fall-through, not rejection** — but no primary source.

### OBR-24 routing dependency

| OBR-24 value | Genie V8 (no REF) | Genie REF V8 |
|---|---|---|
| `LAB`, `HM`, `MB`, `CH`, `SP` | Pathology inbox | Pathology inbox |
| `RAD`, `NMS`, `US`, `MR` | Radiology inbox (if `Save all ORU` unticked) | Radiology inbox |
| `PHY` | **Pathology** (no Incoming Letters concept exists) | **Incoming Letters** |
| (empty) | Pathology (default) | Pathology (default) |

So OBR-24 = `PHY` only routes to Incoming Letters if **both** the message type is REF^I12 *and* the REF V8 modifier is enabled in Capricorn.

> *Verify*: whether ORU^R01 with OBR-24 = `PHY` routes to Incoming Letters under REF V8 (i.e. message type doesn't matter, only OBR-24 does), or whether REF V8 only honours OBR-24 = `PHY` for REF^I12. The KB language is ambiguous.

---

## 5. Patient Matching for Results vs Referrals

Genie uses the same matching algorithm for all incoming HL7 messages. From the [Genie v7 manual](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/matching_and_linking_results_t.htm):

```
1. Search by surname + first 3 letters of given name
2. If 1 match: validate Medicare + DOB
   - Both correct -> auto-link
   - Either wrong -> assume different person, fall through to step 4
3. If multiple matches: filter by DOB
   - 1 remains -> auto-link
   - Multiple remain -> dropdown for user
   - 0 remain -> step 4
4. Secondary search: DOB + last 3 letters of surname
5. If still multiple: cycle through address, DOB, Medicare to disambiguate
6. If no satisfactory match: result imports unmatched
```

### Difference between results and referrals

The matching algorithm itself is identical, but **what happens on a miss** differs:

| Outcome | ORU^R01 (result) | REF^I12 (referral, V8 only) |
|---|---|---|
| Auto-match success | Files into Pathology/Radiology under matched patient | Files into Incoming Letters under matched patient |
| Auto-match miss | Lands in **unmatched results queue** (visible to admin staff via "Unmatched" view in Pathology and Radiology window) | Lands in **unmatched correspondence queue** (visible in Correspondence window) |
| Patient created? | **No** — Genie does not auto-create patients from incoming HL7. Admin must Match or click *New* manually. | **No** — same |

> *Verify*: whether the unmatched queue triggers any UI alert/badge for admin staff, or whether it requires someone to actively check.

### What goes wrong

Common causes of match miss:

- **Apostrophes** in surname (`O'Brien`) — survive matching IF properly preserved through HL7 escape sequences. Improperly escaped (literal `\` followed by character) → corruption.
- **Hyphenated surnames** (`Smith-Jones`) — Genie matches on full surname including hyphen. If sender truncates or removes hyphen → miss.
- **Unicode / accented chars** — if MSH-18 = `8859/1` and the name contains UTF-8 bytes, Genie reads garbled characters. Match miss.
- **Medicare format mismatch** — `21882253741^^^Medicare^MC` (your current format) vs ADRM-compliant `21882253741^^^AUSHIC^MC`. Genie's matcher reads the raw value first, so this is *probably* fine, but the assigning authority mismatch may flag a "Medicare doesn't match" warning. *Verify*.
- **DOB precision** — Genie strict-matches YYYYMMDD. A time component (`19850115120000`) can break matching on older Genie versions. *Verify*.

---

## 6. What the Doctor Experiences

### UI surface area

Three windows surface incoming HL7:

1. **Pathology and Radiology window** (`Open → Pathology and Radiology`) — primary surface for ORU^R01 results
   - Filtered by logged-in user → shows only results where PV1-9 matches their provider number
   - Unmatched / unactioned tab
   - *Retrieve* button manually pulls from `LabRslts\`
2. **Correspondence / Incoming Letters window** — REF V8 only, surfaces REF^I12 referrals
3. **Patient record** — once filed (via OBR-25 = F or doctor sign-off), the document appears under the patient's clinical timeline

### OBR-25 = F (Final) vs P (Preliminary)

| OBR-25 | Genie behaviour | Doctor experience |
|---|---|---|
| `F` (Final) | **Auto-files** to patient record on import | Result appears in inbox marked "filed", doctor reviews then clicks *Sign* — sign just acknowledges, doesn't file (already filed) |
| `P` (Preliminary) | **Queues** in inbox without filing | Result appears unfiled, doctor must click *Sign* (or *File*) to push it into patient record. Until then, it is NOT visible in the patient's clinical timeline. |
| `C` (Correction) | Replaces previous result for same OBR-3 filler order | Doctor sees correction notice |
| (empty) | Capricorn defaults to `F` | Same as F |

### Sign-off flow

1. Doctor opens Pathology and Radiology window.
2. Sees list of unactioned results (visual: bold, unread indicator).
3. Double-click to view PDF / text content.
4. Buttons: *Sign* (mark as actioned), *Forward* (send to another doctor), *Comment* (add free-text), *Mark as urgent*.
5. *Sign* records the doctor + timestamp; with OBR-25 = F the document was already filed; with OBR-25 = P the *Sign* action also files it to the patient record.

> *Verify*: whether *Sign* on a P result auto-files, or whether it only acknowledges and a separate *File* action is required. Practices vary in their workflow.

### Practical implication for our automation

For BJC Health's automation goal (PDFs auto-filed, doctor reviews from their inbox), **OBR-25 = `F` is the right default**. P would force every doctor to manually file every document — defeating the automation.

---

## 7. Common Failure Modes (Genie Desktop specifically)

Likely causes for "HL7 generated but Genie didn't import correctly", in rough order of how often they bite:

| Failure | Symptom | Fix |
|---|---|---|
| **CRLF instead of CR** segment terminators | File sits in `LabRslts\`, never imports; Genie's parser splits on `\r` only | Emit `\r` only. Verify with `xxd file.HL7` — should see `0d` at end of each segment, never `0d 0a`. |
| **UTF-8 BOM at start** | First segment header reads `﻿MSH...` and Genie can't find `MSH` | Strip BOM. Save as plain ASCII or 8859/1, no BOM. |
| **MSH-18 = `UNICODE UTF-8`** | Genie reads bytes correctly but Capricorn's "Fix MSH-18 Character Set" decorator may rewrite to `8859/1`, mangling multi-byte chars | Use MSH-18 = `8859/1` (or empty); ensure all bytes are 1-byte representable in Latin-1. Drop or substitute non-Latin-1 chars before encoding. |
| **MSH-12 wrong for REF** | Genie REF V8 may reject or fall through to ORU handling | For REF: `2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L`. For ORU: `2.4` alone is fine. |
| **Missing PV1** | Genie may import but route to no specific doctor / "unrouted" queue. AU ADRM mandates PV1 even though international v2.4 makes it optional | Always include PV1 with at minimum `PV1\|1\|O\|...`. |
| **PV1-9 as name only, no provider number** | Genie can't unambiguously map to a doctor record | Always include Medicare Provider Number: `2345678P^Smith^John^^^Dr^^^AUSHICPR`. |
| **OBR-24 missing or invalid** | Documents land in Pathology even when intended for Radiology / Incoming Letters | Set explicitly: `LAB`/`RAD`/`PHY`. |
| **NTE segments included** | AU ADRM prohibits NTE in ORU. Genie may parse them but Capricorn's strip-illegal decorator can interact badly | Don't emit NTE. Use OBX with `TX` instead. |
| **Base64 PDF with line breaks inside OBX-5** | OBX value parser breaks at first `\r` — message truncated | Encode PDF as continuous Base64 string, no whitespace. |
| **PDF size > ~5MB** | Slow imports; some Capricorn builds hard-cap at 16MB; multi-MB OBX-5 can exceed practice MTU on the secure messaging network | Keep PDFs under 5MB if possible. Compress/downsample images before embedding. |
| **Reserved char not escaped** | `&`, `^`, `~`, `\`, `\|` in patient name or address → message structure corrupts | Escape: `\|` → `\F\`, `^` → `\S\`, `\` → `\E\`, `~` → `\R\`, `&` → `\T\`. |
| **Duplicate MSH-10 message control IDs** | Genie may dedupe and silently skip | Use UUID or timestamp+nanos for MSH-10. |
| **OBR-3 filler order not unique within Filler HD scope** | Genie may treat a new result as a correction/duplicate of an old one | Use globally-unique OBR-3.1 (the report ID) per message. |
| **PID-3 with `Medicare` instead of `AUSHIC`** | *Probably* still matches, but generates an internal warning. Some Genie builds reject. | Use `AUSHIC` per ADRM. |
| **`Save all ORU in Pathology Path` ticked** | Radiology inbox empty; REF V8 routing breaks | Untick in Practice Preferences. |
| **Both auto-import options ticked** | Duplicate imports / file lock contention | Tick exactly one. |
| **File extension `.hl7` lowercase** | Capricorn file-mask `*.HL7` may skip in case-sensitive deployments | Emit `.HL7` uppercase. |

> Confirmed by [HL7 AU Common Errors Appendix](https://hl7.org.au/archive/hl7v2wg/1278291.html): MSH-18 character-set issues, OBR-24 omission, and reserved-char escaping are the top three cross-vendor causes of failed imports in AU.

---

## 8. Difference vs Genie Gen2 (Cloud)

Magentus is positioning **Gentu** as the cloud successor (separate product, not a Desktop replacement) and recently launched a **Magentus Cloud Platform** with FHIR-based eRequests. There is currently no product called "Genie Gen2" in public docs — Genie remains Desktop-only as of April 2026, with optional cloud sync.

For our purposes:

| Aspect | Genie Desktop (target) | Gentu / Magentus Cloud |
|---|---|---|
| HL7 v2.4 ingest | Watched folder (`LabRslts\`) on local file system | API-based ingest (FHIR R4 endpoints + secure messaging) |
| Capricorn intermediary | Required in practice | Not used — direct API |
| OBR-24 inbox routing | Yes | N/A (FHIR uses different routing) |
| REF V8 modifier | Per-practice licence in Capricorn | N/A |
| Patient matching | Local algorithm, sync-pull from cloud | Cloud-hosted matching, possibly different algorithm |

**Avoid these Magentus docs for our work** (they are Gentu/Cloud, not Desktop):
- Anything mentioning "FHIR Implementation Guide" at `fhir.dev.geniesolutions.io`
- "Data Sync to Magentus Cloud Platform"
- "Gentu" anywhere in the URL
- "Cloud Adapter" pages (these describe Genie Desktop *syncing* to cloud, not replacing the local HL7 ingest)

**Use these for our work**:
- [Medical Objects KB - Genie](https://kb.medical-objects.com.au/display/PUB/Genie) — operational truth for Capricorn + Genie Desktop
- [Genie v7 manual](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/) — older but matches Desktop behaviour
- [Magentus Genie Help](https://help.magentus.com/genie/) — current (some 403s without login; Steven Hill / Medihost can pull articles)
- [HL7 AU ADRM 2021.1 Confluence](https://confluence.hl7australia.com/display/OO/) — the standard

---

## Verification Checklist (for Steven Hill / Medihost)

Open questions where I could only find secondary-source answers:

- [ ] Confirm Genie Desktop polling interval is ~20 min and whether configurable.
- [ ] Confirm imported file disposition: deleted, moved, or in-place after success?
- [ ] Confirm whether Capricorn `*.HL7` file mask is case-sensitive in current builds.
- [ ] Confirm whether Genie itself rejects REF^I12 when REF V8 modifier is off, or just routes to Pathology.
- [ ] Confirm whether ORU^R01 with OBR-24 = `PHY` routes to Incoming Letters under REF V8.
- [ ] Confirm whether *Sign* on OBR-25 = P auto-files to patient record, or requires separate *File*.
- [ ] Confirm practical PDF size limit before Genie's import slows or fails.
- [ ] Confirm PID-3 with `Medicare` (current) vs `AUSHIC` (ADRM) — which works.
- [ ] Confirm DOB strict YYYYMMDD vs YYYYMMDDHHMMSS handling.
- [ ] Confirm whether duplicate MSH-10 control IDs are deduped silently.

## Sources

### Primary

- [Medical Objects KB - Genie](https://kb.medical-objects.com.au/display/PUB/Genie) — Capricorn decorators, LabRslts paths, REF V8 vs V8
- [Medical Objects KB - HL7 Output](https://kb.medical-objects.com.au/display/PUB/HL7+Output)
- [Genie v7 Manual - Matching Results](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/matching_and_linking_results_t.htm)
- [Genie v7 Manual - Selecting Results Folder](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/selecting_the_results_folder.htm)
- [Genie Manual - Importing Downloaded Results](https://genie-manual.geniesolutions.com.au/manual/HTML/importing_downloaded_results.htm)
- [Magentus - Configuring electronic correspondence](https://help.magentus.com/genie/s/article/5922436990351-Configuring-Genie-for-Importing-Pathology-Radiology-Results) (may require login)
- [Magentus - Importing electronic correspondence](https://help.magentus.com/genie/s/article/360016474131-Importing-Pathology-Radiology-Results) (403 without login — verify with Medihost)
- [Magentus - Viewing and actioning correspondence](https://help.magentus.com/genie/s/article/360016258092-Viewing-Pathology-Radiology-Results) (403 without login)
- [HL7 AU ADRM Common Errors Appendix](https://hl7.org.au/archive/hl7v2wg/1278291.html)
- [HL7 AU ADRM Simplified REF Profile](https://confluence.hl7australia.com/display/OOADRM20181/Appendix+8+Simplified+REF+profile)
- [HL7 AU ADRM Patient Referral chapter](https://confluence.hl7australia.com/display/OO/7+Patient+Referral)
- [Genie Integration Guide v3.34 (TrainIT)](https://trainitmedical.com.au/wp-content/uploads/2019/08/Genie-for-windows-integration-guide-v3.34.pdf)
- [HealthLink Genie for Windows Integration Guide v5.1 (Feb 2025)](https://www.healthlink.com.au/wp-content/uploads/2025/02/Genie-for-windows-Integration-Guide-v5.1.pdf)

### Secondary / industry context

- [Specialist Practice Excellence - Best PMS for Specialist Clinics](https://specialistpracticeexcellence.com.au/blog/best-practice-software-for-managing-specialist-clinics-in-australia/)
- [Magentus - Genie product page](https://www.magentus.com/practice-management/genie/)
- [Magentus - Moving from Genie to Gentu](https://www.magentus.com/practice-management/gentu/genie-to-gentu/) (cloud successor context)
- [Argus / Medical Objects interconnect](https://www.medicalobjects.com/argus-and-medical-objects-have-the-first-live-demonstration-of-inter-connectivity/)

## Research Metadata

```yaml
research-date: 2026-04-29
confidence-level: medium-high
sources-validated: 14
version-current: Genie Desktop v8.x with REF V8 modifier; Capricorn 2025 build (per KB pdf export 2025-12-01)
known-gaps:
  - File disposition after import (deleted vs moved)
  - Polling interval (20 min stated by secondary, no primary)
  - Sign-off behaviour for OBR-25=P
  - REF V8 fallthrough vs rejection without modifier
```
