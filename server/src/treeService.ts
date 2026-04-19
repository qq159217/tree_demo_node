import type { AppDb } from "./db.js";
import type { AreaNode } from "./types.js";

function withTrailingSlash(p: string): string {
  const s = p.replace(/\/{2,}/g, "/");
  return s.endsWith("/") ? s : `${s}/`;
}

export class TreeService {
  constructor(private readonly db: AppDb) {}

  private get sqlite() {
    return this.db.sqlite;
  }

  private nodeById(id: number): AreaNode | undefined {
    return this.sqlite.prepare("SELECT * FROM area_node WHERE id = ?").get(id) as AreaNode | undefined;
  }

  private activeNode(id: number): AreaNode | undefined {
    return this.sqlite
      .prepare("SELECT * FROM area_node WHERE id = ? AND is_active = 1")
      .get(id) as AreaNode | undefined;
  }

  hasDirectActiveChildren(nodeId: number): boolean {
    const row = this.sqlite
      .prepare("SELECT 1 FROM area_node WHERE parent_id = ? AND is_active = 1 LIMIT 1")
      .get(nodeId);
    return Boolean(row);
  }

  listRoots(): AreaNode[] {
    return this.sqlite
      .prepare(
        "SELECT * FROM area_node WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order, id",
      )
      .all() as AreaNode[];
  }

  getNode(id: number): AreaNode | undefined {
    return this.nodeById(id);
  }

  getActiveNode(id: number): AreaNode | undefined {
    return this.activeNode(id);
  }

  getPathName(id: number): string | undefined {
    const row = this.sqlite
      .prepare("SELECT path_name FROM area_node WHERE id = ? AND is_active = 1")
      .get(id) as { path_name: string } | undefined;
    return row?.path_name;
  }

  listDirectChildren(parentId: number): AreaNode[] {
    return this.sqlite
      .prepare(
        "SELECT * FROM area_node WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order, id",
      )
      .all(parentId) as AreaNode[];
  }

  /** 子树：含自身，闭包 JOIN */
  listSubtree(nodeId: number): AreaNode[] {
    const root = this.activeNode(nodeId);
    if (!root) return [];
    return this.sqlite
      .prepare(
        `
        SELECT n.*
        FROM area_node n
        JOIN area_closure c ON c.descendant_id = n.id
        WHERE c.ancestor_id = ? AND n.is_active = 1
        ORDER BY n.depth, n.path, n.sort_order, n.id
        `,
      )
      .all(nodeId) as AreaNode[];
  }

  /** 仅后代，不含自身 */
  listDescendants(nodeId: number): AreaNode[] {
    return this.listSubtree(nodeId).filter((n) => n.id !== nodeId);
  }

  createRoot(input: {
    name: string;
    sort_order?: number;
    node_type?: string;
  }): AreaNode {
    const tx = this.sqlite.transaction(() => {
      const insert = this.sqlite.prepare(
        `
          INSERT INTO area_node
          (name, parent_id, path, path_name, depth, sort_order, node_type, is_active)
          VALUES (?, NULL, '', '', 0, ?, ?, 1)
        `,
      );
      const info = insert.run(input.name, input.sort_order ?? 0, input.node_type ?? "area");
      const id = Number(info.lastInsertRowid);
      const path = withTrailingSlash(`/${id}`);
      this.sqlite
        .prepare("UPDATE area_node SET path = ?, path_name = ? WHERE id = ?")
        .run(path, input.name, id);
      this.sqlite
        .prepare("INSERT OR IGNORE INTO area_closure(ancestor_id, descendant_id, depth) VALUES (?, ?, 0)")
        .run(id, id);
      return this.getNode(id)!;
    });
    return tx();
  }

  createChild(
    parentId: number,
    input: { name: string; sort_order?: number; node_type?: string },
  ): AreaNode {
    const parent = this.activeNode(parentId);
    if (!parent) throw new Error(`parent_id=${parentId} 不存在或未激活`);
    const tx = this.sqlite.transaction(() => {
      const info = this.sqlite
        .prepare(
          `
            INSERT INTO area_node
            (name, parent_id, path, path_name, depth, sort_order, node_type, is_active)
            VALUES (?, ?, '', '', ?, ?, ?, 1)
          `,
        )
        .run(
          input.name,
          parentId,
          parent.depth + 1,
          input.sort_order ?? 0,
          input.node_type ?? "area",
        );
      const id = Number(info.lastInsertRowid);
      const path = withTrailingSlash(`${withTrailingSlash(parent.path)}${id}`);
      const pathName = `${parent.path_name}/${input.name}`;
      this.sqlite
        .prepare("UPDATE area_node SET path = ?, path_name = ? WHERE id = ?")
        .run(path, pathName, id);

      // 父节点祖先集合 + 新节点自身，建立闭包关系
      this.sqlite
        .prepare(
          `
          INSERT OR IGNORE INTO area_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, ?, depth + 1
          FROM area_closure
          WHERE descendant_id = ?
          `,
        )
        .run(id, parentId);
      this.sqlite
        .prepare("INSERT OR IGNORE INTO area_closure(ancestor_id, descendant_id, depth) VALUES (?, ?, 0)")
        .run(id, id);
      return this.getNode(id)!;
    });
    return tx();
  }

  /** 软删除节点及其子树 */
  softDeleteSubtree(nodeId: number): number {
    const root = this.nodeById(nodeId);
    if (!root) throw new Error(`node_id=${nodeId} 不存在`);
    const info = this.sqlite
      .prepare(
        `
        UPDATE area_node
        SET is_active = 0
        WHERE is_active = 1
          AND id IN (
            SELECT descendant_id
            FROM area_closure
            WHERE ancestor_id = ?
          )
        `,
      )
      .run(nodeId);
    return info.changes;
  }

  renameNode(nodeId: number, newName: string): AreaNode {
    const node = this.activeNode(nodeId);
    if (!node) throw new Error(`node_id=${nodeId} 不存在或未激活`);
    const parent = node.parent_id != null ? this.activeNode(node.parent_id) : null;
    const oldPrefix = node.path_name;
    const newPrefix = parent ? `${parent.path_name}/${newName}` : newName;

    const tx = this.sqlite.transaction(() => {
      this.sqlite
        .prepare("UPDATE area_node SET name = ?, path_name = ? WHERE id = ?")
        .run(newName, newPrefix, nodeId);
      this.sqlite
        .prepare(
          `
          UPDATE area_node
          SET path_name = ? || substr(path_name, ?)
          WHERE is_active = 1
            AND id != ?
            AND path_name LIKE ?
          `,
        )
        .run(newPrefix, oldPrefix.length + 1, nodeId, `${oldPrefix}/%`);
      return this.getNode(nodeId)!;
    });
    return tx();
  }

  move(nodeId: number, newParentId: number): AreaNode {
    const node = this.activeNode(nodeId);
    if (!node) throw new Error(`node_id=${nodeId} 不存在或未激活`);
    if (nodeId === newParentId) throw new Error("不能将节点移动到自身下");

    const newParent = this.activeNode(newParentId);
    if (!newParent) throw new Error(`new_parent_id=${newParentId} 不存在或未激活`);

    const subIds = this.sqlite
      .prepare("SELECT descendant_id FROM area_closure WHERE ancestor_id = ?")
      .all(nodeId) as Array<{ descendant_id: number }>;
    const subSet = new Set(subIds.map((x) => x.descendant_id));
    if (subSet.has(newParentId)) throw new Error("不能将节点移动到其子树内");

    const activeCount = this.sqlite
      .prepare(
        `
        SELECT COUNT(*) AS cnt
        FROM area_node
        WHERE id IN (SELECT descendant_id FROM area_closure WHERE ancestor_id = ?)
          AND is_active = 1
        `,
      )
      .get(nodeId) as { cnt: number };
    if (activeCount.cnt !== subSet.size) throw new Error("子树含未激活节点，禁止移动");

    const tx = this.sqlite.transaction(() => {
      // 1) 删除旧祖先到子树的闭包边（保留子树内部关系）
      this.sqlite
        .prepare(
          `
          DELETE FROM area_closure
          WHERE descendant_id IN (SELECT descendant_id FROM area_closure WHERE ancestor_id = ?)
            AND ancestor_id NOT IN (SELECT descendant_id FROM area_closure WHERE ancestor_id = ?)
          `,
        )
        .run(nodeId, nodeId);

      // 2) 以新父为锚点重建闭包边：新祖先集合 × 子树集合
      this.sqlite
        .prepare(
          `
          INSERT OR IGNORE INTO area_closure(ancestor_id, descendant_id, depth)
          SELECT super.ancestor_id, sub.descendant_id, super.depth + sub.depth + 1
          FROM area_closure AS super
          CROSS JOIN area_closure AS sub
          WHERE super.descendant_id = ?
            AND sub.ancestor_id = ?
          `,
        )
        .run(newParentId, nodeId);

      // 3) path / path_name / depth / parent_id 同步更新
      const oldRootPath = withTrailingSlash(node.path);
      const oldPathName = node.path_name;
      const oldRootDepth = node.depth;
      const newRootPath = withTrailingSlash(`${withTrailingSlash(newParent.path)}${node.id}`);
      const newPrefixName = `${newParent.path_name}/${node.name}`;
      const newRootDepth = newParent.depth + 1;

      const subtreeNodes = this.sqlite
        .prepare(
          `
          SELECT * FROM area_node
          WHERE id IN (SELECT descendant_id FROM area_closure WHERE ancestor_id = ?)
          ORDER BY LENGTH(path) DESC
          `,
        )
        .all(nodeId) as AreaNode[];

      const update = this.sqlite.prepare(
        `
        UPDATE area_node
        SET parent_id = ?, path = ?, path_name = ?, depth = ?
        WHERE id = ?
        `,
      );
      for (const n of subtreeNodes) {
        const oldDepth = n.depth;
        const np = withTrailingSlash(n.path);
        if (!np.startsWith(oldRootPath)) continue;
        const suffix = np.length > oldRootPath.length ? np.slice(oldRootPath.length) : "";
        const base = newRootPath.replace(/\/$/, "");
        const nextPath = withTrailingSlash(suffix ? `${base}/${suffix}` : `${base}/`);
        const nextPathName =
          n.id === nodeId
            ? newPrefixName
            : n.path_name.startsWith(`${oldPathName}/`)
              ? `${newPrefixName}/${n.path_name.slice(oldPathName.length + 1)}`
              : newPrefixName;
        const nextParent = n.id === nodeId ? newParentId : n.parent_id;
        const nextDepth = newRootDepth + (oldDepth - oldRootDepth);
        update.run(nextParent, nextPath, nextPathName, nextDepth, n.id);
      }
      return this.getNode(nodeId)!;
    });
    return tx();
  }
}
