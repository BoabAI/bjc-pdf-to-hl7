# UI Design Congruence & Uniformity Pass

**Worktree:** `/Users/sean/Projects/bjc-pdf-to-hl7-worktrees/meeting-followup` (branch `feat/2026-05-20-meeting-followup`)
**Dev server for verification:** `http://localhost:3100` (running with `TEST_MODE=true`)

## Context

The app's shared chrome (nav, logo strip, fonts, primary cards/buttons) already reads as one product. But an audit of all seven tabs — done both visually in-browser and via static analysis of every page — surfaced four recurring sources of drift:

1. **Off-system colours.** Status colours are hardcoded Tailwind palette utilities (`amber-*`, `purple-*`, `zinc-*`, `emerald-*`, `yellow-*`) carrying `dark:` variants. The design system in `app/globals.css` has **no dark mode and no amber/purple/zinc tokens**, so the `dark:` classes are dead code and the hues drift from the brand CSS vars.
2. **Ghost classes / tokens that silently no-op** — actual breakage: `class="input"` (undefined; should be `.input-field`/`.select-field`), `var(--accent)` / `var(--surface-muted)` (undefined; fall back to raw hex), `privacy-content` (undefined).
3. **Footer fragmentation.** `AppFooter` exists with canonical copy, but Compliance & Privacy hand-roll their own `<footer>` with *different* wording ("ADRM Compliant · IRAP PROTECTED"), and Settings/Reference/Help render no footer at all.
4. **Page-wrapper width drift.** Narrow content pages don't share a width: Converter `max-w-[580px]`, Help `max-w-[760px]`, the rest `max-w-[680px]`; vertical padding varies `py-8` vs `py-10`.

Goal: route all status colour through brand-aligned semantic tokens, kill the ghost classes, unify the footer, and align the wrappers — without disturbing the intentional patterns (wide data pages, the categorical donut palette).

## Design decisions (intentional, called out so they aren't "fixed" by accident)

- **Wide data pages stay wide.** Log & Stats use `max-w-7xl p-6 md:p-10`; that's correct for tables/dashboards. Only the *narrow content* pages get width-aligned.
- **The 5-way "reason" colour scale stays on its hues.** `ROUTING_REASON_STYLE` (auditShared) and `REVIEW_REASON_STYLES` (ConversionResultPanel) are a categorical scale (low_confidence/missing_fields/wrong_inbox/unknown_type/extraction_failed) that **deliberately mirrors the Tremor donut palette** (`amber/orange/rose/violet/slate`). Force-tokenising these into brand vars would break the badge↔chart colour match and add 15 redundant vars. Fix = **strip the dead `dark:` variants only**, and add a comment documenting the intent.
- **Binary semantic states DO get tokens.** done/failed/auto-routed/manual-review/converting/AI-Vision are binary semantics → route through new/existing brand tokens.
- **Converter keeps its vertical centering** (`justify-center`) — a deliberate landing-page polish that only manifests because that page is short. Width unifies to 680.
- **No route-group refactor.** Hoisting nav/footer into a shared authenticated layout is the "correct" structural fix but is invasive (login must stay outside) and risky mid-worktree. We keep the existing per-page `<AppNav/>` pattern and add `<AppFooter/>` per page to match.
- **Footer copy unifies to `AppFooter`'s line** ("HL7 v2.4 · Genie Compatible · AI processed via AWS Bedrock AU regions"). The "ADRM Compliant · IRAP PROTECTED" wording is **dropped from the footer** (it still lives in the Compliance page body). ⚠️ Flag for sign-off.

---

## Step 1 — Foundation: add tokens + classes to `app/globals.css`

Add to `:root`:
```css
/* warning — amber (manual review / caution) */
--warning: #b45309;
--warning-bg: #fffbeb;
--warning-bg-strong: #fef3c7;   /* table row hover */
--warning-border: #fcd34d;
/* success row hover (—-bg already exists) */
--success-bg-strong: #dcfce7;
/* ai / processing — violet (SMEC AI accent) */
--ai: #7c3aed;
--ai-bg: #f5f3ff;
--ai-border: #ddd6fe;
```

Add badge + audit-row helpers (next to existing `.badge-*`):
```css
.badge-warning { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-border); }
.badge-neutral { background: var(--bg-inner);   color: var(--text-secondary); border: 1px solid var(--border-light); }
.badge-ai      { background: var(--ai-bg);      color: var(--ai); border: 1px solid var(--ai-border); }

.audit-row-ok            { background: var(--success-bg); }
.audit-row-ok:hover      { background: var(--success-bg-strong); }
.audit-row-review        { background: var(--warning-bg); }
.audit-row-review:hover  { background: var(--warning-bg-strong); }
```

## Step 2 — Theme A: route status colours through tokens (strip dead `dark:`)

| File | Lines | Change |
|---|---|---|
| `app/components/FileQueueItem.tsx` | 43–50 (`STATUS_BADGES`) | `converting` → `bg-[var(--ai-bg)] text-[var(--ai)]`; `done` → `bg-[var(--success-bg)] text-[var(--success)]`; `failed` → `bg-[var(--error-bg)] text-[var(--error)]`. Drop all `dark:`. |
| `app/components/FileQueueItem.tsx` | 83 | Inline simulated-mailbox pill → `badge badge-neutral` (keep `text-[10px]` sizing). |
| `app/components/ConversionResultPanel.tsx` | 119 | AI Vision badge → `className="badge badge-ai text-[10px] px-2 py-0.5"` (drop purple + `dark:`). |
| `app/components/ConversionResultPanel.tsx` | 23–52 (`REVIEW_REASON_STYLES`) | Strip `dark:` variants, keep light hues; add comment "categorical scale — mirrors Tremor donut palette". |
| `app/components/ConversionResultPanel.tsx` | `MailboxDisagreementCallout` (~203–218) | Amber callout → `--warning`/`--warning-bg`/`--warning-border` tokens; drop `dark:`. |
| `app/components/auditShared.ts` | 76–105 (`ROUTING_REASON_STYLE`) | Strip `dark:` variants from all 5 `badge` strings; keep hues; add the same "mirrors donut palette" comment. |
| `app/log/page.tsx` | 297–298 | Row tint → `audit-row-review` / `audit-row-ok` classes (replaces `bg-amber-50/60 hover:bg-amber-100/60` / emerald). |
| `app/log/page.tsx` | 318–319 | Routing badge → auto `bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]`; manual `bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]`. Drop `dark:`. |

## Step 3 — Theme B: kill ghost classes / tokens

| File | Lines | Change |
|---|---|---|
| `app/log/page.tsx` | 225, 240 | `class="input text-xs py-1"` → `class="select-field text-xs py-1"` (these are `<select>` — gains the chevron + focus ring). |
| `app/components/dashboard/SettingsPanel.tsx` | 149 | `w-16 input text-right` → `w-16 input-field text-right`. |
| `app/help/filename-hash/page.tsx` | 86 | Filename `<input>` → `className="input-field font-mono"` (replaces hand-rolled border/`rounded-md`/`focus:ring-[var(--accent…)]`). |
| `app/help/filename-hash/page.tsx` | 98, 105 | `var(--surface-muted,#f5f5f5)` → `var(--bg-inner)`. |
| `app/help/filename-hash/page.tsx` | 111, 133 | `var(--accent,#2563eb)` → `var(--bjc-blue)`. |
| `app/privacy/page.tsx` | 454 | Remove dead `privacy-content` class (real bullets come from `policy-body` on the inner div at 465). |

## Step 4 — Theme C: unify footer

- Add `import { AppFooter }` + render `<AppFooter />` (inside the content container, after the card) on: `app/settings/page.tsx`, `app/reference/page.tsx`, `app/help/filename-hash/page.tsx`, and `app/log/page.tsx` + `app/stats/page.tsx` if they currently lack one (verify on edit).
- `app/compliance/page.tsx` 321–326 and `app/privacy/page.tsx` 495–500: replace the inline `<footer>…ADRM Compliant…IRAP PROTECTED…</footer>` with `<AppFooter />`. ⚠️ drops that copy from the footer (see decisions).

## Step 5 — Theme D: align narrow-page wrappers

Canonical narrow wrapper: `px-4 py-10`, inner `max-w-[680px]`.

| File | Change |
|---|---|
| `app/page.tsx` (130) | `max-w-[580px]` → `max-w-[680px]` (keep `justify-center`). |
| `app/help/filename-hash/page.tsx` (51–52) | `max-w-[760px]` → `max-w-[680px]`; `py-8 md:py-10` → `py-10`. |
| `app/settings/page.tsx` (11) | `py-8 md:py-10` → `py-10`. |
| `app/reference/page.tsx` (14) | `py-8 md:py-10` → `py-10`. |
| `app/compliance/page.tsx` (214) | `py-8` → `py-10`. |
| `app/privacy/page.tsx` (406) | `py-8` → `py-10`. |

(The cosmetic `mx-auto` vs `flex flex-col items-center` split is left as-is — both centre identically; not worth the churn/risk.)

## Step 6 — Theme E: normalise heading typography

Canonical: `h1` = `text-2xl font-bold tracking-tight text-[var(--text-primary)]`; subtitle = `text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed`. (Keep the data-page header-card vs content-page in-card *layouts* — both intentional.)

| File | Change |
|---|---|
| `app/components/audit/AuditDateRangeHeader.tsx` (38–39) | add `tracking-tight` to h1; subtitle `mt-1` → `mt-1.5`. |
| `app/compliance/page.tsx` (230) | subtitle `mt-0.5` → `mt-1.5`. |
| `app/privacy/page.tsx` (424) | subtitle `mt-0.5` → `mt-1.5`. |

## Step 7 — Theme F: minor nits

| File | Lines | Change |
|---|---|---|
| `app/page.tsx` | 170 | skip-notice `rounded-md` → `rounded-xl` (align to 12px radius scale). |
| `app/log/page.tsx` | 304, 339, expanded-warnings (~379) | `font-mono` → `mono` (JetBrains Mono). |
| `app/compliance/page.tsx` | 286, 300 | `p-4 rounded-xl bg-[var(--bg-inner)] border border-[var(--border-light)]` → `card-inner p-4`. |
| `app/privacy/page.tsx` | 435 | same `bg-inner` panel → `card-inner p-4`. |

**Left intentionally unchanged:** Stats `COLOR_SWATCH` legend dots (`bg-blue-500` etc. match the Tremor chart palette by design); Stats donut grid not wrapped in an outer `.card` (legitimate dashboard pattern); subtle text buttons "Clear all" (`ConvertActions`) / "Cancel" (`ReferenceDataTab`) (deliberately understated, not full buttons); `AppNav` `bg-white/85` (white == `--bg-card`).

---

## Files touched (≈11)

- `app/globals.css` (tokens + badge/row classes)
- `app/page.tsx`
- `app/components/FileQueueItem.tsx`
- `app/components/ConversionResultPanel.tsx`
- `app/components/auditShared.ts`
- `app/log/page.tsx`
- `app/stats/page.tsx` (footer only, if missing)
- `app/components/dashboard/SettingsPanel.tsx`
- `app/components/audit/AuditDateRangeHeader.tsx`
- `app/settings/page.tsx`, `app/reference/page.tsx`
- `app/compliance/page.tsx`, `app/privacy/page.tsx`
- `app/help/filename-hash/page.tsx`

## Verification

1. **Typecheck + lint:** `bun run typecheck && bun run lint` (clean — pre-existing test-file warnings excepted).
2. **Tests:** `bun test` (no behavioural changes expected; class/colour only).
3. **Visual re-check in browser (`:3100`)** of every tab:
   - Log: filtered selects now have the chevron + focus ring; routing badges & row tints render via tokens (no visual regression); mono cells use JetBrains Mono.
   - Converter: width matches the other content pages; status badges (done/failed/converting) + AI Vision badge render via tokens.
   - Settings: confidence number box now matches `.input-field`.
   - Help: input/links/code use brand blue + `--bg-inner`; width 680.
   - Compliance / Privacy: single `AppFooter`; inner panels are `card-inner`; no dead classes.
   - Stats: unchanged (donuts + legend intact).
4. Confirm a manual-review conversion still shows the correct reason hue end-to-end (badge colour == donut segment colour).

## Post-merge housekeeping

Copy this plan to `docs/plans/` in the repo (per CLAUDE.md) once implementation begins.
