import type { AppDb } from "./db.js";
import type { AreaClosure, AreaNode } from "./types.js";

function withTrailingSlash(p: string): string {
  const s = p.replace(/\/{2,}/g, "/");
  return s.endsWith("/") ? s : `${s}/`;
}

function nextId(db: AppDb): number {
  const id = db.data.meta.nextId;
  db.data.meta.nextId += 1;
  return id;
}

function nodeById(db: AppDb, id: number): AreaNode | undefined {
  return db.data.area_nodes.find((n) => n.id === id);
}

function activeNode(db: AppDb, id: number): AreaNode | undefined {
  const n = nodeById(db, id);
  return n && n.is_active === 1 ? n : undefined;
}

function subtreeIds(db: AppDb, rootId: number): Set<number> {
  // 闭包表里 ancestor_id = rootId 的所有 descendant_id 就是整棵子树
  const ids = new Set<number>();
  for (const c of db.data.area_closures) {
    if (c.ancestor_id === rootId) ids.add(c.descendant_id);
  }
  return ids;
}

function removeClosureRow(db: AppDb, a: number, d: number) {
  const arr = db.data.area_closures;
  const idx = arr.findIndex((c) => c.ancestor_id === a && c.descendant_id === d);
  if (idx >= 0) arr.splice(idx, 1);
}

function addClosureRow(db: AppDb, row: AreaClosure) {
  // lowdb 没有唯一索引，手动保证 (ancestor_id, descendant_id) 唯一
  const exists = db.data.area_closures.some(
    (c) => c.ancestor_id === row.ancestor_id && c.descendant_id === row.descendant_id,
  );
  if (!exists) db.data.area_closures.push(row);
}

export class TreeService {
  constructor(private readonly db: AppDb) {}

  hasDirectActiveChildren(nodeId: number): boolean {
    return this.db.data.area_nodes.some((n) => n.parent_id === nodeId && n.is_active === 1);
  }

  listRoots(): AreaNode[] {
    return this.db.data.area_nodes
      .filter((n) => n.parent_id === null && n.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  getNode(id: number): AreaNode | undefined {
    return nodeById(this.db, id);
  }

  getActiveNode(id: number): AreaNode | undefined {
    return activeNode(this.db, id);
  }

  getPathName(id: number): string | undefined {
    return activeNode(this.db, id)?.path_name;
  }

  listDirectChildren(parentId: number): AreaNode[] {
    return this.db.data.area_nodes
      .filter((n) => n.parent_id === parentId && n.is_active === 1)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  /** 子树：含自身，闭包 JOIN */
  listSubtree(nodeId: number): AreaNode[] {
    const root = activeNode(this.db, nodeId);
    if (!root) return [];
    const desc = new Set<number>();
    for (const c of this.db.data.area_closures) {
      if (c.ancestor_id === nodeId) desc.add(c.descendant_id);
    }
    return this.db.data.area_nodes
      .filter((n) => desc.has(n.id) && n.is_active === 1)
      .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path) || a.sort_order - b.sort_order || a.id - b.id);
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
    const id = nextId(this.db);
    const path = withTrailingSlash(`/${id}`);
    const node: AreaNode = {
      id,
      name: input.name,
      parent_id: null,
      path,
      path_name: input.name,
      depth: 0,
      sort_order: input.sort_order ?? 0,
      node_type: input.node_type ?? "area",
      is_active: 1,
    };
    this.db.data.area_nodes.push(node);
    addClosureRow(this.db, { ancestor_id: id, descendant_id: id, depth: 0 });
    return node;
  }

  createChild(
    parentId: number,
    input: { name: string; sort_order?: number; node_type?: string },
  ): AreaNode {
    const parent = activeNode(this.db, parentId);
    if (!parent) throw new Error(`parent_id=${parentId} 不存在或未激活`);

    const id = nextId(this.db);
    const parentPath = withTrailingSlash(parent.path);
    const path = withTrailingSlash(`${parentPath}${id}`);
    const path_name = `${parent.path_name}/${input.name}`;

    const node: AreaNode = {
      id,
      name: input.name,
      parent_id: parentId,
      path,
      path_name,
      depth: parent.depth + 1,
      sort_order: input.sort_order ?? 0,
      node_type: input.node_type ?? "area",
      is_active: 1,
    };
    this.db.data.area_nodes.push(node);

    // 父节点的每个祖先都要与新节点建立闭包关系（深度 +1）
    for (const c of this.db.data.area_closures) {
      if (c.descendant_id === parentId) {
        addClosureRow(this.db, {
          ancestor_id: c.ancestor_id,
          descendant_id: id,
          depth: c.depth + 1,
        });
      }
    }
    addClosureRow(this.db, { ancestor_id: id, descendant_id: id, depth: 0 });
    return node;
  }

  /** 软删除节点及其子树 */
  softDeleteSubtree(nodeId: number): number {
    const root = nodeById(this.db, nodeId);
    if (!root) throw new Error(`node_id=${nodeId} 不存在`);
    const ids = subtreeIds(this.db, nodeId);
    let n = 0;
    for (const id of ids) {
      const node = nodeById(this.db, id);
      if (node && node.is_active === 1) {
        node.is_active = 0;
        n += 1;
      }
    }
    return n;
  }

  renameNode(nodeId: number, newName: string): AreaNode {
    const node = activeNode(this.db, nodeId);
    if (!node) throw new Error(`node_id=${nodeId} 不存在或未激活`);

    const parent = node.parent_id != null ? activeNode(this.db, node.parent_id) : null;
    const oldPrefix = node.path_name;
    node.name = newName;
    node.path_name = parent ? `${parent.path_name}/${newName}` : newName;

    const oldPrefixSlash = `${oldPrefix}/`;
    const newPrefixSlash = `${node.path_name}/`;

    // 通过 path_name 前缀批量更新整棵子树，避免逐层递归拼路径
    for (const n of this.db.data.area_nodes) {
      if (n.id === nodeId || n.is_active !== 1) continue;
      if (n.path_name === oldPrefix) {
        n.path_name = node.path_name;
      } else if (n.path_name.startsWith(oldPrefixSlash)) {
        n.path_name = newPrefixSlash + n.path_name.slice(oldPrefixSlash.length);
      }
    }
    return node;
  }

  move(nodeId: number, newParentId: number): AreaNode {
    const node = activeNode(this.db, nodeId);
    if (!node) throw new Error(`node_id=${nodeId} 不存在或未激活`);
    if (nodeId === newParentId) throw new Error("不能将节点移动到自身下");

    const newParent = activeNode(this.db, newParentId);
    if (!newParent) throw new Error(`new_parent_id=${newParentId} 不存在或未激活`);

    const sub = subtreeIds(this.db, nodeId);
    if (sub.has(newParentId)) throw new Error("不能将节点移动到其子树内");

    for (const id of sub) {
      const nn = nodeById(this.db, id);
      if (!nn || nn.is_active !== 1) {
        throw new Error("子树含未激活节点，禁止移动");
      }
    }

    // 1) 断开子树与旧祖先的闭包边（子树内部关系保留）
    for (const c of [...this.db.data.area_closures]) {
      if (sub.has(c.descendant_id) && !sub.has(c.ancestor_id)) {
        removeClosureRow(this.db, c.ancestor_id, c.descendant_id);
      }
    }

    // 2) 接到新父下：新祖先集合 × 子树集合，重建新闭包边
    const supers = this.db.data.area_closures.filter((c) => c.descendant_id === newParentId);
    const subs = this.db.data.area_closures.filter((c) => c.ancestor_id === nodeId);
    for (const sup of supers) {
      for (const s of subs) {
        addClosureRow(this.db, {
          ancestor_id: sup.ancestor_id,
          descendant_id: s.descendant_id,
          depth: sup.depth + s.depth + 1,
        });
      }
    }

    // 3) 同步物化路径字段，保证 path/path_name/depth 与闭包关系一致
    const oldRootPath = withTrailingSlash(node.path);
    const oldPathName = node.path_name;
    const oldRootDepth = node.depth;

    const newParentPath = withTrailingSlash(newParent.path);
    const newRootPath = withTrailingSlash(`${newParentPath}${node.id}`);
    const newPathNamePrefix = `${newParent.path_name}/${node.name}`;
    const newRootDepth = newParent.depth + 1;

    const subtreeNodes = this.db.data.area_nodes.filter((n) => sub.has(n.id));
    subtreeNodes.sort((a, b) => b.path.length - a.path.length);

    for (const n of subtreeNodes) {
      const oldDepth = n.depth;
      const np = withTrailingSlash(n.path);
      if (!np.startsWith(oldRootPath)) continue;
      const suffix = np.length > oldRootPath.length ? np.slice(oldRootPath.length) : "";
      const base = newRootPath.replace(/\/$/, "");
      n.path = withTrailingSlash(suffix ? `${base}/${suffix}` : `${base}/`);

      if (n.id === nodeId) {
        n.path_name = newPathNamePrefix;
        n.parent_id = newParentId;
      } else {
        const prefix = `${oldPathName}/`;
        if (n.path_name.startsWith(prefix)) {
          n.path_name = `${newPathNamePrefix}/${n.path_name.slice(prefix.length)}`;
        } else if (n.path_name === oldPathName) {
          n.path_name = newPathNamePrefix;
        }
      }
      n.depth = newRootDepth + (oldDepth - oldRootDepth);
    }

    return node;
  }
}
