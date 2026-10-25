import type { MemexDatabase } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import type { Note, NoteCounts, NoteFilter, NoteInput, NotePatch, NoteSummary, NoteView } from '../types.js';
import { deriveNoteTitle } from '../validation.js';
import { getEntityTags, pruneOrphanTags, setEntityTags } from './tags.js';

interface NoteRow {
  id: string;
  title: string;
  content_json: string;
  plain_text: string;
  is_pinned: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function excerpt(plainText: string): string {
  const compact = plainText.replace(/\s+/g, ' ').trim();
  return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact;
}

function mapSummary(row: NoteRow, tags: string[]): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerpt(row.plain_text),
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    tags,
  };
}

function mapNote(row: NoteRow, tags: string[]): Note {
  return {
    ...mapSummary(row, tags),
    contentJson: row.content_json,
    plainText: row.plain_text,
  };
}

function orderFor(view: NoteView): string {
  return view === 'trash' ? 'n.deleted_at DESC' : 'n.is_pinned DESC, n.updated_at DESC';
}

export interface NoteRepository {
  list(filter?: NoteFilter): NoteSummary[];
  get(id: string): Note | null;
  create(input: NoteInput): Note;
  update(id: string, patch: NotePatch): Note;
  softDelete(id: string): void;
  restore(id: string): void;
  purge(id: string): void;
  setTags(id: string, names: string[]): void;
  counts(): NoteCounts;
}

export function createNoteRepository(db: MemexDatabase): NoteRepository {
  const hydrate = (rows: NoteRow[]): Note[] => {
    const tagMap = getEntityTags(db, 'note', rows.map((row) => row.id));
    return rows.map((row) => mapNote(row, tagMap.get(row.id) ?? []));
  };

  return {
    list(filter = {}) {
      const view = filter.view ?? 'all';
      const where: string[] = [];
      const params: (string | number | null)[] = [];

      if (view === 'trash') {
        where.push('n.deleted_at IS NOT NULL');
      } else {
        where.push('n.deleted_at IS NULL');
        if (view === 'pinned') where.push('n.is_pinned = 1');
      }
      if (filter.tag) {
        where.push('EXISTS (SELECT 1 FROM note_tags nt JOIN tags tg ON tg.id = nt.tag_id WHERE nt.note_id = n.id AND tg.name = ?)');
        params.push(filter.tag);
      }
      if (filter.query?.trim()) {
        where.push("(n.title LIKE ? OR n.plain_text LIKE ?)");
        const like = `%${filter.query.trim()}%`;
        params.push(like, like);
      }

      const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
      const offset = Math.max(filter.offset ?? 0, 0);
      const rows = db
        .prepare(`
          SELECT n.*
          FROM notes n
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderFor(view)}
          LIMIT ? OFFSET ?
        `)
        .all(...params, limit, offset) as unknown as NoteRow[];

      return hydrate(rows).map(({ contentJson: _contentJson, plainText: _plainText, ...summary }) => summary);
    },

    get(id) {
      const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as unknown as NoteRow | undefined;
      if (!row) return null;
      return hydrate([row])[0] ?? null;
    },

    create(input) {
      const id = randomUUID();
      const now = Date.now();
      const title = input.title?.trim() || deriveNoteTitle(input.plainText);
      const apply = db.transaction(() => {
        db.prepare(`
          INSERT INTO notes(id, title, content_json, plain_text, is_pinned, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, title, input.contentJson, input.plainText, input.isPinned ? 1 : 0, now, now);
        if (input.tags?.length) setEntityTags(db, 'note', id, input.tags);
      });
      apply();
      return this.get(id)!;
    },

    update(id, patch) {
      const existing = this.get(id);
      if (!existing) throw new Error('笔记不存在');
      const assignments: string[] = [];
      const params: (string | number | null)[] = [];
      const assign = (column: string, value: string | number | null) => {
        assignments.push(`${column} = ?`);
        params.push(value);
      };

      if (patch.contentJson !== undefined) assign('content_json', patch.contentJson);
      if (patch.plainText !== undefined) assign('plain_text', patch.plainText);
      if (patch.title !== undefined) {
        assign('title', patch.title.trim() || deriveNoteTitle(patch.plainText ?? existing.plainText));
      } else if (patch.plainText !== undefined) {
        assign('title', deriveNoteTitle(patch.plainText));
      }
      if (patch.isPinned !== undefined) assign('is_pinned', patch.isPinned ? 1 : 0);
      assign('updated_at', Date.now());

      const apply = db.transaction(() => {
        db.prepare(`UPDATE notes SET ${assignments.join(', ')} WHERE id = ?`).run(...params, id);
        if (patch.tags !== undefined) setEntityTags(db, 'note', id, patch.tags);
      });
      apply();
      return this.get(id)!;
    },

    softDelete(id) {
      const now = Date.now();
      db.prepare('UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    },

    restore(id) {
      db.prepare('UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id);
    },

    purge(id) {
      db.prepare('DELETE FROM notes WHERE id = ?').run(id);
      pruneOrphanTags(db);
    },

    setTags(id, names) {
      setEntityTags(db, 'note', id, names);
    },

    counts() {
      const row = db
        .prepare(`
          SELECT
            sum(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
            sum(CASE WHEN deleted_at IS NULL AND is_pinned = 1 THEN 1 ELSE 0 END) AS pinned,
            sum(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trash
          FROM notes
        `)
        .get() as { active: number | null; pinned: number | null; trash: number | null };
      return { all: row.active ?? 0, pinned: row.pinned ?? 0, trash: row.trash ?? 0 };
    },
  };
}
