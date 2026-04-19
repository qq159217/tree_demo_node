import type { DataNode } from "antd/es/tree";
import type { Key } from "react";
import { useCallback, useState } from "react";
import { api, type AreaNode } from "../api";

function toTreeNode(n: AreaNode): DataNode {
  return {
    key: String(n.id),
    title: n.name,
    // has_children === undefined（旧数据）时保守当成可展开
    isLeaf: n.has_children === false,
  };
}

function updateTreeData(list: DataNode[], key: Key, children: DataNode[]): DataNode[] {
  return list.map((node) => {
    if (node.key === key) return { ...node, children };
    if (node.children) return { ...node, children: updateTreeData(node.children, key, children) };
    return node;
  });
}

function patchNode(list: DataNode[], key: Key, patch: Partial<DataNode>): DataNode[] {
  return list.map((node) => {
    if (node.key === key) return { ...node, ...patch };
    if (node.children) return { ...node, children: patchNode(node.children, key, patch) };
    return node;
  });
}

export function useAreaTree() {
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("");

  // 受控展开 key 和已加载 key
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [loadedKeys, setLoadedKeys] = useState<Key[]>([]);

  const refreshRoots = useCallback(async () => {
    setLoading(true);
    try {
      const roots = await api.roots();
      setTreeData(roots.map(toTreeNode));
      // 清空已加载缓存 → Tree 会对所有 expandedKeys 重新触发 loadData
      setLoadedKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectNode = useCallback(async (id: number | null) => {
    setSelectedId(id);
    if (id == null) {
      setSelectedPath("");
      return;
    }
    try {
      const path = await api.pathName(id);
      setSelectedPath(path);
    } catch {
      setSelectedPath("");
    }
  }, []);

  const afterMutation = useCallback(async () => {
    // 任何写操作后统一刷新根节点，并尽量保持原选中节点
    await refreshRoots();
    if (selectedId != null) {
      try {
        await api.node(selectedId);
        await selectNode(selectedId);
      } catch {
        setSelectedId(null);
        setSelectedPath("");
      }
    }
  }, [refreshRoots, selectNode, selectedId]);

  /**
   * loadData 回调：
   * - loadedKeys 受控后，Ant Design Tree 不会对已加载节点重复调用此函数。
   * - 此处不再判断 children 缓存（由 loadedKeys 代管）。
   */
  const onLoadData = useCallback(async (treeNode: DataNode) => {
    if (treeNode.isLeaf) return;

    const id = Number(treeNode.key);
    // 懒加载直接子节点，避免一次性拉全树
    const kids = await api.children(id);
    if (kids.length === 0) {
      setTreeData((prev) => patchNode(prev, treeNode.key, { isLeaf: true }));
      return;
    }
    const nodes = kids.map((k) => toTreeNode(k));
    setTreeData((prev) => updateTreeData(prev, treeNode.key, nodes));
  }, []);

  const createChild = useCallback(
    async (parentId: number, name: string) => {
      await api.create({ parent_id: parentId, name });
      await afterMutation();
    },
    [afterMutation],
  );

  const createRoot = useCallback(
    async (name: string) => {
      await api.create({ parent_id: null, name });
      await afterMutation();
    },
    [afterMutation],
  );

  const renameNode = useCallback(
    async (id: number, name: string) => {
      await api.rename(id, name);
      await afterMutation();
    },
    [afterMutation],
  );

  const moveNode = useCallback(
    async (id: number, newParentId: number) => {
      await api.move(id, newParentId);
      await afterMutation();
    },
    [afterMutation],
  );

  const softDelete = useCallback(
    async (id: number) => {
      await api.softDelete(id);
      await afterMutation();
    },
    [afterMutation],
  );

  const seed = useCallback(async () => {
    await api.seed();
    await refreshRoots();
  }, [refreshRoots]);

  /**
   * 返回树形数据管理器
   * @returns {
   *  treeData: 树形数据列表
   *  loading: 加载状态
   *  selectedId: 选中节点ID
   *  selectedPath: 选中节点路径
   *  expandedKeys: 展开的节点key列表
   *  loadedKeys: 已加载的节点key列表
   *  setExpandedKeys: 设置展开的节点key列表
   *  setLoadedKeys: 设置已加载的节点key列表
   */
  return {
    treeData,
    loading,
    selectedId,
    selectedPath,
    expandedKeys,
    loadedKeys,
    setExpandedKeys,
    setLoadedKeys,
    refreshRoots,
    selectNode,
    onLoadData,
    createChild,
    createRoot,
    renameNode,
    moveNode,
    softDelete,
    seed,
  };
}
