import { JSONFilePreset } from "lowdb/node";
import fs from "node:fs";
import path from "node:path";
import type { DbSchema } from "./types.js";

const defaultData: DbSchema = {
  area_nodes: [],
  area_closures: [],
  meta: { nextId: 1 },
};

const file = path.join(process.cwd(), "data", "db.json");

export async function openDb() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = await JSONFilePreset<DbSchema>(file, defaultData);
  if (!db.data.meta) db.data.meta = { nextId: 1 };
  if (!db.data.area_nodes) db.data.area_nodes = [];
  if (!db.data.area_closures) db.data.area_closures = [];
  await db.write();
  return db;
}

export type AppDb = Awaited<ReturnType<typeof openDb>>;
