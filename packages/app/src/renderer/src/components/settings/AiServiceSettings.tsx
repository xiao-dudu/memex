import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, PlugZap, Save, ShieldCheck, Trash2 } from 'lucide-react';
import type { AiServiceConfig, AiServiceConfigPatch } from '@memex/shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AiServiceSettings() {
  const [config, setConfig] = useState<AiServiceConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState('90');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.memex.ai
      .getConfig()
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setBaseUrl(value.baseUrl);
        setModel(value.model);
        setTimeoutSeconds(String(Math.round(value.timeoutMs / 1000)));
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const timeoutValue = Number(timeoutSeconds);
  const timeoutValid = Number.isInteger(timeoutValue) && timeoutValue >= 5 && timeoutValue <= 300;

  const draftPatch = (): AiServiceConfigPatch => {
    if (!timeoutValid) throw new Error('超时时间应为 5 到 300 秒之间的整数');
    const patch: AiServiceConfigPatch = {
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      timeoutMs: timeoutValue * 1000,
    };
    if (apiKey.length > 0) patch.apiKey = apiKey;
    return patch;
  };

  const save = async () => {
    if (!config) return;
    const patch: AiServiceConfigPatch = {};
    if (baseUrl.trim() !== config.baseUrl) patch.baseUrl = baseUrl.trim();
    if (model.trim() !== config.model) patch.model = model.trim();
    if (timeoutValue * 1000 !== config.timeoutMs) patch.timeoutMs = timeoutValue * 1000;
    if (apiKey.length > 0) patch.apiKey = apiKey;
    if (Object.keys(patch).length === 0) {
      setMessage('没有需要保存的修改');
      setError(null);
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await window.memex.ai.updateConfig(patch);
      setConfig(updated);
      setBaseUrl(updated.baseUrl);
      setModel(updated.model);
      setApiKey('');
      setMessage('已保存');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await window.memex.ai.testConnection(draftPatch());
      setMessage(`连接成功，耗时 ${result.latencyMs} ms`);
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setTesting(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await window.memex.ai.updateConfig({ clearApiKey: true });
      setConfig(updated);
      setApiKey('');
      setClearConfirm(false);
      setMessage('API Key 已清除');
    } catch (clearError) {
      setError(errorMessage(clearError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-4 text-[12px] text-[var(--faint)]">
        <Loader2 size={13} className="animate-spin" /> 正在读取 AI 配置…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <label className="space-y-1.5">
          <span className="text-[12px] text-[var(--muted)]">Base URL</span>
          <Input
            aria-label="Base URL"
            value={baseUrl}
            onChange={(event) => { setBaseUrl(event.target.value); setMessage(null); }}
            placeholder="https://api.example.com/v1"
            autoComplete="url"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12px] text-[var(--muted)]">模型</span>
          <Input
            aria-label="模型"
            value={model}
            onChange={(event) => { setModel(event.target.value); setMessage(null); }}
            placeholder="gpt-4.1-mini"
            autoComplete="off"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12px] text-[var(--muted)]">超时（秒）</span>
          <Input
            aria-label="超时时间（秒）"
            type="number"
            min={5}
            max={300}
            step={1}
            value={timeoutSeconds}
            onChange={(event) => { setTimeoutSeconds(event.target.value); setMessage(null); }}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
            <KeyRound size={11} /> API Key
          </span>
          <Input
            aria-label="API Key"
            type="password"
            value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); setMessage(null); }}
            placeholder={config?.hasApiKey ? '已配置，输入新 Key 可替换' : '可留空以连接本地服务'}
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accent" size="sm" disabled={saving || testing || !timeoutValid || !baseUrl.trim() || !model.trim()} onClick={() => void save()}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          保存配置
        </Button>
        <Button variant="outline" size="sm" disabled={saving || testing || !timeoutValid || !baseUrl.trim() || !model.trim()} onClick={() => void test()}>
          {testing ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
          测试连接
        </Button>
        {config?.hasApiKey ? (
          clearConfirm ? (
            <>
              <span className="text-[12px] text-red-600">清除后需重新配置 Key。</span>
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setClearConfirm(false)}>取消</Button>
              <Button variant="danger" size="sm" disabled={saving} onClick={() => void clearKey()}>确认清除</Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="text-[var(--muted)] hover:text-red-500" onClick={() => setClearConfirm(true)}>
              <Trash2 size={13} /> 清除 Key
            </Button>
          )
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[12px] leading-5 text-[var(--faint)]">
        <p className="flex items-center gap-1.5 font-medium text-[var(--muted)]">
          <ShieldCheck size={12} /> 数据发送说明
        </p>
        <p>生成周报时，只会把你勾选的任务和明确开启的关联笔记发送到上述服务。API Key 仅由主进程加密保存和使用。</p>
        {config?.hasApiKey ? <p className="mt-1 flex items-center gap-1 text-[var(--success)]"><Check size={10} /> API Key 已配置</p> : null}
      </div>

      {message ? <p className="text-[12px] text-[var(--success)]">{message}</p> : null}
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
    </div>
  );
}
