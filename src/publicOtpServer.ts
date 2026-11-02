import { createPublicOtpRuntime } from './runtime/publicOtpRuntime';
import { otpRuntimeConfiguration, runtimePort } from './runtime/runtimeConfig';

async function main(): Promise<void> {
  const options = await otpRuntimeConfiguration();
  const port = runtimePort();
  const server = createPublicOtpRuntime(options).listen(port, '0.0.0.0', () => console.info(JSON.stringify({ event: 'runtime_started', service: 'public-auth', port })));
  const stop = () => server.close(() => options.pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch(error => { console.error(JSON.stringify({ event: 'runtime_start_failed', service: 'public-auth', error: error instanceof Error ? error.message : 'unknown' })); process.exit(1); });
