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

## リリース判定・次の工程

- **A. 実体確認：PASS**。既存イメージを読み取り専用で棚卸し。Xvfb存在、印刷/Kerberosサーバー不在、共有ライブラリは残存。ライブラリが存在することとサービスが動いていることを混同しない。
- **B. 縮小版候補の1回の受入：未実施**。Xvfb除去前のAPT削除計画を読み取り専用シミュレーションで検査後、新候補を1回ビルドしPDF Smoke、UI 4件、HTTP 6件、オンデマンドスキャンを同一スクリプトで受入する。旧候補へのテスト再実行は不要。
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
