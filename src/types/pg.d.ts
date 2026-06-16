declare module "pg" {
  export type QueryResultRow = Record<string, unknown>;

  export interface QueryResult<TRow extends QueryResultRow = QueryResultRow> {
    rows: TRow[];
    rowCount: number | null;
  }

  export interface PoolConfig {
    connectionString?: string;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<TRow extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<TRow>>;
    end(): Promise<void>;
  }
}
