import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DbType = NeonHttpDatabase<typeof schema>;

let _db: DbType | null = null;

function getDb(): DbType {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL が設定されていません");
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export const db: DbType = new Proxy({} as DbType, {
  get(_target, prop: string | symbol) {
    return (getDb() as any)[prop];
  },
});

export * from "./schema";
