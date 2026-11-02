import { createPiraPublicRuntime } from './runtime/piraPublicRuntime';
import { piraRuntimeConfiguration, runtimePort } from './runtime/runtimeConfig';

async function main(): Promise<void> {
  const options = await piraRuntimeConfiguration();
  const port = runtimePort();
  const server = createPiraPublicRuntime(options).listen(port, '0.0.0.0', () => console.info(JSON.stringify({ event: 'runtime_started', service: 'pira-public', port })));
  const stop = () => server.close(() => options.pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch(error => { console.error(JSON.stringify({ event: 'runtime_start_failed', service: 'pira-public', error: error instanceof Error ? error.message : 'unknown' })); process.exit(1); });
