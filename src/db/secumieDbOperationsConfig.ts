import type { PoolConfig } from 'pg';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required database operation configuration: ${name}`);
  return value;
}

export function maintenancePoolConfig(): PoolConfig {
  const port = Number(process.env.DB_MAINTENANCE_PORT ?? process.env.DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_MAINTENANCE_PORT');
  return {
    database: required('DB_NAME'),
    user: required('DB_MAINTENANCE_USER'),
    password: required('DB_MAINTENANCE_PASSWORD'),
    host: process.env.DB_MAINTENANCE_SOCKET_PATH ?? process.env.DB_SOCKET_PATH ?? process.env.DB_MAINTENANCE_HOST ?? process.env.DB_HOST ?? '127.0.0.1',
    ...((process.env.DB_MAINTENANCE_SOCKET_PATH ?? process.env.DB_SOCKET_PATH) ? {} : { port }),
    max: 1,
    connectionTimeoutMillis: 10_000,
  };
}

export function deploymentRoleNames() {
  return {
    otp: required('OTP_DB_ROLE'),
    pira: required('PIRA_DB_ROLE'),
    admin: required('PIRA_ADMIN_DB_ROLE'),
    maintenance: required('SECU_MAINTENANCE_DB_ROLE'),
  };
}
