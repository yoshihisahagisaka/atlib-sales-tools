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
