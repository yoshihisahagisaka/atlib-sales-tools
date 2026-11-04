import { Pool } from 'pg';
import type { Config } from '../config';

export interface DatabasePoolOptions {
  /** Existing Sales Tools callers keep the historical default of five. */
  max?: number;
  /** node-postgres defaults to 10 seconds; callers may make it explicit. */
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

/**
 * Cloud Run本番では Cloud SQL Auth Proxy 統合により Unix ソケット経由で接続する
 * （`--add-cloudsql-instances` 指定時、/cloudsql/<INSTANCE_CONNECTION_NAME> にソケットが生成される）。
 * ローカル開発時は host/port のTCP接続にフォールバックする。
 */
export function createPool(config: Pick<Config,'db'>, options: DatabasePoolOptions = {}): Pool {
  const max = positiveInteger('database pool max', options.max ?? 5);
  const idleTimeoutMillis = positiveInteger('database pool idle timeout', options.idleTimeoutMillis ?? 10_000);
  const connectionTimeoutMillis = positiveInteger('database pool connection timeout', options.connectionTimeoutMillis ?? 10_000);
  const common = { max, idleTimeoutMillis, connectionTimeoutMillis };
  if (config.db.socketPath) {
    return new Pool({
      host: config.db.socketPath,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      ...common,
    });
  }
  return new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.name,
    user: config.db.user,
    password: config.db.password,
    ...common,
  });
}
