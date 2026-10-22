import { randomUUID } from 'node:crypto';
import type { MemexDatabase } from '../db/database.js';
import { reportCandidateQuerySchema, reportUpdateSchema } from '../reports/validation.js';
import type {
  Report,
  ReportCandidate,
  ReportGenerationMeta,
  ReportNoteSnapshot,
  ReportSummary,
  ReportTaskSnapshot,
  ReportTemplateSnapshot,
  ReportUpdateInput,
} from '../reports/types.js';
import { getEntityTags } from './tags.js';

interface CandidateRow {
  id: string;
  title: string;
  description: string | null;
  status: ReportCandidate['status'];
  priority: ReportCandidate['priority'];
  due_at: number | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  note_id: string | null;
  note_title: string | null;
  note_deleted_at: number | null;
}

interface ReportRow {
  id: string;
  title: string;
  period_start: number;
  period_end: number;
  template_id: string | null;
  template_snapshot_json: string;
  tasks_snapshot_json: string;
  notes_snapshot_json: string;
  content_markdown: string;
  generation_meta_json: string;
  created_at: number;
  updated_at: number;
}

interface ReportSummaryRow {
  id: string;
  title: string;
  period_start: number;
  period_end: number;
  template_id: string | null;
  template_snapshot_json: string;
  tasks_snapshot_json: string;
  notes_snapshot_json: string;
  created_at: number;
  updated_at: number;
}

interface LinkedTaskRow {
  id: string;
  note_id: string | null;
}

interface LinkedNoteRow {
  id: string;
  title: string;
  plain_text: string;
}

export interface ReportRepository {
  list(): ReportSummary[];
  get(id: string): Report | null;
  listCandidates(periodStart: number, periodEnd: number): ReportCandidate[];
  getSelectedTasks(taskIds: string[]): ReportCandidate[];
  getLinkedNotes(taskIds: string[]): ReportNoteSnapshot[];
  create(input: Omit<Report, 'id' | 'createdAt' | 'updatedAt'>): Report;
  update(id: string, patch: ReportUpdateInput): Report;
  remove(id: string): void;
}

function mapCandidate(row: CandidateRow, tags: string[]): ReportCandidate {
  const hasActiveNote = row.note_id !== null && row.note_deleted_at === null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    tags,
    noteId: hasActiveNote ? row.note_id : null,
    noteTitle: hasActiveNote ? row.note_title : null,
  };
}

function hydrateCandidates(db: MemexDatabase, rows: CandidateRow[]): ReportCandidate[] {
  const tags = getEntityTags(db, 'task', rows.map((row) => row.id));
  return rows.map((row) => mapCandidate(row, tags.get(row.id) ?? []));
}

function mapReport(row: ReportRow): Report {
  return {
    id: row.id,
    title: row.title,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    templateId: row.template_id,
    template: JSON.parse(row.template_snapshot_json) as ReportTemplateSnapshot,
    tasks: JSON.parse(row.tasks_snapshot_json) as ReportTaskSnapshot[],
    notes: JSON.parse(row.notes_snapshot_json) as ReportNoteSnapshot[],
    contentMarkdown: row.content_markdown,
    generationMeta: JSON.parse(row.generation_meta_json) as ReportGenerationMeta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummary(row: ReportSummaryRow): ReportSummary {
  const template = JSON.parse(row.template_snapshot_json) as ReportTemplateSnapshot;
  const tasks = JSON.parse(row.tasks_snapshot_json) as ReportTaskSnapshot[];
  const notes = JSON.parse(row.notes_snapshot_json) as ReportNoteSnapshot[];
  return {
    id: row.id,
    title: row.title,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    templateId: row.template_id,
    templateName: template.name,
    taskCount: tasks.length,
    noteCount: notes.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uniqueInOrder(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function createReportRepository(db: MemexDatabase): ReportRepository {
  const get = (id: string): Report | null => {
    const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as unknown as ReportRow | undefined;
    return row ? mapReport(row) : null;
  };

  return {
    list() {
      const rows = db
        .prepare(`
          SELECT id, title, period_start, period_end, template_id, template_snapshot_json,
                 tasks_snapshot_json, notes_snapshot_json, created_at, updated_at
          FROM reports
          ORDER BY created_at DESC, id DESC
        `)
        .all() as unknown as ReportSummaryRow[];
      return rows.map(mapSummary);
    },

    get,

    listCandidates(periodStart, periodEnd) {
      const period = reportCandidateQuerySchema.parse({ periodStart, periodEnd });
      const rows = db
        .prepare(`
          SELECT t.id, t.title, t.description, t.status, t.priority, t.due_at,
                 t.created_at, t.updated_at, t.completed_at,
                 t.note_id, n.title AS note_title, n.deleted_at AS note_deleted_at
          FROM tasks t
          LEFT JOIN notes n ON n.id = t.note_id
          WHERE t.deleted_at IS NULL AND (
            (t.created_at >= ? AND t.created_at < ?) OR
            (t.due_at >= ? AND t.due_at < ?) OR
            (t.completed_at >= ? AND t.completed_at < ?) OR
            (t.updated_at >= ? AND t.updated_at < ?)
          )
          ORDER BY CASE t.status WHEN 'done' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END,
                   coalesce(t.completed_at, t.due_at, t.updated_at) DESC
          LIMIT 1001
        `)
        .all(
          period.periodStart,
          period.periodEnd,
          period.periodStart,
          period.periodEnd,
          period.periodStart,
          period.periodEnd,
          period.periodStart,
          period.periodEnd,
        ) as unknown as CandidateRow[];
      return hydrateCandidates(db, rows);
    },

    getSelectedTasks(taskIds) {
      const ids = uniqueInOrder(taskIds);
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const rows = db
        .prepare(`
          SELECT t.id, t.title, t.description, t.status, t.priority, t.due_at,
                 t.created_at, t.updated_at, t.completed_at,
                 t.note_id, n.title AS note_title, n.deleted_at AS note_deleted_at
          FROM tasks t
          LEFT JOIN notes n ON n.id = t.note_id
          WHERE t.deleted_at IS NULL AND t.id IN (${placeholders})
        `)
        .all(...ids) as unknown as CandidateRow[];
      const byId = new Map(hydrateCandidates(db, rows).map((item) => [item.id, item]));
      return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    },

    getLinkedNotes(taskIds) {
      const ids = uniqueInOrder(taskIds);
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      const taskRows = db
        .prepare(`SELECT id, note_id FROM tasks WHERE deleted_at IS NULL AND id IN (${placeholders})`)
        .all(...ids) as unknown as LinkedTaskRow[];
      const byTaskId = new Map(taskRows.map((row) => [row.id, row.note_id]));
      const noteIds = uniqueInOrder(
        ids.flatMap((id) => {
          const noteId = byTaskId.get(id);
          return noteId ? [noteId] : [];
        }),
      );
      if (noteIds.length === 0) return [];

      const notePlaceholders = noteIds.map(() => '?').join(', ');
      const noteRows = db
        .prepare(`
          SELECT id, title, plain_text
          FROM notes
          WHERE deleted_at IS NULL AND id IN (${notePlaceholders})
        `)
        .all(...noteIds) as unknown as LinkedNoteRow[];
      const byNoteId = new Map(
        noteRows.map((row) => [row.id, { id: row.id, title: row.title, plainText: row.plain_text }]),
      );
      return noteIds.flatMap((id) => {
        const note = byNoteId.get(id);
        return note ? [note] : [];
      });
    },

    create(input) {
      const id = randomUUID();
      const now = Date.now();
      const apply = db.transaction(() => {
        db.prepare(`
          INSERT INTO reports(
            id, title, period_start, period_end, template_id, template_snapshot_json,
            tasks_snapshot_json, notes_snapshot_json, content_markdown, generation_meta_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.title,
          input.periodStart,
          input.periodEnd,
          input.templateId,
          JSON.stringify(input.template),
          JSON.stringify(input.tasks),
          JSON.stringify(input.notes),
          input.contentMarkdown,
          JSON.stringify(input.generationMeta),
          now,
          now,
        );
      });
      apply();
      return get(id)!;
    },

    update(id, patch) {
      if (!get(id)) throw new Error('报告不存在');
      const value = reportUpdateSchema.parse(patch);
      const assignments: string[] = [];
      const params: (string | number)[] = [];
      const assign = (column: string, next: string | number): void => {
        assignments.push(`${column} = ?`);
        params.push(next);
      };

      if (value.title !== undefined) assign('title', value.title);
      if (value.contentMarkdown !== undefined) assign('content_markdown', value.contentMarkdown);
      assign('updated_at', Date.now());
      db.prepare(`UPDATE reports SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);
      return get(id)!;
    },

    remove(id) {
      if (!get(id)) throw new Error('报告不存在');
      db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    },
  };
}
