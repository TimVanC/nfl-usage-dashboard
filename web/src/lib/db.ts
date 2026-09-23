import { neon } from "@neondatabase/serverless";

/**
 * Neon serverless SQL client. Postgres `numeric` (1700) and `int8` (20) arrive
 * as strings over HTTP; we use fullResults to see field types and coerce those
 * columns to JS numbers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const NUMERIC_OIDS = new Set([1700, 20]);

function coerce(result: { rows: Row[]; fields: { name: string; dataTypeID: number }[] }): Row[] {
  const numCols = result.fields.filter((f) => NUMERIC_OIDS.has(f.dataTypeID)).map((f) => f.name);
  if (numCols.length === 0) return result.rows;
  for (const r of result.rows) {
    for (const c of numCols) {
      const v = r[c];
      if (typeof v === "string") r[c] = Number(v);
    }
  }
  return result.rows;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const raw = neon(url, { fullResults: true });
  const tagged = (strings: TemplateStringsArray, ...values: unknown[]) =>
    raw(strings, ...values).then((res) => coerce(res as unknown as { rows: Row[]; fields: { name: string; dataTypeID: number }[] }));
  tagged.query = (text: string, params: unknown[] = []) =>
    raw.query(text, params).then((res) => coerce(res as unknown as { rows: Row[]; fields: { name: string; dataTypeID: number }[] }));
  return tagged;
}

let _client: ReturnType<typeof makeClient> | null = null;

export function sql() {
  if (!_client) _client = makeClient();
  return _client;
}
