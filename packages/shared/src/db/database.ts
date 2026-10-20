import { DatabaseSync, backup } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';

export interface MemexDatabaseOptions {
  readonly?: boolean;
}

/**
 * Thin compatibility layer over node:sqlite.
 *
 * node:sqlite ships with the Node runtime embedded in Electron, so the app and
 * the MCP server can use the same driver without native-module ABI rebuilds.
 */
export class MemexDatabase {
  private readonly connection: DatabaseSync;
  private savepointCounter = 0;

  constructor(path: string, options: MemexDatabaseOptions = {}) {
    this.connection = new DatabaseSync(path, { readOnly: options.readonly ?? false });
    this.connection.exec('PRAGMA busy_timeout = 5000');
    if (options.readonly) {
      this.connection.exec('PRAGMA query_only = ON');
    } else {
      this.connection.exec('PRAGMA journal_mode = WAL');
      this.connection.exec('PRAGMA synchronous = NORMAL');
      this.connection.exec('PRAGMA foreign_keys = ON');
    }
  }

  prepare(sql: string): StatementSync {
    return this.connection.prepare(sql);
  }

  exec(sql: string): void {
    this.connection.exec(sql);
  }

  pragma(expression: string): void {
    this.connection.exec(`PRAGMA ${expression}`);
  }

  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
    return (...args: TArgs) => {
      if (this.connection.isTransaction) {
        const savepoint = `memex_sp_${++this.savepointCounter}`;
        this.connection.exec(`SAVEPOINT ${savepoint}`);
        try {
          const result = fn(...args);
          this.connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          try {
            this.connection.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            this.connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
          } catch {
            // Preserve the original error.
          }
          throw error;
        }
      }

      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const result = fn(...args);
        this.connection.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.connection.exec('ROLLBACK');
        } catch {
          // Ignore rollback failures so the original error is preserved.
        }
        throw error;
      }
    };
  }

  async backupTo(path: string): Promise<void> {
    await backup(this.connection, path);
  }

  close(): void {
    this.connection.close();
  }

  get isOpen(): boolean {
    return this.connection.isOpen;
  }
}
