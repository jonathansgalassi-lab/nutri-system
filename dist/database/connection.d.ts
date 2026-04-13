import { Pool, PoolClient } from 'pg';
export declare const pool: Pool;
export declare function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]>;
export declare function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null>;
export declare function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
export declare function checkConnection(): Promise<void>;
//# sourceMappingURL=connection.d.ts.map