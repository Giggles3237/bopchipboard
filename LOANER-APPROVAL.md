# Chipboard loaner approval — local review package

## Source and scope

Verified git origins:
- https://github.com/Giggles3237/bopchipboard.git — baseline 5d8e600de26b61ea0d4b24334ee33c2f55799a03.
- https://github.com/Giggles3237/bopchipboardfront.git — baseline 4a78c6cf41e61771b68c16f11969458dd32ad397.

Fresh local checkouts were created because no active checkout was found. Existing user work was preserved. No AGENTS.md is tracked. The backend's frontend directory is ordinary tracked source, despite an outdated submodule comment. Both frontend copies have matching workflow UI changes; confirm which one Netlify builds before release. ChipBoardMySQL was an older discovery candidate; ChipboardEnterprise is a second-generation workspace. Neither is the implementation target.

No live database migration/connection, real email, push, deploy, credential creation or live flow change was performed.

## Agreed behavior

All authenticated active users can submit through Loaner requests or the existing sale form. Requests persist pending in MySQL. Every current active Admin can approve. Existing authenticate/requireAdmin middleware remains in use; current identity, active status and role are loaded from users/roles on each operation. Old JWTs omit email, so requester email comes from the authenticated user's database record, never client input. Non-admins see only their requests; admins see the queue.

Approval requires explicit pulled and replacement vehicle stocks, a CPO yes/no choice and confirmed BMW fee category/cost. The original request/sale stock remains separately labeled. The user clarified that accounting handles R: no suffix is appended, no stock is otherwise altered by the email formatter, and no accounting command/flag is emitted. Entered stocks retain their case and existing suffixes; input boundary whitespace is trimmed.

CPO uses the supplied BMW chart effective 2024-10-01, versioned in seed/cpo-fees.json: 60 months/unlimited miles only, levels $850/$1,200/$1,650/$2,250. No adders or 72-month selector. No CPO yields $0/not applicable. Admin confirms canonical BMW category; no fuzzy model inference. Full M is explicitly distinguished from M Performance/M Sport. MINI/other-make CPO is blocked pending verified rates.

## Email and recipients

Exactly two To destinations: loanerdistribution@pandwforeigncars.com and the authenticated requester's stored email, deduplicated case-insensitively. CC and BCC are empty. Advisor and approver addresses are displayed as context, never added as recipients. Missing/malformed/header-injected requester addresses fail validation. Recipient rules are snapshotted with the approved payload.

The email has a restrained navy/blue Chipboard text brand, clear approval heading, separate pulled/replacement vehicle panels, a CPO summary, requester and approver/time, notes and request ID. It uses a fluid single-column table layout, inline CSS, Outlook conditional table sizing, semantic headings and readable text contrast. All dynamic HTML is escaped. No images, tracking, links, scripts or external assets. A complete plain-text alternative accompanies HTML. Dates display America/New_York with timezone abbreviation. Previews contain synthetic names/addresses only.

Flow contract: emailTo is an array of the exact To recipients; emailCc and emailBcc are empty arrays. emailSubject/emailHtml/emailBody supply the subject, HTML and plain text. The flow must join emailTo as its connector requires and must not append old recipient defaults or accounting instructions. Approval metadata and original request fields are also supplied. The request ID is included in payload and Idempotency-Key header.

## Persistence, concurrency and uncertain delivery

Submission UUIDs make retries idempotent. A reused UUID with changed data/user is rejected. Clients retain retry IDs in session storage. This does not merge independently created requests for the same stock.

Approval state, approver/time, immutable CPO snapshot and complete email/recipient snapshot are one conditional MySQL UPDATE: only a pending request can win. A second conditional UPDATE claims queued email before any network call. This works across server processes; it does not rely on in-memory locks. There is no startup DDL or file-backed production fallback.

The existing LOANER_REQUEST_FLOW_URL and optional LOANER_REQUEST_FLOW_KEY transport are reused. LOANER_APPROVAL_FLOW_READY must explicitly be true before sending; otherwise approvals remain queued. No automatic HTTP redirect replay. Only queued emails are retryable. A timeout/error becomes uncertain; process/DB failures after the claim remain sending. Neither state is automatically reset or resent. accepted means HTTP transport accepted the payload, not independently verified mailbox delivery. Downstream flow deduplication still needs verification.

Reconcile sending/uncertain requests against flow run history by request ID. If accepted/delivered, an authorized operator can mark accepted; only conclusive evidence of no acceptance and no active run permits returning to queued. Unknown outcomes stay held. No live reconciliation or reset UI was added.

## Sender finding and remaining transport check

Read-only inspection of existing local configuration found EMAIL_SERVICE=gmail and EMAIL_USER=chipboard.bot@gmail.com, with a password setting present and no EMAIL_FROM override. The existing getReadyEmail.js fallback therefore formats the sender as "Chipboard System" <chipboard.bot@gmail.com>. No password value was printed, used or packaged. This proves local configured identity only, not working authentication or production configuration.

The existing sender is Nodemailer SMTP, not Gmail API. It can send without Microsoft Approvals, but its existing Get Ready formatter/default recipients must not be used for loaners. A loaner-specific adapter could reuse that transport/configuration without new credentials if approved and verified; no adapter switch was made. The Power Automate flow's actual From mailbox remains unknown. Recipients and accounting behavior are now resolved; remaining minimum information is whether to keep the flow's verified sender or use the existing chipboard.bot@gmail.com sender, and whether that chosen transport is currently operational for these emails. No credentials need to be supplied in chat.

## Exact rollout sequence — not executed

1. Confirm the actual Netlify source/base directory. Review the patches against the baseline SHAs.
2. Validate migration and concurrent approval/send claims in isolated MySQL/InnoDB. Then, only with live-change approval, take the normal backup and apply migrations/loaner-requests.sql through the existing DB admin connection.
3. Inspect the current loaner flow read-only: actual From sender; approval/send action order; requestId deduplication; connector retries; meaning of HTTP success. A redacted action export/screenshot is enough; do not send signed URLs/passwords.
4. With approval, make the selected transport email-only, consume exactly emailTo/emailCc/emailBcc and the supplied subject/HTML/plain text, and remove old R instructions. Do not retire the live Microsoft flow or enable the new gate without approval and verification.
5. Deploy matched backend/frontend with LOANER_APPROVAL_FLOW_READY=false. Old clients without UUIDs are intentionally rejected. Resolve the existing frontend lockfile inconsistency before npm ci-based deployment.
6. With explicit authorization for a controlled email, verify the selected sender, exact recipients, formatting and deduplication using a designated test recipient. Only then enable LOANER_APPROVAL_FLOW_READY=true and send queued approvals. No blind retry of uncertain delivery.

## Verification and limits

- Backend: 45/45 tests passing, including recipient policy, spoofed request fields, header/HTML injection, stock preservation, all chart categories, current-admin checks, concurrent approval/retry and lost network/DB responses. External sends mocked.
- Targeted frontend: 13/13 previously passed; frontend code was unchanged by the email update. Both frontend production builds previously passed.
- Existing full frontend scaffold App.test.js still fails independently: it renders App without AuthContext and expects a removed learn-react link. Unchanged baseline confirms the mismatch.
- Email rendered in Chrome at desktop and 390px phone width, with no horizontal overflow. Both CPO and no-CPO content verified. This is not an actual Outlook client delivery test; controlled delivery remains pending.
- Earlier mocked browser workflow verified submission, BMW X3 at $1,200, MINI blocking and no approval/send controls for Salesperson. Local fixture servers/tabs were stopped.
- git diff --check is clean.
- Existing frontend package-lock mismatch prevented npm ci; local dependencies used npm install --ignore-scripts --package-lock=false, preserving manifests/lockfiles. Backend bcrypt was rebuilt for tests. Dependencies are excluded from delivery.

Native MySQL validation is blocked by unavailable tooling: no MySQL/MariaDB server/client, Docker/Podman/Colima/nerdctl, applicable installation, or container socket. No system software installed. Store SQL tests use isolated SQLite tables behind a MySQL-shaped adapter and do not prove InnoDB integration.

## Deliverables

The ZIP contains both patches (including new files), this note, HTML/plain-text email previews, desktop/mobile email screenshots, earlier mock workflow screenshot and checksum manifest. No local env files, credentials, databases, dependencies or build directories are included. Library delivery status is reported separately after upload inspection.

## Merge-readiness update, October 21

User authorized merges and subsequently live sending using the existing Chipboard sender. Loaner routes now require LOANER_WORKFLOW_ENABLED=true and a read-only required-column schema probe. Until ready they return a controlled 503 without writing or sending; existing unrelated routes/startup are unaffected. The prior Microsoft request endpoint is replaced, not silently retained as an approval fallback.

Loaner sending now uses a dedicated Nodemailer adapter sharing buildEmailConfig with Get Ready, but not its recipients or formatter. LOANER_EMAIL_ENABLED defaults off and requires EMAIL_USER=chipboard.bot@gmail.com. The old LOANER_APPROVAL_FLOW_READY setting is no longer consulted by loaner routes. SMTP partial acceptance is held uncertain; no automatic resend. Deterministic Message-ID assists reconciliation but is not claimed as SMTP deduplication.

Read-only readiness attempts using existing local credentials failed: Azure MySQL sales-db.mysql.database.azure.com / sales-db returned ER_ACCESS_DENIED_ERROR; Gmail SMTP verify returned EAUTH/535. No table access, migration or mail send occurred. Production config is not proven by these local settings. No Heroku CLI/connector was available to inspect current production credentials/release. Restore working existing access through the normal private configuration mechanism before enabling either gate. No new credentials were created.

Migration planned impact remains one additive InnoDB table with a primary key and queue index, no alterations to existing tables or data. Production table presence/version and backup/recovery availability could not be inspected due to denied DB authentication; migration remains unexecuted and requires that safety review/approval. Native MySQL validation remains unavailable locally.
