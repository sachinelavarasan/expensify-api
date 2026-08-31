# Feature Roadmap — AI & Non-AI Ideas

Brainstormed feature ideas for Expensify, split into AI-powered (via Gemini API) and non-AI (rule-based / plain logic) tracks. Each entry has a goal, the key files/screens it touches, rough implementation steps, and an effort estimate (S/M/L).

## Part A — AI-powered (via Gemini API)

### 1. Smart category suggestion — Effort: S — SHIPPED (2026-08-02)
- **Goal:** Suggest a transaction category as the user types a description.
- **Touches:** `app/(root)/transaction.tsx`, new `hooks/useAICategorySuggestion.ts`, categories list from `hooks/useCategoryListOperation.ts`.
- **Steps:** Add a debounced call from the description field → backend/Gemini endpoint with `{description, existing categories}` → return best-match category → show as a tappable suggestion chip above the category picker.

### 2. Receipt scanning → auto-fill transaction — Effort: L
- **Goal:** Photo of a receipt extracts amount/merchant/date and pre-fills the add-transaction form.
- **Touches:** New "Scan Receipt" entry point near `transaction.tsx` / `import-transactions.tsx`; add `expo-camera` + `expo-image-picker` (already present); new `hooks/useReceiptScan.ts`.
- **Steps:** Capture/pick image → upload to backend → backend sends image to Gemini vision → parse structured JSON (amount, merchant, date) → return to app → pre-fill form fields for user to confirm/edit.

### 3. Natural-language quick-add — Effort: M
- **Goal:** Parse free text like "coffee 4.50 yesterday" into structured transaction fields.
- **Touches:** New quick-add field on `transaction.tsx` or dashboard; `hooks/useAIQuickAdd.ts`.
- **Steps:** Send raw text to Gemini with a strict JSON-output prompt (amount/date/description/category) → validate shape → prefill form → user confirms before save.

### 4. Ask-AI spending insights — Effort: L
- **Goal:** Chat-style Q&A over the user's spending data.
- **Touches:** New screen `app/(root)/dashboard/ask-ai.tsx`; reuse data already computed for `stats.tsx`.
- **Steps:** New chat UI (message list + input) → on send, package relevant transaction/stat summaries as context → call Gemini → stream/return answer → render as chat bubble.

### 5. AI-generated monthly summary — Effort: M
- **Goal:** Plain-language narrative recap ("You spent 20% more on dining this month...").
- **Touches:** `export-transactions.tsx` or `dashboard/stats.tsx`; new `hooks/useAISummary.ts`.
- **Steps:** Aggregate month-over-month category totals client-side → send compact JSON summary (not raw transactions) to Gemini → render returned narrative text in a card.

### 6. Budget recommendations — Effort: M
- **Goal:** Suggest per-category budget amounts based on historical spend.
- **Touches:** `app/(root)/dashboard/budget.tsx`; new `hooks/useAIBudgetSuggestion.ts`.
- **Steps:** Compute trailing 3-6 month average per category client-side → send to Gemini for a "reasonable budget" suggestion + rationale → show as a pre-fill option when creating/editing a budget.

### 7. Smart bill reminders — Effort: M
- **Goal:** Time reminders based on actual payment patterns instead of a fixed time.
- **Touches:** `useReminderSettings` hook, `settings.tsx`.
- **Steps:** Detect historical pay-dates for recurring items (reuse Part B #8 rule-based detection first) → optionally have Gemini refine/explain timing → schedule local notification accordingly.

### 8. AI coaching nudges — Effort: S/M
- **Goal:** Short personalized dashboard messages about spending trends.
- **Touches:** `dashboard/index.tsx`; new `hooks/useAINudge.ts`.
- **Steps:** Periodically (e.g. on dashboard load, cached for a day) send a compact spending summary to Gemini → display one short returned sentence in a dismissible card.

### 9. Smarter recurring/duplicate detection (AI-assisted) — Effort: M
- **Goal:** Catch fuzzy duplicates/recurring items that plain rules miss (name variants, near-equal amounts).
- **Touches:** `import-transactions.tsx`, `recurring-transaction(s).tsx`.
- **Steps:** Run the cheap rule-based pass first (Part B #8/#9) → for ambiguous/borderline cases only, send the small candidate set to Gemini to confirm match — keeps API calls low.

### 10. Smarter merchant name cleanup (AI-assisted) — Effort: S
- **Goal:** Normalize merchant strings regex can't anticipate.
- **Touches:** Transaction entry/import pipeline.
- **Steps:** Try the static lookup/regex table first (Part B #7); only fall back to a Gemini call for unmatched/unusual strings, caching results per unique raw string to avoid repeat calls.

---

## Part B — Non-AI (rule-based / plain logic)

### 1. Soft-delete / trash bin — Effort: S
- **Goal:** Deleted transactions are recoverable instead of gone immediately.
- **Touches:** Transaction model (add `deletedAt`), `hooks/useTransaction.ts`, a new "Trash" filter/screen.
- **Steps:** Mark-delete instead of hard-delete → filter active views by `deletedAt IS NULL` → add a Trash view with restore/permanent-delete actions → optional auto-purge after N days.

### 2. Transaction tags — Effort: S/M
- **Goal:** Free-form labels alongside categories for cross-cutting filters.
- **Touches:** `transaction.tsx` form, transaction list/filter UI.
- **Steps:** Add `tags: string[]` field to transaction model → tag input UI (chips) on the form → add tag filter to the transaction list.

### 3. Custom category icons/colors — Effort: S
- **Goal:** Personalize categories beyond defaults.
- **Touches:** `app/(root)/categories/index.tsx`, `categories/[id].tsx`.
- **Steps:** Add icon-picker + color-picker to the category form → store on the category model → use in category chips/lists throughout the app.

### 4. Quick-add favorites/templates — Effort: S
- **Goal:** One-tap re-use of frequent transactions.
- **Touches:** `transaction.tsx`, local storage only (AsyncStorage).
- **Steps:** "Save as template" action on a transaction → store template list locally → show as quick-tap chips above the add-transaction form.

### 5. Multi-account net-worth total — Effort: S
- **Goal:** Combined balance across all accounts.
- **Touches:** `dashboard/index.tsx`, existing `accounts/[id].tsx` data.
- **Steps:** Sum balances already fetched per account (via existing accounts hook) → display as a single card on the dashboard.

### 6. Budget threshold notifications — Effort: S/M
- **Goal:** Alert when spend crosses 80%/100% of a category budget.
- **Touches:** `dashboard/budget.tsx`, `expo-notifications`.
- **Steps:** After each transaction save, recompute category spend vs. budget client-side → if threshold crossed, fire a local notification.

### 7. Merchant name cleanup (rule-based) — Effort: S
- **Goal:** Normalize noisy merchant strings.
- **Touches:** Transaction entry/import pipeline.
- **Steps:** Build a static regex/lookup table (strip prefixes like "SQ *", trailing store numbers) → apply on transaction create/import.

### 8. Recurring transaction detection (rule-based) — Effort: M
- **Goal:** Auto-flag likely recurring transactions.
- **Touches:** `recurring-transaction(s).tsx`, transaction history.
- **Steps:** Group transactions by merchant + similar amount (±small %) → check interval regularity (e.g. ~30 days) → suggest "mark as recurring" for matches.

### 9. Duplicate detection on import (rule-based) — Effort: S/M
- **Goal:** Flag likely duplicates before committing a bulk import.
- **Touches:** `import-transactions.tsx`.
- **Steps:** Before commit, compare each staged row against existing transactions on amount+date+description (exact/fuzzy match) → flag/skip likely duplicates, let user confirm.

### 10. Bulk edit/delete transactions — Effort: M
- **Goal:** Multi-select transactions for batch category change or delete.
- **Touches:** Transaction list screen.
- **Steps:** Add multi-select mode (long-press to enter) → batch action bar (change category / delete, using Part B #1's soft-delete) → confirm dialog.

### 11. Calendar view of transactions — Effort: M
- **Goal:** Day/month grid alternative to the list view.
- **Touches:** New view/tab near the transaction list.
- **Steps:** Add a calendar component → map transactions to dates → tap a day to see that day's transactions.

### 12. Split/shared expenses — Effort: L
- **Goal:** Divide a transaction across multiple people.
- **Touches:** `transaction.tsx`, new "participants" concept, likely backend model change.
- **Steps:** Add participant list + split method (equal/custom) to transaction model → UI for adding participants and shares → settlement/summary view.

### 13. Savings goals tracker — Effort: M
- **Goal:** Goal amount + progress bar, sibling to budgets.
- **Touches:** New screen near `budget.tsx`; new goal model.
- **Steps:** Create goal model (target amount, target date, linked account/category) → progress calculation → dashboard/goals card.

### 14. Biometric app lock — Effort: S/M
- **Goal:** Face ID/Touch ID gate on app open.
- **Touches:** App entry flow, `lib/tokenStore.ts`.
- **Steps:** Add `expo-local-authentication` → prompt on cold start/resume → fall back to existing auth if unavailable → toggle in `settings.tsx`.

### 15. Debt/loan tracker — Effort: M
- **Goal:** Track money owed/lent separately from regular transactions.
- **Touches:** New screen + model, similar shape to accounts.
- **Steps:** New "debt" entity (person, amount, direction, due date) → list + detail screens → optional linking to a settling transaction.

### 16. Scheduled auto-export — Effort: M
- **Goal:** Auto-email a monthly CSV/PDF instead of manual export only.
- **Touches:** `export-transactions.tsx`, backend (needs server-side cron + email sending — outside this repo).
- **Steps:** Add a "schedule" toggle in export settings → backend cron generates + emails the file monthly.

### 17. Data backup/restore — Effort: M
- **Goal:** Manual full-data export/import for backup.
- **Touches:** `settings.tsx`.
- **Steps:** "Export all data" action bundling accounts/categories/transactions/budgets as JSON → "Import" action to restore from that JSON, with conflict handling.

### 18. Offline mode — Effort: L
- **Goal:** App usable without connectivity, syncs later.
- **Touches:** `@tanstack/react-query` config, `lib/apiClient.ts`.
- **Steps:** Enable react-query persistence (AsyncStorage) → queue writes made offline → flush/sync queue on reconnect → handle conflicts.

### 19. Bank SMS/email parsing (regex-based) — Effort: L
- **Goal:** Auto-detect transactions from bank SMS/email alerts.
- **Touches:** New Android-only module (SMS read permission; iOS restricts this).
- **Steps:** Read SMS inbox (Android) or connect an email parsing backend → per-bank regex templates → parse into a pending-transaction queue for user confirmation.

### 20. Transaction attachments (no OCR) — Effort: S/M
- **Goal:** Attach a receipt photo/PDF to a transaction, storage only.
- **Touches:** `transaction.tsx`, reuse `components/ProfileUpload.tsx` pattern.
- **Steps:** Add image/file picker to the transaction form → upload + store URL on the transaction → thumbnail/viewer in transaction detail.

### 21. Advanced search/filter — Effort: M
- **Goal:** Filter by amount range + date range + multiple categories at once.
- **Touches:** Transaction list screen's existing filter UI.
- **Steps:** Extend filter state to support ranges + multi-select categories → update the query params sent via `apiClient`.

### 22. Shared household budget — Effort: L
- **Goal:** Multiple users share one account/budget with permission levels.
- **Touches:** Accounts model, auth/permissions layer — likely backend-heavy.
- **Steps:** Add household/member concept → invite flow → role-based access (view vs. edit) → shared budget aggregation.

### 23. Import mapping wizard — Effort: M
- **Goal:** Map arbitrary CSV columns to fields instead of assuming a fixed format.
- **Touches:** `import-transactions.tsx`.
- **Steps:** Parse header row of uploaded file → UI to map each column to a target field (amount/date/description/category) → remember mapping per file source for next time.

### 24. Self transfer between accounts — Effort: M
- **Goal:** Move money between two of the user's own accounts (debit one, credit the other) without it counting as income/expense anywhere, with correct delete/restore behavior for the transfer as a pair, and correct handling when an account involved in transfer history is deleted.
- **Touches:** New `exp_tt_id=3` "Transfer" type + a system "Transfer" category (mirrors the existing "Others" default-category pattern in `ExpensifyTransactionsCategory.repository.ts:70-83`); `ExpensifyTransactions.repository.ts` (new `createTransfer` plus paired delete/restore/purge logic); `app/(root)/transaction.tsx` (needs a second, "to account" picker — today's form only has one account field); `components/TransactionCard.tsx` (needs a neutral transfer display instead of today's binary expense/income color+sign logic).
- **Steps:** Seed the type-3 row + system category via migration → new repository method validates the transfer amount doesn't exceed the source account's balance, then inserts two linked rows (shared transfer-link id) in one DB transaction, debiting the source/crediting the destination directly rather than reusing the existing single-account type-1/2 balance branch (which would reject type 3) → extend delete/restore/purge to detect a transfer leg and operate on both linked rows together → decide the account-deletion policy for accounts with transfer history (block deletion vs. cascade-delete the linked leg on the other account too) → build the frontend transfer entry point with from/to account pickers.
- **Note:** every existing income/expense sum site (dashboard, budget, stats, exports — ~15 locations audited) already filters by strict `=== 1`/`=== 2` equality, so the new type 3 is automatically excluded everywhere with no changes needed at those sites.
- **Related bug found while auditing deletion (fix alongside, unrelated to transfers):** `ExpensifyBankAccountsRepository.deleteBankAccount` wraps its work in `db.transaction()`, but the account-row delete uses the outer `this.dbObject.db.delete(...)` instead of the callback's `tx.delete(...)` — not actually atomic with the cascaded transaction delete today.

---

## Execution Status — Part A (AI-powered) Progress

Unlike Part B, Part A is being built one feature at a time (not a full phased plan up front), prioritized by Gemini call volume rather than effort size — Gemini runs on a **paid tier**, unlike the app's other backend services (DB, Cloudinary, FCM), which are free-tier.

### ✅ 1. Smart category suggestion — SHIPPED (2026-08-02)
New `src/ai/` module (`gemini.service.ts` wraps `@google/genai`, model `gemini-3.5-flash-lite` via `GEMINI_MODEL` env var; fails soft — returns `null` on any error/timeout/missing key instead of throwing, so a suggestion is always best-effort and never blocks transaction entry). Exported from `AiModule`, imported into the existing `ExpensifyModule` — endpoint lives in the existing `ExpensifyController`/`ExpensifyService` at `POST expensify/ai/suggest-category` rather than a standalone controller, matching this codebase's convention that all user routes share one controller under `AuthExpensifyMiddleware`. The AI's answer is always validated server-side against the requesting user's real category ids before being returned — never trusts free-form model output as an id to act on. `@Throttle` (20/min) is a backstop against abuse; the real cost control is client-side call gating.

Mobile: `hooks/useDebouncedValue.ts` (no debounce dep existed in the repo), `hooks/useAICategorySuggestion.ts` (react-query mutation), `components/CategorySuggestionChip.tsx`. Wired into `app/(root)/transaction.tsx`'s category section — fires only for new transactions with no category chosen yet, 3+ char / 600ms-debounced title, deduped by a `title::exp_tt_id` key, and permanently disabled for the rest of the form session once the user dismisses the chip or picks a category (manually or via the chip). Chip shows a sparkle icon + the suggested category's own icon/color, styled consistently with `CategorySelector`.

Fixed along the way: `switchType` previously only cleared/reset the selected category in edit mode (guarded by `exp_ts_id`) and auto-assigned "Others" for the new type; it now always clears the category outright (to `''`, not an auto-pick) on any type switch for both create and edit, since a category from the old type doesn't belong to the new type's list — this was also silently blocking re-suggestion after a type switch, since the suggestion gate requires no category selected. The category container border now also switches to the error color (`colors.expense`, matching `Input.tsx`'s convention) when `errors.exp_tc_id` is set.

**Requires a real `GEMINI_API_KEY` in `.env`** to actually call Gemini (not yet set as of 2026-08-02 — feature fails soft to "no suggestion" without it).

### ⏳ 2–10. Not started
Receipt scanning (#2), NL quick-add (#3), Ask-AI insights (#4), monthly summary (#5), budget recommendations (#6), smart bill reminders (#7), coaching nudges (#8), AI-assisted recurring/duplicate detection (#9), AI-assisted merchant cleanup (#10) — all can reuse the `GeminiService` plumbing from #1. Vision-heavy or multi-step-reasoning features (#2, #4) will likely want a step up from `gemini-3.5-flash-lite` to full Flash or Pro; simple classification/extraction features (#3, #8, #10) should stay on Flash-Lite.

---

## Execution Status — Part B (Non-AI) Phased Plan

Part B was built out in dependency-ordered phases (batched to avoid re-opening the same screens repeatedly). Full detailed plan history lives in the session's plan file; this is the status summary.

**Already fully built before phasing began:** custom category icons/colors (#3), import mapping wizard (#23 — `.xlsx`-only gap folded into Phase 4).

**Excluded from all phases:**
- Offline mode (#18) — built independently of this roadmap (query caching + `onlineManager`/`NetInfo`), no write-queue by deliberate decision.
- Split expenses (#12), bank SMS/email parsing (#19), shared household budget (#22) — deferred indefinitely per explicit instruction, not scheduled.

### ✅ Phase 1 — Soft-delete + auto-purge (trash bin) — SHIPPED
`exp_ts_deleted_at` column + restore/purge endpoints + 30-day auto-purge cron, new mobile Trash screen. All active-view read paths filtered to exclude trashed rows.

### ✅ Phase 2 — Partials + quick wins — SHIPPED
Net-worth card (#5), budget threshold notifications (#6, local-only), quick-add templates (#4), merchant name cleanup (#7). Biometric app lock (#14) pulled from scope — not approved.

### ✅ Phase 3 — Transaction list & form power-ups — SHIPPED
Tags (#2, `text[]` column), bulk edit/delete (#10), advanced search/filter (#21 — date range, amount range, multi-category, tags), calendar view (#11, `react-native-calendars`).

### ✅ Phase 4 — Import pipeline intelligence — SHIPPED
Duplicate detection on import (#9) — new `exp_transactions_dup_check_idx` composite index, `import-data` now checks staged rows against both existing (non-deleted) transactions and each other within the same file, exact match on user+date+amount+normalized-title. New `possibleDuplicates` response bucket, excluded from commit by default with a per-row opt-in in a new mobile duplicates review sheet. CSV support for the existing import wizard (residual gap from #23) — client-side only, reuses the existing `xlsx` library. Also fixed a pre-existing bug where `bulk-transactions` failed on every commit (hardcoded `category_id` didn't match the UUID-keyed categories table).

### ⏭️ Phase 5 — Recurring detection & goals — DROPPED
Both items (rule-based recurring-pattern detection #8, savings goals tracker #13) were dropped per explicit decision before any code was written. Not scheduled.

### ✅ Phase 6 — Attachments & new trackers — SHIPPED
Transaction attachments, no OCR (#20) — reuses the `ProfileUpload.tsx`/`StorageService` pattern (Firebase Cloud Storage, base64 JSON upload with progress); new `exp_ts_attachment_url` column, decoupled upload/delete endpoints (`POST`/`DELETE /expensify/transaction/attachment`), photo (camera or library) or PDF via a combined `expo-image-picker`/`expo-document-picker` picker, 3MB cap. Debt/loan tracker (#15) — new `exp_debts`/`exp_debt_repayments` tables (parallel to accounts, not an extension of them), standalone repayment log with partial-repayment support (remaining balance computed on read, budget-style — not linked to real transactions/account balances, a deliberate scope-narrowing decision), new list/detail screens under a "Debts & Loans" Profile menu entry. Also extracted a shared `components/ProgressBar.tsx` from two near-duplicate bar implementations (`BudgetSummaryCard`, `CollapsibleCategoryCard`), reused by the new debt cards too.

### ⏳ Phase 7 — Data portability — PARTIALLY SHIPPED
Manual backup/restore (#17) — SHIPPED, API-only, no mobile UI. New `src/backup/` module: admin-only `GET /backup/export` and `POST /backup/import`, both gated by a static `x-backup-token` header (`BACKUP_ADMIN_TOKEN`) checked with `secureCompare` plus a tightened `@Throttle` on top of the app's global throttler (5/min export, 3/min import). Export resolves a user by `userId` or `email` and returns a full JSON bundle (accounts, categories, transactions, starred transactions, budgets, recurring transactions, debts + repayments) with auth secrets (password hash, OTP fields) stripped. Import requires `?confirm=true`, resolves the target user by **email** rather than the bundle's id (a restore across databases can have the same user under a different `exp_us_id`), and wipes + re-inserts that user's data in one DB transaction (rolled back on any failure). Global/shared categories (`exp_tc_user_id IS NULL`, e.g. "Others") are matched by label + transaction type against the target DB rather than by id — the target's own database seeds those with different UUIDs — falling back to creating a user-owned copy if no match exists there, instead of failing the import.

Scheduled auto-export (#16) — not started; needs a new backend cron + email sending, still its own pass.

### ✅ Phase 8 — Self transfer between accounts (#24) — SHIPPED
New `exp_tt_id=3` "Transfer" type + system "Transfer" category (`exp_tc_transaction_type=3`, `exp_tc_user_id IS NULL`, mirroring the "Others" pattern) — seeded via `0007_add_transfers.sql`. Modeled as two linked `exp_transactions` rows sharing a new `exp_ts_transfer_group_id`, each tagged `exp_ts_transfer_direction` (`'out'`/`'in'`) rather than new source/destination columns on one row — keeps every existing single-account balance/delete/restore code path working per-leg unmodified. New `ExpensifyTransactionsRepository.createTransfer` rejects a transfer whose amount exceeds the source account's current balance, then debits/credits both accounts and inserts both legs in one `db.transaction()`, unlike the existing non-atomic `createTransaction`. No transfer fee support — a transfer is a same-owner balance movement only. `deleteTransaction`/`restoreTransaction`/`bulkDeleteTransactions`/`purgeTransaction` now expand to every row sharing a transfer's group id so a transfer never ends up half-reversed; the old binary `isExpense` balance check became a three-way `isOutflow` helper (expense, or a transfer-out leg, moves money out; income, or a transfer-in leg, moves money in). Editing a transfer is blocked server-side (delete-and-recreate only, per scope decision) and blocked in the mobile form (existing transfers render a read-only notice instead of the edit form; Transfer is hidden from the type picker when editing a non-transfer transaction, since converting one in place isn't supported). Deleting a bank account with active transfer history is now blocked with an error instead of silently orphaning the linked leg on the other account — fixed alongside, `ExpensifyBankAccountRepository.deleteBankAccount`'s account-row delete now actually participates in its `db.transaction()` (was using the outer non-transactional `db` instead of the callback's `tx`, per the bug noted when this feature was first scoped).

Mobile: `utils/common-data.ts` adds the Transfer option to `TransactionType`; `utils/Colors.ts` adds a neutral `colors.transfer` (not red/green); `utils/schema.ts`'s `transactionSchema` gained a `superRefine` making category optional and a `to`-account required/distinct only when `exp_tt_id === 3`. `transaction.tsx` renders a second "To Account" picker for Transfer, hides the category/attachment/tags/star/template/bulk-add controls that don't apply to transfers, resets both account fields when switching into Transfer mode (an auto-picked primary account from expense/income entry isn't necessarily the intended "from" account), and calls a new `useCreateTransfer` hook against `POST /expensify/transactions/transfer` instead of the normal save path. `TransactionCard.tsx` colors transfers neutrally and signs the amount by `exp_ts_transfer_direction` rather than the old binary expense/income check. Every existing income/expense sum site (dashboard trend, budget breakdown, exports, account-detail grouping — confirmed across all sites during scoping) already used strict `=== 1`/`=== 2` equality, so type 3 was automatically excluded everywhere with no further changes. Net worth (`useNetWorth`) needed no changes either, since it sums each account's live balance rather than re-deriving from transaction history.
