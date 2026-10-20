# Memex

本地优先的任务清单与富文本笔记桌面应用。内置只读 MCP server，让 AI 客户端可以读取你的任务；笔记访问需在应用设置中显式开启。

## 技术栈

- Electron 39 + React 19 + TypeScript + electron-vite
- Tailwind CSS 4 + shadcn/ui 风格组件 + motion
- TipTap 3（ProseMirror JSON + 纯文本投影）
- Node 22 内置 `node:sqlite`（WAL、FTS5 trigram）
- `@modelcontextprotocol/sdk` + stdio
- pnpm workspace + Vitest + Playwright

## 快速开始

```bash
pnpm install
pnpm dev
```

要求 Node 22.12+、pnpm 10+。

## 构建与测试

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @memex/app dist
```

Windows 安装包输出到 `release/Memex Setup 1.0.0.exe`。

## 功能

- 任务：三态、优先级、截止时间、标签、智能视图、回收站
- 笔记：TipTap 富文本、自动保存、标签、置顶、回收站
- 统一搜索：`Ctrl+K`，中文全文搜索
- 快速捕获：`Ctrl+Shift+Space`，默认任务，`Ctrl+2` 切笔记
- 本地数据：自动保存、每日备份（保留 7 份）、JSON 导出
- MCP：只读任务工具；设置开启后可只读笔记全文

## MCP 配置

打开「设置 → AI 访问权限 → 复制 MCP 配置」，粘贴到 Claude Desktop / Codex 等客户端的 MCP 配置即可。

生成的结构：

```json
{
  "mcpServers": {
    "memex": {
      "command": "C:\\path\\to\\Memex.exe",
      "args": ["C:\\path\\to\\resources\\mcp\\index.mjs"],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1",
        "MEMEX_DB_PATH": "C:\\Users\\<user>\\AppData\\Roaming\\Memex\\memex.db"
      }
    }
  }
}
```

- `ELECTRON_RUN_AS_NODE=1`：用 Electron 内置 Node 运行 MCP，确保与 app 使用同一套 SQLite 运行时。
- `MEMEX_DB_PATH`：由主进程生成，保证 MCP 读取同一份数据库。
- MCP 默认只暴露任务；在设置中切换到「任务 + 笔记」后，下一次 `tools/list` / `tools/call` 立即生效，无需重启 AI 客户端。
- MCP 没有任何写入工具。

## 快捷键

| 快捷键 | 行为 |
| --- | --- |
| `Ctrl+K` | 统一搜索 |
| `Ctrl+N` | 新建任务 / 笔记 |
| `Ctrl+Shift+N` | 新建笔记 |
| `Ctrl+Shift+Space` | 打开快速捕获 |
| `Ctrl+2` | 快速捕获中切换任务 / 笔记 |
| `Enter` / `Ctrl+Enter` / `Esc` | 保存关闭 / 保存继续 / 关闭 |

## 数据与隐私

数据只保存在本机 SQLite，应用本身不发起网络请求。开启笔记访问后，笔记全文会进入 AI 客户端上下文，等同于发送给对应模型服务商。

## 仓库结构

```text
packages/
  app/      Electron main / preload / renderer
  mcp/      stdio MCP server
  shared/   SQL schema、迁移、仓储、校验、IPC 契约
e2e/        Playwright Electron 测试
```
