import { loadDatabaseConfig } from '../config';
import { createPool } from './pool';
import { deploymentRoleNames } from './secumieDbOperationsConfig';

export async function configureSecumieDbRoles(): Promise<void> {
  const roles = deploymentRoleNames();
  const pool = createPool({ db: await loadDatabaseConfig('migration') });
  try {
    await pool.query('SELECT secumie_deployment.configure_roles($1::name,$2::name,$3::name,$4::name)', [roles.otp, roles.pira, roles.admin, roles.maintenance]);
    console.log(JSON.stringify({ event: 'secumie_db_roles_configured', roles }));
  } finally { await pool.end(); }
}

if (require.main === module) configureSecumieDbRoles().catch(error => {
  console.error(JSON.stringify({ event: 'secumie_db_roles_configuration_failed', error: error instanceof Error ? error.message : 'unknown' }));
  process.exitCode = 1;
});
