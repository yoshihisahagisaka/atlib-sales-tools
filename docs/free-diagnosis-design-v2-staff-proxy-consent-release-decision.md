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

## Required business decision before Production enablement

The accountable business/privacy owner must decide and record one of the following under the existing governance process:

1. Staff Proxy may be used only after the staff member has obtained the specified customer consent, with the required operational evidence and retention location; or
2. Staff Proxy is not enabled in Production until an approved product/data-record change captures the required consent.

Until that decision exists, this is a Production Release Blocker for Staff Proxy. It does not change Customer Self, the Design v2 data model, or the current code.
