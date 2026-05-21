import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('indexer', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'nexusky-test-'))
    mkdirSync(join(vaultPath, '.nexusky'), { recursive: true })
  })

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true })
  })

  it('should create database with correct schema', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const db = getDatabase(vaultPath)

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const tableNames = tables.map((t) => t.name)

    expect(tableNames).toContain('notes')
    expect(tableNames).toContain('links')
    expect(tableNames).toContain('tags')
    expect(tableNames).toContain('note_aliases')
    expect(tableNames).toContain('chunks')
    expect(tableNames).toContain('tasks')
    expect(tableNames).toContain('conversations')

    closeDatabase()
  })

  it('should repair old database schemas even when schema_version is current', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const dbPath = join(vaultPath, '.nexusky', 'index.db')
    const oldDb = new Database(dbPath)
    oldDb.exec(`
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        content_hash TEXT NOT NULL
      );
      CREATE TABLE links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_title TEXT NOT NULL
      );
      INSERT INTO links (target_title) VALUES ('Legacy Target');
      CREATE TABLE conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE kanban_tasks (
        id TEXT PRIMARY KEY,
        column_id TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (8);
    `)
    oldDb.close()

    const db = getDatabase(vaultPath)
    const links = db.prepare('PRAGMA table_info(links)').all() as { name: string }[]
    const conversations = db.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
    const kanbanTasks = db.prepare('PRAGMA table_info(kanban_tasks)').all() as { name: string }[]

    expect(links.map((column) => column.name)).toEqual(expect.arrayContaining(['context', 'line', 'link_type']))
    expect(conversations.map((column) => column.name)).toEqual(expect.arrayContaining(['sources', 'session_id']))
    expect(kanbanTasks.map((column) => column.name)).toEqual(expect.arrayContaining(['description', 'priority', 'due_date', 'source_note_id', 'source_file_path', 'created_at', 'updated_at']))
    expect(db.prepare('SELECT COUNT(*) as count FROM links').get()).toEqual({ count: 0 })
    expect(() => db.prepare("INSERT INTO links (source_note_id, target_title, context, line, link_type) VALUES ('n1', 'Target', 'ctx', 3, 'explicit')").run()).not.toThrow()

    closeDatabase()
  })

  it('should index a markdown file', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'test.md')
    writeFileSync(filePath, '# Test Note\n\nHello world\n\n[[Other Note]]\n\n#tag1 #tag2')

    indexNote(vaultPath, filePath)

    const notes = getAllNotes(vaultPath)
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('Test Note')

    closeDatabase()
  })

  it('should index Obsidian nested tags from note body', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllTags } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'nested-tags.md')
    writeFileSync(filePath, '# Nested Tags\n\n#project/research #area/中文')

    indexNote(vaultPath, filePath)

    expect(getAllTags(vaultPath).map((tag) => tag.name).sort()).toEqual(['area/中文', 'project/research'])

    closeDatabase()
  })

  it('should ignore Obsidian comments while indexing searchable structure', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getAllTags, getAllTasks, getOutgoingLinks, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const notePath = join(vaultPath, 'Visible.md')
    const hiddenTargetPath = join(vaultPath, 'Hidden Target.md')
    const visibleTargetPath = join(vaultPath, 'Visible Target.md')
    writeFileSync(hiddenTargetPath, '# Hidden Target\n')
    writeFileSync(visibleTargetPath, '# Visible Target\n')
    writeFileSync(notePath, [
      '# Visible Note',
      '%%',
      'title:: Hidden Title',
      'alias:: Hidden Alias',
      'tags:: #hidden-property',
      '[[Hidden Target]]',
      '#hidden-tag',
      '- [ ] Hidden task',
      '%%',
      '[[Visible Target]]',
      '#visible-tag',
      '- [ ] Visible task',
      'status:: active'
    ].join('\n'))

    indexNote(vaultPath, hiddenTargetPath)
    indexNote(vaultPath, visibleTargetPath)
    indexNote(vaultPath, notePath)

    const note = getAllNotes(vaultPath).find((item) => item.filePath === 'Visible.md')
    expect(note).toBeTruthy()
    expect(note!.title).toBe('Visible Note')
    expect(getOutgoingLinks(vaultPath, note!.id)).toEqual([
      { targetTitle: 'Visible Target', targetPath: 'Visible Target.md', line: 10, context: '[[Visible Target]]', resolved: true }
    ])
    expect(getAllTags(vaultPath).map((tag) => tag.name).sort()).toEqual(['visible-tag'])
    expect(getAllTasks(vaultPath).filter((task) => task.filePath === 'Visible.md')).toEqual([
      { text: 'Visible task', done: false, noteTitle: 'Visible Note', filePath: 'Visible.md' }
    ])
    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Visible.md')
    expect(row?.properties).toMatchObject({ title: 'Visible Note', aliases: [], tags: ['visible-tag'], status: 'active' })
    expect(row?.properties).not.toHaveProperty('alias')

    closeDatabase()
  })

  it('should ignore markdown code while indexing searchable structure', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getAllTags, getAllTasks, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    const notePath = join(vaultPath, 'Code.md')
    const hiddenTargetPath = join(vaultPath, 'Hidden Code Target.md')
    const visibleTargetPath = join(vaultPath, 'Visible Code Target.md')
    writeFileSync(hiddenTargetPath, '# Hidden Code Target\n')
    writeFileSync(visibleTargetPath, '# Visible Code Target\n')
    writeFileSync(notePath, [
      '# Code Note',
      '',
      '`[[Hidden Inline]] #hidden-inline`',
      '',
      '```',
      '[[Hidden Code Target]]',
      '#hidden-code',
      '- [ ] Hidden code task',
      '```',
      '',
      '[[Visible Code Target]]',
      '#visible-code',
      '- [ ] Visible code task'
    ].join('\n'))

    indexNote(vaultPath, hiddenTargetPath)
    indexNote(vaultPath, visibleTargetPath)
    indexNote(vaultPath, notePath)

    const note = getAllNotes(vaultPath).find((item) => item.filePath === 'Code.md')
    expect(note).toBeTruthy()
    expect(getOutgoingLinks(vaultPath, note!.id)).toEqual([
      { targetTitle: 'Visible Code Target', targetPath: 'Visible Code Target.md', line: 11, context: '[[Visible Code Target]]', resolved: true }
    ])
    expect(getAllTags(vaultPath).map((tag) => tag.name).sort()).toEqual(['visible-code'])
    expect(getAllTasks(vaultPath).filter((task) => task.filePath === 'Code.md')).toEqual([
      { text: 'Visible code task', done: false, noteTitle: 'Code Note', filePath: 'Code.md' }
    ])

    closeDatabase()
  })

  it('should skip re-indexing unchanged files', async () => {
    const { getDatabase, closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'test.md')
    writeFileSync(filePath, '# Unchanged\n\nContent here')

    indexNote(vaultPath, filePath)
    indexNote(vaultPath, filePath)

    const db = getDatabase(vaultPath)
    const count = db.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }
    expect(count.c).toBe(1)

    closeDatabase()
  })

  it('should find unlinked mentions without duplicating explicit backlinks', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingUnlinkedMentions, getUnlinkedMentions } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Project.md')
    const plainMentionPath = join(vaultPath, 'Planning.md')
    const linkedMentionPath = join(vaultPath, 'Linked.md')
    const aliasTargetPath = join(vaultPath, 'Roadmap.md')
    const shortAliasPath = join(vaultPath, 'Plan.md')

    writeFileSync(targetPath, '# Project\n\nCanonical project note.')
    writeFileSync(plainMentionPath, '# Planning\n\nProject needs a clearer roadmap.')
    writeFileSync(linkedMentionPath, '# Linked\n\nSee [[Project]] for details.')
    writeFileSync(aliasTargetPath, '---\naliases:\n  - Plan\n---\n# Roadmap\n\nRoadmap note.')
    writeFileSync(shortAliasPath, '# Plan\n\nShort title should not match inside Planning.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, plainMentionPath)
    indexNote(vaultPath, linkedMentionPath)
    indexNote(vaultPath, aliasTargetPath)
    indexNote(vaultPath, shortAliasPath)

    const project = getAllNotes(vaultPath).find((note) => note.title === 'Project')
    const planning = getAllNotes(vaultPath).find((note) => note.title === 'Planning')
    const plan = getAllNotes(vaultPath).find((note) => note.title === 'Plan')
    expect(project).toBeTruthy()
    expect(planning).toBeTruthy()
    expect(plan).toBeTruthy()

    const mentions = getUnlinkedMentions(vaultPath, project!.id)
    expect(mentions).toHaveLength(1)
    expect(mentions[0].sourceTitle).toBe('Planning')
    expect(mentions[0].mention).toBe('Project')
    expect(mentions[0].line).toBe(3)
    expect(mentions[0].context).toContain('Project needs')

    const outgoingMentions = getOutgoingUnlinkedMentions(vaultPath, planning!.id)
    expect(outgoingMentions.map((mention) => mention.targetTitle).sort()).toEqual(['Project', 'Roadmap'])
    expect(outgoingMentions.find((mention) => mention.targetTitle === 'Roadmap')?.mention).toBe('Roadmap')
    expect(outgoingMentions.every((mention) => mention.line === 3)).toBe(true)
    expect(getUnlinkedMentions(vaultPath, plan!.id)).toHaveLength(0)
    expect(getOutgoingUnlinkedMentions(vaultPath, getAllNotes(vaultPath).find((note) => note.title === 'Linked')!.id)).toHaveLength(0)

    closeDatabase()
  })

  it('should ignore markdown code while finding unlinked mentions', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingUnlinkedMentions, getUnlinkedMentions } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Project.md')
    const sourcePath = join(vaultPath, 'Code Mentions.md')
    writeFileSync(targetPath, '# Project\n\nCanonical project note.')
    writeFileSync(sourcePath, [
      '# Code Mentions',
      '',
      '`Project` should stay literal.',
      '',
      '```',
      'Project hidden in code.',
      '```',
      '',
      'Project visible mention.'
    ].join('\n'))

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const project = getAllNotes(vaultPath).find((note) => note.title === 'Project')
    const source = getAllNotes(vaultPath).find((note) => note.title === 'Code Mentions')
    expect(project).toBeTruthy()
    expect(source).toBeTruthy()

    expect(getUnlinkedMentions(vaultPath, project!.id)).toEqual([
      { sourceTitle: 'Code Mentions', sourcePath: 'Code Mentions.md', line: 9, context: 'Project visible mention.', mention: 'Project' }
    ])
    expect(getOutgoingUnlinkedMentions(vaultPath, source!.id)).toEqual([
      { targetTitle: 'Project', targetPath: 'Project.md', line: 9, context: 'Project visible mention.', mention: 'Project' }
    ])

    closeDatabase()
  })

  it('should return resolved and unresolved outgoing links', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Target.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(targetPath, '# Target\n\nLinked note.')
    writeFileSync(sourcePath, '# Source\n\nSee [[Target]].\n\nSee [[Missing Note]] for context.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(source).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(2)
    expect(links.find((link) => link.targetTitle === 'Target')).toMatchObject({ targetPath: 'Target.md', line: 3, resolved: true })
    expect(links.find((link) => link.targetTitle === 'Missing Note')).toMatchObject({ line: 5, resolved: false })

    closeDatabase()
  })

  it('should resolve existing unresolved links when the target note is indexed later', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    const sourcePath = join(vaultPath, 'Source.md')
    const targetPath = join(vaultPath, 'Later Target.md')

    writeFileSync(sourcePath, '# Source\n\nSee [[Later Target]] when it exists.')
    indexNote(vaultPath, sourcePath)

    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(source).toBeTruthy()
    expect(getOutgoingLinks(vaultPath, source!.id)[0]).toMatchObject({ targetTitle: 'Later Target', resolved: false, line: 3 })

    writeFileSync(targetPath, '# Later Target\n\nCreated after the source link.')
    indexNote(vaultPath, targetPath)

    expect(getOutgoingLinks(vaultPath, source!.id)[0]).toMatchObject({ targetTitle: 'Later Target', targetPath: 'Later Target.md', resolved: true, line: 3 })

    closeDatabase()
  })

  it('should index markdown tasks with source note metadata', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllTasks } = await import('../packages/main/src/services/indexer')

    const filePath = join(vaultPath, 'Tasks.md')
    writeFileSync(filePath, '# Tasks\n\n- [ ] Open item\n- [x] Done item')

    indexNote(vaultPath, filePath)

    expect(getAllTasks(vaultPath)).toEqual([
      { text: 'Open item', done: false, noteTitle: 'Tasks', filePath: 'Tasks.md' },
      { text: 'Done item', done: true, noteTitle: 'Tasks', filePath: 'Tasks.md' },
    ])

    closeDatabase()
  })

  it('should resolve Obsidian heading wikilinks to the note target', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Target.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(targetPath, '# Target\n\n## Details\n\nLinked note.')
    writeFileSync(sourcePath, '# Source\n\nSee [[Target#Details]] and [[Target#Details|details]].')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(source).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(2)
    expect(links.every((link) => link.targetTitle === 'Target')).toBe(true)
    expect(links.every((link) => link.targetPath === 'Target.md' && link.resolved)).toBe(true)

    closeDatabase()
  })

  it('should resolve Obsidian path wikilinks to nested notes', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks, getGraphData } = await import('../packages/main/src/services/indexer')

    mkdirSync(join(vaultPath, 'Folder'), { recursive: true })
    const targetPath = join(vaultPath, 'Folder', 'Target.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(sourcePath, '# Source\n\nSee [[Folder/Target]] and [[Folder/Target.md#Details|details]].')
    writeFileSync(targetPath, '# Target\n\n## Details\n\nNested note.')

    indexNote(vaultPath, sourcePath)
    indexNote(vaultPath, targetPath)

    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    const target = getAllNotes(vaultPath).find((note) => note.filePath === 'Folder/Target.md')
    expect(source).toBeTruthy()
    expect(target).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(2)
    expect(links.every((link) => link.targetTitle === 'Folder/Target')).toBe(true)
    expect(links.every((link) => link.targetPath === 'Folder/Target.md' && link.resolved)).toBe(true)

    const graph = getGraphData(vaultPath)
    expect(graph.edges).toContainEqual({ source: source!.id, target: target!.id })

    closeDatabase()
  })

  it('should resolve wikilinks case-insensitively by title, path, and alias', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks, getGraphData } = await import('../packages/main/src/services/indexer')

    mkdirSync(join(vaultPath, 'Folder'), { recursive: true })
    const sourcePath = join(vaultPath, 'Source.md')
    const titleTargetPath = join(vaultPath, 'Project.md')
    const pathTargetPath = join(vaultPath, 'Folder', 'Target.md')
    const aliasTargetPath = join(vaultPath, 'Canonical.md')

    writeFileSync(sourcePath, '# Source\n\nSee [[project]], [[folder/target]], and [[alias name]].')
    writeFileSync(titleTargetPath, '# Project\n\nTitle target.')
    writeFileSync(pathTargetPath, '# Target\n\nPath target.')
    writeFileSync(aliasTargetPath, '---\naliases:\n  - Alias Name\n---\n# Canonical\n\nAlias target.')

    indexNote(vaultPath, sourcePath)
    indexNote(vaultPath, titleTargetPath)
    indexNote(vaultPath, pathTargetPath)
    indexNote(vaultPath, aliasTargetPath)

    const notes = getAllNotes(vaultPath)
    const source = notes.find((note) => note.title === 'Source')
    const project = notes.find((note) => note.filePath === 'Project.md')
    const target = notes.find((note) => note.filePath === 'Folder/Target.md')
    const canonical = notes.find((note) => note.filePath === 'Canonical.md')
    expect(source).toBeTruthy()
    expect(project).toBeTruthy()
    expect(target).toBeTruthy()
    expect(canonical).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(3)
    expect(links.map((link) => link.targetPath).sort()).toEqual(['Canonical.md', 'Folder/Target.md', 'Project.md'])
    expect(links.every((link) => link.resolved)).toBe(true)

    const graph = getGraphData(vaultPath)
    expect(graph.edges).toContainEqual({ source: source!.id, target: project!.id })
    expect(graph.edges).toContainEqual({ source: source!.id, target: target!.id })
    expect(graph.edges).toContainEqual({ source: source!.id, target: canonical!.id })

    closeDatabase()
  })

  it('should not guess case-insensitive wikilinks when multiple notes match', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks, getGraphData } = await import('../packages/main/src/services/indexer')

    const sourcePath = join(vaultPath, 'Source.md')
    const upperTargetPath = join(vaultPath, 'Upper.md')
    const lowerTargetPath = join(vaultPath, 'Lower.md')

    writeFileSync(sourcePath, '# Source\n\nSee [[PROJECT]].')
    writeFileSync(upperTargetPath, '# Project\n\nUpper title.')
    writeFileSync(lowerTargetPath, '# project\n\nLower title.')

    indexNote(vaultPath, sourcePath)
    indexNote(vaultPath, upperTargetPath)
    indexNote(vaultPath, lowerTargetPath)

    const notes = getAllNotes(vaultPath)
    const source = notes.find((note) => note.title === 'Source')
    expect(source).toBeTruthy()

    const links = getOutgoingLinks(vaultPath, source!.id)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ targetTitle: 'PROJECT', resolved: false })
    expect(links[0].targetPath).toBeUndefined()

    expect(getGraphData(vaultPath).edges.some((edge) => edge.source === source!.id)).toBe(false)

    closeDatabase()
  })

  it('should resolve wikilinks through frontmatter aliases', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getBacklinks, getOutgoingLinks, getGraphData } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Canonical.md')
    const sourcePath = join(vaultPath, 'Source.md')

    writeFileSync(targetPath, '---\naliases:\n  - Alias Name\n  - Short Alias\n---\n# Canonical\n\nTarget note.')
    writeFileSync(sourcePath, '# Source\n\nSee [[Alias Name]] for details.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const canonical = getAllNotes(vaultPath).find((note) => note.title === 'Canonical')
    const source = getAllNotes(vaultPath).find((note) => note.title === 'Source')
    expect(canonical).toBeTruthy()
    expect(source).toBeTruthy()

    const outgoing = getOutgoingLinks(vaultPath, source!.id)
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0]).toMatchObject({ targetTitle: 'Alias Name', targetPath: 'Canonical.md', resolved: true })

    const backlinks = getBacklinks(vaultPath, canonical!.id)
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].sourceTitle).toBe('Source')
    expect(backlinks[0].line).toBe(3)

    const graph = getGraphData(vaultPath)
    expect(graph.edges).toContainEqual({ source: source!.id, target: canonical!.id })

    closeDatabase()
  })

  it('should build property table rows from frontmatter and index metadata', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const notePath = join(vaultPath, 'Project.md')
    writeFileSync(notePath, [
      '---',
      'title: Project Display',
      'aliases:',
      '  - Project Alias',
      'tags: "#research #active"',
      'status: active',
      'priority: 2',
      'cssclass: wide-page',
      '---',
      '# Project',
      '',
      'Body.'
    ].join('\n'))

    indexNote(vaultPath, notePath)

    const rows = getPropertyRows(vaultPath)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      title: 'Project Display',
      filePath: 'Project.md',
      properties: {
        title: 'Project Display',
        aliases: ['Project Alias'],
        tags: ['active', 'research'],
        status: 'active',
        priority: 2,
        cssclasses: ['wide-page']
      }
    })

    closeDatabase()
  })

  it('should index Obsidian Dataview inline fields as properties', async () => {
    const { closeDatabase } = await import('../packages/main/src/services/database')
    const { indexNote, getAllNotes, getOutgoingLinks, getPropertyRows } = await import('../packages/main/src/services/indexer')

    const targetPath = join(vaultPath, 'Project.md')
    const sourcePath = join(vaultPath, 'Source.md')
    writeFileSync(targetPath, [
      '# Project',
      '',
      'title:: Inline Project',
      'alias:: Inline Alias',
      'status:: active',
      'priority:: 2',
      'published:: true',
      'tags:: #research, active',
      'cssclass:: wide-page'
    ].join('\n'))
    writeFileSync(sourcePath, '# Source\n\nSee [[Inline Alias]] for context.')

    indexNote(vaultPath, targetPath)
    indexNote(vaultPath, sourcePath)

    const project = getAllNotes(vaultPath).find((note) => note.filePath === 'Project.md')
    const source = getAllNotes(vaultPath).find((note) => note.filePath === 'Source.md')
    expect(project).toBeTruthy()
    expect(source).toBeTruthy()
    expect(project!.title).toBe('Inline Project')

    expect(getOutgoingLinks(vaultPath, source!.id)[0]).toMatchObject({ targetPath: 'Project.md', resolved: true })

    const row = getPropertyRows(vaultPath).find((item) => item.filePath === 'Project.md')
    expect(row).toMatchObject({
      properties: {
        title: 'Inline Project',
        aliases: ['Inline Alias'],
        tags: ['active', 'research'],
        status: 'active',
        priority: 2,
        published: true,
        cssclasses: ['wide-page']
      }
    })

    closeDatabase()
  })
})
