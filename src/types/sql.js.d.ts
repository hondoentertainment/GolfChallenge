declare module 'sql.js' {
  export interface BindParams {
    [key: string]: unknown;
  }

  export interface Statement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getColumnNames(): string[];
    get(params?: unknown[]): unknown[];
    free(): boolean;
    run(params?: unknown[]): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
