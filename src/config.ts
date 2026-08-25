import { getSecret } from './lib/secrets';

export interface Config {
  nodeEnv: string;
  port: number;
  gcpProjectId: string;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    socketPath?: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  };
  staffAuth: {
    googleClientId: string;
    googleClientSecret: string;
    jwtSecret: string;
  };
  diagnosticNotifyEmail: string; // ISMS診断フォーム: 新規回答の通知先（カンマ区切りで複数可）
  portalBaseUrl: string; // 例: https://sales-tools.atlib.jp（通知メール内の管理画面リンク生成用）
  slack: {
    // Slack Incoming Webhook URL。任意項目(undefinedなら送信をスキップするだけでメール通知には影響しない)。
    webhookDiagnostic?: string;
  };
  aiAssist: {
    // 原価見積ツールのAI提案機能用。任意項目(undefinedならaiAssistServiceが503を返すだけで他機能には影響しない)。
    // 本番はSecret Manager (sales-tools-anthropic-api-key) をCloud Runの--set-secretsで環境変数に注入する運用とする。
    anthropicApiKey?: string;
  };
}

/**
 * 環境変数を優先し、値が無ければ Secret Manager から取得する。
 * Cloud Run本番では `--set-secrets` で環境変数に直接注入されるため通常はSecret Manager呼び出しは発生しない。
 * ハードコードは一切しない（値がどちらの手段でも取得できなければ起動時に例外で落とす）。
 */
async function resolveSecret(
  projectId: string,
  envValue: string | undefined,
  secretId: string,
): Promise<string> {
  if (envValue) return envValue;
  return getSecret(projectId, secretId);
}

export async function loadConfig(): Promise<Config> {
  const gcpProjectId = process.env.GCP_PROJECT_ID ?? 'msp-zabbix';

  const dbPassword = await resolveSecret(gcpProjectId, process.env.DB_PASSWORD, 'sales-tools-db-password');
  const smtpPassword = await resolveSecret(gcpProjectId, process.env.SMTP_PASSWORD, 'sales-tools-smtp-password');
  const googleOauthClientSecret = await resolveSecret(
    gcpProjectId,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'sales-tools-google-oauth-client-secret',
  );
  const staffJwtSecret = await resolveSecret(gcpProjectId, process.env.STAFF_JWT_SECRET, 'sales-tools-staff-jwt-secret');

  const required = (name: string, value: string | undefined): string => {
    if (!value) throw new Error(`Missing required config value: ${name}`);
    return value;
  };

  const portalBaseUrl = required('PORTAL_BASE_URL', process.env.PORTAL_BASE_URL);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 8080),
    gcpProjectId,
    db: {
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      name: required('DB_NAME', process.env.DB_NAME),
      user: required('DB_USER', process.env.DB_USER),
      password: dbPassword,
      socketPath: process.env.DB_SOCKET_PATH || undefined,
    },
    smtp: {
      host: required('SMTP_HOST', process.env.SMTP_HOST),
      port: Number(process.env.SMTP_PORT ?? 587),
      user: required('SMTP_USER', process.env.SMTP_USER),
      password: smtpPassword,
      from: required('SMTP_FROM', process.env.SMTP_FROM),
    },
    staffAuth: {
      googleClientId: required('GOOGLE_OAUTH_CLIENT_ID', process.env.GOOGLE_OAUTH_CLIENT_ID),
      googleClientSecret: googleOauthClientSecret,
      jwtSecret: staffJwtSecret,
    },
    diagnosticNotifyEmail: required('DIAGNOSTIC_NOTIFY_EMAIL', process.env.DIAGNOSTIC_NOTIFY_EMAIL),
    portalBaseUrl,
    slack: {
      webhookDiagnostic: process.env.SLACK_WEBHOOK_DIAGNOSTIC || undefined,
    },
    aiAssist: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    },
  };
}
