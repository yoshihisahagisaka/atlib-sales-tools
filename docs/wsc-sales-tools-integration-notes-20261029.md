# WSC × Sales Tools 実装記録（Draft）

## 実装した接続

- `/admin/web-security-check.html` と `/api/admin/web-security-check` は、既存の Google Workspace スタッフ認証ゲート配下に追加した。
- 完成済み WSC VS1、Phase 2A〜2C のモジュールは、`src/wsc/vendor/` に原文のまま取り込んだ。Sales Tools 側には、認証済みの単一実行を Phase 2C の一回限り能力契約へ接続し、VS1 HTML と既存 Playwright によるPDF出力をつなぐ薄いアダプターだけを置いた。
- 診断JSON・HTML・PDFをDBまたはGCSへ保存しない。PDFのバイト列だけを応答し、ブラウザの File System Access API が利用者の選択先へ書き込む。
- CSVはブラウザが一度だけ送信し、既存 WSC CSV パーサーが全体を検証する。ブラウザは返された有効企業だけを一社ずつ `/diagnose` へ送る。所在地は既存仕様どおり空欄可。

## 未実装：CSV ZIP

既存 `wsc-delivery` のZIP生成はローカルのバッチ成果物・内部保存領域を入力にする。今回の契約では、CSV全体をサーバーへ送らず、企業別PDFをブラウザへ逐次返し、サーバーに成果物を保持しない。

そのため、既存配送コードをそのまま再利用してZIPを作ることはできない。ブラウザ側ZIP実装またはサーバー側の一時バッチ保管が必要になるため、今回の実装には含めていない。統括判断なしに、そのいずれも追加しない。

## 検証範囲

- Synthetic DNS・transportとPDFレンダラー注入で、外部通信なしにWSCの取得→確定論的判定→HTML→PDFバイト列の接続を確認した。
- PDF実機・Chromeのフォルダ選択は、Cloud Runへのデプロイを行わない今回の範囲外であり未検証。
- Sales Tools既存のHTTP待受を必要とする回帰は、現在の隔離環境で `127.0.0.1` への接続が拒否されるため未完了。テスト本体のロジック失敗ではない。

## 2026-11-29 — live WEB mail DNS false-absence correction

Owner reported WEB diagnosis checkedAt 2026-11-28T15:30:32.609Z, target https://www.atlib.jp/, finding DMARC_ABSENT / NO_RECORD. Owner's Google Public DNS evidence: _dmarc.www.atlib.jp NXDOMAIN; _dmarc.atlib.jp TXT v=DMARC1; p=none; atlib.jp SPF v=spf1 include:_spf.google.com include:spf.bmv.jp ~all. Therefore the URL host and observed mail policy domain are different; not a missing company DMARC record. No DNS change requested.

Fit/Gap: PR #19 completed WSC vendor and #131 shared HTML service; PR #134 live public release ledger (docs/secumie-general-staging-provisioning-20261128.md) records WEB/Insight notify-03e48d9, app digest sha256:4baf0622413b8d671d2d66c6f606ddfc313dfeb7ee417d9a964a35f04f97c9c8. Current #134 branch HEAD 0b4662e6509f9fbcbf536109d9f852102cbdefd8 (separate staff-security work). The four WSC source blobs (probe, evaluator, rules, explanations) are identical at production source 03e48d93817d9c97e29af8afa6c5de4125ebdeef and current #134 base. WscHtmlService passes normalized URL hostname as mailDomain, and the previous collector queries only that domain's TXT and _dmarc TXT; evaluator maps NO_RECORD to DMARC_ABSENT. No changes to original URL identity, redirect behavior, HTTPS/TLS/SNI/Host, public-address validation, approval capability, body limit, timeout or other services.

Correction: RFC 9989 §§4.10–4.10.2 (https://www.rfc-editor.org/rfc/rfc9989.html) bounded DNS tree walk: exact domain first; if absent, find applicable organizational/PSD policy; up to eight queries and one shared five-second default deadline. Keep raw p and effective policy separate; use sp on existing descendant if present, np only when nonexistence is established. Malformed/duplicate/ambiguous records, transient lookup errors and uncertain existence with distinct np remain INTERNAL_ONLY under existing WSC conservative contract (not a full SMTP DMARC evaluator, syntax validator, or alignment test). SPF is never inherited: if no direct SPF and DMARC discovery identified an actual parent record (not a PSD), independently query that parent and disclose precisely which domain was checked. No guess of SMTP MAIL FROM, DKIM selector, MX, domain ownership or mail delivery. DKIM/MX remain outside current public findings. Preserve legacy offline inputs, finding IDs, statuses, approved explanation templates/layout and result history; new live report evidence includes actual queried/policy domains, and parent-only observations disclose scope. Rule/content versions WSC-R-1.0.1-draft / WSC-C-1.0.1-draft distinguish new results.

Regression: synthetic DNS replay for www/apex/service.atlib.jp; exact overrides, sp/np, multi-level .co.jp, psd boundaries, eight-query cap, absent/timeout/duplicate/malformed data, scoped SPF and customer HTML; existing VS1 and Phase 2A/B/C and public destination security tests. Dedicated CI only; no real customer requests or DNS mutation. Historical reports are immutable diagnosis-time evidence; do not silently rewrite. After verified deployment, rerun the owned-domain case once and review affected older DMARC_ABSENT reports before deciding whether re-diagnosis/reissue is needed. No historical DB modification.

Release gate: separate branch from #134 (no staff-security changes). Prefer minimal WEB-only app overlay from the exact currently serving verified immutable image, preserving existing DB, configuration, nonroot, proxy, traffic and rollback anchors; confirm current traffic/digest via read-only owner GCP evidence first. Verify exact runtime paths, new build/scan, residual security policy on new digest, synthetic test at zero traffic, explicit production approval and rollback on failure. Insight, staff, shared foundation, migrations, secrets, SMTP/Slack and DNS unchanged. No GCP operation performed by this source change; CI/production acceptance must not be claimed until evidenced.

## 2026-11-29 — owner-approved whole-diagnosis accuracy correction (same PR #142)

Owner approved the review of all current WEB findings and a single eventual WEB release. The existing WSC VS1 canonical (README/rules/explanations), Phase 2C acquisition, WscHtmlService, GENERAL runtime and public production ledger were compared. No added diagnostic categories beyond explicit review findings in existing categories, no report redesign or new dependencies. Prior DMARC-only CI 46165527923 PASS is historical, not evidence for this larger delta.

- TLS: compute remaining whole days from certificate notAfter and checkedAt (no current-clock evaluation); 0–30 day review. Preserve strict verification, pinned destination, SNI, Host and one-request limit. Only allowlisted native certificate-verification errors on the bound socket become a partial TLS_INVALID result with HTTP UNVERIFIED; no insecure retry. Transport/SSRF/abort/timeout and other ambiguous failures remain diagnosis unavailable, not an assertion of certificate failure or missing headers.
- HTTP: classify normal 2xx responses excluding 204/205; no page-header findings on redirects/non-normal responses; no redirect follow. Preserve explicit empty, null and missing/invalid type distinction. HSTS: validate required max-age, quoted decimal, duplicate directives, first response STS field; malformed values review, unknown evidence internal only. RFC 6797 §6.1/§8.1.
- CSP: distinguish enforcing header from Report-Only; check recognizable restrictive directive presence (not strength, full browser parser or HTML meta). Empty/unrecognized/reporting-only values get review. Independently check XFO and CSP frame-ancestors, including wildcard overriding XFO; recognized self/none or DENY/SAMEORIGIN suppress missing restriction finding, ambiguous explicit source lists stay internal, no claim of universal clickjacking protection. MIME nosniff retained; unknown or missing not fabricated.
- SPF: independently query exact and bounded ancestor TXT owners, nearest observed SPF first, not SPF inheritance or inferred organizational/SMTP identity. Known DMARC PSD records excluded from parent SPF evidence; without PSL/actual mail identity, ancestor evidence is explicitly labeled and never asserted as the company's sending configuration. Shared five-second default budget per discovery, no recursive includes/redirect expansion. Basic syntax review and permissive first all mechanism review (RFC 7208 §5.1); no full syntax, DNS budget or alignment test. DMARC bounded discovery retains prior conservative error behavior; no new DKIM/MX/DNSSEC findings.
- Existing finding IDs/statuses and fixed introduction/design retained; add HSTS_INVALID, CSP_HEADER_INVALID, SPF_ALLOW_ALL, SPF_INVALID for confirmed review facts. FRAME_HEADER_ABSENT now includes missing effective recognizable restriction, not simply two absent header fields. Rule/content WSC-R/C-1.0.2-draft; no historical result rewrite. New tests exercise mock acquisition and pure evaluator/render, old WSC suites retained. Actual public runtime acceptance and image/digest security gate remain distinct; no GCP, data, staff, Insight or DNS changes.
