export type AreaNode = {
  id: number;
  name: string;
  parent_id: number | null;
  path: string;
  path_name: string;
  depth: number;
  sort_order: number;
  node_type: string;
  is_active: 0 | 1;
  has_children?: boolean;
};

const base = () => import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { data?: T; error?: string };
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data as T;
}

export const api = {
  async roots(): Promise<AreaNode[]> {
    const res = await fetch(`${base()}/api/roots`);
    return parse<AreaNode[]>(res);
  },
  async node(id: number): Promise<AreaNode> {
    const res = await fetch(`${base()}/api/nodes/${id}`);
    return parse<AreaNode>(res);
  },
  async children(id: number): Promise<AreaNode[]> {
    const res = await fetch(`${base()}/api/nodes/${id}/children`);
    return parse<AreaNode[]>(res);
  },
  async subtree(id: number): Promise<AreaNode[]> {
    const res = await fetch(`${base()}/api/nodes/${id}/subtree`);
    return parse<AreaNode[]>(res);
  },
  async pathName(id: number): Promise<string> {
    const res = await fetch(`${base()}/api/nodes/${id}/path-name`);
    const data = await parse<{ path_name: string }>(res);
    return data.path_name;
  },
  async create(input: {
    parent_id?: number | null;
    name: string;
    sort_order?: number;
    node_type?: string;
  }): Promise<AreaNode> {
    const res = await fetch(`${base()}/api/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return parse<AreaNode>(res);
  },
  async rename(id: number, name: string): Promise<AreaNode> {
    const res = await fetch(`${base()}/api/nodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return parse<AreaNode>(res);
  },
  async move(id: number, new_parent_id: number): Promise<AreaNode> {
    const res = await fetch(`${base()}/api/nodes/${id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_parent_id }),
    });
    return parse<AreaNode>(res);
  },
  async softDelete(id: number): Promise<{ deactivated: number }> {
    const res = await fetch(`${base()}/api/nodes/${id}`, { method: "DELETE" });
    return parse<{ deactivated: number }>(res);
  },
  async seed(): Promise<void> {
    const res = await fetch(`${base()}/api/seed`, { method: "POST" });
    await parse<{ ok: boolean }>(res);
  },
  async importTree(nodes: TreeNodeInput[]): Promise<{ imported: number }> {
    const res = await fetch(`${base()}/api/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nodes),
    });
    return parse<{ imported: number }>(res);
  },
};

export type TreeNodeInput = {
  name: string;
  node_type?: string;
  sort_order?: number;
  children?: TreeNodeInput[];
};
