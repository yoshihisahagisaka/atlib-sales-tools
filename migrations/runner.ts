// Development / existing GCE workflow. Production uses the compiled migration artifact.
import {runMigrationCli} from '../src/db/migrateCli';
runMigrationCli().catch(()=>{console.error(JSON.stringify({event:'migration_run_failed'}));process.exitCode=1;});
