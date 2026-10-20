import type { MemexDatabase } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import type { Tag } from '../types.js';
import { tagColor } from './tag-color.js';

export function ensureTag(db: MemexDatabase, rawName: string): string {
  const name = rawName.trim();
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare('INSERT INTO tags(id, name, color) VALUES (?, ?, ?)').run(id, name, tagColor(name));
  return id;
}

export function setEntityTags(
  db: MemexDatabase,
  entity: 'task' | 'note',
  entityId: string,
  names: string[],
): void {
  const joinTable = entity === 'task' ? 'task_tags' : 'note_tags';
  const column = entity === 'task' ? 'task_id' : 'note_id';
  const normalized = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  const apply = db.transaction(() => {
    db.prepare(`DELETE FROM ${joinTable} WHERE ${column} = ?`).run(entityId);
    const insert = db.prepare(`INSERT INTO ${joinTable}(${column}, tag_id) VALUES (?, ?)`);
    for (const name of normalized) {
      insert.run(entityId, ensureTag(db, name));
    }
  });
  apply();
}

export function getEntityTags(db: MemexDatabase, entity: 'task' | 'note', ids: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (ids.length === 0) return result;
  const joinTable = entity === 'task' ? 'task_tags' : 'note_tags';
  const column = entity === 'task' ? 'task_id' : 'note_id';
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`
      SELECT j.${column} AS entity_id, t.name
      FROM ${joinTable} j
      JOIN tags t ON t.id = j.tag_id
      WHERE j.${column} IN (${placeholders})
      ORDER BY t.name COLLATE NOCASE
    `)
    .all(...ids) as { entity_id: string; name: string }[];

  for (const row of rows) {
    const list = result.get(row.entity_id) ?? [];
    list.push(row.name);
    result.set(row.entity_id, list);
  }
  return result;
}

export interface TagRepository {
  list(): Tag[];
  ensure(name: string): Tag;
  rename(id: string, name: string): Tag;
  remove(id: string): void;
}

export function createTagRepository(db: MemexDatabase): TagRepository {
  return {
    list() {
      return db
        .prepare(`
          SELECT t.id, t.name, t.color,
            (SELECT count(*) FROM task_tags tt WHERE tt.tag_id = t.id) AS task_count,
            (SELECT count(*) FROM note_tags nt WHERE nt.tag_id = t.id) AS note_count
          FROM tags t
          ORDER BY t.name COLLATE NOCASE
        `)
        .all()
        .map((row) => {
          const value = row as { id: string; name: string; color: string; task_count: number; note_count: number };
          return {
            id: value.id,
            name: value.name,
            color: value.color,
            taskCount: value.task_count,
            noteCount: value.note_count,
          };
        });
    },

    ensure(name) {
      const id = ensureTag(db, name);
      return db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(id) as unknown as Tag;
    },

    rename(id, name) {
      const clean = name.trim();
      if (!clean) throw new Error('标签名不能为空');
      db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(clean, tagColor(clean), id);
      const row = db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(id) as unknown as Tag | undefined;
      if (!row) throw new Error('标签不存在');
      return row;
    },

    remove(id) {
      db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    },
  };
}
