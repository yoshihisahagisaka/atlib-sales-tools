# atLIB Public Service Auth & Intake UI Contract v1.1

Status: APPROVED IMPLEMENTATION CONTRACT / IMPLEMENTATION NOT STARTED
Date: 2026-10-31
Scope: atLIB公開サービス共通のメールOTP認証、および認証済み利用者を各サービスの受付・診断開始へ渡す境界
Out of scope: PIRA v6/v7の診断ロジック・固定文、WSC診断エンジン、共通会員管理、診断結果/PDFの保存、実装・Migration・Cloud Run・DNS・Secretの変更

## 0. 2026-11-09 目的と利用体験の確認（統括判断）

本節は既存v1.1 Contractの**目的と解釈の明確化**であり、承認済みOTP/JWT、DB、保持、診断、同意文言、画面資産の実装仕様を変更しない。既存仕様に新しい本人確認・会員登録要件を読み込まないための判断記録である。

### 0.1 メールOTPの採用目的

- メールOTPは、無料診断URLの安易な転送・無断共有・二次利用に対する**心理的な抑止**として設ける軽いワンクッションである。
- 実在本人の身元確認、所属企業の在籍確認、利用資格審査、厳格な転送禁止・利用者追跡を目的としない。メールを受信できることは本人確認の成立を意味しない。
- 無料診断として誰でも気軽に利用できることを優先し、会員登録、会社メール強制、追加ログイン、認証後の不要な再確認画面を設けない。
- Bot対策の主体はCloudflare Turnstileとし、IPレート制限（現行10分20回、インスタンス単位）は補助策とする。メールOTPだけで大量アクセスを厳密に防止できるとは扱わない。

### 0.2 確定した利用者フロー

**メールOTP → 診断開始 → 会社情報入力・同意 → 承認済み8問への回答 → v7レポート表示・印刷**。

- 診断の紹介は既存のメール入力画面に含める（PR #30）。「診断開始」は既存の認証成功後の操作を指し、新たな説明・中間画面を追加しない。
- 会社情報・同意の受付が成功した後は、追加の開始画面を挟まず質問1へ直接進む（PR #30）。
- 質問、回答ID、C方式、固定文、v7レポート、印刷方式は変更しない。

### 0.3 登録・保存・システム認証の境界

- 公開OTPによる**利用者アカウント／共通会員マスターは作らない**。OTP challenge/session等の必要最小限の一時状態は既存ContractどおりDBで管理し、24時間の保持期限に従う。セキュリティ監査は30日保持する。
- PIRA受付の企業情報・認証済みemail claim・受付状態は、共通会員登録ではなく別目的の受付業務データであり、既存PIRA Contractの同意・保持規定に従う。
- RS256/JWKS/JWT/jtiは受付APIの受け渡し・再利用防止の技術的境界であり、身元確認や利用資格審査を追加する根拠にしない。
- Cloud RunのIngress/IAMは外部LBからアプリケーションへ到達させる**基盤側の設定**であり、診断利用者にGoogleログイン、IAP、Basic認証等を追加する要求ではない。LB経由の匿名ブラウザアクセスとCloud Run Invoker IAMの整合はStaging配備前の別Fit/Gapとする。

本節はProduction公開承認、GENERAL有効化、DB Migration、Cloud Run配備、DNS/IAM/Secret変更を許可しない。

---

## 1. このContractの正本性と根拠

本書は、統括承認済みの共通メール認証仕様を実装前に一箇所へ集約するContractである。v1.1では、統括の最終判断により、認証・JWT・API・DB・保持期間を実装正本として確定した。環境固有の値だけを第13節のDeployment Configurationに分離する。

### 1.1 承認済み事項

- 共通OTPは最小構成の**専用Cloud Runサービス**（D案）とする。
- 情報セキュリティ診断、WSC、および将来の公開サービスは、URL、ブランド、診断処理を独立して維持する。
- 共通ログインポータル、共通会員DB、サービス間の認証Cookie共有は作らない。
- OTPは6桁、有効期限10分とする。再送は60秒後から、メールアドレスごとに1時間5回までとする。
- OTP入力失敗は5回まで、認証状態は2時間とする。
- Cloudflare Turnstileを使用する。
- IPレート制限は10分20回とし、Cloud Runインスタンス単位の制限でも可とする。
- 既存のMailer、Express、Zod、PostgreSQLを再利用する。
- OTP状態は既存Cloud SQL内のOTP専用論理領域を使用する。
- Sales Toolsのスタッフ認証・営業データ・WSC診断エンジンから分離する。
- 共通OTP側に診断結果またはPDFを保存しない。
- 認証結果の受け渡しは、統括承認済みの**A1方式JWT**、すなわちOTPサービスが発行する署名付き短命JWTを各公開サービスの受付APIが検証する方式を前提とする。
- OTP成功時に2時間の認証セッションを発行する。セッショントークンは256bit乱数とし、DBにはハッシュだけを保存する。ブラウザはメモリだけに保持する。
- 受付時にはRS256署名付き5分JWTを発行する。JWTには認証済みemailを含め、JWKS、`kid`、署名、audienceを検証し、受付側で`jti`の再利用を防止する。
- メール変更時は旧challengeを失効し、メール入力画面へ戻る。OTP再送時は旧コードを失効する。認証失敗5回で当該challengeを無効化する。
- 未登録ブランドは404とする。Turnstile失敗または障害時は認証を許可しない。
- OTP・セッション記録は24時間で削除し、安全ログは30日保持する。

### 1.2 既存実装との接続根拠

| 項目 | 既存の所在 | Contract上の扱い |
| --- | --- | --- |
| Expressの公開/管理ルート分離 | `src/server.ts` | OTPは既存Sales Toolsへ追加せず、専用サービスで分離する |
| Zod入力検証 | `src/routes/kaizenDiagnostic.ts` 等 | OTP要求・照合・受付開始要求で未知フィールドを拒否する |
| IP固定ウィンドウ制限 | `src/middleware/rateLimit.ts` | 10分20回の基盤として再利用可能。インスタンス単位であることを明示する |
| SMTPメール送信 | `src/services/mailer.ts`、`src/config.ts` | SMTP方式を流用する。OTP送信メソッドは新設が必要 |
| PostgreSQL / Cloud SQL | `src/db/pool.ts`、`migrations/runner.ts` | OTP専用論理領域とruntime/migration権限の分離が必要 |
| staff認証 | `src/routes/staffAuth.ts`、`src/middleware/staffAuth.ts` | 公開OTPへ流用しない。Workspaceスタッフ認証は別境界 |

2026-10-31のRead-only確認では、既存Cloud Run `sales-tools` は公開呼出し可能で、スタッフ管理機能・公開API・Cloud SQL接続を同居させている。したがって、OTPを同サービスへ追加することは本Contractの分離条件を満たさない。

## 2. 責任境界

| 境界 | 責任 | 保持しないもの |
| --- | --- | --- |
| 専用OTPサービス | OTP発行・照合、試行/再送制限、Turnstile検証、短命JWT発行、OTP監査に必要な最小状態 | 診断回答、診断結果、PDF、営業案件、共通会員プロフィール |
| 公開サービスUI | メール入力、OTP入力、サービス固有の受付UI、サービス固有の2時間認証状態の表示 | 他サービスのCookie・認証状態 |
| 各サービス受付API | A1 JWTの検証後に、各サービス固有の受付・診断開始を許可 | OTPコード、OTP署名秘密鍵、他サービスの受付情報 |
| Sales Toolsスタッフ管理 | Workspaceスタッフ認証、既存営業・管理データ | 公開OTPの発行・照合、公開サービス横断会員管理 |

## 3. 認証フローContract

1. 利用者は対象サービスの公開URLでメールアドレスを入力し、Turnstileを完了する。
2. 対象サービスUIは、サービス識別子を添えて専用OTPサービスへOTP発行を要求する。
3. 専用OTPサービスは、入力、Turnstile、IP制限、メール別の再送制限を検証後、6桁OTPを送信する。
4. 利用者は同じ対象サービスUIでOTPを入力する。
5. 専用OTPサービスは、有効期限、失敗回数、OTP照合、サービス識別子を検証する。
6. 成功時だけ、2時間有効なセッションと256bit乱数のセッショントークンを発行する。
7. 利用者が受付または診断を開始するとき、専用OTPサービスは当該セッションを基に、対象サービスを受け手として束縛した5分JWTを発行する。
8. 対象サービスの受付APIはJWTを検証し、`jti`を一回だけ消費して受付または診断を開始する。他サービスへのログイン状態やCookieは作らない。

JWTとセッショントークンはブラウザのメモリだけで保持し、永続Cookie、localStorage、sessionStorage、URLには保存しない。対象サービスは受付時に5分JWTを一度だけ受付APIへ提示し、受付APIは`jti`を原子的に消費する。

## 4. A1 JWT Contract

### 4.1 確定している保証

- 発行者は専用OTPサービスだけである。
- 受け手は発行時に指定された一つの公開サービスだけである。
- JWTは短命であり、各受け手の受付APIが署名・有効期限・受け手を検証する。
- JWTそのものは、診断回答、診断結果、PDF、営業判定、スタッフ権限を含まない。
- JWT検証失敗時、対象サービスは受付・診断開始を許可しない。

### 4.2 確定詳細の参照

RS256、JWKS、`kid`、claim、5分JWT、2時間セッション、`jti`消費、失効は第12節の最終Contractに従う。鍵のURL、鍵ローテーション期間、キャッシュ時間は第13節のDeployment Configurationで管理する。

## 5. OTP API Contract

実URL、論理操作、エラーコード、JWT発行・失効の詳細は第12節の最終Contractに従う。すべての入力はZodのstrict schemaで検証する。

| 論理操作 | 必須入力 | 成功時の責務 | 拒否条件 |
| --- | --- | --- | --- |
| OTP発行要求 | サービス識別子、メールアドレス、Turnstile token | 有効なchallengeを作成し、OTPメールを送信する | 入力不正、Turnstile不成功、IP上限、メール別再送上限、60秒内再送 |
| OTP照合要求 | サービス識別子、challenge参照子、6桁OTP | OTPを消費し、2時間セッショントークンを発行する | 期限切れ、入力5回超過、不一致、サービス不一致、使用済み |
| 認証状態終了 | 対象サービス内の状態 | 対象サービスの認証状態を終了する | 共通OTPの状態を他サービスへ波及させない |

メールアドレスの存在、過去の認証有無、送信可否の詳細を攻撃者に知らせない。機械可読エラーコードは第12.5.1節に従う。利用者向けの固定文が未提示のエラー状態は、第13節のDeployment Configurationを満たすまで公開しない。

## 6. OTP状態・DB Contract

OTP専用の論理領域を既存Cloud SQL内に置く。物理Schema名、列型、role名は第13節のDeployment Configurationとし、論理テーブル・保持期間は第12節の最終Contractに従う。

| 論理項目 | 必要性 | 備考 |
| --- | --- | --- |
| challenge識別子 | 必須 | 推測困難で、OTP本文そのものを識別子にしない |
| 対象サービス識別子 | 必須 | 他サービスへの転用を防ぐ |
| メールアドレスの保護表現 | 必須 | 物理的な保護方式はDeployment Configurationで定める |
| OTPの検証用保護表現 | 必須 | OTP平文・復元可能な値を保存しない |
| 発行時刻・有効期限・消費時刻 | 必須 | 10分有効、使用済み防止に必要 |
| 失敗回数・ロック状態 | 必須 | 5回上限を判定する |
| 再送可能時刻・時間窓内送信数 | 必須 | 60秒、1時間5回を判定する |
| 最小監査時刻・結果 | 必須 | セキュリティ調査に必要な最小限に限定する |

OTP runtime roleはOTP専用論理領域だけにアクセスし、既存の `sales_tools` 業務テーブル、営業データ、WSCデータへの権限を持たない。Migration roleもruntime roleと分離する。

OTP・セッション記録は24時間で削除し、安全ログは30日保持する。削除ジョブ、バックアップからの復元時の扱いはDeployment Configurationで検証する。

## 7. UI・受付接続 Contract

- 各サービスは独立URLと独立ブランドを維持する。
- UIはメール入力、OTP送信待機、OTP入力、再送待機、認証完了、エラー表示を持つ。
- 再送操作は60秒間無効化し、メール別上限は1時間5回とする。再送時は旧OTPを失効する。
- 認証後の受付UIは各サービス固有であり、共通OTP側は診断質問・結果・PDFを描画しない。
- PIRA v6/v7の質問、38回答ID、C方式、固定文、印刷方式は本Contractの対象外であり、変更しない。
- PIRAの既存静的試作は外部接続を許可しないCSPを前提としている。OTP連携時は、対象OTP originだけを明示的に許可するCSP/CORS Contractが必要である。

## 8. セキュリティ・運用 Contract

- Cloud Run、SMTP、Cloud SQL、署名鍵、Turnstile用Secretは専用OTPサービスの最小権限サービスアカウントへ分離する。
- Secret値、OTP、JWT、メールアドレス、Turnstile tokenをアプリケーションログ・監視通知・エラー応答へ出力しない。
- CORSはサービスごとの明示的allowlistとし、ワイルドカードOriginやサービス間Cookie共有を使用しない。
- 認証状態はCookieを使わずメモリ内トークンで提示する。CSRFの前提となる自動送信Cookieを持たない。
- IP制限は既存 `createIpRateLimiter` を10分20回で流用し、インスタンス単位とする。
- リリースは専用Cloud RunのRevision単位で行い、問題時は直前の健全RevisionへTrafficを戻せるよう、デプロイ前に切り戻し手順を検証する。

## 9. E2E受入Contract

実装後、少なくとも次を自動・手動で検証する。

1. 各対象サービスでメール入力からOTP送信、照合、当該サービス内の受付開始まで成功する。
2. 6桁以外、期限切れ、誤入力5回、使用済み、別サービス用JWT、改ざんJWTを拒否する。
3. 再送60秒、メール別1時間5回、IP 10分20回を確認する。
4. Turnstile不成功時にOTPを発行しない。
5. サービスAの認証状態でサービスBを開始できず、Cookieが共有されない。
6. OTPサービスに診断回答・結果・PDFが保存されない。
7. PIRA v6/v7およびWSC既存機能の回帰がない。
8. ログ、監査、メール本文、ブラウザ履歴にOTPまたはJWTの機密値が出ない。

## 10. Fit/Gapの解消状況

JWT、セッション、API、DB、Turnstile、CORS/CSP、メール送信方式、保持期間の実装方針は第12節で確定した。環境固有の設定値と本番適用の停止条件は第13節に限定する。WSCおよびSecure Guardの固有要件は本書の対象外であり、追加しない。

## 11. Decision Record

| 日付 | 決定 | 本書での反映 |
| --- | --- | --- |
| 2026-10-31 | 共通OTPは専用Cloud Run（D案） | Sales Toolsから分離した責任境界として記録 |
| 2026-10-31 | A1方式JWT | 受け手をサービス単位で束縛し、各受付APIが検証する前提として記録 |
| 2026-10-31 | サービス間Cookie共有なし・共通会員管理なし | サービス固有の2時間認証状態として記録 |
| 2026-10-31 | 6桁/10分、再送60秒/1時間5回、失敗5回、IP 10分20回 | OTP状態・E2E要件として記録 |

本書は実装承認、Migration承認、Cloud Runデプロイ承認、Secret/DNS承認を意味しない。

---

## 12. v1.1最終Contract

本章は統括の最終判断を反映した実装正本である。本章と初版の「未決定」記述が異なる場合は、本章を優先する。

### 12.1 二段階の認証状態

| 段階 | 確定仕様 | 状態 |
| --- | --- | --- |
| OTP照合直後 | 専用OTPサービスが256bit乱数のセッショントークンを発行し、DBにはハッシュだけを保存する | 確定 |
| 対象サービスへの受付時 | 有効な2時間セッションに対し、専用OTPサービスがRS256署名付き5分JWTを発行する | 確定 |
| ブラウザ保持 | セッショントークンはメモリだけに保持し、再読み込み・タブ終了・ブラウザ再起動時は再認証する | 確定 |

永続Cookie、localStorage、sessionStorage、URLにJWTまたは認証状態を保存しない。対象サービスは、受付開始時にセッショントークンを専用OTPサービスへ提示して5分JWTを受け取り、JWTを受付APIへ一度だけ提示する。受付APIはJWTを検証して`jti`を消費する。

### 12.2 JWT詳細

| 項目 | 確定仕様 | 状態 |
| --- | --- | --- |
| 署名アルゴリズム | RS256 | 確定 |
| 公開鍵配布 | `GET /.well-known/jwks.json` | 確定 |
| 鍵選択 | JWT headerの`kid` | 確定 |
| 有効期限 | 5分 | 確定 |
| 必須claim | `iss`、`aud`、`sub`、`email`、`jti`、`iat`、`exp` | 確定 |
| 受け手制限 | `aud`を対象サービス識別子として検証 | 確定 |

`email`は認証済みemailを表すclaimとする。`sub`はセッション識別子、`jti`はJWT識別子とする。受付APIは`jti`を一回だけ消費する。JWKS取得・署名・`kid`・`iss`・`aud`・`exp`のいずれかを検証できない場合はfail closedとする。JWKS URL、キャッシュ秒数、鍵ローテーション期間はDeployment Configurationとする。

### 12.3 確定API Contract

以下は専用OTPサービスの確定APIである。エラーコードと固定表示文言は第12.5.1節に従う。

| 論理操作 | API | 必要な入力または保証 |
| --- | --- | --- |
| OTP送信 | `POST /v1/otp/challenges` | サービス識別子、メールアドレス、Turnstile token。6桁OTPとchallengeを発行 |
| OTP検証 | `POST /v1/otp/challenges/{challengeId}/verify` | サービス識別子、6桁OTP。成功時に2時間セッショントークンを発行 |
| OTP再送 | `POST /v1/otp/challenges/{challengeId}/resend` | 同一サービス・メール・challengeに限定し、60秒/1時間5回を検証 |
| メールアドレス変更 | `DELETE /v1/otp/challenges/{challengeId}` | 旧challengeを失効し、クライアントをメール入力へ戻す |
| JWT発行 | `POST /v1/auth/sessions/{sessionId}/tokens` | セッショントークンと対象サービス識別子を検証し、5分JWTを発行 |
| 認証状態失効 | `DELETE /v1/auth/sessions/{sessionId}` | セッショントークンを照合し、当該セッションを失効。他サービスに影響させない |
| JWKS | `GET /.well-known/jwks.json` | 公開鍵と`kid`を受け手APIへ配布 |

メールアドレス変更は、`DELETE /v1/otp/challenges/{challengeId}` が成功した場合だけ旧challengeを失効してメール入力画面へ戻る。再送は旧OTPを失効して新しいOTPを発行する。認証失敗5回でchallengeを無効化する。未登録ブランドは404とする。

### 12.4 OTP専用DB Contract

既存Cloud SQLのOTP専用論理領域を使用する。以下は確定した論理テーブルであり、物理Schema名、列型、role名だけをDeployment Configurationとする。

| テーブル | 必要カラム | 索引・制約 |
| --- | --- | --- |
| `otp_challenges` | `challenge_id`、`service_id`、メールの正規化値または保護表現、`otp_digest`、`expires_at`、`verified_at`、`consumed_at`、`failure_count`、`locked_at`、`resend_not_before_at`、`created_at`、`updated_at` | PK: `challenge_id`。サービス・メール・作成時刻、`expires_at`、`consumed_at`の索引 |
| `otp_send_locks` | `service_id`、メール保護表現、`updated_at` | `(service_id, メール保護表現)`を一意にし、送信判定のロック対象を必ず作る |
| `otp_send_events` | `event_id`、`service_id`、メール保護表現、`sent_at` | PK: `event_id`、`(service_id, メール保護表現, sent_at DESC)`。直近60分の送信件数を判定 |
| `otp_auth_audit` | `event_id`、`challenge_id`、`service_id`、結果種別、時刻、最小限のIP保護表現 | PK: `event_id`。OTP、JWT、メール平文を保存しない |
| `otp_sessions` | `session_id`、`service_id`、認証済みemail、`session_token_digest`、`expires_at`、`revoked_at`、`created_at`、`updated_at` | PK: `session_id`、`session_token_digest`一意、期限掃除用`expires_at` |
| `otp_consumed_jti` | 各サービス受付DBに置く: `jti`、`consumed_at`、`expires_at` | 共通OTP DBの所有対象外。各受付APIが一意制約で原子的に一回だけ記録 |

OTP平文・復元可能なOTP値、診断回答、診断結果、PDFを保存しない。メールアドレスの保護表現は、JWTに含める認証済みemailとは別に、DB内の保護要件を満たす方式をDeployment Configurationで定める。

OTP送信時は、当該サービス・メールの`otp_send_locks`行をtransaction内で作成または`SELECT ... FOR UPDATE`でロックし、`sent_at > 現在時刻 - 60分` の`otp_send_events`件数が5未満の場合だけchallengeと送信イベントを作成する。これにより、境界時刻を含めて直近60分の上限を原子的に判定する。challenge検証と`consumed_at`更新、セッション失効とJWT発行も一つのDB transactionで処理し、対象行を`SELECT ... FOR UPDATE`でロックする。一意制約と併用し、同時再送、二重消費、失敗回数競合を防ぐ。`jti`再利用は各サービス受付DBで防ぐ。OTP・セッション記録は24時間で削除し、安全ログは30日保持する。

### 12.5 セキュリティContract

- TurnstileはOTP送信時にサーバー側で検証する。Turnstileが失敗または障害の場合、認証を許可しない。
- IP制限は既存 `createIpRateLimiter` を10分20回へ設定する。インスタンス単位である。
- CORSは、サービス識別子と要求Originの組合せを固定allowlistで検証する。
- CSPの`connect-src`は対象OTP originと各サービス固有の受付APIだけを許可する。
- 受け手APIは`kid`、RS256署名、`iss`、`aud`、`exp`を検証し、JWKS取得・検証不能時はfail closedとする。

PIRAの静的試作は外部通信を許可しないCSPを前提としているため、OTP APIのOrigin、CORS、CSP変更は別途承認なしに実施しない。

### 12.5.1 APIエラーContract

APIは次の機械可読コードを返す。利用者向け表示は、固定文が定義されているコードでは逐語表示し、OTP、JWT、メールアドレスを含めない。

| APIコード | 発生条件 | 固定表示文言 |
| --- | --- | --- |
| `BRAND_NOT_FOUND` | 未登録ブランド。HTTP 404 | — |
| `INVALID_REQUEST` | schema、サービス識別子、形式不正 | — |
| `TURNSTILE_DENIED` | Turnstile失敗または障害 | 確認が完了しませんでした。もう一度お試しください。 |
| `IP_RATE_LIMITED` | IP 10分20回上限 | — |
| `RESEND_COOLDOWN` | 60秒の再送待機中 | 認証コードは60秒経過後に再送できます。 |
| `SEND_LIMIT_REACHED` | メール別1時間5回上限 | 送信回数の上限に達しました。しばらく時間をおいてお試しください。 |
| `MAIL_SEND_FAILED` | SMTP送信失敗 | 認証コードを送信できませんでした。しばらく時間をおいてお試しください。 |
| `CHALLENGE_INVALID` | 無効、失効、サービス不一致、使用済みchallenge | — |
| `OTP_EXPIRED` | 10分有効期限切れ | 認証コードの有効期限が切れました。再度認証コードを送信してください。 |
| `OTP_INVALID` | OTP不一致。ただし試行残数を開示しない | 認証コードが正しくありません。もう一度ご確認ください。 |
| `CHALLENGE_LOCKED` | 5回失敗によるchallenge無効化 | 認証回数の上限に達しました。認証コードを再送してください。 |
| `SESSION_INVALID` | セッション無効、失効、期限切れ、トークン不一致 | 認証の有効期限が切れました。もう一度メールアドレスの確認を行ってください。 |
| `JWT_INVALID` | JWTの署名、`kid`、`iss`、`aud`、`exp`検証失敗 | — |
| `JWT_REPLAYED` | 受付APIで消費済みの`jti` | — |

`NETWORK_ERROR` はフロントエンド専用コードであり、APIは返さない。固定表示文言は「通信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。」とする。

### 12.6 OTP画面・メール固定文（承認済み）

以下の画面文言およびメール本文は統括確定済みであり、改変・要約・追加をしない。

#### メール入力

見出し：

> メールアドレスの確認

説明：

> 本診断を安全にご利用いただくため、メールアドレスによる確認を行っています。
>
> ご入力いただいたメールアドレスに6桁の認証コードをお送りします。

ボタン：

> 認証コードを送信する

#### 認証コード入力

見出し：

> 認証コードの入力

説明：

> メールに届いた6桁の認証コードを入力してください。

ボタン：

> 確認して進む
>
> 再送する
>
> メールアドレスを変更する

#### 認証成功

見出し：

> メールアドレスの確認が完了しました

ボタン：

> 診断を開始する

#### OTPメール

件名：

> 【atLIB】認証コードのご案内

本文：

> {サービス名}の認証コードをお知らせします。
>
> 認証コード：{6桁の認証コード}
>
> 有効期限は発行から10分です。
>
> このメールに心当たりがない場合は、操作の必要はありません。
>
> atLIB株式会社

`{サービス名}` はURL別ブランド設定から取得する。`{6桁の認証コード}` は当該challengeにだけ対応するOTPを表示する。メール本文にはOTP以外の個人情報、JWT、診断結果、PDF、営業情報を含めない。

OTPメール本文では、当該challengeの6桁OTPを表示する。OTPはメール本文以外のアプリケーションログ、監視通知、API応答、ブラウザ履歴、URL、localStorage、sessionStorageへ出力しない。

### 12.7 E2E受入補完

既存の第9節に加え、次を確認する。

1. OTP照合成功後に5分JWTを取得し、対象サービスだけが検証できる。
2. JWTの期限切れ、改ざん、別サービスの`aud`、未知の`kid`、JWKS取得不能を拒否する。
3. 対象サービスの2時間認証状態は、ブラウザ再読み込み後に残らない。
4. 同時再送、同一OTPの二重検証、同一JWTの再利用で、認証・回数制限が矛盾しない。
5. Turnstile不成功、IP 10分20回超過、再送60秒内、メール別1時間5回、OTP誤入力5回を安全に処理する。
6. 6桁OTPは固定OTPメール本文だけに表示され、ログ、監視通知、API応答、ブラウザ履歴、URL、localStorage、sessionStorageには出ない。JWTとセッショントークンも同じ保存・出力禁止を守る。

## 13. Deployment Configuration・本番適用STOP条件

次は環境固有値であり、本Contractの実装ロジックではない。コード、Migration、Cloud Runデプロイ、本番適用の前に、環境ごとに設定・承認・検証する。

| 分類 | Deployment Configuration | 本番適用前のSTOP条件 |
| --- | --- | --- |
| ブランド | URL別ブランド設定、`{サービス名}`、許可サービス識別子、未登録時404 | 登録値と404確認なしに公開しない |
| JWT | `iss`値、JWKS URL、鍵、`kid`、鍵ローテーション期間、JWKSキャッシュ秒数 | 鍵管理・受け手検証の相互確認なしに公開しない |
| CORS/CSP | OTP APIホスト名、固定allowlist、各公開サービスのOrigin、`connect-src` | ワイルドカードまたは未登録Originを公開しない |
| Turnstile | site key、Secret、許可ホスト、障害監視 | サーバー側検証と失敗時拒否を確認せず公開しない |
| Cloud SQL | OTP専用Schema名、runtime/migration role、メール保護方式、接続暗号化 | 既存Sales Tools・営業・WSCデータを読めない権限確認なしに適用しない |
| 保持運用 | 24時間削除ジョブ、安全ログ30日削除、バックアップ復元時の扱い | 削除・復元手順を検証せず本番適用しない |
| メール | SMTPの既存Mailer設定、差出人アドレス、送信失敗監視 | 値をSecretで管理し、送信失敗を安全に扱えることを確認せず公開しない |

## 14. v1.1 Decision Record

| 日付 | 決定 | 状態 |
| --- | --- | --- |
| 2026-10-31 | 専用Cloud Run（D案） | 承認済み |
| 2026-10-31 | A1方式JWT | 承認済み |
| 2026-10-31 | サービス間Cookie共有なし・共通会員管理なし | 承認済み |
| 2026-10-31 | 6桁/10分、再送60秒/1時間5回、失敗5回、認証2時間、IP 10分20回 | 承認済み |
| 2026-10-31 | 256bit乱数・ハッシュ保存の2時間セッション、メモリ保持、再読み込み時再認証 | 承認済み |
| 2026-10-31 | 5分JWT、RS256、JWKS、`kid`、`email` claim、`jti`再利用防止 | 承認済み |
| 2026-10-31 | メール変更時の旧challenge失効、再送時の旧OTP失効、5回失敗時challenge無効化、未登録ブランド404 | 承認済み |
| 2026-10-31 | OTP/セッション24時間削除、安全ログ30日保持、Turnstile fail closed、固定CORS allowlist | 承認済み |

本書は実装承認、Migration承認、Cloud Runデプロイ承認、Secret/DNS承認を意味しない。


---

## 15. SECU:MIE 一般向け公開・診断結果・相談導線 Decision（2026-11-28）

Status: USER APPROVED / IMPLEMENTATION AND PRODUCTION RELEASE NOT APPROVED BY THIS RECORD

本節はSECU:MIE WEB・Insightの一般企業向け公開に限る。既存の国連協向け暫定受付（www.atlib.jp/secumie-web/ 等の配布済み導線）は別レーンで保全する。公開済みKAIZENの仕様は変更しない。PR #50/#51の組合向け受付・後日提出の業務契約を一般向けに強制しない。

| ID | 決定 |
| --- | --- |
| D01 | 一般向け診断はWEBとInsightの2サービス。コーポレートサイトからリンクする。 |
| D02 | 全社確定済み公開方針に従い、正式URLは https://service.atlib.jp/secumie-web/ と https://service.atlib.jp/secumie-insight/ 。以前の個別公開Host案は一般向け正式URLとして採用しない。 |
| D03 | 既存メールOTP・Turnstileを継承する。本人確認・会員登録の追加はしない。 |
| D04 | OTP後、診断開始前（0問目）に企業名・本店所在地を入力し、WEBは診断対象URLも入力する。一般向けに所属組合名は要求しない。 |
| D05 | WEBは既存WSC、Insightは承認済み診断エンジン・質問・レポートを再利用し、HTMLで結果を即時表示する。 |
| D06 | 結果画面にブラウザ標準印刷（window.print）を設け、利用者の環境でPDF保存できるようにする。印刷CSSで操作ボタンを除外する。一般向け専用のサーバーPDF生成・自動メール送付・レポートファイル永続保管を追加しない。社内WSCの既存PDFは保全する。 |
| D07 | 相談希望者だけが結果画面から相談申込へ進む。診断前のメール・企業情報・WEB URLおよび診断結果を引き継ぎ、再入力やPDF添付を要求しない。担当者名・電話番号を追加入力し、相談内容は任意。申込受付後に既存TimeRex日程調整へ遷移する。 |
| D08 | 既存相談受付・スタッフ管理資産をFit/Gapの上で再利用する。新規CRM、共通会員DB、不要な二重保存を追加しない。 |

共通OTPの第12節の認証・保持・JWT audience・jti消費・メモリ保持契約は維持する。同一公開Originになってもサービス識別子と受け手の分離を緩めない。相談申込では既存の同意・利用目的を確認し、診断のみの利用者を自動的に営業案件化しない。診断情報の保存対象・期間、相談との関連付け方法、既存API/DBへの具体的な接続はコードFit/Gapと既存保持契約の照合後に確定する。クライアントから渡された診断結果・メールを無条件に信頼しない。既存Insightの保持契約を無断変更しない。

次工程: PR #47のGENERAL実装、PR #19のWSC HTML生成、PR #50の公開受付、PR #51の管理資産、既存相談受付とTimeRex連携の実コードを照合する。一般向けに必要な差分だけを設計し、国連協向け機能と分離する。既存固定imageの検証証跡はそのdigestに限定する。SECURITY_NO_GO、Production No-Go、Draft、GENERAL無効を維持し、本記録はMerge、Build、Migration、GCP設定変更、公開、CVE例外の承認ではない。


---

## 16. 一般向けSECU:MIE メールOTP不採用 Decision（2026-11-28）

Status: USER APPROVED (GENERAL ONLY) / IMPLEMENTATION AND RELEASE GATED

Owner決定: コーポレートサイトから一般公開するSECU:MIE WEB・InsightはメールOTPを外す。第15節D03およびD04のOTP前提、D07の認証済みメール引継ぎを一般向けに限って本節で置き換える。公開URLの共有は抑止対象ではない。既存の団体向けOTP/JWT実装・Contract・検証証跡・国連協暫定受付は削除・変更しない。

- 一般向け導線: 既存案内ページ → 0問目（企業名・本店所在地、WEBは対象URL）・同意・Turnstile → 診断 → HTML即時結果・ブラウザ印刷/PDF保存 → 希望者のみ相談（入力済み企業情報・診断結果を引継ぎ、担当者名・メール・電話・任意相談内容を追加入力）→ TimeRex。
- OTP送信・認証済みメールclaim・OTP専用Runtime/DB/JWKSへの依存は一般向け経路では要求しない。既存の団体向け認証境界を弱めず、GENERAL専用の入口と安全な診断状態引継ぎをFit/Gapで設計する。
- WEB開始画面はCorporate PR #75の既存案内HTML/CSSを原則再利用し、団体向け文言、組合名、後日送付文言と確定導線に必要な差分のみ変更。国連協公開URL・受付APIは変更しない。
- Turnstileのサーバ側検証、実行回数制限、同時実行制御、WSCの公開IP/HTTPS/DNS再検証/TLS/通信上限等は一般公開前の必須確認事項。数値は今回未承認。

### 実行数制限 Read-only Fit/Gap

確認対象: PR #19 head 61f66e72be14c62b7cbc13c968e24dfd7f4f7365, PR #51 head 3d73fa22bc268c911b7c478c06cfbab190f65ac9, PR #47 previous head 5acf18e638cb3b25744e1e28ca452c3ac5085c6d.
- adminWebSecurityCheck.ts の /diagnose はスタッフ用。ルート内に回数制限/同時実行セマフォなし。ブラウザCSVは逐次実行、サーバ側バッチAPIなし。WscSalesService の一回消費許可はリクエスト内で生成され、利用者別回数制限ではない。
- Phase2C DNS 5秒、HTTPS通信15秒、HTTP応答上限1,000,000 bytes。Phase2B取得上限既定15秒。既存防御は維持する。
- publicOtp.ts のIP制限10分20回はOTP経路専用。一般診断の制限値として流用確定しない。
- piraPublicRuntime.ts / publicPiraIntake.ts に診断受付固有のIP制限は確認できない。JSON上限32kb。既存JWT前提のGENERALは無効のまま。
- Corporate PR #75 siteContactApi.ts のIP制限15分5回は既存問い合わせ・国連協受付用。一般診断の制限ではない。
- 既存B5-2B設計の専用OTP/PIRA Cloud Runは max instances=1, min=0, concurrency=20, timeout=60s（設計値、稼働実測ではない）。2026-11-04時点のSales Tools記録はconcurrency=80, max instances=20。現行GCP設定は別途read-only取得する。
- 一般向け診断APIのIP別・対象ドメイン別・同時実行上限は未確定。既存全体middlewareと実環境の確認後に最小限の数値案を提示する。新規Redis等を前提にしない。

本決定は本番公開・GENERAL有効化・DB/IAM/Secret/DNS/Cloud Run変更・CVE例外・既存OTP資産削除の承認ではない。

### 2026-11-28 Cloud Run read-only 実環境確認

Owner実行 SECUMIE_RUNTIME_LIMIT_AUDIT: 正常終了 / NO CONFIGURATION CHANGES。project=msp-zabbix, region=asia-northeast1。サービス一覧: atlib-cashflow, msp-customer-portal, ppap-download-service, ppap-upload-service, ppap-virus-scan, sales-tools, sales-tools-staging。SECU:MIE/OTP/PIRA/WSC専用サービスは当該一覧に存在しない。

| Service | CPU / memory | Service max | Template revision max/min | Template concurrency / timeout | 100% traffic |
| --- | --- | --- | --- | --- | --- |
| sales-tools | 1 / 1Gi | 20 | 20 / 未明示 | 80 / 300s | sales-tools-fds-20261124-01 |
| sales-tools-staging | 1000m / 512Mi | 20 | 2 / 0 | 80 / 300s | sales-tools-staging-p228 |

注意: Service Templateの取得値であり、配信中Revision固有の設定を再取得した証跡ではない。他project/regionの存在確認ではない。既存Sales Toolsの設定変更は不要。一般向けの診断開始回数・ドメイン別制限・同時実行数の数値は未承認。実環境確認はProduction Goを意味しない。

---

## 17. 一般向けSECU:MIE 診断実行制限 Decision（2026-11-28）

Status: USER APPROVED / IMPLEMENTATION AND PRODUCTION RELEASE GATED

Ownerは第16節の実環境確認後に提示された初期公開時の制限案を承認した。一般向けWEB/Insightのみに適用する。

| 項目 | WEB | Insight |
| --- | --- | --- |
| メールOTP | なし | なし |
| Turnstile | 必須 | 必須 |
| IP別診断開始 | 10分5回 | 10分20回 |
| 同一ドメイン診断 | 10分3回 | 対象外 |
| 診断専用同時実行上限（インスタンス単位） | 3件 | 専用制限なし |
| Cloud Run min instances | 0 | 0 |
| Cloud Run max instances | 1 | 1 |
| Cloud Run concurrency | 20 | 20 |
| Cloud Run timeout | 60秒 | 60秒 |
| 一般向けCSV一括診断 | 提供しない | 対象外 |

既存createIpRateLimiterを流用し、WEBのみ対象ドメイン別のインメモリ制限と実行中件数制御を追加する。上限超過時はアプリ内待ち行列を作らず再試行を案内する。Redis・専用管理DB・ジョブキューは新設しない。インメモリ制限はインスタンス再起動でリセットされ、Revision切替等をまたぐ厳密な全体制限ではない。既存WSCの通信安全対策（公開IP、HTTPS、DNS再検証、TLS、タイムアウト、サイズ制限等）と社内WSCの既存機能は維持する。Turnstileはサーバ側で検証する。数値は初期公開時の承認値であり、運用実績に基づく変更は別途判断する。

実装時の具体的なキー正規化、信頼可能なクライアントIP取得、期限切れカウントの掃除、同時実行枠の例外時解放、エラー応答、検証契約は既存資産のFit/Gapに基づき確定する。国連協向け受付、団体向けOTP/JWT、公開済みKAIZEN、既存Sales Tools設定は変更しない。本DecisionはMerge、DB/GCP変更、GENERAL有効化、本番公開、CVE例外の承認ではない。

---

## 18. Insight 一般向け開始画面・既存受付 Fit/Gap（2026-11-28）

Status: READ-ONLY FIT/GAP RECORDED / IMPLEMENTATION DESIGN CANDIDATE
Evidence: PR #47 HEAD 8a670068a8802d987b013d25f2769787c4b1ba0f.

- pira-e2.html の「情報管理セルフチェック」「日常業務を振り返る 8つの質問」、既存紹介文・全8問選択式・点数/危険度評価なしを流用する。pira-e2.css の既存カード・モバイル対応と v7 CSS を流用。新規LPやUI framework不要。
- GENERAL専用入口では email/code/success のOTP画面と public-service-auth.js の依存を外し、0問目へ直接遷移。企業名・本店所在地のみを必須とする承認済み第16節を反映。既存画面は企業名・担当者名・認証済みemail・URL必須、電話任意、UNIONのみ組合名/住所であり、単純なOTP UI削除では動かない。
- docs/pira-consent-ui-decision-20261101.md の全文表示＋「同意して診断に進む」による同意操作を流用する候補。GENERAL同意版 ATLIB-GENERAL-CONSENT-DRAFT-V0.1 は未承認、既存の「支援・サービスのご案内に利用」文は今回の希望者のみ相談方針と照合が必要。新しい一般向け同意文/版は未確定。UNION文言は変更しない。
- pira-e2-integration.js は受付生成、ANSWERING/COMPLETED 状態更新のたびにJWTを要求する。PiraIntakeService は認証済みemailによる所有権照合・24時間完了再診断制限を持つ。migration 038 は contact_name/verified_email/website_url NOT NULL、GENERAL address IS NULL を要求する。新GENERALの0問目と非互換。ダミーemail、空文字埋め、UNION制約緩和、既存JWT検証の無効化を行わない。既存受付DBを一般向けに強制利用しない。
- v7-prototype-app.js は browser memory state.draft → V.envelope → M.model → HTML report、window.print、回答修正、pira:v7-report-rendered event を実装済み。質問/回答ID・評価・優先テーマ・固定文・資料・印刷CSSを維持する。一般向け開始・戻る導線と相談ボタンのみの差分を検討する。印刷時に操作部を隠す既存 .v7-toolbar を流用。既存「回答は外部へ送信されません」の絶対表現は相談時の明示的な結果引継ぎと矛盾するためGENERAL表示のみ変更候補。
- GENERAL専用経路のTurnstile server verification、10分20回/IP、既存 runtimeSecurity/CSP を流用候補とする。既存 trust proxy=1 は新LB経路で実測確認。GENERAL開始/相談連携の状態管理と保存期間は既存相談API/DBとの照合後に決定する。診断回答を相談なしで外部送信する設計にしない。
- 次工程は共通相談受付/TimeRex の実コード照合、WEB HTML境界、GENERAL専用開始/状態/相談接続のコード契約を具体化。既存UNION・OTP・WSC・国連協受付・KAIZEN変更なし。Production No-Go、GENERAL無効、Draft維持。本記録はコード変更・配備承認ではない。

---

## 19. SECU:MIE ブランド表示 Decision（2026-11-28）

Status: OWNER APPROVED TITLE HIERARCHY / LOGO DESIGN DIRECTION / FINAL ASSET AND UI REVIEW PENDING

Owner指示: 両サービスともサービス名を主タイトルにし、診断名称をサブタイトルにする。SECU:MIE InsightとSECU:MIE WEBのロゴ制作を進める。直前の生成画像はブランド方向性の参考であり、画像内の全文章や画面レイアウトを実装正本にしない。

| 要素 | WEB | Insight |
| --- | --- | --- |
| 主タイトル | SECU:MIE WEB | SECU:MIE Insight |
| サブタイトル | Webセキュリティ診断 | 情報管理セルフチェック |
| 既存キャッチコピー | 御社のWebサイト、本当に大丈夫ですか？ | 日常業務を振り返る 8つの質問 |
| ロゴ方向案 | 盾＋地球、エメラルドグリーン | 盾＋グラフ、ブルー |

共通SECU:MIEロゴタイプ、ディープネイビーを基本とする方向。上記ロゴモチーフ・具体的色・最終形状は制作/ヒューマンレビュー対象。WEBのサブタイトルはWebとメール設定を対象とする既存診断範囲に合わせる。画像案の「URLを入力するだけ」等を0問目の必須項目と矛盾するまま採用しない。既存キャッチコピー、診断紹介文、質問、評価、解説、固定文、資料、印刷構造は維持。開始画面、0問目、診断画面、結果/印刷、相談画面でタイトル階層を統一する候補。既存UNION/国連協公開ページやコーポレートサイトの変更は別承認で行う。ロゴは再利用可能な独立資産（SVGを優先）とし、本文やフォームを画像化しない。既存CSS・印刷CSSを流用し、画面組み込みのPC/スマートフォン/印刷レビュー後に最終確定する。

第15〜18節の承認済み一般向け導線、OTP不採用、実行制限を変更しない。Production No-Go、GENERAL無効、Draft維持。本記録はコード変更・配備・既存公開画面変更の承認ではない。

## 20. SECU:MIE 正式ロゴ採用 Decision（2026-11-28）

Status: OWNER APPROVED VISUAL DESIGN / ASSET INTEGRATION PENDING

Ownerは最終提示の2段文字ロゴ（WEB: green shield/globe、Insight: blue shield/ascending chart、両方orange swoosh）を正式採用した。共通SECU:MIEはdeep navy、下段WEB/Insightは大きく表示する。診断名称は画像に含めず、HTMLテキストで表示する。採用した生成画像を視覚正本とし、旧PR #130 SVG候補をそのまま正式採用しない。最終画像の資産登録・SVG等への忠実な変換が必要な場合の同等性確認・画面組み込みは未実施。既存公開ページ、診断仕様、GCPは変更しない。Production No-Go維持。

## 21. 一般向けSECU:MIE 診断情報一時保持 Decision（2026-11-28）

Status: OWNER APPROVED / IMPLEMENTATION VERIFICATION PENDING

Ownerは相談受付引継ぎの一時保持要件を承認した。一般向けWEB・Insightの各Runtimeでインメモリ保持、発行から2時間、最大500件。未申込の診断情報は期限経過後に破棄し、相談受付通知成功時は診断情報を直ちに破棄する。重複受付抑止に必要な最小状態のみ期限内保持。再起動時は消失する。診断結果永続保管DB・PDF保管は新設しない。相談時のみ明示同意のうえ必要情報を通知する。実装上、期限経過時の物理削除（次回issue時だけの掃除では不足）、容量上限、通知失敗時の再試行、重複抑止、保持情報のログ非出力を検証する。通知先での業務情報保持は別契約。既存団体向け保持契約は変更しない。Production No-Go維持。

## 22. 一般向けSECU:MIE 相談案内・WEB技術用語表示 Decision（2026-11-28）

Status: OWNER APPROVED / IMPLEMENTATION CANDIDATE / VERIFICATION PENDING

- WEB/Insightとも診断結果→相談案内画面→相談申込フォーム→受付成功→TimeRex。案内画面は共通構成、サービス固有の相談内容のみ切替。診断結果へ戻れる。診断のみ利用することを妨げず、不安を煽らず、atLIBの具体的な支援価値を説明する。保持期間・容量・受付APIの基本契約は変更しない。
- 一般向けWEBレポートは診断概要・詳細見出し・確認推奨項目一覧に技術用語を追加し、既存の平易な説明と結果・判定を維持する。TLS_VALID: HTTPS・TLS暗号化通信、TLS_EXPIRING/INVALID: TLS証明書、HSTS: HSTS、CSP: CSP（Content-Security-Policy）、FRAME_HEADER_ABSENT: クリックジャック対策（X-Frame-Options／CSP frame-ancestors）、NOSNIFF_ENABLED: MIMEスニッフィング対策（X-Content-Type-Options: nosniff）、SPF: SPF、DMARC: DMARC。既存14判定IDに対応する8表示分類であり、新しい判定項目は増やさない。CSPの存在だけで埋め込み制御の有効性を認定しない。未確認の技術項目は追加表示しない。社内WSCの従来表示を維持する。
- 実装候補 commit cb7fcdb716a4c7089a8a13eb6803bc896d6f37ee, 61e64cba2e029b36f83ccb55590ebdce63078697, 5a50d72e5979b9c1f04a2d418c70bb98e35ac8b4, 4b11d8d75dd8bda902878d7f5d91f868de3f1b63。相談案内画面の申込ボタンは受付接続が未完成のため現時点で無効。最終フォーム・Mailer・TimeRex・ブラウザ・印刷・回帰検証未完了。本番公開しない。

## 23. 一般向けRuntime Security Gate — 2026-11-28

- Source HEAD: `526c81bd65a25c561f3b54da6b67bebd18757837`; CI run 46043800276 (source 14/14, browser synthetic 2/2, image smoke PASS).
- Candidate image: `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-general@sha256:8381e526e76cab78998f5fb12f4250c551ac06b9e904b7db987253f96d9bb7eb`.
- On-demand scan: `projects/msp-zabbix/locations/asia/scans/421db150-578b-49b6-8e07-e7241f1099e4`. C=0 H=13 M=19 L=45 MINIMAL=34 severity null=2. SECURITY_NO_GO; no deployment.
- H: npm undici 6.28.0 (4; max reported fixed 6.29.1), brace-expansion 5.0.9 (2; max reported fixed 5.0.11); OS openssl 3.5.9-1~deb13u1 (3), acl 2.3.2-2 (2), attr 1:2.5.2-3 (1), perl 5.40.1-6+deb13u1 (1), OS fixes not reported by scanner. Neither affected npm version is present in the canonical application lockfile; base tooling origin is a hypothesis, to verify through image inventory and rescan.
- Candidate remediation: reuse the existing Dockerfile.secumie pinned distroless Node24/Debian13 runtime digest (a551fc4166d8c43cf5af80eb05291a3cf9b05397); adapt smoke checks to shell-less nonroot (3c006ec5beb58e14f2e79e084f19ef00a97451b5). Do not alter shared lockfile without evidence. No assumption that all CVEs disappear, no suppression/waiver. Rebuild, CI, immutable image scan, review null severity and residual findings before any release. Public WSC actual TLS destination pinning, public address rejection, print and live integration acceptance remain separate required gates.

### 23.1 Distroless candidate rescan (2026-11-28)

- Source HEAD: `d4e07d3d00c8a51d984cef8fae826a250f24f373`; CI run 46047308072: source 14/14, browser synthetic 2/2, image smoke and nonroot/tool absence PASS.
- Candidate: `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-general@sha256:2ae1fac626b124124a12dc1f63809a59d237260887501ba6efd020fc14fe70e7`; VM_BUILD, DISTROLESS_NONROOT, VM_IMAGE_PUSH PASS. Node v24.22.3 reports OpenSSL 3.5.9, distinct from OS package version.
- Scan: `projects/msp-zabbix/locations/asia/scans/6f157e15-8522-4fc5-aa48-bb7ce5a4b78f`. C=0 H=3 M=6 L=23 MINIMAL=16 null=6. High reduction 13→3, all former non-OpenSSL High findings absent. No shared dependency changes. SECURITY_NO_GO, no deployment.
- Residual OS openssl 3.5.7-1~deb13u3: CVE-2026-84786, CVE-2026-107493, CVE-2026-107496; scanner supplies no fixed version (MAXIMUM). Prior slim image openssl 3.5.9-1~deb13u1 also had these findings. Do not infer fixed status from Node's OpenSSL version or remove scanner metadata.
- Unclassified vulnerabilities: CVE-2026-95818, CVE-2026-8674, CVE-2026-124851, CVE-2026-97399, CVE-2026-86805, CVE-2026-89092. Require package and advisory evidence; not counted as passed.
- Next: inspect actual available distroless base digest and Debian package candidates, compare advisory applicability; do not rebuild or change pin without evidence. Keep independent external destination binding, print quality and live integration gates open.

### 23.2 Residual advisory and available base investigation (2026-11-28)

- Existing scan 6f157e15-8522-4fc5-aa48-bb7ce5a4b78f: unclassified glibc 2.41-12+deb13u4 (5; reported fixed 2.41-12+deb13u5), libzstd 1.5.7+dfsg-1 (1; reported fixed 1.5.7+dfsg-1+deb13u1). Debian apt candidate openssl/libssl3t64 3.5.9-1~deb13u1; prior slim scan found the same three HIGH at that version. Last dpkg-query command stopped because openssl CLI package absent; libssl3t64 is installed. Evidence above remains valid.
- Debian Security Tracker consulted 2026-11-28: https://security-tracker.debian.org/tracker/CVE-2026-84786 (DANE client crash), https://security-tracker.debian.org/tracker/CVE-2026-107493 (existing X509_INFO stack on PEM parse failure), https://security-tracker.debian.org/tracker/CVE-2026-107496 (CMS encryption to attacker-controlled EC certificate). Both trixie 3.5.9-1~deb13u1 and trixie-security 3.5.7-1~deb13u3 remain vulnerable for all three; no Debian fixed version listed. Applicability to the runtime is not yet demonstrated; do not waive or suppress.
- Available upstream nonroot index sha256:675c532423b908f9e56f9d60a4e62309b63cd2a3175acb90a46b96f7ee68e121; linux/amd64 manifest sha256:774b396818c5dbc4d9aba312b84d548045939ca6efdadc840a928f205116fc74. Inspect actual package inventory before changing existing pinned base. No rebuild solely for OpenSSL until evidence warrants.

### 23.3 Public WSC destination binding remediation candidate

- Existing phase2c request used hostname and agent:false plus custom createConnection. To avoid depending on that combination for DNS binding, set actual HTTPS request host to validated numeric IP, preserving original Host header, SNI and certificate checks. Keep existing two DNS lookups, approval, no redirects, response bounds and secureConnect remoteAddress check. Commit 3f8c1635acf1e1107339d6014c60e80f711cad93.
- Phase2a IPv6 validation now uses net.BlockList, restricts to 2000::/3 excluding special/transition ranges 2001::/23, 2001:db8::/32, 2002::/16, 3fff::/20; reject scoped and literal IP URLs. Conservative rejection of some special global ranges is intentional. Commit 555ae885ab553f0ffa89a394dd808cb0c2124602.
- Tests cover alternate IPv6 spellings, private/mixed DNS, DNS change, numeric HTTPS request host, SNI, Host, redirect not followed using mocked request without network. Commits b9526ccaa7b603fdfe28ec954c565fae728d3666 and faf9dc94b70bf10985470f6808237370c31f71cb. CI and actual TLS integration not yet verified; changes touch shared WSC vendor and require existing staff regression. No production deployment or release authorization. SECURITY_NO_GO.

### 23.4 Inspected upstream base and WSC regression (2026-11-28)

- VM inventory BASE_INVENTORY=PASS. Old pinned base: libc6 2.41-12+deb13u4, libzstd1 1.5.7+dfsg-1, libssl3t64 3.5.7-1~deb13u3. New linux/amd64 manifest sha256:774b396818c5dbc4d9aba312b84d548045939ca6efdadc840a928f205116fc74: libc6 2.41-12+deb13u5, libzstd1 1.5.7+dfsg-1+deb13u1, libssl3t64 3.5.9-1~deb13u1. Both Node v24.22.3 and Node OpenSSL 3.5.9. New libc/zstd meet all six previous unclassified findings' reported fixed versions. New scan required; no claim of OpenSSL HIGH remediation.
- WSC destination safety CI run 46049508778 at source 3e78525a58f51781c8f4b3eac7f5440b09012ad0: new mocked destination tests 3/3, existing source tests 14/14, browser synthetic 2/2, distroless smoke PASS. Actual TLS integration still unverified. 
- Adopt inspected amd64 base in general Dockerfile only, commit 8690983c42bcd3d8831cb44fed436981140aeb8d. Existing union/OTP Dockerfile and shared dependency lockfile unchanged. Build and scan a new immutable candidate after new CI. Production No-Go, no deployment or waiver.

## 24. General SECU:MIE visual acceptance — 2026-11-28

- Owner explicitly confirmed both review PDFs OK (WEB and Insight, evidence from run 46051557812 / artifact 15225290269, source d19c6b4c679bb8e0b3de87ae03a15e1ea164039d). Treat report structure, wording and technical headings as accepted; no unsolicited redesign. This does not constitute production release approval or visual approval of subsequent CSS changes.
- General-only responsive/footer/print adjustments at e74b137, aff62c8, 0ec53c3, a1fd15f; regression assertions at 7c00a06c94983a466905151c3b1c6720d645c35a. CI run 46051992851 SUCCESS; synthetic browser/width/footer checks pass. Latest PDF/visual evidence must be checked for regressions against accepted reference, not redesign.
- Infra read-only preflight: no general WEB/Insight Cloud Run in msp-zabbix or atlib-corporate-site; existing secumie-prod-smtp-password and secumie-prod-turnstile-secret names observed in msp-zabbix, values/compatibility/IAM not verified. service.atlib.jp path ownership and LB default route require exact read-only confirmation before change. No DB required for general. Preserve all existing public paths including association QR intake.
- Remaining: immutable candidate rebuild/rescan, residual OpenSSL and unclassified evidence, actual TLS/SMTP/Turnstile, public route and configuration acceptance. Production No-Go.

## 25. General SECU:MIE AIO acceptance — 2026-11-28

Status: OWNER APPROVED DIRECTION / IMPLEMENTATION CANDIDATE / VERIFICATION PENDING

- Official reading: SECU:MIE = セキュミー; SECU:MIE WEB = セキュミー ウェブ; SECU:MIE Insight = セキュミー インサイト. Do not use セクミエ. Public landing page metadata, image alt and visible service definition use consistent spelling.
- General WEB/Insight canonical public guide only: static HTML definitions, accurate service-specific diagnosis scope and limitations, title/description, canonical, Open Graph, Service/WebPage/Organization JSON-LD (visible facts only; free diagnosis offer), six visible native FAQ disclosures, provider/privacy/contact/other-service links. No new diagnosis logic, results, account or persistence. No FAQ rich-result promise, no special AI markup requirement. No changes to approved PDF or union/QR intake.
- Insight eight topics are grounded in existing v6-content question IDs T01–T08. WEB technical scope grounded in existing WSC findings; no unsupported DKIM or comprehensive safety claim.
- General runtime adds X-Robots-Tag noindex,nofollow by default to non-health routes; removes it only for enabled canonical guide at configured service.atlib.jp and exact trailing-slash path. Existing Host/origin/Turnstile/POST/no-store unchanged. Staging configured with separate host stays noindex; release route remains gated. No public result URL or customer data in metadata. noindex is not access control.
- Host-root robots.txt and sitemap.xml owned by actual service.atlib.jp routing/default backend; route ownership not yet verified. Preserve existing public routes, robots rules and sitemap entries. At release, verify HTTPS GET /robots.txt and /sitemap.xml on service.atlib.jp; permit public guides for search crawlers including OAI-SearchBot (distinct from GPTBot training policy), do not alter training policy implicitly. Register exactly the canonical guides in the existing host sitemap, do not include diagnostic/consultation APIs, results, staging or QR duplicate. Do not add conflicting per-service root robots/sitemap endpoints. Verify canonical GET 200, no unintended X-Robots-Tag/noindex, asset availability and crawlability, API GET 404 + noindex, robots policies at LB/CDN, sitemap XML and Search Console URL inspection after release. llms.txt not mandatory.
- Implementation: WEB 69f27f26f6700e276efd66779b2809e7731dc3dd, Insight aa6552cc6766b7a6da850f90cb756599952bf248, guide-only styles 17b4ff0c6824d2821c486558a750501a776a2ce3, indexing boundary 5069cf93e5a39c0fbec50a7a3b6f9b91412008d1, source tests 9b32a437b42a8db8be5980d68671a95e6c95205a, browser assertions 08d731703c03755720b65bfb2f5258207439e2d4. Latest CI and visual regression pending. No production changes; security gate remains NO-GO.

## 26. General SECU:MIE release candidate evidence and route ownership — 2026-11-28

Status: VERIFIED CANDIDATE / SECURITY_NO_GO / NO DEPLOYMENT

- Immutable source HEAD: `6ead5cb9a47085b8434aa0dd8d9fc9f906cec29c`. CI run 46053189005: source 16/16, WSC destination safety 3/3, synthetic browser 2/2, distroless image smoke PASS. AIO guide review artifact 15225586118; public guide metadata/FAQ/indexing boundary passed automated checks, owner PDF approval remains section 24.
- VM_BUILD=PASS, DISTROLESS_NONROOT=PASS. LIVE_TLS=PASS against atLIB-owned public site using built image: TLS_VALID,HSTS_ENABLED,CSP_HEADER_PRESENT,NOSNIFF_ENABLED,SPF_PRESENT,DMARC_ABSENT. This is one actual TLS acquisition, not general coverage or SMTP/Turnstile acceptance.
- Candidate image `asia-northeast1-docker.pkg.dev/msp-zabbix/cloud-run-source-deploy/secumie-general@sha256:430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba`. Scan `projects/msp-zabbix/locations/asia/scans/d34117e1-9d82-42e8-82cb-d1300bbd0bcc`. C=0 H=3 M=6 L=14 MINIMAL=16 UNCLASSIFIED=0 total=39. Six prior unclassified glibc/libzstd findings absent. High residual OS openssl 3.5.9-1~deb13u1: CVE-2026-107493, CVE-2026-84786, CVE-2026-107496; fixedVersion MAXIMUM/no concrete fix. SECURITY_OR_TLS_GATE=NO_GO. No deployment.
- Debian Security Tracker rechecked: https://security-tracker.debian.org/tracker/CVE-2026-107493 ; https://security-tracker.debian.org/tracker/CVE-2026-84786 ; https://security-tracker.debian.org/tracker/CVE-2026-107496 . All mark trixie 3.5.9-1~deb13u1 and trixie-security 3.5.7-1~deb13u3 vulnerable, with postponed notes. Do not waive/suppress or infer non-applicability. Avoid repeated rebuilds without material fix evidence. Keep scanned source and digest fixed; this documentation-only evidence commit is not the scanned image's source SHA.
- Route preflight: service.atlib.jp resolves to 136.69.71.191, matching atlib-corporate-site global forwarding rules corporate-site-http-fr and corporate-site-https-fr. HTTPS proxy corporate-site-https-proxy uses corporate-site-https-map and certificate map corporate-site-prod-map. URL map default backend corporate-site-bes, no hostRules/pathMatchers. msp-zabbix LB 136.68.254.85 is not this host's route.
- Release routing design candidate: exact host service.atlib.jp path matcher with existing default corporate-site-bes; only /secumie-web and /secumie-web/*, /secumie-insight and /secumie-insight/* to separate dedicated backends/NEGs, preserving other hosts, routes and default. Trailing slash redirect or exact-path handling must be tested; do not change existing public paths including www.atlib.jp/secumie-web/ association QR. Confirm project compatibility for serverless NEG/backend and Cloud Run placement and least-privilege IAM before creation. Snapshot URL map, validate candidate, prepare rollback. No route change before security and live integration acceptance.
- Current service.atlib.jp robots.txt HTTP 200 text/plain has User-agent: *, Allow: /business-web/, Allow: /it-management-kaizen/, Sitemap: https://service.atlib.jp/sitemap.xml; no observed Disallow. Current sitemap HTTP 200 application/xml lists business-web/ and it-management-kaizen/. Root metadata owned by corporate-site default backend. Corporate-site lane should add the two canonical service URLs to existing sitemap and corresponding Allow directives, retaining existing entries; do not alter crawler training policy. Search crawler access (including OAI-SearchBot) to be verified after publication. Do not publish sitemap entries for unready routes, and do not include association QR or result/API URLs. Coordinate separate corporate-site candidate/acceptance, not direct production mutation in this lane.
- Remaining: OpenSSL security gate, secure Cloud Run configuration and exact secret binding/recipient/site key verification without exposing secret values, SMTP/Turnstile actual integration, candidate route/robots/sitemap and release E2E. No Production Go.

## 27. General SECU:MIE infrastructure preparation contract — 2026-11-28

Status: DESIGN CANDIDATE / READ-ONLY PREFLIGHT PENDING / SECURITY_NO_GO

- Preserve scanned source 6ead5cb9a47085b8434aa0dd8d9fc9f906cec29c and immutable image sha256:430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba per section 26. No rebuild for documentation-only commits; no deployment while residual HIGH findings are unresolved.
- Reuse B5 SMTP design (docs/secumie-production-gate-b5-preparation-20261117.md): Mailtrap Live Sending, live.smtp.mailtrap.io:587, SMTP_USER=api, SMTP_FROM=SECU:MIE <no-reply@notify.atlib.jp>, secumie-prod-smtp-password candidate. Verify actual credential scope, sender domain, account quota, recipient and delivery before use; never assume the old OTP credential is authorized for general notification. Existing OTP Turnstile secret was designed for insight.atlib.jp only: do not bind it to general service merely because the Secret exists. Confirm the actual widget for service.atlib.jp, allowed hostname, site key (public), corresponding secret reference and enabled numeric version. Reuse an existing suitable widget only with verified scope; otherwise prepare a distinct general widget and dedicated Secret without altering existing widget/OTP settings. No payload read in preflight. Consultation destination SECUMIE_CONSULTATION_NOTIFY_EMAIL must be confirmed, not guessed.
- Preferred placement candidate: msp-zabbix / asia-northeast1, service and SA names secumie-web-general-prod and secumie-insight-general-prod; corresponding regional NEG names secumie-web-general-neg / secumie-insight-general-neg, global EXTERNAL_MANAGED backend names secumie-web-general-bes / secumie-insight-general-bes. Same-project Cloud Run/NEG/backend; corporate-site-https-map in atlib-corporate-site references the backend across projects only when same Organization and effective IAM confirmed. Official GCP https://docs.cloud.google.com/load-balancing/docs/https and https://docs.cloud.google.com/load-balancing/docs/negs/serverless-neg-concepts . If same org not established, stop and compare same-LB-project placement and explicitly scoped cross-project image/Secret access; no fallback mutation.
- Keep per-service SA distinct, no DB/JWT/HMAC/admin roles, no project-wide Secret Accessor. Bind only actual selected SMTP and Turnstile Secret at resource level, numeric enabled versions. Cross-project backend use permission roles/compute.loadBalancerServiceUser scoped to new backends and the authorized LB administrator only if needed. No existing IAM removals, service edits or secret rotation.
- Runtime config per current code: SECUMIE_GENERAL_KIND=WEB or INSIGHT; SECUMIE_GENERAL_HOST=service.atlib.jp; SECUMIE_GENERAL_ENABLED=false until controlled private acceptance and release gates, SECUMIE_TURNSTILE_SITE_KEY, SECUMIE_TURNSTILE_SECRET, SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SECUMIE_CONSULTATION_NOTIFY_EMAIL. Initial CPU/memory candidate 1 vCPU/512MiB (measure HTML report peak), section 17 approved min0/max1/concurrency20/timeout60s each. Public release ingress internal-and-cloud-load-balancing, disable default URL after private acceptance; no public invoker or route before gates. Establish a verified non-public acceptance route without weakening Host/origin or Turnstile. Verify trusted actual client IP through LB before relying on IP limits. Test negative origin/host, actual receipt expiry, SMTP delivery, both TimeRex destinations; no real customer data or reservation creation.
- Section 21 timer-based physical cleanup: request-based billing does not guarantee idle timer execution. Instance-based billing (CPU always allocated, min0 unchanged) is a configuration candidate requiring cost/owner confirmation and acceptance; instance termination loses receipt by design. Do not represent 2h as guaranteed availability or exact timer execution. Official https://docs.cloud.google.com/run/docs/configuring/billing-settings .
- Future URL-map candidate must retain existing default corporate-site-bes, preserve other hosts, use exact host service.atlib.jp and only two approved path prefixes. No route import or robots/sitemap publication until security and integration gates. Baseline fingerprint must match immediately before eventual change; export prior map and validate candidate before import. Coordinate corporate-site lane for host-root metadata. No changes to association QR path.
- Read-only preflight script secumie_general_infra_preflight.sh SHA256 66f121639bee7d697318be1a1720e616d4adb403aa9fdfb9a736dc64ee0afbbe: organization ancestry, required API inventory, actual URL-map/default backend, collision checks, candidate digest, secret metadata/direct IAM, existing env names and refs only. Shell syntax checked; actual execution pending. No Secret payload access, no writes to GCP, no deployment. The output is evidence collection, not release approval.

### 27.1 Infrastructure preflight evidence — 2026-11-28

- Both msp-zabbix and atlib-corporate-site have the same Organization ancestor (273205071203); artifactregistry, compute, iam, run, secretmanager APIs enabled in each. CROSS_PROJECT_LB_ORGANIZATION=PASS. Effective cross-project IAM still unverified.
- corporate-site-https-map fingerprint 0krNwKm-L-I=, default corporate-site-bes, no hostRules/pathMatchers. Default backend EXTERNAL_MANAGED, HTTP, CDN enabled, IAP disabled, existing corporate-site-neg. EXPECTED_LB_BASELINE=PASS. Preserve baseline; fingerprint must be rechecked before future change.
- Planned resource collision checks returned four empty arrays; immutable candidate digest 430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba exists.
- Preflight stopped at gcloud secrets versions describe latest for msp-zabbix/secumie-prod-smtp-password: NOT_FOUND (secret absent or no versions). Earlier name list contained this Secret, so current existence, versions, access and suitability are unresolved; Turnstile and later checks did not execute. Do not infer payload missing or rotate/create credentials. Inspect Secret existence and version metadata separately, continue other independent read-only checks, compare active serving revisions of corporate-site and sales-tools for SMTP/Turnstile configuration references only. Prefer appropriate existing credential with explicit scope/owner approval. Consultation destination remains to confirm.
- No GCP mutations, no secret payload retrieval, no deployment. Production No-Go and OpenSSL HIGH gate unchanged.

### 27.2 General SMTP decision correction — 2026-11-28

Owner clarified that existing atLIB-internal notifications can be sent from system. Adopt existing Google Workspace SMTP and system@atlib.jp for general WEB/Insight consultation notifications only. No OTP, no external customer email, no new Mailtrap contract or mailbox. This supersedes the general SMTP candidate in §27, not the union/OTP B5 Mailtrap decision.

Prior corporate-site evidence: system@atlib.jp to contact@atlib.jp delivery PASS, Google Workspace SMTP port 587, existing corporate-site-smtp-password Secret; actual current host, authentication identity, enabled numeric Secret version and permission scope to be verified against serving revision. Prefer compatible same-project existing SMTP credentials only if sender authorization and scope are verified; do not copy payloads or grant project-wide access. General consultation recipient not yet explicitly confirmed; contact@atlib.jp is prior delivery evidence, not an automatic recipient decision. The Mailtrap Secret NOT_FOUND is no longer a general runtime prerequisite; no assertion that the underlying Secret is absent or faulty. Existing SMTP configuration and credentials remain unchanged. Production No-Go; no GCP writes.

### 27.3 Existing successful knowledge first; general notification destination — 2026-11-28

- Owner confirmed both general WEB and Insight consultation notifications to sales@atlib.jp; sender system@atlib.jp, existing Google Workspace SMTP, internal delivery only. Set SECUMIE_CONSULTATION_NOTIFY_EMAIL=sales@atlib.jp. This supersedes unresolved recipient in §27.2. Do not introduce Mailtrap, external customer mail, new account, DB, Slack or CRM changes for general.
- Before infrastructure/configuration design, reconcile current Git, Canonical/ADR/Decision/Production Ledger and successful runtime evidence; use working general-purpose services before historical OTP designs. Do not ask owner to repeat known facts or re-run broad checks that already passed.
- Prior successful corporate-site SMTP evidence: 2026-11-12 system@atlib.jp to contact@atlib.jp, smtp.gmail.com:587, existing Workspace SMTP identity and corporate-site-smtp-password; 2026-11-20 corporate-site-00030-vow evidence refers to SMTP password version 2 and corporate-site-prod-turnstile-secret version 1. Historical relay 421/550 issues mean smtp-relay.gmail.com must not be assumed interchangeable with authenticated smtp.gmail.com. Current serving revision and actual credential/sender compatibility still need targeted read-only confirmation; never retrieve payloads for inspection. Corporate-site PR #64 (72cf54a39a82f805375671ab3200bc9d611b2ad5) shows successful-flow contact SMTP implementation; sales-tools PR #53 (1a0584bae5b6c473b57d3d1213be3ebb8f0187bf) uses Mailer and config.diagnosticNotifyEmail for business-web, PR #98 (28f963f97f77474cf5feba265e2f5e9c299c4d63) config reads DIAGNOSTIC_NOTIFY_EMAIL. General runtime already uses its dedicated env and existing Mailer; no source rebuild solely to set recipient.
- Owner-provided 2026-11-27 Turnstile hostname-management evidence includes service.atlib.jp, atlib.jp, recruit.atlib.jp, www.atlib.jp and www.service.atlib.jp. Existing suitable widget is the first candidate; no new widget or old OTP widget change by default. Confirm mapping to site key and server secret in currently serving configuration, not by name alone. Existing evidence does not prove exact current widget-secret mapping.
- Next gate: targeted metadata-only comparison of active corporate-site and sales-tools SMTP and Turnstile refs, numeric enabled versions and scoped IAM; reuse compatible credentials without copying payloads, no changes to existing policies. Production NO-GO (OpenSSL HIGH 3). No GCP changes or image rebuild.

### 27.4 Release acceleration direction — 2026-11-28

Owner directs shortest publication path and deferral of nonessential verification until after publication. Reuse verified image/CI, existing Workspace SMTP (system@atlib.jp to sales@atlib.jp), compatible existing service.atlib.jp Turnstile widget, existing corporate LB, DNS and certificate. No new features, DB, mail account, broad repeated preflight or redesign. Only retrieve missing actual active configuration references/versions; do not expose credential values. Batch new dedicated services, scoped IAM, NEGs/backends and route preparation; preserve all existing routes, keep rollback ready. Minimum publication checks: actual credentials and host mapping, image identity, restricted ingress, effective IAM, public path/negative isolation and essential start/consultation functionality; defer expanded browser matrices, long-running monitoring and Search Console/AI discovery checks. No actual infrastructure change in this documentation commit.

Known HIGH 3 (CVE-2026-107493, CVE-2026-84786, CVE-2026-107496) remain on scanned image with no concrete fixed version reported. Prior explicit SECURITY_NO_GO remains recorded; speed/verification direction alone does not document a specific acceptance of these three findings. Any temporary exception requires explicit owner decision with scope, expiry/review and remediation trigger; do not treat no fix as no risk. Until decision or remediation, retain no-go for public runtime. Do not alter or re-scan immutable candidate for docs-only changes.

### 27.5 Temporary release exception and minimal release runbook — 2026-11-28

Owner responded "進めてください" immediately to the explicit question whether to temporarily accept the three residual HIGH OpenSSL findings and publish before upstream remediation. Interpret this as scoped temporary risk acceptance for general SECU:MIE WEB/Insight only, not a blanket security waiver or a claim that CVEs are remediated. Supersedes the public-runtime no-go in §27.4 only for this exact candidate and these three findings; all other protections and existing service boundaries remain. C=0 H=3 M=6 L=14 MINIMAL=16 UNCLASSIFIED=0; CVE-2026-107493, CVE-2026-84786, CVE-2026-107496, OS openssl 3.5.9-1~deb13u1. Immutable image sha256:430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba; scanned source 6ead5cb9a47085b8434aa0dd8d9fc9f906cec29c; scan d34117e1-9d82-42e8-82cb-d1300bbd0bcc. Proposed review date 2026-12-05 (JST), earlier if fix or severity change; no automatic renewal or automatic shutdown. Daily official-source monitor created, automation ID 6b09dbf45fd8819196f594ca5fc3b07c; update candidate after concrete fix and re-scan, no automatic deployment. Actual public release not yet confirmed.

- Existing successful corporate-site configuration names verified in PR #64 source (72cf54a39a82f805375671ab3200bc9d611b2ad5): SMTP_HOST/PORT/USER/FROM/PASSWORD and SITE_CONTACT_TURNSTILE_SITE_KEY/SECRET/HOSTNAMES. Resolve from actual 100% serving revision, pin enabled Secret numeric versions; require system@atlib.jp sender and Workspace host, do not access secret payload. Existing widget host confirmation is prior evidence; actual widget token/SMTP delivery is immediate post-release test, not preclaimed PASS. Destination sales@atlib.jp confirmed by owner.
- One-shot Cloud Shell release script secumie_general_release.sh SHA256 14c2cb4bbbedd8deaf3e496590e5add21b7e018d014dafa1b702275819567126. Syntax and local URL-map normalization tested; live execution pending. Uses new dedicated SA per service, scoped Secret Accessor on two existing corporate-site Secrets, existing immutable msp-zabbix image; no project-wide credential grant or secret copy. Creates only new named Cloud Run, NEG, global backend, CDN off, ingress internal-and-cloud-load-balancing, default URL disabled, invoker IAM check disabled for LB ingress. CPU always allocated (instance-based billing candidate selected for cleanup; min0/max1, 1 vCPU/512MiB initial, concurrency20/timeout60). May incur usage charges; no persistent DB. Stops on incompatible settings, resource collision, IAM, startup or map validation failure; do not rerun blindly after partial provisioning.
- Same-organization cross-project backend referencing supported per official GCP docs. URL-map candidate only exact service.atlib.jp host and two paths with slash redirects; all other paths/hosts retain existing default. Save baseline, static validate with existing-route tests, fingerprint-guarded REST patch, verify actual map, public HTTP/canonical/logo/API rejection smoke, existing URL status comparison. Conditional rollback only if own route shape still present, preserve other changes; no resource deletion. If operation status is uncertain, verify actual LB before retry.
- No deployment or GCP change performed by assistant. User runs Cloud Shell. On successful PUBLICATION_SMOKE=PASS, immediately perform synthetic company diagnosis and consultation, real Turnstile/SMTP delivery to sales@atlib.jp, both TimeRex redirects (no booking), verify rate-limit client-IP behavior. Corporate-site host-root robots/sitemap update only after real public routes verified; Search Console/AI discovery later. No changes to old association QR intake or existing services.

### Partial general release recovery — 2026-11-28

Owner executed release v2 (SHA256 c82332e450ca57ecb6cc1ba2b3149066b78f31c650e9f6ec6917dba8ce3a9e1c). Live source corporate-site-00068-xig; SMTP host smtp.gmail.com, corporate-site-smtp-password:2, corporate-site-prod-turnstile-secret:1. SMTP auth identity is distinct from sender; preserve existing auth identity, system@atlib.jp sender and sales@atlib.jp recipient.

WEB SA secumie-web-general-prod created, both selected Secret bindings added, Cloud Run revision secumie-web-general-prod-00001-6tr Ready/100%, no default URL, NEG secumie-web-general-neg and backend secumie-web-general-bes created and connected. Insight SA secumie-insight-general-prod created; first cross-project Secret IAM binding failed with 400 account does not exist immediately after creation. Likely IAM eventual consistency; exact cause not yet independently verified. No Insight runtime/NEG/backend reported, no LB patch reached; publication not confirmed. Evidence directory ~/secumie-release-WNjpo6KN.

Recovery script secumie_general_release_v3.sh SHA256 52961a87d37c88de8d05e9affb497c0d7696a5bac8fd44fcbca9f4f115ff3491: reuse both existing SAs; check WEB recorded revision, identity, settings, existing Secret bindings and connected NEG/backend, do not recreate or redeploy WEB; resume Insight missing resources only, retry specifically account-not-found IAM errors with bounded backoff, validate existing resources before reuse; preserve original exact-host URL map validation, fingerprint guard and conditional rollback/smoke. Bash syntax checked, actual execution pending. No new security exception or changes to existing customer paths. Keep both candidate resources and prior evidence. Do not rerun v2.

### General release v4 routing rollback — 2026-11-28

Owner execution of secumie_general_release_v4.sh (SHA256 69aa60d69b64e0f9e54c09d30cb3d4d7a2636c498a0bb8e478614fbfb07505bb) reused WEB revision secumie-web-general-prod-00001-6tr, its NEG and backend. Corporate active configuration source corporate-site-00070-kic, smtp.gmail.com, corporate-site-smtp-password:2, corporate-site-prod-turnstile-secret:1. Insight scoped access to both Secrets PASS; deployed secumie-insight-general-prod-00001-z47 Ready/100%, default URL None, created and attached secumie-insight-general-neg and secumie-insight-general-bes. Both dedicated runtimes retained. Exact-host map validation and patch reached public smoke; WEB guide check failed after retry loop. Conditional rollback PASS, PUBLICATION_NOT_CONFIRMED. Evidence ~/secumie-release-JouB0uCM. No reason code can be inferred from the generic smoke failure: v4 combines HTTP status, canonical, reading, noindex checks, and removes temporary response headers/body on exit. Check historical Cloud Run request logs for both new services and LB logs in both projects; compare saved published and baseline map with live map. Distinguish app rejection, LB/backend failure, propagation/cache, and smoke predicate failure before retry. Keep restricted ingress and default URL disabled; no redeploy or broad IAM changes. No additional change to existing services. Scoped temporary exception and review date unchanged.

### Existing KAIZEN publication knowledge — 2026-11-28

Owner requests explicit reuse of successful IT経営KAIZEN publication knowledge. Verified corporate-site PR #79 head 45533d6c3e6e2995499fb3923230992442156105, docs/it-management-kaizen-service-host-release-20261123.md including 2026-11-25 Production Ledger, src/server.ts and src/middleware/sitePublication.ts; predecessor PR #74 head a7c14308a01da253d4842266ed3d9f94ac0bcb29. IT経営KAIZEN success: existing corporate-site HTTPS LB/certificate/DNS and default backend, LP served from private dist/service-content/it-management-kaizen, exact actual Host and proxy hostname match, separate existing sales.atlib.jp intake, scoped immutable overlay, isolated HTTP acceptance with correct Host, existing ingress retained, no new LB backend or cross-project backend reference. Ledger records image 0653f45d969ff4eaab604534adb3cbc0ed8c856e722e2e76546f0a9babc46baa, corporate-site-imv-20261123071048 promotion, public HTTP/SEO/CSP/host isolation/regression PASS; this is historical, not current revision. Business Web host routing and service-host robots/sitemap owned by corporate-site app.

Fit/Gap: general SECU:MIE uses dynamic same-origin POST APIs and two already provisioned dedicated Cloud Run/NEG/backend services in msp-zabbix, not static LP plus existing sales.atlib.jp intake. Cross-project LB path routing is a new difference, not a proven KAIZEN route. Do not mechanically overlay diagnosis runtime into corporate-site, expose run.app, weaken Host checks, or redeploy working resources. Inspect actual request logs / saved map after v4 rollback to distinguish LB routing, backend reachability and app/HTTP predicate failures; preserve existing corporate-site paths. If cross-project route is unsuitable, compare same-project backend placement or existing app-owned host routing with authenticated internal handoff; require evidence and minimal change before choosing, not a new architecture by default. Reuse verified exact-host, isolation, rollback, host-specific cache discipline; no broad cache purge. No GCP changes.

## 28. General SECU:MIE production publication ledger — 2026-11-28 10:11 JST

Status: PUBLIC GUIDE SMOKE PASS / LIVE FUNCTIONAL ACCEPTANCE PENDING / SCOPED TEMPORARY SECURITY EXCEPTION

- Owner executed secumie_route_only_recovery.sh SHA256 52739764de809ddb3273ab1c28b39460ccba57982d5b6375a8b13472701d1e3b. Existing WEB revision secumie-web-general-prod-00001-6tr and Insight revision secumie-insight-general-prod-00001-z47 reused. No new image, runtime, SA, Secret, NEG or backend. Exact-host map applied to existing corporate-site HTTPS LB. Repeated initial 404, then intermittent 200, finally both guide predicates simultaneously PASS: HTTP=200 CANONICAL=1 READING=1 NOINDEX=0. PUBLICATION_SMOKE=PASS. The observed transition supports LB propagation delay as likely cause of earlier failures; no definitive internal cause established. Keep longer propagation observation and avoid unnecessary reconfiguration or premature rollback when retrying verified routes.
- Public URLs https://service.atlib.jp/secumie-web/ and https://service.atlib.jp/secumie-insight/. Source 6ead5cb9a47085b8434aa0dd8d9fc9f906cec29c, image sha256:430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba. Evidence ~/secumie-route-aJUM41Rx. Owner-submitted Cloud Shell log is publication evidence; independent external fetch from assistant not available. Scoped HIGH 3 exception per §27.5 remains; review 2026-12-05, daily monitor already configured; no broader waiver.
- Immediate remaining: user-operated browser E2E using synthetic company/contact, real Turnstile, WEB own-domain target and Insight 8 questions, result and PDF, consultation to sales@atlib.jp from system@atlib.jp, both TimeRex redirects without booking. Do not disclose credentials or send customer data. Verify existing KAIZEN and QR intake unaffected; actual client-IP/rate limit verification still pending. No real SMTP submission or Turnstile acceptance established by this smoke.
- Corporate-site lane: reuse current service-host root robots/sitemap implementation (Business Web PR #74, IT management PR #79). Append only two canonical public guide URLs to existing entries, preserve all existing host routing and corporate WWW metadata, no broad cache purge, apply scoped overlay to actual active revision and verify. No code change to diagnosis runtime or PDF, no rebuild of candidate. AIO_ROOT_SITEMAP_UPDATE=PENDING_CORPORATE_SITE, Search Console and AI discovery follow afterward. No production action by assistant in this documentation commit.

## 29. General post-publication UX and intake minimization — 2026-11-28

Status: OWNER UX DIRECTION / IMPLEMENTED CANDIDATE / CI AND PRODUCTION UPDATE PENDING

- Owner reported WEB embedded navy PDF/print button inert while outer orange button worked; consultation CTA required scrolling. Remove only the redundant button from the general iframe HTML, retain the working outer print handler, add top and retain bottom consultation entry using existing guide. No approved report content, sandbox permission, union/staff report renderer, diagnosis logic or consultation handoff changes.
- Owner explicitly requests no address for general intake and red required marks. WEB first stage companyName + HTTPS URL; Insight first stage companyName. Remove address from guide FAQ, form, receipt and notification mail. To avoid breaking an already-open old form, accept its optional bounded legacy registeredAddress field at start and discard it; never retain or forward it. Existing consultation fields personName/email/phone (required), note optional, consent required stay unchanged pending separate field discussion; no new department/title fields or phone requirement change by inference. Required red ＊ with explanation and existing HTML required semantics; no union/OTP intake changes.
- Owner approved approximately three-second minimum presentation in both services: WEB at valid start submission, actual request starts immediately and result appears once successful response and minimum 3s; on failure show existing input/error without artificial delay. Insight after eight questions, synchronous existing report-rendered event is used to briefly hide result before displaying; no shared question engine change. Indeterminate progress only (no simulated completion percentages or claims about individual checks); accessible status and reduced motion. No server sleep or additional diagnosis requests. Previous native print spy failed in CI 46104191179, user confirmed real outer print works; revised parent-world spy, keep iframe scripts disabled.
- Implementation through bdfaf4c1d13bd5641fb2cac06cc42cf48695c243; browser assertions for minimum duration, failure restoration, viewport CTA, print, required marks, no address and existing consultation flow. Await actual CI result; do not claim tests passed until verified. Both general services require an updated candidate now, unlike earlier WEB-only fix. Build once, verify image/scan, keep existing routing/IAM/Secret unchanged. Current production image and scoped temporary HIGH exception remain per §28; new digest requires explicit bounded exception decision if residual HIGH persists, no automatic extension. No GCP changes.

### 29.1 UX candidate verification — 2026-11-28

- CI 46104954265 SUCCESS at source afbf1c2aee60008480445de4d81bad552c245994: source 16/16, WSC destination 3/3, browser 2/2, image smoke PASS. Browser includes three-second preparation, error restoration, top/bottom WEB consultation CTA, parent print spy, address removal and required marks.
- Owner execution of secumie_ux_candidate_gate_v2.sh SHA256 03787a72c1d0055585125b6210c03d0aa649bc5783f6e2a2a71ea4fe6b45e758: both live revisions remain Ready/100%, WEB secumie-web-general-prod-00001-6tr and Insight secumie-insight-general-prod-00001-z47, resolved amd64 manifest sha256:247fa5ea983d654288776eb85a7240c7f367635583303fa5c13bcc44f58d8ab1 from prior index 430fe8e4b4e12f501119a1269279f80b1cac6960276b7be0e91a89a1f0a73eba. Baseline gate corrected to account for resolved child manifest.
- New candidate index sha256:89630791d07fe6a204cf262feb69fd62878611a27f22455d64501c417b11ebfe; amd64 manifest sha256:913601fc8480af5f7357b7b6ce488c7e9a2411f43ab299913303c2192de878b9; VM_BUILD=PASS, DISTROLESS_NONROOT=PASS, LIVE_TLS=PASS (own-domain). Scan projects/msp-zabbix/locations/asia/scans/4000ded9-490d-421e-b83d-b63236e8a357; C0 H3 M6 L14 MINIMAL16 UNCLASSIFIED0, total 39, same severity counts as existing production. HIGH exactly CVE-2026-107493, CVE-2026-84786, CVE-2026-107496 on OS openssl 3.5.9-1~deb13u1; no concrete fixedVersion reported. This is not remediation or proof of absence of other risks. Evidence /tmp/secumie-final-evidence-NVsVxg/vulnerabilities.json. SECURITY_OR_TLS_GATE=NO_GO; no deployment. Candidate retained.
- Existing temporary exception is scoped to previous digest. Require explicit owner decision to apply same three-finding exception to new candidate, retaining 2026-12-05 JST review date and existing monitoring/remediation trigger; no new findings allowed and no automatic extension. Once authorized, update only the two existing Cloud Run services by immutable image with 0%-traffic candidates and Ready/config verification; preserve previous revisions for rollback and all LB, IAM, Secret, DNS, Turnstile/SMTP settings. No rebuild or repeated broad preflight. This evidence-only Git commit does not change the scanned source SHA.

### 29.2 UX production promotion — 2026-11-28

Status: UX_PUBLICATION_SMOKE=PASS / LIVE POST-UPDATE DIAGNOSIS AND CONSULTATION PENDING

- Owner executed secumie_ux_promote.sh SHA256 6c870895834726b23a84b6e7e1c309f003d271027c473eeb7966f4cda5401d43 with explicit SECUMIE_APPROVE_SAME_HIGH_3=sha256:89630791d07fe6a204cf262feb69fd62878611a27f22455d64501c417b11ebfe. Temporary exception applies only to the same three OpenSSL findings on this verified candidate; retain 2026-12-05 JST review and remediation trigger, no extension or automatic deployment. CI and scan evidence in §29.1.
- Baseline PASS for both existing production revisions. Image-only 0%-traffic candidates Ready; each promoted to 100%. WEB secumie-web-general-prod-ux-afbf1c2; Insight secumie-insight-general-prod-ux-afbf1c2. PUBLIC_UX=PASS twice for each service; UX_PUBLICATION_SMOKE=PASS. Source afbf1c2aee60008480445de4d81bad552c245994; image index sha256:89630791d07fe6a204cf262feb69fd62878611a27f22455d64501c417b11ebfe; scan projects/msp-zabbix/locations/asia/scans/4000ded9-490d-421e-b83d-b63236e8a357. Evidence ~/secumie-ux-promote-tnukKuGE. Owner-provided execution output is the production evidence.
- Prior rollback targets: secumie-web-general-prod-00001-6tr and secumie-insight-general-prod-00001-z47. No LB/IAM/Secret/DNS changes; existing runtime configuration retained. No GCP action by assistant in this docs-only update.
- Real post-update browser diagnosis, print, consultation, SMTP to sales@atlib.jp and TimeRex remain pending; public HTML/asset smoke does not establish these live flows. In-memory receipts may be lost on revision switching, requiring a new diagnosis. Second-stage consultation fields remain current (no department/title addition or phone optionality decision). Corporate-site robots/sitemap remains a separate pending release item. Update only documentation; no rebuild or further release.

### 29.3 Owner UX acceptance

Owner explicitly confirmed production reflection of the requested UX corrections OK. Close the visual/UX acceptance for the deployed afbf1c2 revisions: duplicate inert print button removal, consultation CTA placement, address removal, required marks, and approximately three-second preparation display. This confirmation does not independently establish real SMTP delivery, complete consultation submission/TimeRex flow, or completion of the corporate-site root robots/sitemap update. Preserve existing temporary OpenSSL exception and review date. Documentation only; no rebuild, redeployment or additional design changes.

### 29.4 Owner live consultation acceptance — 2026-11-28

Owner confirmed live consultation submission, email receipt and TimeRex operation OK following the general production UX update. Together with §29.3, record owner acceptance of the general WEB/Insight public diagnostic and consultation flow at the deployed afbf1c2 revisions. Notification destination remains sales@atlib.jp, existing Workspace SMTP/system sender and service-specific TimeRex destinations unchanged. This is owner-reported functional acceptance, not an independent assistant-run submission, exhaustive operational test or evidence of a TimeRex reservation. Close the requested functional/UX acceptance; corporate-site robots/sitemap and service links, operational monitoring and the scoped OpenSSL remediation/review remain separate. No new deployment, configuration change or extension of temporary exception.
