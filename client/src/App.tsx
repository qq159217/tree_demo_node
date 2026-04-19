import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { TreeManager } from "./components/TreeManager";

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#4f6ef7",
          colorBgContainer: "#ffffff",
          borderRadius: 8,
          fontFamily:
            "'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif",
        },
        components: {
          Layout: { headerBg: "#1a1f3c", siderBg: "#1a1f3c" },
          Menu: { darkItemBg: "#1a1f3c", darkSubMenuItemBg: "#141829" },
          Card: { headerBg: "#fafbff" },
        },
      }}
    >
      <AntApp>
        <TreeManager />
      </AntApp>
    </ConfigProvider>
  );
}
