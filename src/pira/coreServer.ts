import { createCore } from './core';
import { coreConfig } from './runtimeConfig';
import { googleMachineVerifier } from './machineAuth';
import { createPiraPool } from './runtimePool';
import { PgPiraStore } from './pgStore';
import { LimitedSalesReferences } from './salesReferences';
import { PiraService } from './service';
async function main(){const c=coreConfig(process.env);const pool=await createPiraPool(process.env);const service=new PiraService(new PgPiraStore(pool,new LimitedSalesReferences()));const server=createCore(service,c.auth,c.salesOrigin,c.callers,googleMachineVerifier(c.audience)).listen(Number(process.env.PORT??8080));process.on('SIGTERM',()=>server.close(()=>{void pool.end();}));}
if(require.main===module)void main().catch(()=>{console.error(JSON.stringify({event:'pira_core_startup_failed'}));process.exitCode=1;});
