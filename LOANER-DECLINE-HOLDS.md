# Loaner decline and Hold workflow — local implementation

## Source and isolation

- Backend remote: https://github.com/Giggles3237/bopchipboard.git
- Backend base: 1000837c6485d6875cf61eafff25640c3b2c9f68
- Frontend remote: https://github.com/Giggles3237/bopchipboardfront.git
- Frontend base: 490efa44f5740fdf70ea1ff3e910b9cf964de12e
- Both branches: codex/loaner-decline-holds
- Both were cloned directly from their verified remote HEADs, into loaner-workflow-backend and loaner-workflow-frontend under the October 26 task directory.
- The earlier chip-indicator clones and commits 68486c9 / f0c4add are unchanged. No AGENTS.md or checkout .agents/skills was found in the new checkouts.

## Behavior

Existing Admin decision policy is retained. Managers, Salespeople and Genius users cannot decline/approve. An Admin can decline a pending request with an optional reason (up to 2,000 characters), after an explicit confirmation. The row remains in history, including the original request, decision actor, date and reason. Requestors see their own outcome and reason. Conditional SQL updates allow exactly one pending-to-processed/declined decision; competing or stale decisions cannot overwrite it. Repeated identical declines by the same Admin return the saved outcome without sending again.

Decline mail uses the existing loaner Nodemailer SMTP adapter and existing From/configuration. Its only recipient is request_json.respondersEmail, originally populated from the authenticated submitter's database email, not client input. There is no distribution list, advisor CC or BCC on declines. The message contains outcome, request stock, optional reason, timestamp and request ID; it omits customer name, original notes and unrelated data. An invalid legacy stored requestor address leaves the decline durable and notification queued with a visible blocker. It is never guessed or substituted.

A decline and its email payload are persisted together before sending. Disabled transport leaves it queued. A send claim is atomic. Confirmed pre-delivery failures (SMTP authentication/initial connection/all recipients rejected before DATA) are marked failed and explicitly retryable. Partial acceptance, DATA failures, timeouts and response loss are uncertain, preserving the existing no-blind-resend behavior. A successful SMTP acceptance is described as acceptance, not guaranteed mailbox delivery. Failed completion writes leave sending state rather than allowing duplicates.

Hold is the existing soldUnit='No' request type. Submission already did not ask for replacement or CPO; the approval form and server validation now honor the same distinction. Hold approvals retain the pulled-stock requirement, but omit replacement/CPO inputs and store those new decision fields as null/not applicable, never false or $0. Hold approval emails explicitly say not applicable. Sold/release requests still require a distinct replacement and an explicit Yes/No CPO answer with the existing fee validation. The server uses the saved request type, ignoring a client attempt to switch type during approval.

The existing submission draft remains editable; Hold-to-sold switching retains other details. Switching approval form types hides rather than clears irrelevant draft values. Submitted requests have no existing edit endpoint, so this change does not introduce one. Reusing an attempted request ID with changed details remains a conflict, avoiding duplicate requests after response loss. Previously approved/history JSON is not rewritten.

## Organization ownership

The current user is re-resolved from users/roles, including active status and organization, before workflow operations. New requests snapshot organizationId in their existing JSON. Reads and decisions are scoped to that organization, and non-Admins see only their own requests. New ownership remains stable if a submitter later moves organizations.

Legacy requests did not store organization ownership. Inspection found that routes/users.js can change user organization membership, but no historical membership record or immutable deployment tenant scope establishes ownership at request creation. Current membership is therefore never used to assign a legacy request.

Requests without recorded organization ownership stay stored but are excluded from every organization queue. Approval, decline and notification retry return not found; an attempted submission reusing their ID conflicts rather than adopting or rewriting them. This also applies to the original submitter and Admins. The queue explains that older requests may be hidden pending verification and should not be recreated. Existing decision history and queued/accepted notification state remain unchanged. These records are not fully supported until individually verified; some or all pre-feature requests may therefore be unavailable in the app.

### Controlled verification/backfill (not executed)

1. An authorized operator identifies only the affected request IDs through a read-only review outside tenant-facing queues. Preserve a backup of each original row and its exact JSON/state before any write.
2. Establish each request's organization **at creation** using independent immutable evidence, such as an archived deployment/database tenant mapping or recorded membership events covering its creation timestamp. Current user organization, email/domain, dealership branding, or the operator's active organization are not proof. If evidence is absent or ambiguous, leave the row restricted.
3. Record an explicit reviewed mapping of request ID to organization ID, source evidence, reviewer and review timestamp. Obtain separate authorization for those exact production data changes; this development task authorizes none.
4. In a controlled transaction, lock each named row, compare it against its reviewed snapshot, and verify that ownership is still absent. Add only `request_json.organizationId` using JSON_SET. Do not replace the whole request, change submitted_by, decision/history, or email state/payload. Abort on an existing different owner or changed snapshot. Retain the reviewed mapping and before/after audit outside the request's original data.
5. Validate that exactly the approved rows became visible only to the verified organization and appropriate requestor/Admin. An identical completed mapping is a no-op; do not overwrite known ownership. Backfill does not dispatch email, approve, decline, or replay any notification.

There is no automatic migration, mass assignment, ownership-claim endpoint, or default organization fallback. This is the smallest practical treatment that preserves records without exposing historical data under an assumed tenant.

No migration is needed: the existing VARCHAR state fields and JSON decision/payload columns support the additional states. No live schema changes were made.

## Verification

- Backend full suite: 83/83 pass, including 15 new decline/Hold service/store tests and SMTP failure-classification coverage.
- Standalone frontend: 23/23 pass across LoanerRequests and ChipLoanerRequest.
- Bundled frontend: the same 23/23 pass; its existing distinct source remains intact.
- Changed frontend files pass uncached ESLint. Git whitespace checks pass.
- Standalone optimized production build passes. CRA's lint plugin was disabled for the build because dependencies are read-only shared symlinks and its default cache is outside the workspace; uncached lint was run separately.
- Built app inspected in temporary headless Chrome at 1280x900 and 390x844. All requests were intercepted and served from local build files or synthetic mocks; no external API request or notification was sent. Hold controls, decline confirmation, saved failed-notification status and retry were exercised. Workflow content had no horizontal overflow. Screenshots are workflow-hold-*, workflow-confirm-*, workflow-declined-* in the task directory.
- SQL tests use isolated in-memory SQLite with compatibility for the MySQL JSON scalar expression. Production MySQL was not contacted. Conditional UPDATE semantics and known query structure are tested, but a live MySQL integration test is not claimed.

## Remaining release gates

The new-request workflow is implemented. Unverified legacy requests remain intentionally unavailable pending evidence-backed ownership verification; this is an explicit compatibility gate, not full legacy support. Publication, merge and deployment still require authorization. Backend and frontend changes must ship together: new Hold approvals have null CPO and declined decisions have their own JSON shape, which the updated UI handles. SMTP operational delivery is not claimed; tests used mocked transport only. Existing enablement/configuration is reused and was not changed. No accounts, recipients or grants were changed. The separate chip-indicator stock-reuse question remains unresolved and is not part of these branches.
