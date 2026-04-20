import fs from "node:fs";
import path from "node:path";

type NodeType = "park" | "building" | "room" | "area" | "point";
type TreeNodeInput = {
  name: string;
  node_type: NodeType;
  sort_order?: number;
  children?: TreeNodeInput[];
};

type Config = {
  roots: number;
  depth: number;
  childrenPerLevel: number;
  maxNodes: number;
  output: string;
  /** 第一个根节点的显示名称（depth=1, sort_order=0） */
  rootName: string | undefined;
  compactJson: boolean;
};

function toInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseArgs(argv: string[]): Config {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      map.set(key, value);
      i += 1;
    } else {
      map.set(key, "true");
    }
  }

  return {
    roots: toInt(map.get("roots"), 3),
    depth: toInt(map.get("depth"), 4),
    childrenPerLevel: toInt(map.get("children"), 4),
    maxNodes: toInt(map.get("max"), 3000),
    output: map.get("output") ?? "mock-tree-data.json",
    rootName: map.get("root-name") ?? map.get("rootName"),
    compactJson: map.get("compact") === "true",
  };
}

function typeForDepth(currentDepth: number, maxDepth: number): NodeType {
  if (currentDepth === 1) return "park";
  if (currentDepth === maxDepth) return "point";
  if (currentDepth === 2) return "building";
  if (currentDepth === 3) return "room";
  return "area";
}

function nameFor(type: NodeType, index: number, depth: number): string {
  const prefix =
    type === "park"
      ? "产业园"
      : type === "building"
        ? "楼栋"
        : type === "room"
          ? "房间"
          : type === "area"
            ? "区域"
            : "点位";
  return `${prefix}-${depth}-${index}`;
}

function buildTree(config: Config): { roots: TreeNodeInput[]; total: number } {
  let serial = 0;
  let total = 0;

  function createNode(depth: number, siblingOrder: number): TreeNodeInput | null {
    if (total >= config.maxNodes) return null;
    serial += 1;
    total += 1;

    const type = typeForDepth(depth, config.depth);
    const rootLabel =
      depth === 1 && config.rootName && siblingOrder === 0
        ? config.rootName
        : nameFor(type, serial, depth);
    const node: TreeNodeInput = {
      name: rootLabel,
      node_type: type,
      sort_order: siblingOrder,
    };

    if (depth < config.depth) {
      const children: TreeNodeInput[] = [];
      for (let i = 0; i < config.childrenPerLevel; i += 1) {
        const child = createNode(depth + 1, i);
        if (!child) break;
        children.push(child);
      }
      if (children.length > 0) node.children = children;
    }
    return node;
  }

  const roots: TreeNodeInput[] = [];
  for (let i = 0; i < config.roots; i += 1) {
    const root = createNode(1, i);
    if (!root) break;
    roots.push(root);
  }
  return { roots, total };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const { roots, total } = buildTree(config);

  const outPath = path.isAbsolute(config.output)
    ? config.output
    : path.join(process.cwd(), config.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = config.compactJson
    ? `${JSON.stringify(roots)}\n`
    : `${JSON.stringify(roots, null, 2)}\n`;
  fs.writeFileSync(outPath, body, "utf-8");

  console.log("mock tree json generated");
  console.log(`output: ${outPath}`);
  console.log(`roots: ${config.roots}, depth: ${config.depth}, children: ${config.childrenPerLevel}`);
  console.log(`max: ${config.maxNodes}, actual_nodes: ${total}`);
}

main();
