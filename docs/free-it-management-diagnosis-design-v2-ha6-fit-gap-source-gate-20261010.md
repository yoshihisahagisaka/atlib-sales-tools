# IT経営KAIZEN 無料診断 Design v2 — HA6 Fit/Gap Source Gate

Status: SOURCE RECOVERY GATE / STOP BEFORE IMPLEMENTATION
Date: 2026-10-10
Branch: docs/free-diagnosis-design-v2-20261010

## 1. Purpose

Design v2の上位Contract確定後、現行HA6実装との1:1 Fit/Gapへ進む前に、比較対象となるHA6 sourceを事実ベースで取得できるか確認した記録。

## 2. Expected HA6 source

既存運用記録上のHA6 source commit:

`0f8700e4454bf3ead886057b0993863e28d34fc8`

Known release context:

- candidate revision: `sales-tools-00068-hoy`
- tag: `it-kaizen-cdv1-ha6`
- Production traffic remains on prior VS1; HA6 is not Production traffic
- HA6 was the Human Acceptance candidate whose hearing UX exposed the redesign need

## 3. GitHub verification performed

Repository checked:

`yoshihisahagisaka/atlib-sales-tools`

Result:

- Fetch by exact commit SHA `0f8700e4454bf3ead886057b0993863e28d34fc8` returned: commit not found.
- Search for commit text `HA6` returned no matching commit.
- Search for branch name containing `ha6` returned no branch.
- Search for branch name containing `it-kaizen` returned no branch.

Therefore the currently connected GitHub repository cannot be used to prove the exact HA6 source tree.

## 4. Decision

Do **not** substitute any of the following for HA6 without evidence:

- current `main`
- older VS1 source
- an earlier dogfooding commit
- memory of HA6 behavior
- reconstructed code from the Design v2 discussion

The next Fit/Gap must compare Design v2 against the exact source used to build HA6, or another artifact proven byte-equivalent / source-equivalent to that build.

## 5. Why this gate matters

HA6 is specifically the implementation that exposed the product-design problem. Using a different source revision would risk:

- identifying already-fixed gaps again
- missing HA6-specific behavior
- designing patches against the wrong schema/API/UI
- violating the project rule that completed/current work must be recovered from Git/docs/Canonical rather than guessed

## 6. Acceptable recovery evidence

Fit/Gap may resume when at least one of the following is available and provenance is confirmed:

1. the exact HA6 Git commit/tree,
2. the source archive recorded by Cloud Build / Cloud Run for the HA6 build,
3. a local worktree whose HEAD is proven to be the HA6 source SHA,
4. another Git ref/artifact whose tree hash or file hashes are proven equivalent to HA6.

## 7. Current gate

**STOP: HA6 implementation Fit/Gap is not started.**

Design work may continue, but no implementation patch, migration, build, HA7, deploy, or traffic change should be created from an approximate source baseline.

## 8. Design v2 artifacts already completed before this gate

- Design v2 checkpoint
- Initial Analysis Contract
- Survey Semantic / Narrative Rule
- Survey Question Contract
- HA6-style paper simulation
- Healthy / Solution Hypothesis validation
- Report / Current Understanding Contract

These remain valid design artifacts independent of the HA6 source recovery gate.
