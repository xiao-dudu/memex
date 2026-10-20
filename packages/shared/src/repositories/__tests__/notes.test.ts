import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemexDatabase } from '../../db/database.js';
import { openDatabase } from '../../db/open.js';
import { runMigrations } from '../../db/migrate.js';
import { createNoteRepository } from '../notes.js';

let db: MemexDatabase;

beforeEach(() => {
  db = openDatabase(join(mkdtempSync(join(tmpdir(), 'memex-notes-')), 'test.db'));
  runMigrations(db);
});

describe('note repository', () => {
  it('derives the title from the first non-empty line', () => {
    const repo = createNoteRepository(db);
    const note = repo.create({ contentJson: '{}', plainText: '\n  第一行标题\n正文内容' });
    expect(note.title).toBe('第一行标题');
    expect(note.excerpt).toContain('第一行标题');
  });

  it('falls back to a placeholder title', () => {
    const repo = createNoteRepository(db);
    const note = repo.create({ contentJson: '{}', plainText: '   ' });
    expect(note.title).toBe('无标题');
  });

  it('keeps pinned notes first', () => {
    const repo = createNoteRepository(db);
    repo.create({ contentJson: '{}', plainText: '普通笔记' });
    repo.create({ contentJson: '{}', plainText: '置顶笔记', isPinned: true });
    expect(repo.list()[0]?.title).toBe('置顶笔记');
  });

  it('round-trips content json and restores from trash', () => {
    const repo = createNoteRepository(db);
    const content = JSON.stringify({ type: 'doc', content: [] });
    const note = repo.create({ contentJson: content, plainText: '测试' });
    expect(repo.get(note.id)?.contentJson).toBe(content);

    repo.softDelete(note.id);
    expect(repo.list()).toHaveLength(0);
    expect(repo.list({ view: 'trash' })).toHaveLength(1);
    repo.restore(note.id);
    expect(repo.list()).toHaveLength(1);
  });
});
