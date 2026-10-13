# Staff Proxy consent release decision required

## Scope

This is an evidence record for the Design v2 release gate, not a new legal or product policy.

## Observed implementation

- Customer Self requires and persists the privacy and diagnostic-use confirmations in `it_management_public_self_submission`.
- Staff Proxy records the authenticated staff actor as `entered_by_user_id` with `entry_channel=STAFF_PROXY`.
- Staff Proxy does not present a consent control or persist a customer-consent record.
- The existing privacy-policy link and Customer Self consent contract do not establish an auditable Staff Proxy consent procedure.

## Canonical evidence status

The checked repository contracts and release-readiness documents contain no formal approval stating that Staff Proxy registration may proceed without a customer-consent record. They also do not define who captures the consent, which wording/version applies, or where that evidence is retained.

## Confirmed business decision and implementation

Staff Proxy registration is permitted only after the responsible sales staff member has explained the IT経営KAIZEN無料診断 purpose and personal-information handling to the customer and confirmed the customer's consent. Oral consent is permitted.

The Staff Proxy form requires this exact, unedited confirmation before registration:

> 顧客にIT経営KAIZEN無料診断の目的と個人情報の取扱いについて説明し、顧客の同意を得たうえで入力しています。

The API requires `consentConfirmed: true`; missing, false, or malformed values are rejected before Company, Contact, Sales Activity, Case, or Design v2 artifacts are created.

The existing append-only `it_management_diagnosis_case_v2_audit` table records one `RecordDesignV2StaffProxyConsent` entry in the same transaction as the registration. Its Case key, authenticated staff actor, server-created timestamp, `consent_confirmed: true`, and fixed `consent_wording_version: STAFF_PROXY_CONSENT_V1` provide Case-level traceability. Client actor and timestamp values are not accepted.

If this audit write fails, the entire Staff Proxy registration is rolled back. Reuse of the same idempotency key returns the original Case and does not add a second consent record.
