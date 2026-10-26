# Memex

本地优先的任务清单、富文本笔记与 AI 周报桌面应用。内置只读 MCP server，让 AI 客户端可以读取你的任务；笔记访问需在应用设置中显式开启，周报生成也只会发送你明确勾选的内容。

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

Windows 安装包输出到 `release/Memex-Setup-1.2.2.exe`。

## 自动更新

应用内「设置 → 软件更新」可以检查 GitHub Releases 上的新版本，并一键下载、校验、静默安装和重启。

更新器使用两种校验来源：

- Release 中的 `latest.yml`（sha512）
- GitHub Release 资产自带的 `digest`（sha256）

两者至少存在一个，否则会阻止自动安装。

默认仓库：`xiao-dudu/memex`。可通过 `MEMEX_UPDATE_OWNER` / `MEMEX_UPDATE_REPO` 覆盖。

版本发现通过 `/releases/latest` 重定向完成，不调用 GitHub API，因此不受 60 次/小时限流影响。更新下载使用 Electron 的 `net.fetch`（Chromium 网络栈），因此会遵循 Windows 系统代理 / PAC 设置与 VPN 路由。下载支持断点续传，连接中断后会自动重试并从中断处继续。

## 发版流程

发版由 GitHub Actions 完成：推一个 `v*` tag，CI 就会跑测试、构建、打包，并把安装包和 `latest.yml` 上传到对应的 GitHub Release。本地不需要打包。

### 1. 确认工作区干净

```bash
git status
```

有未提交改动先提交，否则 tag 会指向旧提交。

### 2. 跑一遍本地验证

```bash
pnpm typecheck
pnpm test
```

CI 会再跑一次，但本地失败能省一轮等待。

### 3. 升版本号

四个 `package.json` 和 MCP server 的版本号必须保持一致：

```text
package.json
packages/app/package.json
packages/shared/package.json
packages/mcp/package.json
packages/mcp/src/server.ts   → new Server({ name: 'memex', version: '...' })
```

用 `pnpm version` 时注意它是单包工具，不要用它批量改 workspace 版本，直接改文件更可控。

### 4. 提交版本号

```bash
git commit -am "chore(release): v1.1.15"
```

### 5. 推送代码

```bash
git push github master
```

### 6. 打 tag 并推送

```bash
git tag -a v1.1.15 -m "Memex v1.1.15"
git push github v1.1.15
```

tag 必须是 `v` 开头，`release.yml` 的触发条件是 `v*`。

### 7. 等 CI 完成

在 https://github.com/xiao-dudu/memex/actions 查看 `Release` workflow，约 3 分钟。

成功后 Release 里会有三个资产：

```text
latest.yml
Memex-Setup-<version>.exe
Memex-Setup-<version>.exe.blockmap
```

### 8. 验证

```bash
# 最新 tag 是否为刚发的版本
curl.exe -sI -L https://github.com/xiao-dudu/memex/releases/latest | findstr /I location
```

客户端打开「设置 → 软件更新 → 检查更新」应显示新版本。

### 重跑失败的构建

CI 失败时先进失败的 run 看是哪一步：

| 失败步骤 | 常见原因 |
| --- | --- |
| `Typecheck and test` | 代码或测试有问题，本地跑 `pnpm typecheck && pnpm test` 复现 |
| `Package Windows installer` | 打包配置或依赖问题，本地跑 `pnpm --filter @memex/app exec electron-builder --win nsis --publish never` |
| `Publish release assets` | 资产文件名与 workflow 的 glob 不匹配 |

`electron-builder` 不要在 CI 里自己发布（会缺 token），必须是 `--publish never`，由 `softprops/action-gh-release` 负责上传。

重跑前要先删掉失败的 tag，否则同一个 tag 不会再次触发 workflow：

```bash
git tag -d v1.1.15
git push github :refs/tags/v1.1.15
git tag -a v1.1.15 -m "Memex v1.1.15"
git push github v1.1.15
```

### 只重跑、不改代码

可以在 Actions 页面选 `Release` → `Run workflow`，填入已存在的 tag。注意这种方式不会重新创建 tag，只会基于该 tag 重新构建并上传资产。

### 推送失败时的排查

如果 `git push` 报 `Connection closed by <ip> port 22`，通常是 VPN 拦截了 SSH 的 22 端口。改用 GitHub 的 443 端口：

```bash
git remote set-url github ssh://git@ssh.github.com:443/xiao-dudu/memex.git
```

当前仓库的 `github` remote 已经配成这个地址，一般不需要再改。

### 关于版本号

- `latest.yml` 里的 `version` 来自 `packages/app/package.json`，客户端靠它判断是否有新版本
- 安装包文件名来自 `artifactName`，当前是 `Memex-Setup-${version}.${ext}`
- 两者必须和 tag 语义一致，但客户端比较的是 `version`，不是 tag 名

### 什么时候不能覆盖 tag

已经发布给用户的 tag 不要重打。tag 变了但版本号没变，客户端会认为没有更新；版本号变了但 tag 没变，`latest.yml` 的下载地址会指向下一个版本，导致 404。发现发错就发一个新版本号。

## 功能

- 任务：三态、优先级、截止时间、标签、智能视图、回收站
- 笔记：TipTap 富文本、自动保存、标签、置顶、回收站
- 周报：结构化模板、任务筛选、关联笔记、历史快照、Markdown/PDF 导出
- 统一搜索：`Ctrl+K`，中文全文搜索
- 快速捕获：`Ctrl+Shift+Space`，默认任务，`Ctrl+2` 切笔记
- 本地数据：自动保存、每日备份（保留 7 份）、JSON 导出
- MCP：读取任务/笔记，设置开启后可新建任务与笔记
- 自动更新：GitHub Releases，检查、下载、校验、安装一步完成

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
- 写入默认全关：开启「允许 AI 修改任务」后暴露 `create_task` / `update_task`；切换到「任务 + 笔记」并开启「允许 AI 新建笔记」后暴露 `create_note`。

| 工具 | 类型 | 需要的开关 |
| --- | --- | --- |
| `list_tasks` / `search_tasks` / `get_task` | 读 | 无 |
| `create_task` / `update_task` | 写 | 允许 AI 修改任务 |
| `list_notes` / `search_notes` / `get_note` | 读 | 任务 + 笔记 |
| `create_note` | 写 | 任务 + 笔记 + 允许 AI 新建笔记 |

`create_note` 的 `content` 按 Markdown 解析（`#` 标题、`-` 列表、`- [ ]` 待办、`>` 引用、``` 代码块、`**粗体**` / `*斜体*` / `` `代码` ``），转成与编辑器同构的文档；不传 `title` 时取正文第一行。

## 快捷键

| 快捷键 | 行为 |
| --- | --- |
| `Ctrl+K` | 统一搜索 |
| `Ctrl+N` | 新建任务 / 笔记 / 周报 |
| `Ctrl+Shift+N` | 新建笔记 |
| `Ctrl+Shift+Space` | 打开快速捕获 |
| `Ctrl+2` | 快速捕获中切换任务 / 笔记 |
| `Enter` / `Ctrl+Enter` / `Esc` | 保存关闭 / 保存继续 / 关闭 |

## 数据与隐私

数据默认只保存在本机 SQLite。应用只在检查/下载更新，或用户主动生成周报时访问网络。

- MCP 开启笔记访问后，笔记全文会进入 AI 客户端上下文，等同于发送给对应模型服务商。
- 周报生成只会发送用户勾选的任务，以及明确开启的关联笔记；发送前会显示服务地址和数量。
- API Key 由 Electron `safeStorage` 加密保存，只在主进程解密使用，不会进入渲染进程、日志或 JSON 导出。

## 仓库结构

```text
packages/
  app/      Electron main / preload / renderer
  mcp/      stdio MCP server
  shared/   SQL schema、迁移、仓储、校验、IPC 契约
e2e/        Playwright Electron 测试
```
