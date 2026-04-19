import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

const file = path.join(process.cwd(), "data", "area-tree.sqlite");

type SqlRunResult = {
  changes: number;
  lastInsertRowid: number;
};

type SqlStatement = {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => SqlRunResult;
};

type SqliteCompat = {
  prepare: (sql: string) => SqlStatement;
  exec: (sql: string) => void;
  pragma: (sql: string) => void;
  transaction: <T>(fn: () => T) => () => T;
};

export type AppDb = {
  sqlite: SqliteCompat;
  read: () => Promise<void>;
  write: () => Promise<void>;
};

export async function openDb() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const native = new Database(file, { create: true });
  const sqlite: SqliteCompat = {
    prepare(sql: string) {
      return {
        get: (...params: unknown[]) => native.query(sql).get(...(params as never[])),
        all: (...params: unknown[]) => native.query(sql).all(...(params as never[])),
        run: (...params: unknown[]) => {
          native.run(sql, ...(params as never[]));
          const row = native
            .query("SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid")
            .get() as SqlRunResult;
          return row;
        },
      };
    },
    exec: (sql: string) => native.exec(sql),
    pragma: (sql: string) => native.exec(`PRAGMA ${sql}`),
    transaction: <T>(fn: () => T) => {
      return () => {
        native.exec("BEGIN IMMEDIATE");
        try {
          const result = fn();
          native.exec("COMMIT");
          return result;
        } catch (error) {
          native.exec("ROLLBACK");
          throw error;
        }
      };
    },
  };

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS area_node (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER NULL,
      path TEXT NOT NULL,
      path_name TEXT NOT NULL,
      depth INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      node_type TEXT NOT NULL DEFAULT 'area',
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (parent_id) REFERENCES area_node(id)
    );

    CREATE TABLE IF NOT EXISTS area_closure (
      ancestor_id INTEGER NOT NULL,
      descendant_id INTEGER NOT NULL,
      depth INTEGER NOT NULL,
      PRIMARY KEY (ancestor_id, descendant_id),
      FOREIGN KEY (ancestor_id) REFERENCES area_node(id),
      FOREIGN KEY (descendant_id) REFERENCES area_node(id)
    );

    CREATE INDEX IF NOT EXISTS idx_area_node_parent_active ON area_node(parent_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_area_node_path ON area_node(path);
    CREATE INDEX IF NOT EXISTS idx_area_closure_ancestor ON area_closure(ancestor_id);
    CREATE INDEX IF NOT EXISTS idx_area_closure_descendant ON area_closure(descendant_id);
  `);

  return {
    sqlite,
    // 兼容旧调用方式（lowdb时代有 read/write），sqlite 模式下为 no-op
    read: async () => {},
    write: async () => {},
  } satisfies AppDb;
}
