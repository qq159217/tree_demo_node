import {
  ApartmentOutlined,
  BranchesOutlined,
  FieldTimeOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  InputNumber,
  Space,
  Spin,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { forwardRef, useImperativeHandle, useState } from "react";
import type { AreaNode } from "../api";
import { api } from "../api";

const { Text } = Typography;

export type QueryPanelHandle = { setNodeId: (id: number) => void };

const NODE_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  park:     { color: "blue",   label: "园区" },
  building: { color: "cyan",   label: "楼栋" },
  room:     { color: "green",  label: "房间" },
  point:    { color: "orange", label: "点位" },
  area:     { color: "purple", label: "区域" },
};

const columns: ColumnsType<AreaNode> = [
  {
    title: "ID",
    dataIndex: "id",
    width: 60,
    render: (v: number) => <Tag color="blue" style={{ margin: 0 }}>{v}</Tag>,
  },
  { title: "名称", dataIndex: "name", width: 140, ellipsis: true },
  {
    title: "类型",
    dataIndex: "node_type",
    width: 80,
    render: (v: string) => {
      const cfg = NODE_TYPE_CONFIG[v] ?? { color: "default", label: v };
      return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>;
    },
  },
  {
    title: "深度",
    dataIndex: "depth",
    width: 70,
    render: (v: number) => <Tag style={{ margin: 0 }}>{v} 层</Tag>,
  },
  {
    title: "父节点 ID",
    dataIndex: "parent_id",
    width: 90,
    render: (v: number | null) =>
      v != null ? <Tag color="geekblue" style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">根节点</Text>,
  },
  {
    title: "完整路径",
    dataIndex: "path_name",
    ellipsis: true,
    render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
  },
];

type QueryResult =
  | { mode: "children" | "subtree"; rows: AreaNode[] }
  | { mode: "path"; pathName: string }
  | null;

type QueryState = { loading: boolean; error: string | null; result: QueryResult };

const initial: QueryState = { loading: false, error: null, result: null };

export const QueryPanel = forwardRef<QueryPanelHandle>(function QueryPanel(_props, ref) {
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [childrenState, setChildrenState] = useState<QueryState>(initial);
  const [subtreeState,  setSubtreeState]  = useState<QueryState>(initial);
  const [pathState,     setPathState]     = useState<QueryState>(initial);
  const [activeTab, setActiveTab] = useState("children");

  useImperativeHandle(ref, () => ({
    setNodeId(id: number) {
      setNodeId(id);
      setChildrenState(initial);
      setSubtreeState(initial);
      setPathState(initial);
    },
  }));

  const query = async (mode: "children" | "subtree" | "path") => {
    if (nodeId == null) return;
    const set =
      mode === "children" ? setChildrenState :
      mode === "subtree"  ? setSubtreeState  : setPathState;

    set({ loading: true, error: null, result: null });
    setActiveTab(mode);
    try {
      if (mode === "children") {
        const rows = await api.children(nodeId);
        set({ loading: false, error: null, result: { mode: "children", rows } });
      } else if (mode === "subtree") {
        const rows = await api.subtree(nodeId);
        set({ loading: false, error: null, result: { mode: "subtree", rows } });
      } else {
        const pathName = await api.pathName(nodeId);
        set({ loading: false, error: null, result: { mode: "path", pathName } });
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "查询失败", result: null });
    }
  };

  const tabBadge = (s: QueryState, color: string) =>
    s.result && s.result.mode !== "path" ? (
      <Badge count={(s.result as { rows: AreaNode[] }).rows.length} color={color} showZero overflowCount={9999} style={{ marginLeft: 4 }} />
    ) : null;

  const hint = (
    <Text type="secondary" style={{ fontSize: 12 }}>
      ↑ 点击左侧树节点自动填入 ID
    </Text>
  );

  const renderTable = (s: QueryState) => (
    <Spin spinning={s.loading}>
      {s.error && <Text type="danger">{s.error}</Text>}
      {!s.loading && !s.error && !s.result && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先点击上方按钮执行查询" style={{ margin: "32px 0" }} />
      )}
      {s.result && s.result.mode !== "path" && (
        s.result.rows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无激活子节点" style={{ margin: "32px 0" }} />
        ) : (
          <Table<AreaNode>
            dataSource={s.result.rows}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 8, size: "small", hideOnSinglePage: true }}
            scroll={{ x: 640 }}
            style={{ marginTop: 4 }}
          />
        )
      )}
    </Spin>
  );

  const renderPath = (s: QueryState) => (
    <Spin spinning={s.loading}>
      {s.error && <Text type="danger">{s.error}</Text>}
      {!s.loading && !s.error && !s.result && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先点击上方按钮执行查询" style={{ margin: "32px 0" }} />
      )}
      {s.result && s.result.mode === "path" && (
        <div
          style={{
            background: "linear-gradient(135deg,#f0f4ff,#eef0ff)",
            border: "1px solid #dce3ff",
            borderRadius: 10,
            padding: "18px 20px",
            marginTop: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10 }}>
            完整路径（O(1) 直读 path_name 字段）
          </Text>
          <Flex align="center" gap={6} wrap="wrap">
            {s.result.pathName.split("/").map((seg, i, arr) => (
              <Flex key={i} align="center" gap={6}>
                <Tag
                  color={i === arr.length - 1 ? "processing" : "default"}
                  style={{
                    fontSize: 13,
                    padding: "3px 10px",
                    borderRadius: 14,
                    fontWeight: i === arr.length - 1 ? 600 : 400,
                    margin: 0,
                  }}
                >
                  {seg}
                </Tag>
                {i < arr.length - 1 && (
                  <Text type="secondary" style={{ fontSize: 16, lineHeight: 1, userSelect: "none" }}>
                    \
                  </Text>
                )}
              </Flex>
            ))}
          </Flex>
        </div>
      )}
    </Spin>
  );

  return (
    <Card
      style={{
        marginTop: 20,
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(79,110,247,.08)",
      }}
      styles={{ body: { padding: 0 } }}
      title={
        <Flex align="center" gap={10}>
          <SearchOutlined style={{ color: "#4f6ef7" }} />
          <span>区域查询</span>
          <Text type="secondary" style={{ fontWeight: "normal", fontSize: 12 }}>
            — 无递归高效查询演示
          </Text>
        </Flex>
      }
    >
      {/* 查询控制区 */}
      <div
        style={{
          padding: "16px 20px 0",
          background: "linear-gradient(180deg,#fafbff 0%,#ffffff 100%)",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Flex align="center" gap={16} wrap="wrap" style={{ paddingBottom: 14 }}>
          <Space align="center">
            <Text style={{ whiteSpace: "nowrap" }}>节点 ID</Text>
            <InputNumber
              min={1}
              value={nodeId}
              onChange={(v: number | null) => {
                setNodeId(v);
                setChildrenState(initial);
                setSubtreeState(initial);
                setPathState(initial);
              }}
              placeholder="输入或点击树节点"
              style={{ width: 160, borderRadius: 8 }}
            />
            {nodeId != null && (
              <Tag color="processing" style={{ borderRadius: 10 }}>
                当前节点 #{nodeId}
              </Tag>
            )}
            {!nodeId && hint}
          </Space>

          <Flex gap={8} wrap="wrap">
            <Tooltip title="按 parent_id 索引，无需递归">
              <Button
                icon={<BranchesOutlined />}
                type={activeTab === "children" ? "primary" : "default"}
                disabled={nodeId == null}
                loading={childrenState.loading}
                onClick={() => query("children")}
                style={{ borderRadius: 8 }}
              >
                直接子节点
              </Button>
            </Tooltip>
            <Tooltip title="闭包表一次 JOIN，无论深度均不递归">
              <Button
                icon={<ApartmentOutlined />}
                type={activeTab === "subtree" ? "primary" : "default"}
                disabled={nodeId == null}
                loading={subtreeState.loading}
                onClick={() => query("subtree")}
                style={{ borderRadius: 8 }}
              >
                完整子树
              </Button>
            </Tooltip>
            <Tooltip title="直读 path_name 字段，O(1)">
              <Button
                icon={<FieldTimeOutlined />}
                type={activeTab === "path" ? "primary" : "default"}
                disabled={nodeId == null}
                loading={pathState.loading}
                onClick={() => query("path")}
                style={{ borderRadius: 8 }}
              >
                完整路径
              </Button>
            </Tooltip>
          </Flex>
        </Flex>

        {/* 标签栏 */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          style={{ marginBottom: -1 }}
          items={[
            {
              key: "children",
              label: (
                <span>
                  直接子节点
                  {tabBadge(childrenState, "#1677ff")}
                </span>
              ),
            },
            {
              key: "subtree",
              label: (
                <span>
                  完整子树
                  {tabBadge(subtreeState, "#52c41a")}
                </span>
              ),
            },
            {
              key: "path",
              label: "完整路径",
            },
          ]}
        />
      </div>

      {/* 结果区 */}
      <div style={{ padding: "16px 20px 20px" }}>
        {activeTab === "children" && renderTable(childrenState)}
        {activeTab === "subtree"  && renderTable(subtreeState)}
        {activeTab === "path"     && renderPath(pathState)}
      </div>
    </Card>
  );
});
