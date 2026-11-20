# 設計Assessment × FACTACT Core — 責任分担・並行開発方針

Date: 2026-11-21
Status: USER-APPROVED CROSS-LANE ARCHITECTURE PRINCIPLE / NO MERGE OR RELEASE AUTHORIZATION
Source: 2026-11-21 user-provided FACTACT/Assessment agreement
Related: docs/it-kaizen-assessment-development-execution-principles-20261117.md; docs/it-kaizen-assessment-design-v2-handoff-fit-gap-20261117.md; docs/it-kaizen-assessment-scope-price-separated-development-priority-20261117.md; Assessment Draft PR #48; FACTACT Draft PR #69.

## Architecture
1. **FACTACT Core** is authoritative for FACT/UNKNOWN/Evidence/Observation/Knowledge, Organization/Person/Device/Relation, provenance, verification state, Work/Change/Decision/Authority/Audit, common queries, comparison and contradictions.
2. **Assessment** is a specialized business application consuming Core information. It owns assessment criteria, IT management maturity assessment, Future/current gap analysis, root-cause and priority reasoning, ACT options/scenarios, roadmap, improvement plan and executive/report outputs.
3. **AI** assists information organization, analysis suggestions and document drafting; the essential workflow must remain functional without AI.

## End-to-end semantic flow
Approved free-diagnosis context → source-linked initial information (not verified FACT) → Assessment preparation of missing materials/interviews/confirmation → human fieldwork → FACTACT structured source/evidence/differences/verification → Assessment specialist analysis, improvement options, roadmap and reports → human approval/decision → FACTACT record and operational reuse.

Future is a management goal/intention, not a current verified FACT.

## Non-negotiable boundaries
- One Fact, Multiple Views: no Assessment-owned duplicate customer/device/FACT/evidence registry.
- Work First / Natural Fact Accumulation: routine Assessment work creates reusable information without requiring separate FACT-entry labor.
- Change → Verify → Commit: importing a statement or register is not reality verification; verification requires appropriate evidence and authority.
- AI Suggests. Human Decides. System Records.
- IT management maturity scoring, gap/root-cause and prioritization algorithms stay in Assessment, not Core.
- No Assessment-specific duplicate Work management, Evidence management or FACT management.
- Existing Canonical, ADR, Decision Log, Git state and Product-owned typed contracts take precedence over speculative adapters.

## Development workstreams (parallel, not a single serial gate)
A. FACTACT lane: Core source intake, entity/relationship, verification, grants/audit, scoped read and operational reuse. Device S1–S3 are needed for **Device registration integration acceptance**, not for starting all Assessment development.
B. Assessment lane: read-only/approved free diagnosis context, preparation and hearing workflow, specialist analysis, improvement alternatives/scenarios, roadmap, human review, report generation and evidence-referenced outputs. Implement these independently with synthetic references where Core runtime is unavailable.
C. Joint integration: only after approved exact identity, authorization, source, query, typed Command, version and idempotency contracts; use synthetic tenant isolation tests and preserve source semantics.

## Immediate Fit/Gap baseline
- Existing legacy `kaizenAssessment` and `freeHearingAssessment` must not be relabeled as the paid Design Assessment without contract comparison.
- Design v2 `it_management_diagnosis_case_v2` and legacy `diagnosis_cases` are distinct; existing handoff is not a drop-in adapter.
- Existing approved report/feedback and eligibility projection are useful read-only inputs, not proof of paid engagement acceptance.
- Assessment Draft PR #48 local CSV/XLSX preview accepted, no FACTACT writes. Keep separate and Draft.
- FACTACT Draft PR #69 provides pure Device S0 policy, not proof of production persistence or authenticated API.
- The next Assessment engineering slice is a **bounded source-level Fit/Gap of the existing Assessment workflow, analysis, and report implementation against the approved Business Canonical**; then implement only identified Assessment-owned gaps. Do not build duplicate Core persistence.

## Explicit exclusions
No PR merge, migration, GCP/DB changes, production release, new Core object, generic CRM/dashboard, pricing workflow, or invented FACTACT API is authorized by this agreement.

## Next Assessment acceptance criteria
1. Free diagnosis source references and provenance are preserved, without automatically promoting statements to FACT.
2. Preparation, hearing, confirmation and analysis remain usable with a synthetic Core read adapter/no AI.
3. Assessment-owned maturity/gap/priority rules are explicit, testable and separate from Core.
4. Human-approved decisions and versioned improvement/report artifacts retain exact input source references.
5. Later FACTACT changes do not rewrite previously approved Assessment outputs.
