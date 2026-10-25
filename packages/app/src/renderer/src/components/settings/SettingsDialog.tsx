import { useEffect, useState } from 'react';
import {
  Check,
  Clipboard,
  Database,
  Download,
  ExternalLink,
  HardDrive,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppInfo, McpAccessMode, ThemeMode, UpdateState } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { AiServiceSettings } from './AiServiceSettings';

type SectionId = 'appearance' | 'desktop' | 'ai-service' | 'ai-access' | 'data' | 'update' | 'about';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  description: string;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '通用',
    items: [
      { id: 'appearance', label: '外观', icon: Sun, description: '选择 Memex 的明暗主题。' },
      { id: 'desktop', label: '桌面行为', icon: Monitor, description: '决定窗口和快速记录的行为。' },
    ],
  },
  {
    group: 'AI',
    items: [
      { id: 'ai-service', label: 'AI 服务', icon: Sparkles, description: '配置周报生成使用的 OpenAI 兼容服务。' },
      { id: 'ai-access', label: 'AI 访问权限', icon: ShieldCheck, description: '控制 MCP 客户端能读取哪些本地内容，以及能否修改任务。' },
    ],
  },
  {
    group: '系统',
    items: [
      { id: 'data', label: '数据', icon: Database, description: '数据始终保存在本机，不上传。' },
      { id: 'update', label: '软件更新', icon: Download, description: '从 GitHub Releases 检查新版本，下载完成后自动重启安装。' },
      { id: 'about', label: '关于', icon: Info, description: '本地优先的备忘录与任务清单。' },
    ],
  },
];

const SECTION_BY_ID = Object.fromEntries(NAV.flatMap((group) => group.items).map((item) => [item.id, item])) as Record<
  SectionId,
  NavItem
>;

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, updateSettings } = useAppStore();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionResult, setActionResult] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [activeId, setActiveId] = useState<SectionId>('appearance');

  useEffect(() => {
    if (!settingsOpen) return;
    setActiveId('appearance');
    void window.memex.app.info().then(setInfo);
    void window.memex.update.getState().then(setUpdateState);
    return window.memex.update.onState(setUpdateState);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, setSettingsOpen]);

  if (!settings) return null;

  const active = SECTION_BY_ID[activeId];

  const checkForUpdates = async () => {
    try {
      setUpdateState(await window.memex.update.check());
    } catch (error) {
      setUpdateState({
        phase: 'error',
        currentVersion: info?.version ?? '',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const installUpdate = async () => {
    try {
      setUpdateState(await window.memex.update.install());
    } catch (error) {
      setUpdateState({
        phase: 'error',
        currentVersion: info?.version ?? '',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const setMode = (mode: McpAccessMode) => void updateSettings({ mcpAccessMode: mode });
  const setTheme = (theme: ThemeMode) => void updateSettings({ theme });

  const renderSection = () => {
    switch (active.id) {
      case 'appearance':
        return (
          <div className="space-y-5">
            <div className="flex gap-3">
              <ThemeButton icon={Sun} label="浅色" active={settings.theme === 'light'} onClick={() => setTheme('light')} />
              <ThemeButton icon={Moon} label="深色" active={settings.theme === 'dark'} onClick={() => setTheme('dark')} />
              <ThemeButton icon={Database} label="跟随系统" active={settings.theme === 'system'} onClick={() => setTheme('system')} />
            </div>

            <div>
              <p className="mb-2 text-[12px] text-[var(--faint)]">预览</p>
              {/* 用主题变量搭一个迷你界面，切换主题时同步变化 */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <div className="flex h-[128px] overflow-hidden rounded-lg border border-[var(--line)] shadow-sm">
                  <div className="flex w-[56px] shrink-0 flex-col gap-2 border-r border-[var(--line)] bg-[var(--sidebar)] p-2">
                    <div className="h-1.5 w-7 rounded-full bg-[var(--line-strong)]" />
                    <div className="mt-1 h-1.5 w-8 rounded-full bg-[var(--accent)] opacity-70" />
                    <div className="h-1.5 w-6 rounded-full bg-[var(--line-strong)]" />
                    <div className="h-1.5 w-7 rounded-full bg-[var(--line-strong)]" />
                  </div>
                  <div className="flex w-[104px] shrink-0 flex-col gap-2 border-r border-[var(--line)] bg-[var(--surface)] p-2">
                    <div className="h-1.5 w-10 rounded-full bg-[var(--ink)] opacity-60" />
                    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-1.5">
                      <div className="h-1 w-12 rounded-full bg-[var(--line-strong)]" />
                      <div className="mt-1 h-1 w-8 rounded-full bg-[var(--line)]" />
                    </div>
                    <div className="p-1.5">
                      <div className="h-1 w-14 rounded-full bg-[var(--line-strong)]" />
                      <div className="mt-1 h-1 w-9 rounded-full bg-[var(--line)]" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 bg-[var(--bg)] p-3">
                    <div className="h-2 w-28 rounded-full bg-[var(--ink)] opacity-70" />
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-6 rounded-full bg-[var(--accent)] opacity-60" />
                      <div className="h-1.5 w-8 rounded-full bg-[var(--line)]" />
                    </div>
                    <div className="h-1 w-full rounded-full bg-[var(--line-strong)]" />
                    <div className="h-1 w-3/4 rounded-full bg-[var(--line-strong)]" />
                    <div className="h-1 w-5/6 rounded-full bg-[var(--line)]" />
                    <div className="h-1 w-2/3 rounded-full bg-[var(--line)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'desktop':
        return (
          <div className="space-y-2">
            <ToggleRow
              label="关闭窗口时最小化到托盘"
              checked={settings.closeToTray}
              onChange={(checked) => void updateSettings({ closeToTray: checked })}
            />
            <ToggleRow
              label="开机自动启动"
              checked={settings.autoLaunch}
              onChange={(checked) => void updateSettings({ autoLaunch: checked })}
            />
            <ToggleRow
              label="快速记录窗口失焦时隐藏"
              checked={settings.quickCaptureHideOnBlur}
              onChange={(checked) => void updateSettings({ quickCaptureHideOnBlur: checked })}
            />
          </div>
        );

      case 'ai-service':
        return <AiServiceSettings />;

      case 'ai-access':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                title="仅任务"
                detail="AI 可以读取任务清单"
                active={settings.mcpAccessMode === 'tasks'}
                onClick={() => setMode('tasks')}
              />
              <ModeCard
                title="任务 + 笔记"
                detail="AI 还可以读取笔记全文"
                active={settings.mcpAccessMode === 'all'}
                onClick={() => setMode('all')}
              />
            </div>
            {settings.mcpAccessMode === 'all' ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-700 dark:text-amber-300">
                开启后，笔记全文会进入 AI 客户端的上下文，相当于发送给对应的模型服务商。请确认你接受这一点。
              </p>
            ) : null}

            <ToggleRow
              label="允许 AI 修改任务"
              checked={settings.mcpTaskWrite}
              onChange={(checked) => void updateSettings({ mcpTaskWrite: checked })}
            />
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-700 dark:text-amber-300">
              开启后，AI 客户端可以通过 MCP 修改任务的状态、优先级、截止时间、标题、描述和标签。请只在你信任的客户端中开启。
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void window.memex.app.copyMcpConfig().then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  });
                }}
              >
                <Clipboard size={13} /> {copied ? '已复制' : '复制 MCP 配置'}
              </Button>
              <span className="text-[12px] text-[var(--faint)]">粘贴到 Claude Desktop / Codex 的 MCP 设置</span>
            </div>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void window.memex.app.backupNow().then((path) => setActionResult(`备份已保存：${path}`));
                }}
              >
                <HardDrive size={13} /> 立即备份
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void window.memex.app.exportJson().then((path) => setActionResult(`已导出：${path}`));
                }}
              >
                <ExternalLink size={13} /> 导出 JSON
              </Button>
            </div>
            {actionResult ? <p className="break-all text-[12px] text-[var(--muted)]">{actionResult}</p> : null}
          </div>
        );

      case 'update':
        return (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Download size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium">Memex v{info?.version ?? updateState?.currentVersion ?? '—'}</p>
                  {updateState?.latestVersion && updateState.phase === 'available' ? (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent)]">
                      可更新至 v{updateState.latestVersion}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[var(--faint)]">
                  {updateState?.message ?? '尚未检查更新。'}
                </p>
                {updateState?.phase === 'downloading' || updateState?.phase === 'downloaded' ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <motion.div
                      className="h-full rounded-full bg-[var(--accent)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${updateState.progress ?? 0}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                ) : null}
                {updateState?.notes && (updateState.phase === 'available' || updateState.phase === 'up-to-date') ? (
                  <div className="thin-scroll mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--hover)] px-3 py-2 text-[12px] leading-5 text-[var(--muted)]">
                    {updateState.notes}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant={updateState?.phase === 'available' ? 'accent' : 'outline'}
                size="sm"
                disabled={
                  updateState?.phase === 'checking' ||
                  updateState?.phase === 'downloading' ||
                  updateState?.phase === 'downloaded'
                }
                onClick={() => void (updateState?.phase === 'available' ? installUpdate() : checkForUpdates())}
              >
                {updateState?.phase === 'available' ? (
                  <Download size={13} />
                ) : (
                  <RefreshCw size={13} className={updateState?.phase === 'checking' ? 'animate-spin' : ''} />
                )}
                {updateState?.phase === 'available'
                  ? `一键更新到 v${updateState.latestVersion}`
                  : updateState?.phase === 'checking'
                    ? '检查中…'
                    : updateState?.phase === 'downloading'
                      ? `下载中 ${updateState.progress ?? 0}%`
                      : updateState?.phase === 'downloaded'
                        ? '正在重启安装…'
                        : '检查更新'}
              </Button>
              {updateState?.releaseUrl ? (
                <button
                  onClick={() => window.open(updateState.releaseUrl, '_blank')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <ExternalLink size={12} /> 查看发布说明
                </button>
              ) : null}
            </div>
          </div>
        );

      case 'about':
        return info ? (
          <dl className="grid grid-cols-[88px_1fr] gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[12px]">
            <dt className="text-[var(--faint)]">版本</dt>
            <dd className="text-[var(--muted)]">{info.version}</dd>
            <dt className="text-[var(--faint)]">数据库</dt>
            <dd className="break-all text-[var(--muted)]">{info.dbPath}</dd>
            <dt className="text-[var(--faint)]">数据目录</dt>
            <dd className="break-all text-[var(--muted)]">{info.userDataPath}</dd>
          </dl>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {settingsOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setSettingsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-[min(80vh,620px)] w-full max-w-[900px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-2)] shadow-[var(--shadow)]"
          >
            <aside className="flex w-[212px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
              <div className="flex h-14 shrink-0 items-center border-b border-[var(--line)] px-4">
                <h2 className="text-[15px] font-semibold">设置</h2>
              </div>
              <nav className="thin-scroll flex-1 overflow-y-auto p-2">
                {NAV.map((group) => (
                  <div key={group.group} className="mb-4 last:mb-0">
                    <p className="mb-1 px-2 text-[12px] font-medium text-[var(--faint)]">{group.group}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.id === active.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setActiveId(item.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition-colors',
                              isActive
                                ? 'bg-[var(--surface-2)] font-medium text-[var(--ink)] shadow-sm'
                                : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]',
                            )}
                          >
                            <Icon size={15} className={isActive ? 'text-[var(--accent)]' : ''} />
                            <span className="flex-1 truncate text-left">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="shrink-0 border-t border-[var(--line)] px-4 py-3 text-[12px] text-[var(--faint)]">
                Memex v{info?.version ?? '—'}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--line)] px-6">
                <h3 className="flex-1 text-[15px] font-semibold">{active.label}</h3>
                <button
                  onClick={() => setSettingsOpen(false)}
                  aria-label="关闭设置"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="thin-scroll flex-1 overflow-y-auto px-6 py-5">
                <p className="mb-4 text-[12px] leading-5 text-[var(--faint)]">{active.description}</p>
                {renderSection()}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ThemeButton({ icon: Icon, label, active, onClick }: { icon: typeof Sun; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[72px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border text-[13px] transition',
        active
          ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)]',
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function ModeCard({ title, detail, active, onClick }: { title: string; detail: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-xl border p-3 text-left transition',
        active ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)]' : 'border-[var(--line)] hover:bg-[var(--hover)]',
      )}
    >
      {active ? <Check size={14} className="absolute right-2.5 top-2.5 text-[var(--accent)]" /> : null}
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-[var(--faint)]">{detail}</p>
    </button>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--line)] px-3 py-2.5">
      <span className="text-[13px] text-[var(--muted)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]')}
      >
        <span
          className={cn(
            'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
