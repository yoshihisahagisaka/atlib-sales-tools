# Controlled Pilot Policy Closure — Branch Status

Status: implementation in progress / not merge-ready / not Pilot GO.

Implemented on this branch:
- BD-05 versioned WEB policy acknowledgement hook + provenance.
- Separate Transcript consent model and DB-level guard.
- BD-02 Human deletion-request workflow foundation.
- Retention classes, holds, tombstones, and dry-run preview.
- Golden tests for acknowledgement, Transcript guard, deletion approval, and destructive-mode gate.

Still open:
- build/test execution evidence.
- destructive deletion/anonymization worker and table-by-table semantics.
- Transcript purpose-completion command/UI.
- restore reconciliation execution and real Cloud SQL rehearsal.
- AI provider retention/external evidence.
- Legal/Privacy-approved customer wording.
- docs/32 Gate rerun.

Do not merge to main until review and gate evidence are complete.
