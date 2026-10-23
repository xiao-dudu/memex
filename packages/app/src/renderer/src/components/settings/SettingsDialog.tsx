import { useEffect, useState } from 'react';
import { Check, Clipboard, Database, Download, ExternalLink, HardDrive, Moon, RefreshCw, Sun, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { AppInfo, McpAccessMode, ThemeMode, UpdateState } from '@memex/shared';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { AiServiceSettings } from './AiServiceSettings';

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, updateSettings } = useAppStore();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionResult, setActionResult] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
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
            className="thin-scroll max-h-[86vh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] shadow-[var(--shadow)]"
          >
            <div className="flex h-14 items-center gap-3 border-b border-[var(--line)] px-5">
              <h2 className="flex-1 text-[14px] font-semibold">设置</h2>
              <button onClick={() => setSettingsOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-7 p-5">
              <Section title="外观" description="选择 Memex 的明暗主题。">
                <div className="flex gap-2">
                  <ThemeButton icon={Sun} label="浅色" active={settings.theme === 'light'} onClick={() => setTheme('light')} />
                  <ThemeButton icon={Moon} label="深色" active={settings.theme === 'dark'} onClick={() => setTheme('dark')} />
                  <ThemeButton icon={Database} label="跟随系统" active={settings.theme === 'system'} onClick={() => setTheme('system')} />
                </div>
              </Section>

              <Section title="AI 服务" description="配置周报生成使用的 OpenAI 兼容服务。">
                <AiServiceSettings />
              </Section>

              <Section title="AI 访问权限" description="控制 MCP 客户端能读取哪些本地内容，以及能否修改任务。">
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
                  <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10.5px] leading-5 text-amber-700 dark:text-amber-300">
                    开启后，笔记全文会进入 AI 客户端的上下文，相当于发送给对应的模型服务商。请确认你接受这一点。
                  </p>
                ) : null}
                <div className="mt-3">
                  <ToggleRow
                    label="允许 AI 修改任务"
                    checked={settings.mcpTaskWrite}
                    onChange={(checked) => void updateSettings({ mcpTaskWrite: checked })}
                  />
                </div>
                <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10.5px] leading-5 text-amber-700 dark:text-amber-300">
                  开启后，AI 客户端可以通过 MCP 修改任务的状态、优先级、截止时间、标题、描述和标签。请只在你信任的客户端中开启。
                </p>
                <div className="mt-2 flex items-center gap-2">
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
                  <span className="text-[10px] text-[var(--faint)]">粘贴到 Claude Desktop / Codex 的 MCP 设置</span>
                </div>
              </Section>

              <Section title="数据" description="数据始终保存在本机，不上传。">
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
                {actionResult ? <p className="mt-2 break-all text-[10px] text-[var(--muted)]">{actionResult}</p> : null}
              </Section>

              <Section title="软件更新" description="从 GitHub Releases 检查新版本，下载完成后自动重启安装。">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Download size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11.5px] font-medium">Memex v{info?.version ?? updateState?.currentVersion ?? '—'}</p>
                        {updateState?.latestVersion && updateState.phase === 'available' ? (
                          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
                            可更新至 v{updateState.latestVersion}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[10px] leading-5 text-[var(--faint)]">
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
                        <div className="thin-scroll mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--hover)] px-2.5 py-2 text-[9.5px] leading-5 text-[var(--muted)]">
                          {updateState.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
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
                      {updateState?.phase === 'available' ? <Download size={13} /> : <RefreshCw size={13} className={updateState?.phase === 'checking' ? 'animate-spin' : ''} />}
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
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] text-[var(--faint)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                      >
                        <ExternalLink size={11} /> 查看发布说明
                      </button>
                    ) : null}
                  </div>
                </div>
              </Section>

              <Section title="桌面行为" description="决定窗口和快速记录的行为。">
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
              </Section>

              {info ? (
                <Section title="关于" description="本地优先的备忘录与任务清单。">
                  <dl className="grid grid-cols-[76px_1fr] gap-y-1.5 text-[10.5px]">
                    <dt className="text-[var(--faint)]">版本</dt>
                    <dd className="text-[var(--muted)]">{info.version}</dd>
                    <dt className="text-[var(--faint)]">数据库</dt>
                    <dd className="break-all text-[var(--muted)]">{info.dbPath}</dd>
                    <dt className="text-[var(--faint)]">数据目录</dt>
                    <dd className="break-all text-[var(--muted)]">{info.userDataPath}</dd>
                  </dl>
                </Section>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[12px] font-semibold">{title}</h3>
      <p className="mb-3 mt-0.5 text-[10.5px] text-[var(--faint)]">{description}</p>
      {children}
    </section>
  );
}

function ThemeButton({ icon: Icon, label, active, onClick }: { icon: typeof Sun; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-16 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border text-[10.5px] transition',
        active ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)]',
      )}
    >
      <Icon size={16} />
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
      {active ? <Check size={13} className="absolute right-2.5 top-2.5 text-[var(--accent)]" /> : null}
      <p className="text-[11.5px] font-medium">{title}</p>
      <p className="mt-0.5 text-[9.5px] leading-4 text-[var(--faint)]">{detail}</p>
    </button>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full transition', checked ? 'bg-[var(--accent)]' : 'bg-[var(--line-strong)]')}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

