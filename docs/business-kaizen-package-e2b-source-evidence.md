# 業務KAIZEN Package E2b Source Evidence

検証日: 2026-11-24 JST

## Source identity

- Base: Sales Tools PR #99 HEAD `d50ec072501ef50f55b9535456bb3b27512f20ba`
- Latest main確認値: `850e1f0bc9c6a2d269b0d5f71d239c1c98df05ae`
- Fit/Gap: `docs/business-kaizen-package-e2-anonymous-kpi-fit-gap.md`
- Canonical: `docs/sales-tools-production-canonical-policy-20261003.md`
- Production Ledgerの正本はProduction `schema_migrations`。リポジトリ上のMigration 036 verifierは027〜036各1回、037以降なしを期待するが、Production実値は本Sliceで未確認。未採番SQLのままとする。

## Fit decisions

- Public APIは `diagnosis_start` / `diagnosis_complete` 以外をstrict schemaで拒否する。
- Turnstile secret、action、hostname、Originは匿名KPI専用設定とする。設定が不完全なら機能だけを無効化し、Sales Tools起動は阻害しない。
- Siteverify失敗、例外、action不一致、hostname不一致、Origin不一致はfail closedで未計上。
- request bodyをaccess logへ出さない既存allowlist serializerを維持し、匿名APIではremote IPも出さない。
- 有効な `BUSINESS_WEB` Marketing InitiativeへUTM5項目が完全一致した場合だけ承認済み値を保存する。無付与は `UNATTRIBUTED`、未登録は `OTHER` とし、未登録raw値は保存しない。
- 個別イベント行を作らず、JST日付、event type、environment、Origin、UTM分類・承認済みUTMをkeyにatomic upsertする。
- 読み取り値はイベント件数であり、比率はperson-level conversion rateではない。
- E1 Diagnosis Cohort、Lead、Diagnosis、Sales Activity、Commercial Eventとは結合しない。

## Isolated PostgreSQL evidence

- PostgreSQL: `16.16`
- Database: `business_kaizen_disposable_test`
- Address: `127.0.0.1/32`
- Production database名 `sales_tools` および既知Production address `10.17.0.3` を拒否するtest guardを通過
- Connections: 2
- Backend PIDs (final review run): `26824`, `25776`
- Concurrent requests: 8
- Result: JST境界の2 bucketへ4件ずつ、合計8件。欠落・重複rowなし

## Verification

- TypeScript build: PASS
- E2b PGlite/API: 7/7 PASS
- E2b PostgreSQL 16: 1/1 PASS
- Production-equivalent ACL: both runtime/app roles can SELECT/INSERT/UPSERT; DELETE and DROP rejected; neither role owns the table
- Related E1/D1/Business Web/CRM/IT and Production readiness security regression: 51/51 PASS
- Business Web Browser: 9/9 PASS
- Common CRM Browser desktop/mobile: 2/2 PASS
- Production secret、Production DB、Migration実行は不使用

## Remaining release gates

1. 正式Originを `service.atlib.jp` のみにするか、legacy `www.atlib.jp` も許可するか。
2. Production/Test別Turnstile widget、secret、action、hostname allowlist。
3. Production `schema_migrations` のread-only preflightと正式Migration採番。
4. Corporate JS/CSP/widget統合と、結果表示を待たせないBrowser検証。
5. runtime roleの新規日次集計表権限をProduction相当で再検証。
