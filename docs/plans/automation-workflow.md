# BJC PDF-to-HL7 Automation Workflow — Implementation Plan

## Context

BJC Health currently uses a manual browser-based tool to convert referral PDFs to HL7 files. The requirements doc (`docs/business/bjc-pdf-to-hl7-requirements.md`) describes a fully automated pipeline: emails arrive in a shared mailbox, PAD (Power Automate Desktop) processes them every 15 minutes, calls the SMEC AI cloud service, saves HL7 files to Genie's import folder, and routes emails to Linked/Review folders. A web dashboard provides doctor list management, health monitoring, metrics, and audit logging.

**What exists:** Next.js 14 app on AWS Amplify with PDF-to-HL7 conversion via Bedrock Claude vision, password cookie auth, browser UI with localStorage-backed doctor list, 187+ tests. No database, no API key auth, no audit logging, no dashboard, no metrics.

**What needs to be built:** DynamoDB data layer, API key auth for PAD, automatic audit logging, doctor list API, health endpoint, dashboard UI (overview/doctors/logs/settings), and PAD workflow documentation.

---

## Branch & Worktree

```bash
git worktree add ../bjc-pdf-to-hl7-workflow feature/automation-workflow
```

All work happens in the `feature/automation-workflow` branch via a worktree at `../bjc-pdf-to-hl7-workflow`.

---

## Development Workflow: Red/Green TDD

Every module follows this cycle:
1. **Red** — Write the test file first with all expected behaviors. Run tests to confirm they fail.
2. **Green** — Write the implementation to make tests pass.
3. **Refactor** — Clean up if needed, re-run tests.

Tests are written before implementation, never after.

---

## Phase 0: Terraform Infrastructure

**Why first:** DynamoDB table and IAM policy must exist before any application code can use them. Infrastructure as code in Terraform.

### New Files
- **`infra/main.tf`** — Terraform provider config (AWS, ap-southeast-2)
- **`infra/dynamodb.tf`** — DynamoDB table definition:
  ```hcl
  resource "aws_dynamodb_table" "app" {
    name         = "bjc-pdf-to-hl7"
    billing_mode = "PAY_PER_REQUEST"
    hash_key     = "pk"
    range_key    = "sk"
    attribute { name = "pk"; type = "S" }
    attribute { name = "sk"; type = "S" }
    ttl { attribute_name = "ttl"; enabled = true }
  }
  ```
- **`infra/iam.tf`** — DynamoDB policy attached to Amplify compute role:
  ```hcl
  data "aws_iam_role" "amplify_compute" {
    name = "AmplifyComputeRole-ddv0o3k8wcjhr"
  }
  resource "aws_iam_role_policy" "dynamodb_access" {
    name   = "bjc-pdf-to-hl7-dynamodb"
    role   = data.aws_iam_role.amplify_compute.id
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query",
                     "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
        Resource = aws_dynamodb_table.app.arn
      }]
    })
  }
  ```
- **`infra/outputs.tf`** — Table name and ARN outputs
- **`infra/.terraform.lock.hcl`** — Provider lock file (generated)
- **`infra/README.md`** — Apply instructions

### Apply
```bash
cd infra && terraform init && terraform plan && terraform apply
```

---

## Phase 1: DynamoDB Application Layer

**Why:** Every new feature (audit logs, doctor list, API keys, metrics) needs persistent storage. DynamoDB is provisioned by Terraform (Phase 0). At ~500 referrals/month, costs <$1/month.

### Single-Table Design

| Entity | PK | SK | Purpose |
|--------|----|----|---------|
| API Key (by hash) | `APIKEY#<sha256>` | `APIKEY#<sha256>` | Lookup by hashed key value |
| API Key (by ID) | `APIKEYID#<id>` | `APIKEYID#<id>` | List/revoke by key ID |
| Audit Log | `AUDIT#<YYYY-MM>` | `<ISO-timestamp>#<uuid>` | Query logs by month, paginated |
| Doctor List | `DOCTORS#default` | `DOCTORS#default` | Single item with array of names |
| Daily Metric | `METRIC#<YYYY-MM-DD>` | `METRIC#<YYYY-MM-DD>` | Aggregated counts per day |

### TDD Sequence
1. **Red:** Write `lib/dynamodb.test.ts` — tests for putItem, getItem, queryItems, updateItem, incrementItem, deleteItem with mocked DynamoDB client. Run → all fail.
2. **Green:** Write `lib/dynamodb.ts` — Document Client singleton, typed helpers. Table name from `DYNAMODB_TABLE` env var (default: `bjc-pdf-to-hl7`), region `ap-southeast-2`. Run → all pass.

### Dependencies
- `bun add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb`

### Config
- New env var: `DYNAMODB_TABLE` (optional, defaults to `bjc-pdf-to-hl7`)
- Update `amplify.yml` to write `DYNAMODB_TABLE` to `.env.production`

---

## Phase 2: Convert Service Layer + API Key Auth

**Why:** Both browser UI and PAD call the same `/api/convert` endpoint. Extract pure conversion logic into a service layer so the route handler is a thin orchestrator. PAD needs API key auth alongside cookie auth.

### Architecture
```
lib/
├── convert-service.ts   ← Pure conversion (extract + build HL7 + format)
├── auth.ts              ← API key validation + resolveAuth()
├── audit.ts             ← Audit logging + metrics (Phase 3)
├── pdf-parser.ts        ← Existing (unchanged)
├── hl7-builder.ts       ← Existing (unchanged)
└── dynamodb.ts          ← Data layer (Phase 1)

app/api/convert/route.ts ← Thin handler: auth → service → audit
```

### Service Interface
```typescript
// lib/convert-service.ts
interface ConvertRequest {
  pdfBuffer: Buffer;
  filename: string;
  fileSizeBytes: number;
  documentType?: DocumentType | "auto";
  autoFile?: boolean;
  orderingProvider?: string;
  carrier?: string;
  bjcDoctors?: string[];
}

interface ConvertResult {
  success: boolean;
  filename?: string;
  hl7Content?: string;
  extractedData?: Record<string, string>;
  documentType: DocumentType;
  messageType?: string;
  warnings: string[];
  error?: string;
  processingTimeMs: number;
  tokensUsed?: { input: number; output: number };
}

export async function convertPdf(req: ConvertRequest): Promise<ConvertResult>
export function parseConvertFormData(request: NextRequest): Promise<{ data: ConvertRequest } | { error: string }>
```

### Auth Interface
```typescript
// lib/auth.ts
interface AuthResult {
  valid: boolean;
  source: "web" | "api";
  keyId?: string;
  name?: string;
}

export async function resolveAuth(request: NextRequest): Promise<AuthResult>
export async function validateApiKey(key: string): Promise<{ valid: boolean; keyId?: string; name?: string }>
export function generateApiKey(): { keyId: string; plaintext: string; hash: string }
export async function createApiKeyRecord(name: string): Promise<{ keyId: string; plaintext: string }>
export async function revokeApiKey(keyId: string): Promise<void>
export async function listApiKeys(): Promise<Array<{ keyId: string; name: string; createdAt: string; lastUsedAt?: string }>>
```

### Route Handler (~30 lines)
```typescript
export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = await parseConvertFormData(request);
  if ("error" in input) return NextResponse.json({ success: false, error: input.error }, { status: 400 });

  const result = await convertPdf(input.data);

  void recordConversion({ ...result, source: auth.source, apiKeyId: auth.keyId });

  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
```

### TDD Sequence
1. **Red:** Write `lib/convert-service.test.ts` — tests for convertPdf (success/failure, document types, options pass-through, timing capture) and parseConvertFormData (valid/invalid/missing file/oversized). Run → all fail.
2. **Green:** Write `lib/convert-service.ts` — extract logic from current route.ts into pure functions. Run → all pass.
3. **Red:** Write `lib/auth.test.ts` — tests for resolveAuth (cookie→web, apikey→api, neither→invalid), generateApiKey (bjc_ prefix, length), validateApiKey (valid/invalid/malformed), createApiKeyRecord (stores both records), revokeApiKey (deletes both), listApiKeys (no plaintext). Run → all fail.
4. **Green:** Write `lib/auth.ts` — SHA-256 hashing via Node.js `crypto`, DynamoDB lookups. Run → all pass.
5. **Red:** Add tests to `middleware.test.ts` — API key header passthrough on `/api/*`, `/api/health` public, existing cookie flow unchanged. Run → new tests fail.
6. **Green:** Modify `middleware.ts` — check `X-API-Key` header on `/api/*` routes, add `/api/health` as public. Run → all pass.
7. **Red:** Rewrite `app/api/convert/route.test.ts` — thin handler tests: 401 when no auth, delegates to convertPdf, fires audit, returns result. Run → new tests fail.
8. **Green:** Rewrite `app/api/convert/route.ts` — thin orchestrator using service layer. Run → all pass.

---

## Phase 3: Audit Logging & Metrics

**Why:** Every conversion must be recorded (metadata only — no patient data). The dashboard needs metrics to display.

### TDD Sequence
1. **Red:** Write `lib/audit.test.ts` — tests for recordAuditLog (correct PK/SK, no patient data), queryAuditLogs (pagination, month filter), incrementDailyMetric (atomic counters), getDailyMetrics (date range). Run → all fail.
2. **Green:** Write `lib/audit.ts` — all functions using DynamoDB helpers. Run → all pass.
3. **Red:** Add tests to `app/api/convert/route.test.ts` — verify audit log is called on success and failure. Run → new tests fail.
4. **Green:** Modify `app/api/convert/route.ts` — fire-and-forget audit + metrics after conversion. Run → all pass.

### Audit Log Schema (metadata only)
```typescript
interface AuditLogEntry {
  timestamp: string;        // ISO 8601
  source: "web" | "api";    // Browser vs PAD
  apiKeyId?: string;        // Which API key (if API source)
  documentType: string;     // consent_form, referral_letter, gp_referral, generic
  success: boolean;
  errorMessage?: string;    // No patient info
  filename: string;         // Original PDF filename
  fileSizeBytes: number;
  messageType?: string;     // ORU^R01 or REF^I12
  processingTimeMs: number;
  tokensUsed?: { input: number; output: number };
  ttl?: number;             // 90-day auto-cleanup
}
```

### Daily Metrics Schema
```typescript
interface DailyMetric {
  date: string;
  totalConversions: number;
  successCount: number;
  failureCount: number;
  byDocumentType: { consent_form: number; referral_letter: number; gp_referral: number; generic: number };
  bySource: { web: number; api: number };
  totalProcessingTimeMs: number;
}
```

### Modified Files
- **`app/api/convert/route.ts`** — After conversion completes (success or failure), fire-and-forget audit log + metric update. Capture timing with `Date.now()` before/after. Use `Promise.allSettled()` so logging failures don't block the response.

---

## Phase 4: Doctor List API

**Why:** Doctor list is currently localStorage-only. Both the dashboard and PAD automation need a server-side canonical list.

### TDD Sequence
1. **Red:** Write `lib/doctors.test.ts` — tests for getDoctorList (returns from DynamoDB, falls back to defaults), updateDoctorList (validates non-empty, writes to DynamoDB). Run → all fail.
2. **Green:** Write `lib/doctors.ts` — functions + `DEFAULT_BJC_DOCTORS` constant (moved from `app/page.tsx`). Run → all pass.
3. **Red:** Write `app/api/doctors/route.test.ts` — GET returns doctors array, PUT validates and updates, auth required. Run → all fail.
4. **Green:** Write `app/api/doctors/route.ts` — GET/PUT with auth. `export const runtime = "nodejs"`. Run → all pass.
5. **Modify** `app/page.tsx` — Fetch `GET /api/doctors` on mount instead of localStorage. Import `DEFAULT_BJC_DOCTORS` from `lib/doctors.ts` as fallback.

---

## Phase 5: Health Endpoint

**Why:** Dashboard needs health status. PAD/monitoring can check service availability.

### TDD Sequence
1. **Red:** Write `app/api/health/route.test.ts` — tests for health response shape, DynamoDB check, Bedrock credential check, today's metrics inclusion. Run → all fail.
2. **Green:** Write `app/api/health/route.ts` — `GET` (unauthenticated), checks DynamoDB + Bedrock + today's metrics. Run → all pass.

### Response Shape
```json
{
  "status": "healthy",
  "timestamp": "2026-03-30T14:25:00.000Z",
  "version": "1.1.0",
  "checks": {
    "dynamodb": { "status": "ok", "latencyMs": 12 },
    "bedrock": { "status": "ok" }
  },
  "metrics": { "today": { "total": 23, "success": 21, "failure": 2 } }
}
```

---

## Phase 6: Dashboard API Endpoints

### TDD Sequence (all three routes in parallel)
1. **Red:** Write test files for all three routes:
   - `app/api/keys/route.test.ts` — list/create/revoke keys, cookie auth only
   - `app/api/logs/route.test.ts` — paginated query, month filter, cookie auth
   - `app/api/metrics/route.test.ts` — date range query, cookie auth
2. **Green:** Implement all three route handlers. Run → all pass.

---

## Phase 7: Dashboard UI

### New Files
- **`app/dashboard/layout.tsx`** — Server component layout with sidebar nav (Overview, Doctors, Audit Log, Settings). `force-dynamic`. Shares brand CSS.
- **`app/dashboard/page.tsx`** — Overview: health status cards, today's metrics, success rate, recent activity (last 10 audit entries). Simple CSS bar charts (no chart library).
- **`app/dashboard/doctors/page.tsx`** — Doctor list CRUD backed by `GET/PUT /api/doctors`. Add/remove/reset. Same UI pattern as existing Doctors tab but server-backed.
- **`app/dashboard/logs/page.tsx`** — Audit log table with month picker, pagination, source/type/status columns. No patient data columns.
- **`app/dashboard/settings/page.tsx`** — API key management: list keys, create (show plaintext once with copy button), revoke. Warning about one-time plaintext display.

### Design
- Reuse existing Tailwind design system from `globals.css` (BJC brand colors)
- Sidebar navigation for dashboard section
- Responsive for tablet/desktop (staff use it at reception desk)
- No external chart library — CSS/Tailwind bar visualization for metrics

---

## Phase 8: PAD Workflow Documentation

**Why:** The PAD flow runs on the Windows server and is built separately. We provide the API contract and reference flow design.

### New Files
- **`docs/operations/pad-integration-guide.md`** — Complete PAD integration reference:
  - API endpoint contract (POST /api/convert with X-API-Key header)
  - Request/response format with examples
  - Authentication setup (API key from dashboard)
  - Error handling and retry logic (retry 500s twice, don't retry 400/401)
  - PAD Robin pseudocode for the full flow
  - Task Scheduler configuration (15-min, Mon-Fri 7AM-7PM, startup trigger)
  - HL7 file encoding (ASCII for Genie compatibility)
  - Email folder routing (Linked/Review)
  - Failure notification email template
  - Carrier value: `"EMAIL"` for email-sourced referrals

### PAD Flow Summary
```
Check mailbox → For each unread email with PDF attachment:
  → POST /api/convert with PDF + API key
  → Save hl7Content to Genie LabRslts folder as .hl7 file
  → Move email to Linked (success) or Review (failure)
  → Send notification email on failure
  → Log to audit (automatic via /api/convert)
```

---

## Refactoring Notes

Refactor existing code where it improves clarity:
- **`app/api/convert/route.ts`** — Replace the 154-line monolith with thin orchestrator (~30 lines). All conversion logic moves to `lib/convert-service.ts`.
- **`app/page.tsx`** — Extract `DEFAULT_BJC_DOCTORS` to `lib/doctors.ts`. Replace localStorage doctor management with API calls. Clean up any dead code.
- **`middleware.ts`** — Extract public route list to a constant. Add clear comments for the two auth paths (cookie vs API key).
- **`lib/pdf-parser.ts`** / **`lib/vision-extractor.ts`** — If the service layer reveals cleaner interfaces (e.g., returning tokens used), update these to expose that data cleanly rather than losing it.
- **Type exports** — Consolidate shared types (`DocumentType`, `PatientData`, `ReferralInfo`, `ExtractionResult`) into `lib/types.ts` if they're currently duplicated or scattered across files.
- **Test helpers** — If test files share common mocking patterns (e.g., mock Bedrock client, mock FormData), extract to `lib/test-helpers.ts`.

---

## File Summary

| Action | Count | Files |
|--------|-------|-------|
| Terraform | 4 | infra/main.tf, infra/dynamodb.tf, infra/iam.tf, infra/outputs.tf |
| New source files | 12 | lib/dynamodb.ts, lib/auth.ts, lib/audit.ts, lib/doctors.ts, app/api/doctors/route.ts, app/api/health/route.ts, app/api/keys/route.ts, app/api/logs/route.ts, app/api/metrics/route.ts, app/dashboard/layout.tsx, app/dashboard/page.tsx + 3 subpages |
| New test files | 9 | Matching .test.ts for each source module + route |
| Modified files | 4 | middleware.ts, app/api/convert/route.ts, app/page.tsx, package.json |
| Config files | 2 | amplify.yml, .env.example |
| Documentation | 1 | docs/operations/pad-integration-guide.md |

---

## Env Var Additions

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DYNAMODB_TABLE` | No | `bjc-pdf-to-hl7` | DynamoDB table name |

API keys are managed via the dashboard (stored hashed in DynamoDB), not as env vars.

---

## IAM & DynamoDB

Provisioned via Terraform in `infra/` (Phase 0). See `infra/README.md` for apply instructions.

---

## Verification

After each phase:
1. `bun test` — all existing + new tests pass
2. `bun run build` — production build succeeds
3. `bun run lint` — no lint errors

End-to-end after all phases:
1. **API key flow:** Create key via dashboard settings → `curl -X POST -H "X-API-Key: <key>" -F "pdf=@test.pdf" https://<domain>/api/convert` → verify HL7 response
2. **Audit log:** Convert a PDF via web UI + via API key → verify both appear in dashboard logs
3. **Doctor list:** Update doctors via dashboard → convert a referral → verify addressee resolution uses updated list
4. **Health check:** `curl https://<domain>/api/health` → verify all checks pass
5. **Metrics:** Process several PDFs → verify dashboard overview shows correct counts
6. **Existing tests:** `bun test` — all 187+ existing tests still pass (no regressions)
