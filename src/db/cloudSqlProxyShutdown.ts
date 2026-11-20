export async function shutdownCloudSqlProxy(): Promise<void> {
  const url = process.env.CLOUD_SQL_PROXY_ADMIN_URL;
  if (!url) return;
  if (url !== 'http://127.0.0.1:9091/quitquitquit') throw new Error('SECU_PROXY_ADMIN_URL_INVALID');
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('SECU_PROXY_SHUTDOWN_FAILED');
}
