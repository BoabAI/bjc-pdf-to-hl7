# Genie Desktop HL7 Input Format - Research Summary

_Generated: 2026-03-12 | Sources: 25+ | Confidence: Medium-High (Genie-specific docs are limited; ADRM standard is well-documented)_

## Executive Summary

Genie Desktop (by Genie Solutions / Magentus / Citadel Health) accepts incoming HL7 v2.4 messages via a **watched folder mechanism**, processing both ORU^R01 (observation/results) and REF^I12 (referral) message types. Genie uses the Medical Objects Capricorn client or HealthLink HMS as intermediary software to receive, validate, and route HL7 messages into the appropriate inbox (Pathology, Radiology, or Incoming Letters). The Australian ADRM standard governs the expected message format.

**Key findings for our PDF-to-HL7 converter:**

- ORU^R01 is the primary message type for delivering documents with embedded PDFs. REF^I12 is accepted by Genie REF versions but requires additional segments (RF1, PRD).
- PV1-9 (Consulting Doctor) routes documents to a specific doctor's inbox using their Medicare Provider Number.
- OBR-25 controls auto-filing: `F` = Final (auto-file), `P` = Preliminary (queue for review).
- OBR-24 (Diagnostic Service Section ID) controls which inbox receives the message: pathology, radiology, or clinical/other.
- Patient matching uses surname + first 3 letters of first name, then validates against Medicare number and DOB.
- PDFs are embedded in OBX-5 using ED datatype with AUSPDI coding: `^application^pdf^Base64^<data>`.
- Segment terminator must be CR only (`\r`), no LF.
- MSH-18 character set should be `8859/1` (or blank for ASCII).

---

## 1. What HL7 Message Types Does Genie Accept?

### ORU^R01 (Observation Result - Unsolicited)

The **primary message type** for delivering pathology, radiology, and clinical documents. This is what laboratories and diagnostic services use to send results to Genie. Our current implementation uses this type.

```
MSH|^~\&|SENDAPP|SENDFAC|GENIE|CLINIC|20260312120000||ORU^R01|MSG001|P|2.4
```

### REF^I12 (Patient Referral)

Accepted by **Genie REF** and **Genie REF V8** modifiers. This message type is specifically designed for referral letters and clinical correspondence. It includes additional segments (RF1, PRD) for sender/addressee identification.

```
MSH|^~\&|SENDAPP|SENDFAC|GENIE|CLINIC|20260312120000||REF^I12|MSG001|P|2.4
```

**Important distinction:**
- **Genie V8** (without REF): Puts ALL incoming correspondence into Pathology and Radiology inboxes.
- **Genie REF V8**: Splits incoming correspondence between Pathology, Radiology, **and Incoming Letters** as appropriate.

The REF modifier is what enables Genie to recognize and correctly route referral letters to the "Incoming Letters" inbox rather than dumping them into pathology/radiology.

### Other Message Types

- **RRI^I12**: Referral acknowledgment response (Genie sends this back to acknowledge REF messages).
- **LAB2, RSDAU, PIT, BROADCST**: Legacy/alternative formats supported via HealthLink but not standard HL7.

> **NEEDS VERIFICATION**: Whether Genie accepts REF^I12 messages that arrive directly via the watched folder (without going through Medical Objects or HealthLink processing), or whether the intermediary software must be present.

---

## 2. How Does Genie Import HL7 Files?

### Watched Folder Mechanism

Genie monitors a **LabRslts** folder for incoming HL7 files:

| Installation | Results Folder | ACK Folder |
|---|---|---|
| Server | `C:\Genie\Labrslts\` | `C:\Genie\Labrslts\Hl7 ACKS\` |
| Client/Network | `\\server\Genie\Labrslts\` | `\\server\Genie\Labrslts\Hl7 ACKS\` |

### Auto-Import Settings

Configured in **File > Practice Preferences > Clinical tab**:

- **"Allow Pathology Import on Server"** - Server-side auto-import
- **"Import Pathology Automatically on Client"** - Client-side auto-import
- **Only ONE option may be selected** - Genie imports from either the Server or the workstation, not both.

Auto-import runs approximately every **20 minutes**.

### Manual Import

Users can manually import via: **Open > Pathology and Radiology > Retrieve button > Select files > Import button**.

### Intermediary Software

In production, Genie typically receives HL7 via intermediary messaging software:

- **Medical Objects Capricorn**: Downloads results from the Medical Objects network into the LabRslts folder. Applies "decorators" (message processors) to fix/transform incoming HL7.
- **HealthLink HMS**: Alternative messaging client that delivers HL7 files to Genie's watched folder.

The intermediary software applies processing steps ("decorators") in sequence:
1. Strip Illegal Characters
2. Move ACKs to Application ACK Folder
3. Fix MSH-18 Character Set
4. Fix REF Message routing
5. Use MSH-6 MO Routing ID to readdress REF messages
6. Override Sender HD fields using Primary Practice Identifier

### File Format

- File extension: `.hl7` or `.HL7`
- Genie auto-detects between PIT (legacy) and HL7 formats transparently - no configuration needed.
- The `Save all ORU in Pathology Path` option should be **unticked** to allow separate pathology/radiology routing.

---

## 3. What Segments Does Genie Expect/Require?

### ORU^R01 Message Structure (Australian ADRM)

```
MSH    Message Header              [Required]
PID    Patient Identification      [Required]
[PD1]  Additional Demographics     [Optional]
[{NK1}] Next of Kin               [Optional]
PV1    Patient Visit               [Required - Australian mandate]
[PV2]  Patient Visit Additional    [Optional]
{
  [ORC] Order Common               [Optional]
  OBR   Observation Request        [Required]
  [CTD] Contact Data               [Optional]
  {
    [OBX] Observation/Result       [Required - at least one per OBR]
  }
}
```

**Key Australian variance**: PV1 is **mandatory** in Australian ORU messages (optional in international HL7 v2.4). NTE segments are **prohibited**.

### REF^I12 Message Structure (Australian ADRM Simplified Profile)

```
MSH    Message Header              [Required]
RF1    Referral Information        [Required]
{PRD}  Provider Data               [Required - multiple allowed]
PID    Patient Identification      [Required]
[{AL1}] Allergy Information       [Optional]
{
  OBR   Observation Request        [Required]
  {OBX} Observation/Result         [Required]
}
PV1    Patient Visit               [Required]
[PV2]  Patient Visit Additional    [Optional]
```

**Note**: The Australian localisation removes ORC before PV1 (changed in 2018 release) and extends PRD usage beyond the international standard.

### Minimum Viable Message (ORU^R01 with embedded PDF)

For our use case (delivering a PDF document to Genie), the minimum required segments are:

```
MSH - Message header with correct type, encoding, version
PID - Patient identification (name, DOB, Medicare)
PV1 - Patient visit (at minimum: set ID + patient class)
OBR - Observation request (report ID, timestamp, result status)
OBX - Observation with embedded PDF (ED datatype, Base64)
```

---

## 4. How Does Genie Handle Embedded PDFs in HL7?

### OBX Segment Format for PDF

```
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^<base64data>||||||F
```

Field breakdown:
- **OBX-1** (Set ID): `1`
- **OBX-2** (Value Type): `ED` (Encapsulated Data) - note Australian extension allows 3 chars (vs 2 in standard)
- **OBX-3** (Observation Identifier): `PDF^Display format in PDF^AUSPDI`
  - Component 1: Code (`PDF`)
  - Component 2: Description (`Display format in PDF`)
  - Component 3: Coding system (`AUSPDI` - Australian Patient Display Information)
- **OBX-4** (Sub-ID): Empty
- **OBX-5** (Observation Value): ED format `^application^pdf^Base64^<base64data>`
  - Component 1: Source (empty)
  - Component 2: Type (`application`)
  - Component 3: Subtype (`pdf`)
  - Component 4: Encoding (`Base64`)
  - Component 5: Data (raw Base64-encoded PDF, no line breaks)
- **OBX-11** (Result Status): `F` (Final)

### Encoding Rules

- Base64 data must be **continuous** (no line breaks, no spaces within the encoded data).
- OBX-5 can be up to **16 MB** for ED/FT value types (Australian extension).
- The PDF should be the **final OBX segment** (or penultimate if a digital signature follows).
- There must be **only one AUSPDI OBX segment per display format** (e.g., one PDF OBX per OBR group).

### Display Format Priority

The ADRM Simplified REF profile defines conformance levels:
- **Level 1**: Receivers must support PDF display. Senders must include PDF.
- **Level 2**: Receivers must support HTML, PDF, RTF, and TXT display formats.

Most Genie installations support at least PDF viewing.

---

## 5. How Does Genie Route Documents to Specific Doctors?

### PV1-9 (Consulting Doctor) - Primary Routing Mechanism

The **first repeat** of PV1-9 identifies the **target provider** (the doctor who should see this document in their inbox):

```
PV1|1|O|||||||<provider>
```

Format with Medicare Provider Number:
```
PV1|1|O|||||||2345678P^^^AUSHICPR
```

Format with name only (no provider number):
```
PV1|1|O|||||||^SMITH^JOHN^^^DR
```

Format with both:
```
PV1|1|O|||||||2345678P^SMITH^JOHN^^^DR^^^AUSHICPR
```

The XCN (Extended Composite ID Number and Name) components are:
1. ID Number (Provider Number)
2. Family Name
3. Given Name
4. Second Names
5. Suffix
6. Prefix (e.g., DR)
7. Degree
8. Source Table
9. Assigning Authority (`AUSHICPR`)

### OBR-16 (Ordering Provider) - Sender/Referrer Identification

OBR-16 identifies the **ordering/referring provider** (the doctor who requested/sent the document). In the ADRM standard, OBR-16 "is not necessarily the sender or recipient" but typically represents the GP or referrer.

```
OBR|1||RPT20260312^SMECAI|PDF^Patient Consent Form^L|||20260312||||||||||2345678P^JONES^SUSAN^^^DR^^^AUSHICPR
```

### PRD Segments (REF^I12 only) - Explicit Provider Roles

For REF messages, PRD segments provide explicit role-based routing:

```
PRD|RP~AP|SMITH^JOHN^^^DR||||||1234567A^AUSHICPR^UPIN    (Referring Provider + Authoring Provider)
PRD|RT~IR|JONES^SUSAN^^^DR||||||2345678P^AUSHICPR^UPIN   (Referred-To Provider + Intended Recipient)
```

Provider role codes:
- **RP** = Referring Provider (who made the referral)
- **RT** = Referred-To Provider (the specialist)
- **AP** = Authoring Provider (who wrote the document) - **exactly one required**
- **IR** = Intended Recipient (who should receive this message) - **exactly one required**
- **CP** = Consulting Provider

### OBR-24 (Diagnostic Service Section ID) - Inbox Routing

This field determines which **inbox category** receives the message:

| OBR-24 Value | Routes To |
|---|---|
| `LAB` | Pathology inbox |
| `RAD` | Radiology inbox |
| `PHY` | Clinical/Incoming Letters inbox (for referrals) |
| `HM`, `MB`, `SP`, etc. | Other pathology sub-categories |

**Critical for referral letters**: Set OBR-24 to `PHY` so Genie REF routes the document to "Incoming Letters" rather than Pathology/Radiology.

> **NEEDS VERIFICATION**: Whether Genie V8 (non-REF) respects OBR-24 or ignores it and dumps everything into Pathology. Also whether OBR-24 alone is sufficient without the REF^I12 message type.

---

## 6. What is Genie's Patient Matching Logic?

Genie uses a **sequential matching algorithm** when importing results:

### Step 1: Name Search
Search for patients matching **surname** and **first 3 letters of first name**.

### Step 2: Single Match Validation
If one patient found, validate against the incoming HL7 data:
- Check Medicare number AND date of birth
- If **both** don't match, assumes different person with same name
- Falls back to secondary search by DOB only

### Step 3: Multiple Match Resolution
If multiple patients found with same name:
- Search for matching DOB among candidates
- If no DOB match, display all in dropdown for user selection

### Step 4: Secondary Search
If no matches from name search:
- Search by **DOB** and **last 3 letters of surname**

### Step 5: Final Resolution
If multiple records still match:
- Cycle through seeking matches on **address**, **DOB**, or **Medicare number**
- If no satisfactory match, no patient links automatically (goes to unmatched queue)

### Matching Field Sources in PID

| PID Field | Purpose |
|---|---|
| PID-3 (Patient ID) | Medicare number for matching |
| PID-5 (Patient Name) | Surname + first name for initial search |
| PID-7 (DOB) | Secondary matching criterion |
| PID-11 (Address) | Tertiary matching criterion |

### Manual Matching

Users can:
- Click **Match** to trigger additional searches
- Click **Find** to manually search the patient database
- Click **New** to create a new patient record (if truly new)
- Drag demographic data from results onto Genie fields to update mismatches

---

## 7. How Does Genie Handle Auto-Filing vs. Queuing?

### OBR-25 (Result Status) Controls Filing Behavior

| OBR-25 Value | Meaning | Genie Behavior |
|---|---|---|
| `F` | Final | Auto-files to patient record (verified, complete) |
| `P` | Preliminary | Queues for doctor review before filing |
| `C` | Correction | Re-files with corrected data (must include ALL OBX segments) |
| `A` | Partial | Some results available, more expected |
| `X` | Cancelled | Order was cancelled |
| `R` | Results stored, unverified | Similar to preliminary |

### For Our Use Case

- **`F` (Final)** = Document auto-files to the matched patient's record. The doctor sees it in their results queue but it's already filed.
- **`P` (Preliminary)** = Document appears in the doctor's review queue. They must manually review and action it before it files to the patient record.

**Default recommendation**: Use `F` for routine document delivery (consent forms, standard referrals). Use `P` if the practice wants to review every document before it enters the patient record.

### Medical Objects Capricorn Default

The Capricorn software applies a decorator that **defaults OBR-25 to `F` if empty**: `if HL7Data['OBR.25.0'] = '' then HL7Data['OBR.25'] := 'F';`. So if we leave it blank, the intermediary will set it to Final anyway.

---

## 8. REF^I12 Specifics

### Does Genie Accept REF^I12?

**Yes**, but only when configured with the **Genie REF** or **Genie REF V8** modifier in Medical Objects Capricorn. Without this modifier, REF messages may be converted to ORU format by the intermediary software (historically, this was standard practice).

### Required Segments for REF^I12

```
MSH|^~\&|SMECAI|BJCHEALTH|GENIE|CLINIC|20260312120000||REF^I12|MSG001|P|2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L||||AUS|8859/1
RF1||||||20260312
PRD|RP~AP|SMITH^JOHN^^^DR||||||1234567A^AUSHICPR^UPIN
PRD|RT~IR|JONES^SUSAN^^^DR||||||2345678P^AUSHICPR^UPIN
PID|1||21882253741^^^AUSHIC^MC||DOE^JANE||19850115|F|||123 Main St^^Sydney^NSW^2000^AUS
OBR|1||RPT20260312^SMECAI|PDF^Referral Letter^L|||20260312||||||||||||||||20260312||PHY|F
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^<base64data>||||||F
PV1|1|O|||||||2345678P^^^AUSHICPR
```

### Key Differences from ORU^R01

| Feature | ORU^R01 | REF^I12 |
|---|---|---|
| RF1 segment | Not used | Required (referral info) |
| PRD segments | Not used | Required (provider roles) |
| OBR-24 | Optional | Must be `PHY` for physician referrals |
| MSH-12 version | `2.4` | `2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L` |
| Inbox routing | Pathology/Radiology | Incoming Letters (with REF modifier) |
| Acknowledgment | ACK^R01 | RRI^I12 expected |

### MSH-12 Version ID for REF

The simplified REF profile requires a specific MSH-12 value:
- **Level 1**: `2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706-L1&&L`
- **Level 2**: `2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L`

### Character Set Limitation

The Simplified REF profile states: receivers must support **ASCII only**. Character set `8859/1` and `UNICODE UTF8` are **unsupported** by this profile.

> **NEEDS VERIFICATION**: Whether Genie actually enforces this ASCII-only limitation or whether 8859/1 works in practice (it does for ORU messages).

---

## 9. MSH-3 (Sending Application) and MSH-4 (Sending Facility)

### What Values Does Genie Expect?

Genie does not enforce specific values for MSH-3 and MSH-4 on incoming messages. These fields identify the **source** of the message, not the destination.

- **MSH-3** (Sending Application): The name/identifier of the software sending the message. Typically a short code like `SMECAI`, `MEDOBJECTS`, `HEALTHLINK`, etc.
- **MSH-4** (Sending Facility): The organization/facility sending the message. E.g., `BJCHEALTH`, `SULLIVANNIC`, laboratory name, etc.

### ADRM Recommended Format

```
MSH-3: APP^VERSION^LOCATION
MSH-4: Facility Name^NATA#^AUSNATA  (for laboratories)
```

For non-laboratory senders (like our app), a simple application name is sufficient.

### MSH-5 and MSH-6 (Receiving Application/Facility)

- **MSH-5** (Receiving Application): Often `GENIE` or left blank.
- **MSH-6** (Receiving Facility): The Medical Objects routing ID or clinic identifier. Medical Objects uses this for endpoint routing.

### Our Current Values

```
MSH-3: SMECAI       (our application)
MSH-4: BJCHEALTH    (our facility)
MSH-5: GENIE        (target application)
MSH-6: CLINIC       (target facility)
```

These values are acceptable. The intermediary software (Capricorn) may override them with its "Override Sender HD fields" decorator anyway.

---

## 10. OBR-16 (Ordering Provider) Format

### Purpose

Identifies the provider who **ordered** or **originated** the document. In referral context, this is the referring doctor (sender of the referral letter).

### XCN Format

```
ProviderNumber^LastName^FirstName^MiddleName^Suffix^Prefix^Degree^SourceTable^AssigningAuthority
```

### Examples

With Medicare Provider Number:
```
2345678P^JONES^SUSAN^W^^DR^^^AUSHICPR^^^^UPIN
```

Without provider number (name only):
```
^SMITH^JOHN^^^DR
```

Simplified (common in practice):
```
2345678P^SMITH^JOHN^^^DR^^^AUSHICPR
```

### AUSHICPR Identifier

- `AUSHICPR` = Medicare Australia Provider Number registry
- `UPIN` = Universal Physician Identification Number (identifier type)
- Provider numbers are 8 characters: 6 digits + 1 letter + 1 check character (e.g., `2345678P`)

---

## 11. Sender/Addressee Mapping for Referral Letters

### In ORU^R01 Messages

Since ORU messages lack PRD segments, sender/addressee must be inferred from:

| Role | HL7 Field | Description |
|---|---|---|
| **Sender** (referring doctor) | OBR-16 (Ordering Provider) | The doctor who sent/created the referral |
| **Addressee** (receiving doctor) | PV1-9 (Consulting Doctor) | The doctor who should receive the document |

This is our current implementation approach.

### In REF^I12 Messages

REF messages use explicit PRD segments:

| Role | PRD-1 Code | Description |
|---|---|---|
| **Sender** (author) | `AP` (Authoring Provider) | Who wrote the referral |
| **Sender** (referrer) | `RP` (Referring Provider) | Who is making the referral |
| **Addressee** (recipient) | `IR` (Intended Recipient) | Who should receive this message |
| **Addressee** (specialist) | `RT` (Referred-To Provider) | The specialist being referred to |

A single PRD segment can have multiple roles (PRD-1 is repeatable):
```
PRD|RP~AP|SMITH^JOHN^^^DR||||||1234567A^AUSHICPR^UPIN
```
This means Dr. Smith is both the Referring Provider and the Authoring Provider.

### Practical Mapping

For our BJC Health use case (scanning referral letters received by the practice):

**ORU^R01 approach** (current):
- OBR-16 = The external GP/doctor who wrote the referral letter (sender)
- PV1-9 = The BJC Health doctor the letter is addressed to (addressee)

**REF^I12 approach** (if we switch):
- PRD with `RP~AP` = The external GP/doctor (sender)
- PRD with `RT~IR` = The BJC Health doctor (addressee)
- PV1-9 = Also set to the BJC Health doctor for inbox routing

---

## 12. Australian HL7 Specifics

### ADRM Standard

The **Australian Diagnostics and Referral Messaging** standard (HL7AUSD-STD-OO-ADRM-2021.1) governs HL7 v2.4 messaging in Australia. Key references:
- **Chapter 4**: Observation Reporting (ORU^R01)
- **Chapter 7**: Patient Referral (REF^I12)
- **Appendix 8**: Simplified REF Profile

### AUSPDI (Australian Patient Display Information)

Coding system used in OBX-3 for display-format documents:
```
OBX-3: PDF^Display format in PDF^AUSPDI
```

### AUSHICPR (Australian HIC Provider Registry)

Assigning authority for Medicare Provider Numbers:
```
2345678P^AUSHICPR^UPIN    (in CM fields like PRD-7)
2345678P^^^AUSHICPR        (in XCN fields like PV1-9)
```

### Medicare Number Format in PID-3

```
PID-3: 21882253741^^^AUSHIC^MC            (11-digit with IRN)
PID-3: 2188225395^^^AUSHIC^MC              (10-digit without IRN)
PID-3: 21882253741^^^AUSHIC^MC^^^200706    (with expiry date)
```

Components:
- Value: Medicare card number (10 or 11 digits; 11th digit is Individual Reference Number)
- Assigning Authority: `AUSHIC` (Medicare Australia)
- Identifier Type: `MC` (Patient's Medicare Number)

Our current format (`number-ref^^^Medicare^MC`) is a **simplified variant**. The ADRM-compliant format uses `AUSHIC` as the assigning authority rather than `Medicare`.

### DVA Number Format in PID-3

```
PID-3: VX26655^^^AUSDVA^DVG    (Gold card)
PID-3: QX123268^^^AUSDVA^DVW   (White card)
```

### IHI (Individual Healthcare Identifier)

```
PID-3: 8003608833357361^^^AUSHIC^NI
```

### Other Australian Identifier Tables

| Assigning Authority | Description |
|---|---|
| `AUSHIC` | Medicare Australia (patients) |
| `AUSHICPR` | Medicare Australia (providers) |
| `AUSDVA` | Department of Veterans Affairs |
| `AUSNATA` | National Association of Testing Authorities (labs) |
| `AUSLINK` | Centrelink |

### Encoding Requirements

- **Segment terminator**: CR only (`\r`, 0x0D). No LF.
- **Character set**: ASCII (7-bit) or 8859/1 (8-bit). Specified in MSH-18.
- **Timestamps**: Minimum precision of minutes with timezone offset.
- **NTE segments**: Prohibited in Australian ORU messages.
- **OBX-2 length**: 3 characters (Australian extension; standard is 2).
- **OBR-2, OBR-3 length**: 250 characters (Australian extension; standard is 22).

---

## 13. Genie's HL7 Configuration Options

### Incoming Message Modifiers

Set in Medical Objects Capricorn configuration:

| Modifier | Genie Version | Routing Behavior |
|---|---|---|
| **Genie V8** | >= 8 | All correspondence -> Pathology & Radiology |
| **Genie REF V8** | >= 8 | Splits between Pathology, Radiology, and Incoming Letters |
| **Genie** | < 8 | All correspondence -> Pathology & Radiology |
| **Genie REF** | < 8 | Splits between Pathology, Radiology, and Incoming Letters |

### Capricorn Decorators (Processing Queue)

Applied in order to incoming messages:

1. **Strip Illegal Characters** - Removes non-printable/invalid chars
2. **Move ACKs to Application ACK Folder** - Routes acknowledgment messages
3. **Fix MSH-18 Character Set** - Corrects character set declaration
4. **Fix REF Message** - Adjusts REF message routing
5. **Use MSH-6 MO Routing ID** - Readdresses REF messages using Medical Objects routing ID
6. **Override Sender HD fields** - Updates sender identification using primary practice identifier
7. **Remove OBX with RTF** - Strips OBX segments containing RTF format codes (known issue)

### Genie Practice Preferences

- **Clinical tab > Allow Pathology Import on Server**: Enable server-side auto-import
- **Clinical tab > Import Pathology Automatically on Client**: Enable client-side auto-import
- **Save all ORU in Pathology Path**: Should be **unticked** for proper routing
- **Extract Pathology Results PIT Format**: For legacy PIT file handling

### HealthLink Configuration

- HealthLink EDI address entered in **Practice Preferences > Clinical tab > Identifier box**
- HMS client must be installed on the **same partition** as Genie
- Uses a separate outgoing folder: `C:\Genie\Medical Objects\Outgoing\`

---

## 14. Common Pitfalls and Known Issues

### RTF Format Codes in OBX

Genie has issues with OBX segments containing RTF format codes. The Capricorn decorator "Remove OBX with RTF" strips these. **Avoid sending RTF in OBX segments.**

### Character Set Issues

The "Fix MSH-18 Character Set" decorator exists because many sending systems incorrectly populate MSH-18. If MSH-18 is blank, ASCII is assumed. Setting `8859/1` is the safe choice for Australian messages with extended characters.

### REF Message Routing

Without the REF modifier in Capricorn, referral letters (REF^I12) may be:
- Converted to ORU format by the intermediary
- Routed to Pathology/Radiology instead of Incoming Letters
- Missing proper provider role information

### Message Looping

Improperly configured folder paths can cause messages to **loop** in and out of the system. Ensure input and output folders are different.

### Multiple Connections

When using multiple messaging connections, use **unique filenames** instead of the default `Current_Patient.hl7` to prevent file overwrites.

### Patient Name Matching Edge Cases

- Apostrophes in names (O'Brien) - ensure HL7 escaping preserves the name
- Hyphenated names (Smith-Jones) - Genie searches on full surname
- Short names - only first 3 characters of first name are used in initial search
- Unicode/accented characters - may not match if character sets differ

### OBR-25 Default Behavior

If OBR-25 is empty, Capricorn defaults it to `F` (Final). This means documents will auto-file. If you want doctor review, you **must** explicitly set `P`.

### PV1-9 Without Provider Number

If PV1-9 contains a name but no provider number, Genie may not reliably route to the correct doctor. Always include the Medicare Provider Number when available.

### PDF Size

While the ADRM allows up to 16 MB in OBX-5, practical limits depend on:
- HL7 transport layer (Medical Objects/HealthLink may have lower limits)
- Genie's import processing capacity
- Network bandwidth for the watched folder

> **NEEDS VERIFICATION**: Practical PDF size limits for Genie import. Recommended to keep under 5 MB if possible.

---

## 15. Recommendations for Our Implementation

### Current State Assessment

Our current `hl7-builder.ts` implementation is **largely correct** for ORU^R01 delivery. Areas to review:

| Feature | Current | Recommended | Status |
|---|---|---|---|
| Message type (MSH-9) | `ORU^R01` or `REF^I12` | Both supported | OK |
| MSH-18 charset | `8859/1` | `8859/1` (or blank for ASCII) | OK |
| PID-3 Medicare | `number-ref^^^Medicare^MC` | `number^^^AUSHIC^MC` (ADRM format) | Review |
| PV1-9 format | `provNum^^^AUSHICPR` | `provNum^LastName^FirstName^^^DR^^^AUSHICPR` | Enhancement |
| OBR-25 default | `F` | `F` (correct) | OK |
| OBR-24 | Not set | Set `PHY` for referrals | Missing |
| OBX-3 AUSPDI | `PDF^Display format in PDF^AUSPDI` | Correct | OK |
| Segment terminator | `\r` | Correct | OK |

### Priority Changes

1. **Add OBR-24**: Set to `PHY` for referral letters so Genie REF routes them to Incoming Letters.
2. **Review PID-3 format**: Consider switching from `Medicare` to `AUSHIC` assigning authority for ADRM compliance.
3. **Enhance PV1-9**: Include provider name components alongside provider number for better matching.
4. **REF^I12 segments**: If using REF message type, ensure RF1 and PRD segments are present with correct provider roles (AP, IR).

### For Verification with Genie/Efex Support

- [ ] Does Genie accept HL7 files dropped directly in the LabRslts folder without Capricorn/HealthLink?
- [ ] What is the practical PDF size limit for Genie import?
- [ ] Does Genie V8 (non-REF) process OBR-24 for routing, or only Genie REF V8?
- [ ] What MSH-12 value does Genie expect for REF messages specifically?
- [ ] Does PID-3 with `Medicare` assigning authority work as well as `AUSHIC`?
- [ ] Is there a preference between ORU^R01 and REF^I12 for referral letter delivery?
- [ ] Can Genie handle both ORU and REF messages in the same LabRslts folder?

---

## References

### Genie / Medical Objects Documentation
- [Medical Objects - Genie Auto Import Pre-Configuration](https://kb.medical-objects.com.au/display/PUB/Genie)
- [Medical Objects - HL7 REF Message Integration](https://kb.medical-objects.com.au/display/PUB/HL7+REF+Message+Integration)
- [Medical Objects - Genie Sending](https://kb.medical-objects.com.au/display/PUB/Genie+Sending)
- [Genie Manual - Matching and Linking Results to Patients](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/matching_and_linking_results_t.htm)
- [Genie Manual - Selecting the Results Format](https://genie-v7-manual.geniesolutions.com.au/manual/v7/HTML/selecting_the_results_folder.htm)
- [Magentus Practice Management - Genie](https://www.magentus.com/practice-management/genie/)
- [Magentus Practice Management FHIR Implementation Guide](https://fhir.dev.geniesolutions.io/)
- [Importing Electronic Correspondence (Magentus Help)](https://help.magentus.com/genie/s/article/360016474131-Importing-Pathology-Radiology-Results)
- [Viewing and Actioning Electronic Correspondence (Magentus Help)](https://help.magentus.com/genie/s/article/360016258092-Viewing-Pathology-Radiology-Results)

### Australian HL7 ADRM Standard
- [ADRM 2021 - 4 Observation Reporting](https://confluence.hl7australia.com/display/OOADRM20211/4+Observation+Reporting) (may require HL7 AU membership)
- [ADRM Archive - 4 Observation Reporting](https://hl7.org.au/archive/hl7v2wg/4-Observation-Reporting_1278278.html)
- [ADRM 2021 - 6 Identifiers](https://confluence.hl7australia.com/display/OOADRM20211/6+Identifiers)
- [ADRM Archive - 6 Identifiers](https://hl7.org.au/archive/hl7v2wg/6-Identifiers_1278284.html)
- [ADRM Archive - Appendix 8 Simplified REF Profile](https://hl7.org.au/archive/hl7v2wg/2623494.html)
- [ADRM 2021 - Appendix 7 Significant Changes](https://confluence.hl7australia.com/pages/viewpage.action?pageId=31590264)
- [ADRM 2021 - 7 Patient Referral](https://confluence.hl7australia.com/display/OO/7+Patient+Referral)

### HL7 General References
- [HL7 v2.4 OBR Segment Definition](https://hl7-definition.caristix.com/v2/HL7v2.4/Segments/OBR)
- [HL7 v2.4 PV1 Segment Definition](https://hl7-definition.caristix.com/v2/HL7v2.4/Segments/PV1)
- [HL7 v2.4 OBX Segment Definition](https://hl7-definition.caristix.com/v2/HL7v2.4/Segments/OBX)
- [HL7 v2.4 PID Segment Definition](https://hl7-definition.caristix.com/v2/HL7v2.4/Segments/PID)
- [HL7 Table 0074 - Diagnostic Service Section ID](https://terminology.hl7.org/CodeSystem-v2-0074.html)
- [HL7 Australia - Medicare Number](https://confluence.hl7australia.com/display/PA/Medicare+Number)

---

## Appendix A: Complete ORU^R01 Example Message

```
MSH|^~\&|SMECAI|BJCHEALTH|GENIE|CLINIC|20260312120000||ORU^R01|MSG20260312120000ABCD|P|2.4|||AL|NE|AUS|8859/1\r
PID|1||21882253741^^^AUSHIC^MC||DOE^JANE||19850115|F|||123 Main St^^Sydney^NSW^2000^AUS||||||||\r
PV1|1|O|||||||2345678P^JONES^SUSAN^^^DR^^^AUSHICPR\r
OBR|1||RPT20260312120000^SMECAI|PDF^Patient Consent Form^L|||20260312120000||||||||||||||||20260312120000||PHY|F\r
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^JVBERi0xLjQK...||||||F\r
```

Note: `\r` represents CR (0x0D). Each segment ends with CR. No trailing LF.

## Appendix B: Complete REF^I12 Example Message

```
MSH|^~\&|SMECAI|BJCHEALTH|GENIE|CLINIC|20260312120000||REF^I12|MSG20260312120000ABCD|P|2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L|||AL|NE|AUS|8859/1\r
RF1||||||20260312\r
PRD|RP~AP|SMITH^JOHN^^^DR||||||1234567A^AUSHICPR^UPIN\r
PRD|RT~IR|JONES^SUSAN^^^DR||||||2345678P^AUSHICPR^UPIN\r
PID|1||21882253741^^^AUSHIC^MC||DOE^JANE||19850115|F|||123 Main St^^Sydney^NSW^2000^AUS||||||||\r
OBR|1||RPT20260312120000^SMECAI|PDF^Referral Letter^L|||20260312120000||||||||||||||||20260312120000||PHY|F\r
OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^JVBERi0xLjQK...||||||F\r
PV1|1|O|||||||2345678P^JONES^SUSAN^^^DR^^^AUSHICPR\r
```

## Appendix C: HL7 Table 0074 - Diagnostic Service Section ID (Common Values)

| Value | Description | Genie Routing |
|---|---|---|
| `AU` | Audiology | Pathology |
| `CH` | Chemistry | Pathology |
| `CP` | Cytopathology | Pathology |
| `HM` | Hematology | Pathology |
| `IMM` | Immunology | Pathology |
| `LAB` | Laboratory | Pathology |
| `MB` | Microbiology | Pathology |
| `NMS` | Nuclear Medicine Scan | Radiology |
| `PHY` | Physician (Referral) | Incoming Letters |
| `RAD` | Radiology | Radiology |
| `SP` | Surgical Pathology | Pathology |
| `SR` | Serology | Pathology |

## Appendix D: PRD Provider Role Codes (HL7 Table 0286)

| Code | Description | Usage in REF^I12 |
|---|---|---|
| `AP` | Authoring Provider | Who wrote the document (exactly one required) |
| `CP` | Consulting Provider | Additional consultant involved |
| `IR` | Intended Recipient | Who should receive this message (exactly one per message instance) |
| `RP` | Referring Provider | Who is making the referral |
| `RT` | Referred-To Provider | The specialist being referred to |

Multiple roles can be assigned to one PRD segment: `PRD|RP~AP|...` means this provider is both the Referring Provider and the Authoring Provider.
