import {loadDatabaseConfig} from '../config';
import {createPool} from './pool';

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('RUNTIME_DB_ROLE must be a simple PostgreSQL identifier');
  }
  return '"' + value.replace(/"/g, '""') + '"';
}

export async function grantCustomerFitRuntimeAuthority(): Promise<void> {
  const runtimeRole = process.env.RUNTIME_DB_ROLE?.trim();
  if (!runtimeRole) throw new Error('Missing required config value: RUNTIME_DB_ROLE');

  const pool = createPool({db: await loadDatabaseConfig('migration')});
  const role = quoteIdentifier(runtimeRole);

  try {
    await pool.query('BEGIN');
    await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE customer_fit_checks TO ${role}`);
    await pool.query(`GRANT SELECT, INSERT, DELETE ON TABLE customer_fit_check_items TO ${role}`);
    await pool.query('COMMIT');
    console.log(JSON.stringify({
      event: 'customer_fit_runtime_authority_granted',
      role: runtimeRole,
      grants: {
        customer_fit_checks: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        customer_fit_check_items: ['SELECT', 'INSERT', 'DELETE'],
      },
    }));
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  grantCustomerFitRuntimeAuthority().catch((error: unknown) => {
    console.error(JSON.stringify({
      event: 'customer_fit_runtime_authority_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  });
}
