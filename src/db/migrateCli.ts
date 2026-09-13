import path from 'node:path';
import {loadDatabaseConfig} from '../config';
import {createPool} from './pool';
import {runMigrations} from './migrate';
export async function runMigrationCli(){const pool=createPool({db:await loadDatabaseConfig()});try{await runMigrations(pool,process.env.MIGRATIONS_DIR??path.resolve(process.cwd(),'migrations'),e=>console.log(JSON.stringify(e)));}finally{await pool.end();}}
if(require.main===module)runMigrationCli().catch(()=>{console.error(JSON.stringify({event:'migration_run_failed'}));process.exitCode=1;});
