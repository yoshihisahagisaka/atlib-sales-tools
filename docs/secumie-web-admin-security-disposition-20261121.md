# SECU:MIE Web 管理画面｜ランタイムCVE整理と縮小方針（2026-11-21）

## 確定した検証結果と境界

- Draft PR #51。公開済み `sales-tools` / `sales-tools-staging` / 専用DB・Migration / `www.atlib.jp/secumie-web/` は未変更。
- オフラインUI実Chromium受入 **4 PASS / FAIL 0 / SKIP 0**。実Expressスタッフ認証ゲート→WSC VS1→Chromium実PDFのHTTP結合受入 **6 PASS / FAIL 0 / SKIP 0**。日本語合成PDF Smoke PASS。
- 上記は模擬データのオフライン結合テスト。**実Google Workspace OAuth・実顧客URLでのWSC外部取得・公開Staging/Production E2EのPASSを意味しない**。
- 検査済み既存イメージ：Git `808e99e275b73fbd25fb795b26115df144c78e1e`、`sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e`。
- イメージ検査結果：**CRITICAL 0 / HIGH 17 / UNKNOWN 16 / OTHER 230、SECURITY_NO_GO**。修正版未提供33件の危険度をゼロと見なさない。
- 新しい縮小パッチは別Commit。**未ビルド・未スキャン・未受入**。安全性改善の達成を宣言しない。

## 2026-11-21 読み取り専用ランタイム棚卸し（実測・PASS）

対象は縮小前イメージ `sha256:810d3ddcf97cd009cdf73de77dfff008cd281d234ff49f9ae39a4dfdf86a384e`。ユーザーがCloud Shellで `scripts/secumie-admin-runtime-inventory.sh` を実行し、以下を確認。

- **実行主体**：`uid=1000(node)`、rootではない。
- **Xvfb**：`xvfb`/`xserver-common`インストール済み、`/usr/bin/Xvfb`が存在。Xサーバー削減の直接根拠。
- **X11関連依存**：`libxfont2`と`libfontenc1`がインストール済み。Xvfb削除後も残るかは新候補のスキャンで確認。
- **CUPS**：印刷デーモン `cups`/`cups-daemon`は未導入、`/usr/sbin/cupsd`不在。ただしブラウザに必要な`libcups2t64`は導入済み。ソースパッケージの検出結果と実行可能な攻撃経路は切り分ける。
- **Kerberos**：`krb5-kdc`/`krb5-admin-server`は未導入、`krb5kdc`/`kadmind`実行ファイル不在。ただし`libkrb5-3`は導入済み。
- **Perl**：`perl`パッケージは未導入状態だが、`perl-base`と`/usr/bin/perl`は存在。言語ランタイムの存在だけで`Archive::Tar`脆弱性の成立・不成立を判断しない。
- **OpenSSL/Expat/ACL/attr**：`libssl3t64`、`libexpat1`、`libacl1`、`libattr1`は存在。CLIパッケージ`acl`/`attr`は未導入。
- 旧棚卸しの「Headless shell installed」の検索結果が空欄なのは指定検索深度/ファイル名の制約による可能性がある。すでに同一イメージの日本語PDF実生成・UI 4件・HTTP 6件がPASSしているので、単に検索結果が空だったことをブラウザ未搭載の根拠としない。

**この証拠はパッケージの同梱確認であり、脆弱性33件の安全性を承認するものではない。** Xvfb除去版のビルド・スキャンはまだ未実施。

## 重要度別の範囲（既存イメージのスキャナー原票から）

| Debianソース | HIGH | UNKNOWN | 対応・判断 |
|---|---:|---:|---|
| xorg-server | 1 | 0 | Xvfb専用CVE-2023-5574。ヘッドレスPDFではXvfb自体を使わない。新版Dockerfileで`xvfb`/`xserver-common`を除去し、不要になった依存をautoremove。新イメージで要検証 |
| libxfont / libfontenc | 0 | 3 | Xサーバー依存として導入された可能性。Xvfb除去後も入っていないか検証。ライブラリが残れば理由を調査 |
| cups | 1 | 0 | CVE-2026-34980はネットワーク公開`cupsd`の印刷キュー悪用。Chromiumの`libcups2t64`と印刷デーモン`cupsd`を区別。実行ファイルの有無を確認するまでは非該当と決めつけない |
| perl | 1 | 0 | CVE-2026-9538は`Archive::Tar`による細工されたtarファイル読込。ランタイムで該当機能が呼ばれるか確認 |
| krb5 | 6 | 6 | HIGHの多くはKDC/`kadmind`等のKerberosサーバーでのDoS。ランタイムでKDCを起動していないことと、同梱ライブラリの用途を確認。UNKNOWN 6件は未評価 |
| acl / attr | 3 | 0 | シンボリックリンク等を利用したローカル権限昇格。最終イメージは`USER node`、ただし特権呼出しの不存在を引き続き確認 |
| openssl | 3 | 0 | PEM/CMS/DANE等の限定されたAPIパスが報告されているが、暗号ライブラリを根拠なく削除しない。実際の呼出し経路を調査 |
| expat | 2 | 0 | 悪意ある巨大XML/外部エンティティの扱いに関係。対象URLの解析実装と入力制限を確認するまで非該当扱いしない |
| glibc | 0 | 4 | 基盤ライブラリ。UNKNOWNを暫定LOWに落とさない |
| gnutls28 | 0 | 3 | 推移的な依存の可能性。要実ランタイム参照確認 |
| **計** | **17** | **16** | **未解決・本番No-Go** |

## 追加した最小変更

1. `Dockerfile`：Chromiumヘッドレス専用版とNoto CJK日本語フォントは維持し、Playwright `--with-deps` が併せて導入する`xvfb`/`xserver-common`を`apt-get purge`する。`apt-get autoremove --purge`により孤立したXサーバー用依存も除く。Chromeライブラリを手作業で消さない。
2. `scripts/secumie-admin-image-gate.sh`：HIGH/CRITICAL/UNKNOWNのパッケージ別集計のみを表示するよう修正。旧集計はLOW/MODERATEを混ぜていたため無効。
3. `scripts/secumie-admin-runtime-inventory.sh`：**既存の確定イメージ**をネットワークなし・read-onlyで起動し、Xvfb/`cupsd`/KDCなどのパッケージと実行ファイルの有無を表示。ビルド／スキャン／デプロイを行わない。

## 2026-11-21 Xvfb削除候補 初回Gate停止と修正

- Git `5448b128e8fd056c38756d316298e98edd05c978` でGateを起動したが、ビルド前のAPTシミュレーションで `[STOP] APT plan did not remove expected package: xvfb` と停止。`secumie-admin-image-result.txt` は `RUNNING` のままだった（停止状態の記録不備）。
- 原因：`apt-get -s purge` は削除操作を `Purg` で出す場合があるのに、従来の抽出は `Remv` のみを処理した。**削除が失敗した、またはビルド失敗した事実はない。初回はビルド前で停止。**
- Gateを `Purg`／`Remv` の両方の検出へ修正。パッケージ名が読み取れない場合はAPTシミュレーション原文末尾を表示し、安全確認未完了として停止。保護対象の削除を検出した場合も停止。
- 明示的な停止も `PREFLIGHT_NO_GO`／`ERROR` として結果ファイルに記録し、セッション終了後に `RUNNING` のまま残さない。
- **修正版は未実行**。縮小版イメージも未ビルド・未スキャン。本番／Staging／DBは変更なし、SECURITY_NO_GO継続。

## 2026-11-21 Xvfb削減版イメージ：実行結果確定

| 検証・証跡 | 結果 |
|---|---|
| Git固定ソース | `b578d4428675c3d9d14e2ac207b88c077248a60f` |
| Cloud Build | `807cd10c-4a5e-4fd2-b26f-229442b5570a`、**SUCCESS** |
| 不変イメージdigest | `sha256:87967dd7a73ebbd3e56c3a1c3b20dc6c6c06051af3041b5b6d6a790cba5412f0` |
| APTシミュレーション | PASS。Xvfb/xserver-common等19パッケージの削除予定を確認、保護対象の削除なし |
| 日本語PDF Smoke | **PASS**（32,166 bytes） |
| 実Chromiumブラウザ | **4/4 PASS** |
| 実HTTP結合（合成データ） | **6/6 PASS** |
| オンデマンドスキャン | `projects/msp-zabbix/locations/asia/scans/47c0fb7d-2fc9-44fb-8361-3509d194291c` |
| 最終Gate | **SECURITY_NO_GO**。既存Cloud Run、DB、公開受付には変更なし |

### 脆弱性件数の差分（旧候補と比較）

| 重要度 | 旧 `810d3dd...` | 新 `87967dd...` | 削減 |
|---|---:|---:|---:|
| CRITICAL | 0 | 0 | 0 |
| HIGH | 17 | 16 | 1 |
| UNKNOWN | 16 | 14 | 2 |
| OTHER | 230 | 203 | 27 |
| **合計** | **263** | **233** | **30** |

**重大度HIGH/UNKNOWNの未解決は計30件。** 減った3件のCVE名はこの集計だけでは特定しない（個別スキャン原票の差分で確認）。削減によって実行環境の最小化とPDF動作が確認されたが、残るHIGH/UNKNOWNを安全と承認したものではない。

- 新候補の原票はCloud Shellの `$HOME/secumie-admin-image-vulnerabilities.json` に保存済み。再スキャン不要。
- 調査次工程は残存30件のCVE ID・対象パッケージ・適用条件・リスク緩和策・必要な例外承認の確認。**本番および公開Stagingへのデプロイは禁止継続**。
- PR #50 DB/移行と `www.atlib.jp/secumie-web/` 受付導線に影響なし。

## 2026-11-21 残存30件の一次評価（CVE単位の原票に基づく）

- 正式な個別CVE一覧と攻撃成立条件は `docs/secumie-web-admin-cve-review-20261121.md` に記録。**HIGH 16件／UNKNOWN 14件、例外承認0件**。
- **krb5 12件（HIGH 6／UNKNOWN 6）**：KDC・kadmind不在が判明。ただしCVE-2026-112314はGSS-RPCクライアント側の問題であり、krb5の全件除外不可。
- **OpenSSL 3・Expat 2・GnuTLS 3・glibc 4**：共有ライブラリの実使用経路確認を優先。TLSを利用しているという事実だけでDANE/CMS等の特殊経路を利用しているとは判断しない。逆に未使用も推定しない。
- **CUPS 1・ACL 2・attr 1・Perl 1・libfontenc 1**：印刷デーモン/特権CLI/Perl Archive::Tar/フォントファイル解析という成立条件を分ける。根拠付き例外の検討対象であって、現段階のリスク受容ではない。
- 既存の確定イメージに対する**読み取り専用の実依存調査**を `scripts/secumie-admin-cve-runtime-evidence.sh` に追加。実行待ち。再ビルド・再スキャン・デプロイなし。ELFの`ldd`だけでは動的ロードまでは立証できない。
- **No-Go継続**。リスク判断、Google Workspace実ログイン、管理画面のリリースは別ゲート。

## リリース判定・次の工程

- **A. 実体確認：PASS**。既存イメージを読み取り専用で棚卸し。Xvfb存在、印刷/Kerberosサーバー不在、共有ライブラリは残存。ライブラリが存在することとサービスが動いていることを混同しない。
- **B. 縮小版候補の1回の受入：機能PASS／セキュリティNo-Go**。APT削除計画PASS、新候補ビルドSUCCESS、PDF Smoke（32,166 bytes）PASS、UI 4/4 PASS、HTTP 6/6 PASS。スキャンCRITICAL 0／HIGH 16／UNKNOWN 14のためリリース判定はSECURITY_NO_GO。旧候補の再検証は不要。
- **C. 残存CVEの意思決定**：未解決のHIGH/UNKNOWNは「実際の脆弱性」「到達可能性」「悪用条件」「緩和策」「根拠」「再確認日」「承認者」を記録し、**明示的に承認された例外だけ**をリリースGateへ反映する。単純に`fixedVersion`無しを許可条件にしない。
- **D. 実サービス確認**：例外承認または修正完了後、Cloud Runの既存100%トラフィックを保持した別候補でスタッフGoogleログインと実WSC PDFをUAT。リリースは別承認。PR #50 DB/migrationは別工程。

## 公開資料の参照

- Playwright公式 Debian 13依存定義: https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/nativeDeps.ts
- Playwright公式 Chromium headless shell: https://playwright.dev/docs/browsers
- Debian CVE-2023-5574 (Xvfb): https://security-tracker.debian.org/tracker/CVE-2023-5574
- Debian CVE-2026-34980 (cupsd): https://security-tracker.debian.org/tracker/CVE-2026-34980
- Debian CVE-2026-9538 (Perl Archive::Tar): https://security-tracker.debian.org/tracker/CVE-2026-9538
- Debian CVE-2026-112320 (kadmind): https://security-tracker.debian.org/tracker/CVE-2026-112320
- Debian CVE-2026-54369 (acl): https://security-tracker.debian.org/tracker/CVE-2026-54369
- Debian CVE-2026-54371 (attr): https://security-tracker.debian.org/tracker/CVE-2026-54371
- Debian CVE-2026-107496 (OpenSSL CMS): https://security-tracker.debian.org/tracker/CVE-2026-107496
- Red Hat CVE-2026-118370 (Expat): https://access.redhat.com/security/cve/cve-2026-118370

※参照した外部CVEの適用条件は、ベンダー説明とアプリの実行経路を照合して判断する。インストール済み=即悪用可能とは限らず、未実行=安全の証明でもない。
