import Database from 'better-sqlite3'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('proactive schema', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-proactive-schema-'))
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

  function uniqueIndexes(db: Database.Database, tableName: string): string[] {
    const rows = db.prepare(`PRAGMA index_list(${tableName})`).all() as { name: string, unique: number }[]
    return rows.filter((row) => row.unique === 1).map((row) => row.name)
  }

  it('creates the proactive_suggestions table, indexes, and unique signature constraint for a new vault', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)

    expect(tableNames(db)).toEqual(expect.arrayContaining(['proactive_suggestions']))
    expect(db.prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: 10 })

    expect(columnNames(db, 'proactive_suggestions')).toEqual(expect.arrayContaining([
      'id',
      'kind',
      'source_ref',
      'entity_type',
      'entity_id',
      'title',
      'body',
      'cta_action',
      'cta_payload_json',
      'importance',
      'status',
      'snooze_until',
      'shown_at',
      'responded_at',
      'signature',
      'created_at',
      'updated_at'
    ]))

    expect(indexNames(db, 'proactive_suggestions')).toEqual(expect.arrayContaining([
      'idx_proactive_signature',
      'idx_proactive_status_created',
      'idx_proactive_entity'
    ]))

    expect(uniqueIndexes(db, 'proactive_suggestions')).toContain('idx_proactive_signature')
  })

  it('migrates an existing schema 9 vault to schema 10 idempotently', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const dbPath = join(vaultPath, '.nexusky', 'index.db')
    const oldDb = new Database(dbPath)
    oldDb.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (9);
    `)
    oldDb.close()

    const migratedDb = getDatabase(vaultPath)
    expect(migratedDb.prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: 10 })
    expect(tableNames(migratedDb)).toEqual(expect.arrayContaining(['proactive_suggestions']))
    expect(indexNames(migratedDb, 'proactive_suggestions')).toEqual(expect.arrayContaining([
      'idx_proactive_signature',
      'idx_proactive_status_created',
      'idx_proactive_entity'
    ]))

    closeDatabase()
    expect(() => getDatabase(vaultPath)).not.toThrow()
    expect(getDatabase(vaultPath).prepare('SELECT version FROM schema_version LIMIT 1').get()).toEqual({ version: 10 })
  })

  it('repairs missing proactive_suggestions columns when schema_version is already current', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const dbPath = join(vaultPath, '.nexusky', 'index.db')
    const partialDb = new Database(dbPath)
    partialDb.exec(`
      CREATE TABLE proactive_suggestions (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (10);
    `)
    partialDb.close()

    const db = getDatabase(vaultPath)
    expect(columnNames(db, 'proactive_suggestions')).toEqual(expect.arrayContaining([
      'kind',
      'source_ref',
      'title',
      'cta_action',
      'importance',
      'status',
      'signature'
    ]))
  })

  it('enforces unique signature: inserting duplicate signature throws', async () => {
    const { getDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)

    const insert = db.prepare(`
      INSERT INTO proactive_suggestions
        (id, kind, source_ref, title, body, cta_action, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('a', 'relation', 'rel-1', 'Title A', 'Body A', 'open_note', 'relation|rel-1|note-1')
    expect(() => insert.run('b', 'relation', 'rel-1', 'Title B', 'Body B', 'open_note', 'relation|rel-1|note-1')).toThrow()
  })
})
