import { Hono } from "hono";
import { cors } from "hono/cors";
import { openDb } from "./db.js";
import { logger } from "./logger.js";
import { TreeService } from "./treeService.js";

const db = await openDb();

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  // lowdb 是单文件写入，这里串行化写请求，避免并发写脏数据
  const run = chain.then(fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

const app = new Hono();

function withHasChildren(svc: TreeService, node: ReturnType<TreeService["getNode"]>) {
  if (!node) return node;
  return { ...node, has_children: svc.hasDirectActiveChildren(node.id) };
}

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.use("*", async (c, next) => {
  const started = Date.now();
  try {
    await next();
  } finally {
    // 统一请求日志：用于排查慢请求和导入卡住
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: Date.now() - started,
    });
  }
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/roots", async (c) => {
  return exclusive(async () => {
    const svc = new TreeService(db);
    return c.json({ data: svc.listRoots().map((n) => withHasChildren(svc, n)) });
  });
});

app.get("/api/nodes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  const svc = new TreeService(db);
  const node = svc.getActiveNode(id);
  if (!node) return c.json({ error: "not found" }, 404);
  return c.json({ data: withHasChildren(svc, node) });
});

app.get("/api/nodes/:id/children", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  return exclusive(async () => {
    const svc = new TreeService(db);
    if (!svc.getActiveNode(id)) return c.json({ error: "not found" }, 404);
    return c.json({ data: svc.listDirectChildren(id).map((n) => withHasChildren(svc, n)) });
  });
});

app.get("/api/nodes/:id/subtree", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  return exclusive(async () => {
    const svc = new TreeService(db);
    return c.json({ data: svc.listSubtree(id) });
  });
});

app.get("/api/nodes/:id/path-name", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  return exclusive(async () => {
    const svc = new TreeService(db);
    const pathName = svc.getPathName(id);
    if (pathName === undefined) return c.json({ error: "not found" }, 404);
    return c.json({ data: { path_name: pathName } });
  });
});

app.post("/api/nodes", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name required" }, 400);
  }
  const name = body.name.trim();
  const sort_order = typeof body.sort_order === "number" ? body.sort_order : 0;
  const node_type = typeof body.node_type === "string" ? body.node_type : "area";

  return exclusive(async () => {
    const svc = new TreeService(db);
    try {
      const parentId = body.parent_id ?? body.parentId;
      const node =
        parentId === null || parentId === undefined
          ? svc.createRoot({ name, sort_order, node_type })
          : svc.createChild(Number(parentId), { name, sort_order, node_type });
      await db.write();
      return c.json({ data: node }, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg }, 400);
    }
  });
});

app.patch("/api/nodes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name required" }, 400);
  }
  return exclusive(async () => {
    const svc = new TreeService(db);
    try {
      const node = svc.renameNode(id, body.name.trim());
      await db.write();
      return c.json({ data: node });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg }, 400);
    }
  });
});

app.patch("/api/nodes/:id/move", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  const body = await c.req.json().catch(() => null);
  const newParentId = body?.new_parent_id ?? body?.newParentId;
  if (!Number.isFinite(Number(newParentId))) {
    return c.json({ error: "new_parent_id required" }, 400);
  }
  return exclusive(async () => {
    const svc = new TreeService(db);
    try {
      const node = svc.move(id, Number(newParentId));
      await db.write();
      return c.json({ data: node });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg }, 400);
    }
  });
});

app.delete("/api/nodes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);
  return exclusive(async () => {
    const svc = new TreeService(db);
    try {
      const count = svc.softDeleteSubtree(id);
      await db.write();
      return c.json({ data: { deactivated: count } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      return c.json({ error: msg }, 400);
    }
  });
});

/** 递归导入 JSON 树结构 */
app.post("/api/import", async (c) => {
  const started = Date.now();
  const body = await c.req.json().catch(() => null);
  if (!Array.isArray(body) || body.length === 0) {
    logger.warn("import rejected: invalid payload");
    return c.json({ error: "请求体须为非空数组" }, 400);
  }

  type NodeInput = {
    name: string;
    node_type?: string;
    sort_order?: number;
    children?: NodeInput[];
  };

  function importTree(
    svc: TreeService,
    nodes: NodeInput[],
    parentId: number | null,
  ): number {
    // 递归导入：根节点走 createRoot，其余走 createChild
    let count = 0;
    nodes.forEach((n, i) => {
      if (typeof n.name !== "string" || !n.name.trim()) return;
      const created =
        parentId == null
          ? svc.createRoot({ name: n.name.trim(), node_type: n.node_type ?? "area", sort_order: n.sort_order ?? i })
          : svc.createChild(parentId, { name: n.name.trim(), node_type: n.node_type ?? "area", sort_order: n.sort_order ?? i });
      count += 1;
      if (Array.isArray(n.children) && n.children.length > 0) {
        count += importTree(svc, n.children, created.id);
      }
    });
    return count;
  }

  return exclusive(async () => {
    const svc = new TreeService(db);
    try {
      logger.info("import started", { root_count: body.length });
      const total = importTree(svc, body as NodeInput[], null);
      await db.write();
      logger.info("import completed", { imported: total, duration_ms: Date.now() - started });
      return c.json({ data: { imported: total } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "导入失败";
      logger.error("import failed", { error: msg, duration_ms: Date.now() - started });
      return c.json({ error: msg }, 400);
    }
  });
});

/** 文档示例数据：机电产业园 → 监控室 → 内监控室 → 火灾监控 */
app.post("/api/seed", async (c) => {
  return exclusive(async () => {
    const row = db.sqlite.prepare("SELECT COUNT(*) AS cnt FROM area_node").get() as { cnt: number };
    if (row.cnt > 0) {
      return c.json({ error: "already seeded" }, 409);
    }
    const svc = new TreeService(db);
    const root = svc.createRoot({ name: "机电产业园", node_type: "park" });
    const a2 = svc.createChild(root.id, { name: "监控室", node_type: "building" });
    const a3 = svc.createChild(a2.id, { name: "内监控室", node_type: "room" });
    svc.createChild(a3.id, { name: "火灾监控", node_type: "point" });
    svc.createChild(root.id, { name: "停车场", node_type: "area" });
    await db.write();
    return c.json({ data: { ok: true } });
  });
});

const port = Number(process.env.PORT) || 3000;
console.log(`Area tree API listening on http://localhost:${port}`);
logger.info("server started", { port, log_file: logger.filePath() });
Bun.serve({ port, fetch: app.fetch });
