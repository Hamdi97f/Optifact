/**
 * Tiny JSON-file-backed "database" sitting on top of the api-gateway's
 * file-storage endpoints. Each logical table is persisted as a single JSON
 * file in the user's storage:
 *
 *     optifact-table-<tenant>-<name>-<version>.json   →   { rows: T[] }
 *
 * The exposed query API mimics a small subset of the supabase-js builder so
 * existing call sites (`db.from('documents').select('*').eq('type','invoice')`)
 * keep working with minimal changes.
 *
 * Caveats / trade-offs of this design:
 *   • All filtering/sorting happens in-memory on the client after the table
 *     file is loaded — fine for small ERP datasets, not for large ones.
 *   • Writes serialize through a per-table mutex to avoid lost updates from
 *     concurrent operations within the same tab. They are NOT safe across
 *     multiple browser tabs / devices (the gateway has no transactions).
 *   • "Update" replaces the table file by uploading a brand-new version
 *     (unique filename) and then deleting all older versions. This avoids
 *     re-PUTting an existing object — the storage backend treats that as
 *     a duplicate and surfaces a 500/409 — while still keeping a usable
 *     copy on the server in case the cleanup step fails midway.
 *   • Legacy filenames (`optifact-table-<tenant>-<name>.json`, no version
 *     suffix) are still discovered on read so existing user data keeps
 *     loading after the upgrade; the next save migrates them to a
 *     versioned name and removes the legacy file.
 */

import {
  deleteFile,
  downloadFileText,
  getCurrentUser,
  listFiles,
  uploadFile,
} from './apiClient';

const FILE_PREFIX = 'optifact-table-';
const FILE_SUFFIX = '.json';

type Row = Record<string, unknown> & { id: string };

interface TableFile {
  rows: Row[];
}

interface FileRef {
  file_id: string;
  file_name: string;
}

/* --------------------------- per-table cache + lock ------------------------ */

const cache = new Map<string, { ref: FileRef | null; data: TableFile }>();
const writeQueues = new Map<string, Promise<unknown>>();

/**
 * Stable prefix identifying every file (legacy or versioned) that backs a
 * given (tenant, table) pair. The legacy filename is `${prefix}${SUFFIX}`;
 * versioned filenames look like `${prefix}-<timestamp>-<rand>${SUFFIX}`.
 */
function tablePrefix(table: string): string {
  const user = getCurrentUser();
  // Scope by user_id so multi-account scenarios don't collide on the same device.
  const tenant = user?.user_id ?? 'anon';
  return `${FILE_PREFIX}${tenant}-${table}`;
}

/**
 * Build a unique filename for a fresh write. Each save uploads under a new
 * name so we never re-PUT an existing object — many storage backends
 * (including the Supabase Storage that the Optifact api-gateway proxies)
 * reject duplicate filenames with a 500/409, which previously surfaced as
 * "Internal server error" on the second create/update of any table.
 */
function newFileNameFor(table: string): string {
  // UUID guarantees uniqueness even when multiple saves land in the same
  // millisecond; the leading timestamp keeps filenames roughly chronological
  // for human inspection in the storage console.
  const stamp = Date.now().toString(36);
  return `${tablePrefix(table)}-${stamp}-${genId()}${FILE_SUFFIX}`;
}

/**
 * True when `name` is one of our backing files (legacy fixed name or any
 * versioned variant) for the given table. The trailing `-` on the
 * versioned check prevents accidentally matching files of a different table
 * that happens to share a prefix (e.g. `documents` vs `documents_archive`),
 * and the `.json` suffix check prevents matching unrelated artefacts a user
 * might happen to have under a similar prefix.
 */
function isTableFileName(name: string, table: string): boolean {
  if (!name.endsWith(FILE_SUFFIX)) return false;
  const prefix = tablePrefix(table);
  return name === `${prefix}${FILE_SUFFIX}` || name.startsWith(`${prefix}-`);
}

/**
 * Return every storage file that backs `table` (legacy + all versions),
 * ordered newest-first. We sort primarily by `created_at` (the gateway's
 * authoritative timestamp) and fall back to the filename — which embeds
 * the client-side write timestamp — so ordering stays stable even if
 * `created_at` is missing or two files share it.
 */
async function listTableFiles(table: string): Promise<FileRef[]> {
  const files = await listFiles();
  return files
    .filter((f) => isTableFileName(f.file_name, table))
    .sort((a, b) => {
      const byTime = (b.created_at ?? '').localeCompare(a.created_at ?? '');
      return byTime !== 0 ? byTime : b.file_name.localeCompare(a.file_name);
    })
    .map((f) => ({ file_id: f.id, file_name: f.file_name }));
}

async function findFile(table: string): Promise<FileRef | null> {
  const matches = await listTableFiles(table);
  return matches[0] ?? null;
}

async function loadTable(table: string): Promise<TableFile> {
  const cached = cache.get(table);
  if (cached) return cached.data;
  const ref = await findFile(table);
  if (!ref) {
    const empty: TableFile = { rows: [] };
    cache.set(table, { ref: null, data: empty });
    return empty;
  }
  let parsed: TableFile = { rows: [] };
  try {
    const text = await downloadFileText(ref.file_id);
    const json = text ? (JSON.parse(text) as TableFile) : { rows: [] };
    parsed = { rows: Array.isArray(json.rows) ? (json.rows as Row[]) : [] };
  } catch {
    parsed = { rows: [] };
  }
  cache.set(table, { ref, data: parsed });
  return parsed;
}

async function saveTable(table: string, data: TableFile): Promise<void> {
  // Discover every existing version (legacy + versioned) so we can clean
  // them up after a successful upload. Falling back to the just-loaded
  // cache entry isn't enough because earlier writes may have left behind
  // older versions on the server.
  const previous = await listTableFiles(table);
  // Upload under a fresh unique filename so we never re-PUT an existing
  // object — the storage backend rejects duplicates with a 500/409.
  const target = newFileNameFor(table);
  const uploaded = await uploadFile(target, JSON.stringify(data), 'application/json');
  cache.set(table, {
    ref: { file_id: uploaded.file_id, file_name: uploaded.file_name },
    data,
  });
  // Best-effort cleanup of every prior version. We never delete the file
  // we just uploaded (defensive: in case the gateway returns the same id).
  await Promise.all(
    previous
      .filter((p) => p.file_id !== uploaded.file_id)
      .map((p) =>
        deleteFile(p.file_id).catch(() => {
          // best-effort cleanup of stale copies
        }),
      ),
  );
}

function withWriteLock<T>(table: string, op: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(table) ?? Promise.resolve();
  const next = previous.then(op, op);
  writeQueues.set(
    table,
    next.catch(() => undefined),
  );
  return next;
}

/** Drop all in-memory caches — call this on sign-out / sign-in. */
export function resetDbCache(): void {
  cache.clear();
  writeQueues.clear();
}

/* --------------------------------- helpers --------------------------------- */

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (RFC4122-ish, non-cryptographic).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/* ---------------------------- query builder types -------------------------- */

type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[] }
  | { kind: 'gte'; column: string; value: unknown }
  | { kind: 'lte'; column: string; value: unknown };

interface QueryState {
  filters: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  single?: 'one' | 'maybe';
  /** Columns requested via `.select('a, b')`. '*' or empty means all. */
  columns: string;
}

export interface QueryResult<T> {
  data: T | null;
  error: Error | null;
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const v = row[f.column];
      if (f.kind === 'eq') return v === f.value;
      if (f.kind === 'in') return f.values.includes(v);
      if (f.kind === 'gte') return compareValues(v, f.value) >= 0;
      if (f.kind === 'lte') return compareValues(v, f.value) <= 0;
      return true;
    }),
  );
}

function projectColumns(rows: Row[], columns: string): Row[] {
  const trimmed = columns.trim();
  if (!trimmed || trimmed === '*') return rows;
  const wanted = trimmed.split(',').map((c) => c.trim()).filter(Boolean);
  if (wanted.length === 0 || wanted.includes('*')) return rows;
  return rows.map((row) => {
    const out: Row = { id: row.id };
    for (const col of wanted) {
      if (col in row) (out as Record<string, unknown>)[col] = row[col];
    }
    return out;
  });
}

/* --------------------------- terminal query builder ------------------------ */

class TerminalQuery<T> implements PromiseLike<QueryResult<T>> {
  constructor(
    private readonly run: () => Promise<QueryResult<T>>,
  ) {}

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/* --------------------------- chainable select query ------------------------ */

class SelectQuery<T> implements PromiseLike<QueryResult<T>> {
  private state: QueryState;
  constructor(
    private readonly table: string,
    columns: string,
  ) {
    this.state = { filters: [], columns };
  }

  eq(column: string, value: unknown): SelectQuery<T> {
    this.state.filters.push({ kind: 'eq', column, value });
    return this;
  }
  in(column: string, values: unknown[]): SelectQuery<T> {
    this.state.filters.push({ kind: 'in', column, values });
    return this;
  }
  gte(column: string, value: unknown): SelectQuery<T> {
    this.state.filters.push({ kind: 'gte', column, value });
    return this;
  }
  lte(column: string, value: unknown): SelectQuery<T> {
    this.state.filters.push({ kind: 'lte', column, value });
    return this;
  }
  order(column: string, opts: { ascending?: boolean } = {}): SelectQuery<T> {
    this.state.order = { column, ascending: opts.ascending ?? true };
    return this;
  }
  limit(n: number): SelectQuery<T> {
    this.state.limit = n;
    return this;
  }
  single(): TerminalQuery<T> {
    this.state.single = 'one';
    return new TerminalQuery(() => this.execute());
  }
  maybeSingle(): TerminalQuery<T> {
    this.state.single = 'maybe';
    return new TerminalQuery(() => this.execute());
  }

  async execute(): Promise<QueryResult<T>> {
    try {
      const data = await loadTable(this.table);
      let rows = applyFilters(data.rows, this.state.filters);
      if (this.state.order) {
        const { column, ascending } = this.state.order;
        rows = [...rows].sort((a, b) => {
          const c = compareValues(a[column], b[column]);
          return ascending ? c : -c;
        });
      }
      if (typeof this.state.limit === 'number') rows = rows.slice(0, this.state.limit);
      const projected = projectColumns(rows, this.state.columns);
      if (this.state.single === 'one') {
        if (projected.length === 0) {
          return { data: null, error: new Error('No rows returned') };
        }
        return { data: projected[0] as unknown as T, error: null };
      }
      if (this.state.single === 'maybe') {
        return { data: (projected[0] ?? null) as unknown as T, error: null };
      }
      return { data: projected as unknown as T, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/* --------------------- write builders (insert/update/delete) -------------- */

class WriteResult<T> implements PromiseLike<QueryResult<T>> {
  private projection = '*';
  private wantSingle: 'none' | 'one' | 'maybe' = 'none';
  constructor(private readonly run: (projection: string) => Promise<QueryResult<unknown>>) {}

  select(columns = '*'): WriteResult<T> {
    this.projection = columns;
    return this;
  }
  single(): WriteResult<T> {
    this.wantSingle = 'one';
    return this;
  }
  maybeSingle(): WriteResult<T> {
    this.wantSingle = 'maybe';
    return this;
  }

  private async finalize(): Promise<QueryResult<T>> {
    const result = await this.run(this.projection);
    if (result.error) return { data: null, error: result.error };
    const arr = Array.isArray(result.data) ? (result.data as Row[]) : [];
    if (this.wantSingle === 'one') {
      if (arr.length === 0) return { data: null, error: new Error('No rows returned') };
      return { data: arr[0] as unknown as T, error: null };
    }
    if (this.wantSingle === 'maybe') {
      return { data: (arr[0] ?? null) as unknown as T, error: null };
    }
    return { data: result.data as unknown as T, error: null };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.finalize().then(onfulfilled, onrejected);
  }
}

/** A pending update that needs filters applied via .eq(...) before it runs. */
class UpdateBuilder<T> {
  private filters: Filter[] = [];
  constructor(
    private readonly table: string,
    private readonly patch: Record<string, unknown>,
  ) {}

  eq(column: string, value: unknown): UpdateBuilder<T> {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }
  in(column: string, values: unknown[]): UpdateBuilder<T> {
    this.filters.push({ kind: 'in', column, values });
    return this;
  }

  select(columns = '*'): WriteResult<T> {
    return new WriteResult<T>((projection) => this.run(columns || projection));
  }

  private async run(projection: string): Promise<QueryResult<unknown>> {
    return withWriteLock(this.table, async () => {
      try {
        const data = await loadTable(this.table);
        const updated: Row[] = [];
        const nextRows = data.rows.map((row) => {
          if (applyFilters([row], this.filters).length === 0) return row;
          const next: Row = {
            ...row,
            ...this.patch,
            // Immutable identity / lineage: never let a patch overwrite these.
            id: row.id,
            created_at: row.created_at,
            updated_at: nowIso(),
          };
          updated.push(next);
          return next;
        });
        await saveTable(this.table, { rows: nextRows });
        return { data: projectColumns(updated, projection), error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
      }
    });
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run('*').then(
      (r) => ({ data: r.data as T | null, error: r.error }) as QueryResult<T>,
      () => ({ data: null, error: new Error('update failed') }) as QueryResult<T>,
    ).then(onfulfilled, onrejected);
  }
}

/** A pending delete that needs filters applied via .eq(...) before it runs. */
class DeleteBuilder implements PromiseLike<QueryResult<unknown>> {
  private filters: Filter[] = [];
  constructor(private readonly table: string) {}

  eq(column: string, value: unknown): DeleteBuilder {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }
  in(column: string, values: unknown[]): DeleteBuilder {
    this.filters.push({ kind: 'in', column, values });
    return this;
  }

  private async run(): Promise<QueryResult<unknown>> {
    return withWriteLock(this.table, async () => {
      try {
        const data = await loadTable(this.table);
        if (this.filters.length === 0) {
          // Mirror supabase-js behaviour: refuse unfiltered deletes.
          return { data: null, error: new Error('Refusing to delete without filters') };
        }
        const remaining = data.rows.filter(
          (row) => applyFilters([row], this.filters).length === 0,
        );
        await saveTable(this.table, { rows: remaining });
        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
      }
    });
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

/* ----------------------------- table entry point --------------------------- */

class TableQuery {
  constructor(private readonly table: string) {}

  select<T = unknown>(columns = '*'): SelectQuery<T> {
    return new SelectQuery<T>(this.table, columns);
  }

  insert<T = unknown>(values: Record<string, unknown> | Record<string, unknown>[]): WriteResult<T> {
    return new WriteResult<T>((projection) => this.runInsert(values, projection));
  }

  update<T = unknown>(patch: Record<string, unknown>): UpdateBuilder<T> {
    return new UpdateBuilder<T>(this.table, patch);
  }

  delete(): DeleteBuilder {
    return new DeleteBuilder(this.table);
  }

  private async runInsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    projection: string,
  ): Promise<QueryResult<unknown>> {
    return withWriteLock(this.table, async () => {
      try {
        const data = await loadTable(this.table);
        const incoming = Array.isArray(values) ? values : [values];
        const inserted: Row[] = incoming.map((v) => {
          const id = (v.id as string | undefined) ?? genId();
          const created = (v.created_at as string | undefined) ?? nowIso();
          const updated = (v.updated_at as string | undefined) ?? created;
          return { ...v, id, created_at: created, updated_at: updated } as Row;
        });
        await saveTable(this.table, { rows: [...data.rows, ...inserted] });
        return { data: projectColumns(inserted, projection), error: null };
      } catch (e) {
        return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
      }
    });
  }
}

/* ------------------------------- public API -------------------------------- */

export const db = {
  from(table: string): TableQuery {
    return new TableQuery(table);
  },
};
