import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../packages/main/src/services/database'

describe('long-context schema', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-long-context-schema-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    closeDatabase()
    rmSync(vaultPath, { recursive: true, force: true })
  })

  function tableNames(db: Database.Database): string[] {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table')").all() as { name: string }[]
    return rows.map((row) => row.name)
  }

  function indexNames(db: Database.Database, tableName: string): string[] {
    const rows = db.prepare(`PRAGMA index_list(${tableName})`).all() as { name: string }[]
    return rows.map((row) => row.name)
  }

  function columnNames(db: Database.Database, tableName: string): string[] {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
    return rows.map((row) => row.name)
  }

  it('creates long-context tables, indexes, and foreign keys for a new vault', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)

    expect(tableNames(db)).toEqual(expect.arrayContaining([
      'context_events',
      'ai_relations',
      'long_term_themes',
      'theme_memberships',
      'relation_feedback'
    ]))
    expect(db.prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: SCHEMA_VERSION })

    expect(indexNames(db, 'context_events')).toEqual(expect.arrayContaining([
      'idx_context_events_entity',
      'idx_context_events_type'
    ]))
    expect(indexNames(db, 'ai_relations')).toEqual(expect.arrayContaining([
      'idx_ai_relations_pair_type',
      'idx_ai_relations_source',
      'idx_ai_relations_target',
      'idx_ai_relations_type'
    ]))
    expect(indexNames(db, 'long_term_themes')).toContain('idx_long_term_themes_strength')
    expect(indexNames(db, 'theme_memberships')).toContain('idx_theme_memberships_unique')
    expect(indexNames(db, 'relation_feedback')).toContain('idx_relation_feedback_relation')

    const themeMembershipKeys = db.prepare('PRAGMA foreign_key_list(theme_memberships)').all() as { table: string, on_delete: string }[]
    const feedbackKeys = db.prepare('PRAGMA foreign_key_list(relation_feedback)').all() as { table: string, on_delete: string }[]
    expect(themeMembershipKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'long_term_themes', on_delete: 'CASCADE' })
    ]))
    expect(feedbackKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'ai_relations', on_delete: 'CASCADE' })
    ]))
  })

  it('migrates an existing schema 9 vault to the current schema idempotently', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const dbPath = join(vaultPath, '.nexusky', 'index.db')
    const oldDb = new Database(dbPath)
    oldDb.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (9);
    `)
    oldDb.close()

    const migratedDb = getDatabase(vaultPath)
    expect(migratedDb.prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: SCHEMA_VERSION })
    expect(tableNames(migratedDb)).toEqual(expect.arrayContaining([
      'context_events',
      'ai_relations',
      'long_term_themes',
      'theme_memberships',
      'relation_feedback'
    ]))

    closeDatabase()
    expect(() => getDatabase(vaultPath)).not.toThrow()
    expect(getDatabase(vaultPath).prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: SCHEMA_VERSION })
  })

  it('repairs partial long-context tables when schema_version is already current', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const dbPath = join(vaultPath, '.nexusky', 'index.db')
    const partialDb = new Database(dbPath)
    partialDb.exec(`
      CREATE TABLE context_events (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (11);
    `)
    partialDb.close()

    const db = getDatabase(vaultPath)
    expect(columnNames(db, 'context_events')).toEqual(expect.arrayContaining([
      'event_type',
      'entity_type',
      'entity_id',
      'entity_title',
      'entity_path',
      'content_snapshot',
      'metadata_json',
      'created_at'
    ]))
    expect(indexNames(db, 'context_events')).toEqual(expect.arrayContaining([
      'idx_context_events_entity',
      'idx_context_events_type'
    ]))
  })
})
