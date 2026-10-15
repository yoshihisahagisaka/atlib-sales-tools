# IT経営KAIZEN — aggregate KPI release acceptance
Date: 2026-10-15
Status: CODE TESTED IN CI / PRODUCTION INTEGRATION NOT APPROVED

## Verified
- Monthly numeric counts, UTM matching and fiscal-period summaries are present in the feature branch.
- GitHub Actions run 38674087243 passed build and test:survey-kpi including a disposable PGlite SQL rehearsal.
- Repeat questionnaire attempts are counted; no person deduplication or customer linkage.
- atLIB fiscal year is February 1 to January 31.

## Still required
- Coordinate migration numbering and Production deploy with Business KAIZEN.
- Rehearse the numbered migration on disposable PostgreSQL 16 with runtime role ACL and concurrent atomic increment tests.
- Confirm exact Marketing Initiative table schema and historical attribution semantics in the target DB.
- Mount the count API behind the existing IP limiter and connect the browser instrumentation. Verify the public-intake flag and safe behavior when counting fails.
- Verify same-attempt back-navigation does not recount completion, but later new attempts count again.
- Verify authenticated ?test=1 traffic is excluded. The test URL remains disabled until test provenance is resolved.
- Add read-only summary API and Sales Tools information-page integration.
- Run browser and public-submission regression, then staging smoke before any Production change.

## Stop conditions
No Production migration, deploy or traffic promotion until all applicable gates are satisfied and the shared Production release is explicitly coordinated.
