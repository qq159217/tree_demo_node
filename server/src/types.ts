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
};

export type AreaClosure = {
  ancestor_id: number;
  descendant_id: number;
  depth: number;
};

export type DbSchema = {
  area_nodes: AreaNode[];
  area_closures: AreaClosure[];
  meta: { nextId: number };
};
