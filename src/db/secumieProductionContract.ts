export const SECU_PRODUCTION_DATABASE = 'secumie_insight';
export const SECU_PRODUCTION_INSTANCE = 'msp-zabbix:asia-northeast1:secumie-sg-shared-prod-db';
export const SECU_PRODUCTION_TARGET = `${SECU_PRODUCTION_INSTANCE}/${SECU_PRODUCTION_DATABASE}`;
export const SECU_APPROVED_APPLICATION_CONNECTIONS = 78;

export const SECU_PRODUCTION_ROLES = [
  { name: 'secumie_otp_prod', passwordEnv: 'SECU_OTP_DB_PASSWORD', connectionLimit: 6 },
  { name: 'secumie_pira_prod', passwordEnv: 'SECU_PIRA_DB_PASSWORD', connectionLimit: 6 },
  { name: 'secumie_admin_prod', passwordEnv: 'SECU_ADMIN_DB_PASSWORD', connectionLimit: 40 },
  { name: 'secumie_migration_prod', passwordEnv: 'SECU_MIGRATION_DB_PASSWORD', connectionLimit: 1 },
  { name: 'secumie_maintenance_prod', passwordEnv: 'SECU_MAINTENANCE_DB_PASSWORD', connectionLimit: 1 },
] as const;

export const SECU_PRODUCTION_MIGRATIONS = [
  '037_public_service_otp.sql',
  '038_pira_public_intake.sql',
  '039_pira_admin_export.sql',
  '040_pira_export_audit_retention.sql',
  '041_secumie_db_operations.sql',
] as const;

export function assertProductionInstance(instance: string | undefined): void {
  if (instance !== SECU_PRODUCTION_INSTANCE) throw new Error('SECU_PRODUCTION_INSTANCE_MISMATCH');
}

export function evaluateProductionConnectionCapacity(input: {
  maxConnections: number;
  superuserReserved: number;
  reserved: number;
  observedConnections: number;
}) {
  const reserve = Math.max(
    10,
    Math.ceil(input.maxConnections * 0.20),
    input.superuserReserved + input.reserved + 5,
    input.observedConnections + 5,
  );
  const applicationAvailable = input.maxConnections - reserve;
  return {
    ...input,
    reserve,
    applicationAvailable,
    required: SECU_APPROVED_APPLICATION_CONNECTIONS,
    pass: applicationAvailable >= SECU_APPROVED_APPLICATION_CONNECTIONS,
  };
}
