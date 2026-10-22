import { describe, expect, it } from 'vitest';
import { IPC } from '../ipc.js';

describe('IPC channels', () => {
  it('uses unique report and AI channel names', () => {
    const values = [
      IPC.reportsList,
      IPC.reportsGet,
      IPC.reportsCandidates,
      IPC.reportsGenerate,
      IPC.reportsCancel,
      IPC.reportsUpdate,
      IPC.reportsDelete,
      IPC.reportsExportMarkdown,
      IPC.reportsExportPdf,
      IPC.templatesList,
      IPC.templatesGet,
      IPC.templatesCreate,
      IPC.templatesUpdate,
      IPC.templatesDelete,
      IPC.aiGetConfig,
      IPC.aiUpdateConfig,
      IPC.aiTestConnection,
    ];
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps every channel globally unique', () => {
    const values = Object.values(IPC);
    expect(new Set(values).size).toBe(values.length);
  });
});
