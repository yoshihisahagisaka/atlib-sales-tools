import { createSecumieWebPublicRuntime } from './runtime/secumieWebPublicRuntime';
import { runtimePort, secumieWebRuntimeConfiguration } from './runtime/runtimeConfig';
async function main(){const options=await secumieWebRuntimeConfiguration();const server=createSecumieWebPublicRuntime(options).listen(runtimePort(),'0.0.0.0');const stop=()=>server.close(()=>options.pool.end().finally(()=>process.exit(0)));process.on('SIGTERM',stop);process.on('SIGINT',stop);}
main().catch(()=>process.exit(1));
