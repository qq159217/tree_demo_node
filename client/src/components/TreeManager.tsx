import {
  ApartmentOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScissorOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { Key } from "react";
import type React from "react";
import {
  Alert,
  App,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Steps,
  Tag,
  Tooltip,
  Tree,
  Typography,
  Upload,
} from "antd";
import type { DataNode, EventDataNode } from "antd/es/tree";
import { useEffect, useRef, useState } from "react";
import type { AreaNode, TreeNodeInput } from "../api";
import { api } from "../api";
import { useAreaTree } from "../hooks/useAreaTree";
import { QueryPanel, type QueryPanelHandle } from "./QueryPanel";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const NODE_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  park:     { color: "blue",    label: "园区" },
  building: { color: "cyan",    label: "楼栋" },
  room:     { color: "green",   label: "房间" },
  point:    { color: "orange",  label: "点位" },
  area:     { color: "purple",  label: "区域" },
};

function NodeTypeTag({ type }: { type: string }) {
  const cfg = NODE_TYPE_CONFIG[type] ?? { color: "default", label: type };
  return <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>;
}

export function TreeManager() {
  const { message } = App.useApp();
  const tree = useAreaTree();
  const [detail, setDetail] = useState<AreaNode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [addOpen, setAddOpen]         = useState(false);
  const [addRootOpen, setAddRootOpen]   = useState(false);
  const [renameOpen, setRenameOpen]   = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [moveOpen, setMoveOpen]       = useState(false);
  const [importOpen, setImportOpen]   = useState(false);
  const [pending, setPending]         = useState(false);

  // 导入状态
  const [importFile, setImportFile]   = useState<File | null>(null);
  const [importParsed, setImportParsed] = useState<TreeNodeInput[] | null>(null);
  const [importParseErr, setImportParseErr] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const queryPanelRef = useRef<QueryPanelHandle | null>(null);

  /* antd v5 FormInstance strict-mode workaround: access methods via cast */
  type F = { resetFields(): void; validateFields(): Promise<Record<string, unknown>>; setFieldsValue(v: Record<string, unknown>): void };
  const [_addChildForm] = Form.useForm();
  const addChildForm = _addChildForm as unknown as F;
  const [_addRootForm] = Form.useForm();
  const addRootForm  = _addRootForm  as unknown as F;
  const [_renameForm] = Form.useForm();
  const renameForm   = _renameForm   as unknown as F;
  const [_moveForm] = Form.useForm();
  const moveForm     = _moveForm     as unknown as F;

  useEffect(() => { void tree.refreshRoots(); }, [tree.refreshRoots]);

  useEffect(() => {
    if (tree.selectedId == null) { setDetail(null); return; }
    setDetailLoading(true);
    api.node(tree.selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [tree.selectedId]);

  const onSelect = async (_: Key[], info: { node: EventDataNode<DataNode> }) => {
    const id = Number(info.node.key);
    await tree.selectNode(id);
    queryPanelRef.current?.setNodeId(id);
  };

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
      message.success("操作成功");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setPending(false);
    }
  };

  const crumbs = detail?.path_name?.split("/") ?? [];

  /* ───────────────────────── render ───────────────────────── */
  return (
    <Layout style={{ minHeight: "100vh", background: "#f0f2f8" }}>
      {/* ── 顶栏 ── */}
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          background: "linear-gradient(90deg,#1a1f3c 0%,#2d3561 100%)",
          boxShadow: "0 2px 12px rgba(0,0,0,.35)",
        }}
      >
        <Flex align="center" gap={12}>
          <ApartmentOutlined style={{ fontSize: 22, color: "#7eb0ff" }} />
          <Title level={4} style={{ margin: 0, color: "#fff", fontWeight: 600 }}>
            区域树管理系统
          </Title>
          <Tag
            style={{
              marginLeft: 4,
              background: "rgba(78,110,247,.25)",
              color: "#7eb0ff",
              border: "1px solid rgba(78,110,247,.4)",
              borderRadius: 10,
              fontSize: 11,
            }}
          >
            闭包表 + 物化路径
          </Tag>
        </Flex>

        <Space>
          <Button
            icon={<CloudUploadOutlined />}
            onClick={() => {
              setImportFile(null);
              setImportParsed(null);
              setImportParseErr(null);
              setImportResult(null);
              setImportOpen(true);
            }}
            disabled={pending}
            style={{ borderRadius: 8 }}
          >
            导入数据
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddRootOpen(true)}
            disabled={pending}
            style={{ borderRadius: 8 }}
          >
            新建根区域
          </Button>
          <Tooltip title="刷新树">
            <Button
              icon={<ReloadOutlined spin={tree.loading} />}
              onClick={() => void tree.refreshRoots()}
              loading={tree.loading}
              style={{ borderRadius: 8 }}
            />
          </Tooltip>
        </Space>
      </Header>

      <Content style={{ padding: "24px 32px" }}>
        <Row gutter={20}>
          {/* ── 左栏：树 ── */}
          <Col xs={24} md={9} lg={8}>
            <Card
              title={
                <Flex align="center" gap={8}>
                  <ApartmentOutlined style={{ color: "#4f6ef7" }} />
                  <span>区域结构</span>
                  <Badge count={tree.treeData.length} color="#4f6ef7" showZero />
                </Flex>
              }
              style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(79,110,247,.08)", minHeight: 480 }}
              styles={{ body: { padding: "12px 16px" } }}
            >
              <Spin spinning={tree.loading}>
                {tree.treeData.length === 0 && !tree.loading ? (
                  <Empty
                    description="暂无数据，请导入示例或新建根节点"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ marginTop: 40 }}
                  />
                ) : (
                  <Tree
                    showLine={{ showLeafIcon: false }}
                    blockNode
                    loadData={tree.onLoadData}
                    treeData={tree.treeData}
                    selectedKeys={tree.selectedId != null ? [String(tree.selectedId)] : []}
                    onSelect={onSelect}
                    expandedKeys={tree.expandedKeys}
                    onExpand={(keys: Key[]) => tree.setExpandedKeys(keys)}
                    loadedKeys={tree.loadedKeys}
                    onLoad={(keys: Key[]) => tree.setLoadedKeys(keys)}
                    style={{ fontSize: 14 }}
                  />
                )}
              </Spin>
            </Card>
          </Col>

          {/* ── 右栏：详情 + 操作 ── */}
          <Col xs={24} md={15} lg={16}>
            <Card
              title={
                <Flex align="center" gap={8}>
                  <SearchOutlined style={{ color: "#4f6ef7" }} />
                  <span>节点详情</span>
                </Flex>
              }
              style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(79,110,247,.08)", minHeight: 480 }}
              styles={{ body: { padding: 20 } }}
            >
              <Spin spinning={detailLoading}>
                {!tree.selectedId && (
                  <Flex vertical align="center" justify="center" style={{ minHeight: 360 }}>
                    <ApartmentOutlined style={{ fontSize: 48, color: "#c8d0e8", marginBottom: 12 }} />
                    <Text type="secondary">点击左侧树节点查看详情</Text>
                  </Flex>
                )}

                {tree.selectedId != null && detail && (
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    {/* 面包屑路径 */}
                    <div
                      style={{
                        background: "linear-gradient(135deg,#f0f4ff,#eef0ff)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        border: "1px solid #dce3ff",
                      }}
                    >
                      <Breadcrumb
                        items={crumbs.map((seg, i) => ({
                          title: (
                            <span
                              style={{
                                fontWeight: i === crumbs.length - 1 ? 600 : 400,
                                color: i === crumbs.length - 1 ? "#4f6ef7" : undefined,
                              }}
                            >
                              {seg}
                            </span>
                          ),
                        }))}
                      />
                    </div>

                    {/* 属性卡 */}
                    <Row gutter={[12, 12]}>
                      {[
                        { label: "节点 ID", value: <Tag color="blue">{detail.id}</Tag> },
                        { label: "名称",    value: <Text strong>{detail.name}</Text> },
                        { label: "类型",    value: <NodeTypeTag type={detail.node_type} /> },
                        { label: "深度",    value: <Tag>{detail.depth} 层</Tag> },
                        { label: "父节点",  value: detail.parent_id != null ? <Tag>{detail.parent_id}</Tag> : <Text type="secondary">根节点</Text> },
                        { label: "物化路径", value: <Text code style={{ fontSize: 12 }}>{detail.path}</Text> },
                      ].map(({ label, value }) => (
                        <Col xs={24} sm={12} key={label}>
                          <div
                            style={{
                              background: "#fafbff",
                              border: "1px solid #eaedff",
                              borderRadius: 8,
                              padding: "8px 12px",
                            }}
                          >
                            <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                              {label}
                            </Text>
                            {value}
                          </div>
                        </Col>
                      ))}
                    </Row>

                    <Divider style={{ margin: "4px 0" }} />

                    {/* 操作按钮组 */}
                    <Flex gap={8} wrap="wrap">
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setAddOpen(true)}
                        disabled={pending}
                        style={{ borderRadius: 8 }}
                      >
                        新增子节点
                      </Button>
                      <Button
                        icon={<EditOutlined />}
                        onClick={() => {
                          renameForm.setFieldsValue({ name: detail.name });
                          setRenameInput(detail.name);
                          setRenameOpen(true);
                        }}
                        disabled={pending}
                        style={{ borderRadius: 8 }}
                      >
                        重命名
                      </Button>
                      <Button
                        icon={<ScissorOutlined />}
                        onClick={() => setMoveOpen(true)}
                        disabled={pending}
                        style={{ borderRadius: 8 }}
                      >
                        移动
                      </Button>
                      <Popconfirm
                        title="确认软删除？"
                        description={
                          <span>
                            将把该节点及其<Text type="danger">整棵子树</Text>标记为不激活，<br />
                            数据保留可追溯，可联系管理员恢复。
                          </span>
                        }
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true, loading: pending }}
                        onConfirm={() =>
                          run(async () => {
                            await tree.softDelete(tree.selectedId!);
                          })
                        }
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          disabled={pending}
                          style={{ borderRadius: 8 }}
                        >
                          软删除子树
                        </Button>
                      </Popconfirm>
                    </Flex>
                  </Space>
                )}
              </Spin>
            </Card>
          </Col>
        </Row>

        {/* ── 查询面板 ── */}
        <QueryPanel ref={queryPanelRef} />
      </Content>

      {/* ─────────── Modals ─────────── */}
      <Modal
        title={
          <Flex align="center" gap={8}>
            <PlusOutlined style={{ color: "#4f6ef7" }} />
            <span>新增子节点</span>
          </Flex>
        }
        open={addOpen}
        onCancel={() => { setAddOpen(false); addChildForm.resetFields(); }}
        okText="确认新增"
        okButtonProps={{ loading: pending }}
        onOk={async () => {
          const v = await addChildForm.validateFields() as { name: string };
          if (tree.selectedId == null) return;
          const sid = tree.selectedId;
          await run(async () => {
            await tree.createChild(sid, v.name);
            setAddOpen(false);
            addChildForm.resetFields();
          });
        }}
      >
        <Form form={_addChildForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="请输入名称" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Flex align="center" gap={8}>
            <PlusOutlined style={{ color: "#4f6ef7" }} />
            <span>新建根区域</span>
          </Flex>
        }
        open={addRootOpen}
        onCancel={() => { setAddRootOpen(false); addRootForm.resetFields(); }}
        okText="确认新建"
        okButtonProps={{ loading: pending }}
        onOk={async () => {
          const v = await addRootForm.validateFields() as { name: string };
          await run(async () => {
            await tree.createRoot(v.name);
            setAddRootOpen(false);
            addRootForm.resetFields();
          });
        }}
      >
        <Form form={_addRootForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="name" label="区域名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：机电产业园" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Flex align="center" gap={8}>
            <EditOutlined style={{ color: "#4f6ef7" }} />
            <span>重命名节点</span>
          </Flex>
        }
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        okText="确认重命名"
        okButtonProps={{ loading: pending }}
        onOk={async () => {
          const v = await renameForm.validateFields() as { name: string };
          if (tree.selectedId == null) return;
          const sid = tree.selectedId;
          await run(async () => {
            await tree.renameNode(sid, v.name);
            setRenameOpen(false);
          });
        }}
      >
        <Form form={_renameForm} layout="vertical" style={{ marginTop: 12 }}>
          {/* 当前路径只读展示 */}
          {detail && (
            <div
              style={{
                background: "#f5f5f5",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 16,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                当前完整路径
              </Text>
              <Text code style={{ fontSize: 12, wordBreak: "break-all" }}>
                {detail.path_name}
              </Text>
            </div>
          )}

          <Form.Item name="name" label="新名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameInput(e.target.value)} />
          </Form.Item>

          {/* 修改后路径预览 */}
          {detail && renameInput.trim() && renameInput.trim() !== detail.name && (
            <div
              style={{
                background: "linear-gradient(135deg,#f0f4ff,#eef0ff)",
                border: "1px solid #dce3ff",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                修改后路径预览（含所有后代同步更新）
              </Text>
              {(() => {
                const segs = detail.path_name.split("/");
                const newSegs = [...segs.slice(0, -1), renameInput.trim()];
                const oldSeg = segs[segs.length - 1];
                return (
                  <Flex align="center" gap={4} wrap="wrap">
                    {newSegs.map((seg, i) => (
                      <Flex key={i} align="center" gap={4}>
                        <Tag
                          color={
                            i === newSegs.length - 1
                              ? seg !== oldSeg ? "error" : "processing"
                              : "default"
                          }
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontWeight: i === newSegs.length - 1 ? 600 : 400,
                            margin: 0,
                          }}
                        >
                          {seg}
                        </Tag>
                        {i < newSegs.length - 1 && (
                          <Text type="secondary" style={{ fontSize: 14, userSelect: "none" }}>/</Text>
                        )}
                      </Flex>
                    ))}
                  </Flex>
                );
              })()}
              <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: "block" }}>
                ⚠ 该节点的所有后代 path_name 将同步级联更新
              </Text>
            </div>
          )}
        </Form>
      </Modal>

      <Modal
        title={
          <Flex align="center" gap={8}>
            <ScissorOutlined style={{ color: "#4f6ef7" }} />
            <span>移动节点</span>
          </Flex>
        }
        open={moveOpen}
        onCancel={() => { setMoveOpen(false); moveForm.resetFields(); }}
        okText="确认移动"
        okButtonProps={{ loading: pending }}
        onOk={async () => {
          const v = await moveForm.validateFields() as { new_parent_id: number };
          if (tree.selectedId == null) return;
          const sid = tree.selectedId;
          await run(async () => {
            await tree.moveNode(sid, v.new_parent_id);
            setMoveOpen(false);
            moveForm.resetFields();
          });
        }}
      >
        <Form form={_moveForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="new_parent_id"
            label="目标父节点 ID"
            rules={[{ required: true, message: "请输入目标父节点 ID" }]}
            extra="不能移动到自身或其子树；子树须全部处于激活状态"
          >
            <InputNumber min={1} style={{ width: "100%" }} placeholder="输入节点 ID" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 导入数据 Modal ── */}
      <Modal
        title={
          <Flex align="center" gap={8}>
            <CloudUploadOutlined style={{ color: "#4f6ef7" }} />
            <span>导入树型数据</span>
          </Flex>
        }
        open={importOpen}
        width={580}
        onCancel={() => setImportOpen(false)}
        footer={
          importResult ? (
            <Button type="primary" onClick={() => setImportOpen(false)} style={{ borderRadius: 8 }}>
              完成
            </Button>
          ) : (
            <Space>
              <Button onClick={() => setImportOpen(false)} style={{ borderRadius: 8 }}>取消</Button>
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                loading={importLoading}
                disabled={!importParsed || !!importParseErr}
                style={{ borderRadius: 8 }}
                onClick={async () => {
                  if (!importParsed) return;
                  setImportLoading(true);
                  try {
                    const res = await api.importTree(importParsed);
                    setImportResult(res);
                    await tree.refreshRoots();
                    message.success(`成功导入 ${res.imported} 个节点`);
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : "导入失败");
                  } finally {
                    setImportLoading(false);
                  }
                }}
              >
                确认导入
              </Button>
            </Space>
          )
        }
      >
        <div style={{ marginTop: 8 }}>
          {!importResult && (
            <Steps
              size="small"
              current={importParsed ? 1 : 0}
              style={{ marginBottom: 20 }}
              items={[
                { title: "选择 JSON 文件" },
                { title: "预览校验" },
                { title: "确认导入" },
              ]}
            />
          )}

          {/* 成功结果 */}
          {importResult && (
            <Alert
              type="success"
              showIcon
              message={`导入成功！共创建 ${importResult.imported} 个节点`}
              description="树已自动刷新，可在左侧区域树中查看。"
              style={{ borderRadius: 8 }}
            />
          )}

          {/* 文件上传区 */}
          {!importResult && (
            <>
              <Upload.Dragger
                accept=".json"
                maxCount={1}
                showUploadList={importFile ? { showRemoveIcon: true } : false}
                beforeUpload={(file) => {
                  setImportFile(file);
                  setImportParseErr(null);
                  setImportParsed(null);
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    try {
                      const data = JSON.parse(e.target?.result as string) as unknown;
                      if (!Array.isArray(data) || data.length === 0) {
                        setImportParseErr("JSON 根节点须为非空数组，请参考下方模板格式");
                        return;
                      }
                      setImportParsed(data as TreeNodeInput[]);
                    } catch {
                      setImportParseErr("JSON 解析失败，请检查文件格式");
                    }
                  };
                  reader.readAsText(file);
                  return false;
                }}
                onRemove={() => {
                  setImportFile(null);
                  setImportParsed(null);
                  setImportParseErr(null);
                }}
                style={{ borderRadius: 10 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: "#4f6ef7", fontSize: 36 }} />
                </p>
                <p style={{ fontSize: 15, fontWeight: 500 }}>点击或拖拽 JSON 文件到此区域</p>
                <p style={{ color: "#999", fontSize: 13 }}>仅支持 .json 格式，根节点为数组</p>
              </Upload.Dragger>

              {importParseErr && (
                <Alert
                  type="error"
                  showIcon
                  message={importParseErr}
                  style={{ marginTop: 12, borderRadius: 8 }}
                />
              )}

              {importParsed && !importParseErr && (
                <Alert
                  type="success"
                  showIcon
                  message={`解析成功，根节点 ${importParsed.length} 个，点击「确认导入」写入数据库`}
                  style={{ marginTop: 12, borderRadius: 8 }}
                />
              )}

              {/* 模板说明 */}
              <Divider style={{ margin: "14px 0 10px" }}>
                <Flex align="center" gap={4}>
                  <FileTextOutlined />
                  <Text type="secondary" style={{ fontSize: 12 }}>JSON 格式说明</Text>
                </Flex>
              </Divider>
              <div
                style={{
                  background: "#f6f8ff",
                  border: "1px solid #e0e6ff",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  lineHeight: 1.7,
                  color: "#3c4a7a",
                }}
              >
                {`[
  {
    "name": "机电产业园",
    "node_type": "park",
    "children": [
      {
        "name": "监控室",
        "node_type": "building",
        "children": [
          { "name": "内监控室", "node_type": "room" }
        ]
      },
      { "name": "停车场", "node_type": "area" }
    ]
  }
]`}
              </div>
              <Flex justify="space-between" align="center" style={{ marginTop: 10 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  node_type 可选：park / building / room / point / area
                </Text>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  style={{ borderRadius: 6 }}
                  onClick={() => {
                    const template = JSON.stringify([
                      {
                        name: "机电产业园",
                        node_type: "park",
                        children: [
                          {
                            name: "监控室",
                            node_type: "building",
                            children: [
                              {
                                name: "内监控室",
                                node_type: "room",
                                children: [{ name: "火灾监控", node_type: "point" }],
                              },
                            ],
                          },
                          { name: "停车场", node_type: "area" },
                        ],
                      },
                    ], null, 2);
                    const blob = new Blob([template], { type: "application/json" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "area-tree-template.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  下载模板
                </Button>
              </Flex>
            </>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
