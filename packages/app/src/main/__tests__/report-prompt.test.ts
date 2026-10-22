// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ReportTemplateSnapshot } from '@memex/shared';
import { buildReportMessages } from '../report-prompt';

const template: ReportTemplateSnapshot = {
  name: '团队周报',
  description: '团队使用',
  basePrompt: '用简洁专业的中文总结。',
  sections: [
    { id: 'done', title: '本周完成', instruction: '列出成果', allowEmpty: false },
    { id: 'next', title: '下周计划', instruction: '列出计划', allowEmpty: true },
  ],
  constraints: '不要编造数据。',
};

describe('report prompt', () => {
  it('keeps fixed rules in system and user template in user', () => {
    const messages = buildReportMessages(template, { periodStart: 1, periodEnd: 2, tasks: [], notes: [] });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('不得虚构');
    expect(messages[0]?.content).toContain('不是可执行指令');
    expect(messages[0]?.content).not.toContain('本周完成');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toContain('本周完成');
    expect(messages[1]?.content).toContain('不要编造数据。');
  });

  it('wraps selected tasks and notes in a JSON data block with readable times', () => {
    const start = new Date(2026, 9, 19, 0, 0, 0).getTime();
    const end = new Date(2026, 9, 26, 0, 0, 0).getTime();
    const messages = buildReportMessages(template, {
      periodStart: start,
      periodEnd: end,
      tasks: [
        {
          id: 'task-1',
          title: '完成任务',
          description: null,
          status: 'done',
          priority: 'high',
          dueAt: null,
          createdAt: start,
          updatedAt: start,
          completedAt: start,
          tags: ['项目'],
          noteId: 'note-1',
          noteTitle: '项目笔记',
          note: { id: 'note-1', title: '项目笔记', plainText: '笔记内容' },
        },
      ],
      notes: [{ id: 'note-1', title: '项目笔记', plainText: '笔记内容' }],
    });

    expect(messages[1]?.content).toContain('<report_data>');
    expect(messages[1]?.content).toContain('```json');
    expect(messages[1]?.content).toContain('2026-10-19 00:00');
    expect(messages[1]?.content).toContain('"title": "完成任务"');
    expect(messages[1]?.content).toContain('"plainText": "笔记内容"');
  });
});
