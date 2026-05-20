export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  mtime?: number
}

export interface TrashEntry {
  fileName: string
  originalName: string
  originalPath?: string
  path: string
  deletedAt?: number
}

export interface NoteSearchResult {
  id: string
  title: string
  filePath: string
  aliasMatch?: string
}

export type PropertyValue = string | number | boolean | (string | number | boolean)[] | null

export interface PropertyTableRow {
  id: string
  title: string
  filePath: string
  createdAt: number
  updatedAt: number
  properties: Record<string, PropertyValue>
}

export interface PluginCommand {
  id: string
  title: string
  description?: string
  prompt: string
  mode?: 'chat' | 'edit'
}

export interface PluginPanel {
  id: string
  title: string
  description?: string
  content?: string
}

export interface PluginEditorExtension {
  id: string
  title: string
  description?: string
  kind: 'markdown' | 'toolbar' | 'slash'
}

export interface LocalPlugin {
  id: string
  name: string
  version?: string
  commands: PluginCommand[]
  panels: PluginPanel[]
  editorExtensions: PluginEditorExtension[]
}

export interface PluginMarketplaceItem extends LocalPlugin {
  author: string
  tags: string[]
  installed: boolean
}

export interface CssSnippet {
  name: string
  path: string
  content: string
}

export interface ThemePackage {
  id: string
  name: string
  path: string
  version?: string
  author?: string
  description?: string
  colors: Record<string, string>
}

export interface NoteTemplate {
  id: string
  name: string
  content: string
  description?: string
  category?: string
}

export interface TemplateMarketplaceItem extends NoteTemplate {
  author: string
  tags: string[]
  installed: boolean
}

export interface BacklinkResult {
  sourceTitle: string
  sourcePath: string
  line: number
  context: string
}

export interface OutgoingLinkResult {
  targetTitle: string
  targetPath?: string
  line: number
  context: string
  resolved: boolean
}

export interface UnlinkedMentionResult {
  sourceTitle: string
  sourcePath: string
  line: number
  context: string
  mention: string
}

export interface GraphNode {
  id: string
  title: string
  filePath?: string
  type: 'file' | 'folder'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: { source: string; target: string }[]
}

export interface KanbanColumn {
  id: string
  name: string
  sortOrder: number
}

export interface KanbanTask {
  id: string
  columnId: string
  title: string
  description: string
  sortOrder: number
  priority: number
  dueDate: string | null
  sourceNoteId?: string | null
  sourceFilePath?: string | null
  sourceTitle?: string | null
  createdAt: number
  updatedAt: number
}

export interface KanbanRelation {
  id: string
  sourceTaskId: string
  targetTaskId: string
  relationType: 'blocks' | 'depends_on' | 'related'
}

export interface KanbanAiPlan {
  tasks: { title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }[]
  relations: { sourceIndex: number; targetIndex: number; relationType: KanbanRelation['relationType'] }[]
}

export interface EmbeddingStatus {
  state: 'idle' | 'indexing' | 'done' | 'error'
  current: number
  total: number
  embedded: number
  message?: string
  updatedAt: number
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface IPCChatMessage {
  role: ChatRole
  content: string | ChatContentPart[]
}

export interface ChatSource {
  title: string
  filePath: string
  chunk: string
  score: number
}

export type ChatHistoryRole = 'user' | 'assistant'

export interface ChatHistoryEntry {
  id: string
  role: ChatHistoryRole
  content: string
  sources?: ChatSource[]
}

export interface AIStreamEvent {
  type: 'text' | 'done' | 'error' | 'retry' | 'tool_call'
  content: string
}

export interface AINotesProgress {
  stage: 'planning' | 'planned' | 'generating' | 'indexing' | 'index-error' | 'done' | string
  message: string
  plan?: { title: string; brief?: string }[]
  current?: number
  total?: number
}

export interface GeneratedFlashcard {
  type: 'basic' | 'cloze'
  front: string
  back: string
  tags: string[]
}

export type FlashcardReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface FlashcardQueueItem extends GeneratedFlashcard {
  title: string
  filePath: string
  startLine: number
  endLine: number
  sourceTitle?: string
  status: string
  interval: number
  ease: number
  due: string
}

export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'openai-responses' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface AIProviderValidationResult {
  ok: boolean
  error?: string
}

export interface IPCChannelMap {
  'file:read': { params: { path: string }; result: string }
  'file:stat': { params: { path: string }; result: { size: number; mtime: number } }
  'file:write': { params: { path: string; content: string; vaultPath?: string }; result: void }
  'file:list': { params: { dirPath: string }; result: FileEntry[] }
  'file:list-shallow': { params: { dirPath: string }; result: FileEntry[] }
  'file:create': { params: { path: string; content?: string; vaultPath?: string }; result: void }
  'file:reveal': { params: { path: string }; result: void }
  'file:delete': { params: { path: string; vaultPath?: string }; result: void }
  'file:rename': { params: { oldPath: string; newPath: string; vaultPath?: string }; result: void }
  'file:save-image': { params: { vaultPath: string; imageData: string; fileName: string }; result: string }
  'file:get-history': { params: { vaultPath: string; filePath: string }; result: { fileName: string; path: string; timestamp: string }[] }
  'file:restore-history': { params: { snapshotPath: string; targetPath: string }; result: void }
  'file:encrypt': { params: { path: string; password: string }; result: boolean }
  'file:decrypt': { params: { path: string; password: string }; result: { success: boolean; content?: string; error?: string } }
  'file:list-trash': { params: { vaultPath: string }; result: TrashEntry[] }
  'file:restore-trash': { params: { trashPath: string; vaultPath: string }; result: void }
  'file:empty-trash': { params: { vaultPath: string }; result: void }
  'export:html': { params: { content: string; title: string }; result: boolean }
  'export:pdf': { params: { content: string; title: string }; result: boolean }
  'export:share': { params: { content: string; title: string }; result: string }
  'export:publish-vault': { params: { vaultPath: string }; result: { ok: boolean; outputPath?: string; files: number } }
  'vault:select': { params: undefined; result: string | null }
  'vault:create': { params: { name: string }; result: string | null }
  'vault:get': { params: undefined; result: string | null }
  'vault:get-recent': { params: undefined; result: string[] }
  'vault:clear-current': { params: undefined; result: void }
  'db:index-vault': { params: { vaultPath: string }; result: { indexed: number } }
  'db:index-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:remove-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:remove-folder': { params: { vaultPath: string; folderPath: string }; result: void }
  'db:get-all-notes': { params: { vaultPath: string }; result: NoteSearchResult[] }
  'db:get-property-rows': { params: { vaultPath: string }; result: PropertyTableRow[] }
  'db:get-recent-notes': { params: { vaultPath: string; limit?: number }; result: NoteSearchResult[] }
  'db:get-outgoing-links': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: OutgoingLinkResult[] }
  'db:get-backlinks': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: BacklinkResult[] }
  'db:get-unlinked-mentions': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: UnlinkedMentionResult[] }
  'db:get-graph': { params: { vaultPath: string }; result: GraphData }
  'db:search-notes': { params: { vaultPath: string; query: string }; result: NoteSearchResult[] }
  'db:semantic-search': { params: { vaultPath: string; query: string }; result: { noteId: string; title: string; filePath: string; chunk: string; score: number }[] }
  'db:fulltext-search': { params: { vaultPath: string; query: string; regex?: boolean }; result: { filePath: string; title: string; line: string; lineNumber: number }[] }
  'db:get-tags': { params: { vaultPath: string }; result: { name: string; count: number }[] }
  'db:get-notes-by-tag': { params: { vaultPath: string; tag: string }; result: NoteSearchResult[] }
  'flashcards:list-due': { params: { vaultPath: string; today?: string; limit?: number }; result: { cards: FlashcardQueueItem[]; total: number } }
  'flashcards:review': { params: { vaultPath: string; filePath: string; startLine: number; rating: FlashcardReviewRating; reviewedAt?: string }; result: { ok: boolean; card?: FlashcardQueueItem; error?: string } }
  'kanban:get-columns': { params: { vaultPath: string }; result: KanbanColumn[] }
  'kanban:create-column': { params: { vaultPath: string; id: string; name: string }; result: void }
  'kanban:rename-column': { params: { vaultPath: string; id: string; name: string }; result: void }
  'kanban:delete-column': { params: { vaultPath: string; id: string }; result: void }
  'kanban:reorder-columns': { params: { vaultPath: string; columnIds: string[] }; result: void }
  'kanban:get-tasks': { params: { vaultPath: string }; result: KanbanTask[] }
  'kanban:create-task': { params: { vaultPath: string; id: string; columnId: string; title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }; result: void }
  'kanban:update-task': { params: { vaultPath: string; id: string; title?: string; description?: string; columnId?: string; sortOrder?: number; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }; result: void }
  'kanban:delete-task': { params: { vaultPath: string; id: string }; result: void }
  'kanban:move-task': { params: { vaultPath: string; taskId: string; columnId: string; sortOrder: number }; result: void }
  'kanban:reorder-tasks': { params: { vaultPath: string; moves: { id: string; columnId: string; sortOrder: number }[] }; result: void }
  'kanban:get-relations': { params: { vaultPath: string; taskId?: string }; result: KanbanRelation[] }
  'kanban:create-relation': { params: { vaultPath: string; id: string; sourceTaskId: string; targetTaskId: string; relationType: KanbanRelation['relationType'] }; result: void }
  'kanban:delete-relation': { params: { vaultPath: string; id: string }; result: void }
  'kanban:ai-analyze': { params: { vaultPath: string }; result: { summary: string } }
  'kanban:ai-breakdown-task': { params: { vaultPath: string; taskId?: string; title: string; description?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }; result: { tasks: KanbanTask[] | KanbanAiPlan['tasks']; relations: KanbanRelation[] | KanbanAiPlan['relations']; summary: string; plan?: KanbanAiPlan } }
  'kanban:ai-from-note': { params: { vaultPath: string; filePath: string; content?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }; result: { tasks: KanbanTask[] | KanbanAiPlan['tasks']; relations: KanbanRelation[] | KanbanAiPlan['relations']; summary: string; plan?: KanbanAiPlan } }
  'db:embed-note': { params: { vaultPath: string; noteId: string; content: string }; result: void }
  'db:embed-vault': { params: { vaultPath: string }; result: { embedded: number } }
  'db:embedding-status': { params: { vaultPath: string }; result: EmbeddingStatus }
  'db:chat-history-load': { params: { vaultPath: string; sessionId?: string }; result: ChatHistoryEntry[] }
  'db:chat-history-append': { params: { vaultPath: string; role: ChatHistoryRole; content: string; sources?: ChatSource[]; sessionId?: string }; result: void }
  'db:chat-history-clear': { params: { vaultPath: string; sessionId?: string }; result: void }
  'db:chat-sessions-list': { params: { vaultPath: string }; result: { id: string; title: string; createdAt: number; updatedAt: number }[] }
  'db:chat-session-create': { params: { vaultPath: string; id: string; title: string }; result: void }
  'db:chat-session-delete': { params: { vaultPath: string; sessionId: string }; result: void }
  'db:chat-session-rename': { params: { vaultPath: string; sessionId: string; title: string }; result: void }
  'ai:get-providers': { params: undefined; result: AIProviderConfig[] }
  'ai:save-providers': { params: { providers: AIProviderConfig[] }; result: void }
  'ai:set-active': { params: { providerId: string }; result: void }
  'ai:get-active-provider': { params: undefined; result: string | null }
  'ai:validate': { params: { config: AIProviderConfig }; result: AIProviderValidationResult }
  'ai:chat': { params: { messages: IPCChatMessage[]; vaultPath?: string; systemPrompt?: string }; result: void }
  'ai:chat-agent': { params: { messages: IPCChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null }; result: void }
  'ai:detect-intent': { params: { messages: IPCChatMessage[]; intents?: string[]; intentContext?: string }; result: { intent?: string } }
  'ai:stop': { params: undefined; result: void }
  'ai:complete': { params: { text: string; system?: string; temperature?: number; taskKey?: string; styleSource?: string }; result: string }
  'ai:complete-abort': { params: { taskKey?: string } | undefined; result: void }
  'ai:transcribe': { params: { audioData: string; mimeType?: string; fileName?: string; model?: string; language?: string }; result: { success: boolean; text?: string; error?: string } }
  'ai:get-system-prompt': { params: undefined; result: string }
  'ai:set-system-prompt': { params: { prompt: string }; result: void }
  'ai:infer-links': { params: { vaultPath: string; filePaths: string[] }; result: { success: boolean; added?: number; error?: string } }
  'ai:infer-global-links': { params: { vaultPath: string }; result: { success: boolean; added?: number; error?: string } }
  'ai:generate-memories': { params: { vaultPath: string }; result: { success: boolean; generated: number; skipped: number; failed: number; total: number; totalNotes?: number; limited?: boolean; error?: string } }
  'ai:list-ollama-models': { params: { baseUrl?: string }; result: string[] }
  'ai:suggest-tags': { params: { content: string; existingTags: string[] }; result: string[] }
  'ai:summarize': { params: { content: string }; result: string }
  'ai:generate-flashcards': { params: { content: string; title?: string; maxCards?: number }; result: { success: boolean; cards: GeneratedFlashcard[]; markdown?: string; error?: string } }
  'ai:detect-local-config': { params: undefined; result: { claude?: { apiKey: string; baseUrl: string; source?: string }; openai?: { apiKey: string; source?: string }; codex?: { command: string; source?: string }; skipped?: string[] } }
  'ai:edit': { params: { instruction: string; fileContent: string; filePath: string; images?: string[]; history?: string[] }; result: { success: boolean; content?: string; error?: string } }
  'ai:generate-graph': { params: { filePaths: string[]; vaultPath: string }; result: { success: boolean; content?: string; error?: string } }
  'ai:generate-notes': { params: { instruction: string; vaultPath: string; targetDir?: string }; result: { success: boolean; files: string[]; error?: string } }
  'file:import-obsidian': { params: { sourcePath: string; vaultPath: string }; result: { imported: number; converted: number; indexed: number } }
  'file:import-readwise': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; skipped: number; indexed: number; canceled?: boolean } }
  'file:import-pocket': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; skipped: number; indexed: number; canceled?: boolean } }
  'file:import-notion': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; converted: number; indexed: number; assets: number; skipped: number; canceled?: boolean } }
  'template:daily-note': { params: { vaultPath: string }; result: string }
  'template:get-templates': { params: undefined; result: NoteTemplate[] }
  'template:save-templates': { params: { templates: NoteTemplate[] }; result: void }
  'template:get-marketplace': { params: undefined; result: TemplateMarketplaceItem[] }
  'template:install-marketplace': { params: { templateId: string }; result: { installed: number; templates: NoteTemplate[] } }
  'template:install-marketplace-pack': { params: undefined; result: { installed: number; templates: NoteTemplate[] } }
  'template:list-community': { params: { vaultPath: string }; result: TemplateMarketplaceItem[] }
  'template:install-community-pack': { params: { vaultPath: string }; result: { installed: number; templates: NoteTemplate[] } }
  'template:create-from': { params: { vaultPath: string; templateId: string; title: string }; result: string | null }
  'plugins:list': { params: { vaultPath: string }; result: LocalPlugin[] }
  'plugins:get-marketplace': { params: { vaultPath: string }; result: PluginMarketplaceItem[] }
  'plugins:install-marketplace': { params: { vaultPath: string; pluginId: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'plugins:install-marketplace-pack': { params: { vaultPath: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'snippets:list': { params: { vaultPath: string }; result: CssSnippet[] }
  'themes:list': { params: { vaultPath: string }; result: ThemePackage[] }
  'cloud:get-config': { params: undefined; result: { supabaseUrl: string; supabaseKey: string; serviceRoleKey: string; enabled: boolean } }
  'cloud:save-config': { params: { config: { supabaseUrl: string; supabaseKey: string; serviceRoleKey: string; enabled: boolean } }; result: void }
  'cloud:init': { params: undefined; result: { success: boolean; error?: string } }
  'cloud:sign-in': { params: { email: string; password: string }; result: { success: boolean; error?: string } }
  'cloud:sign-up': { params: { email: string; password: string }; result: { success: boolean; error?: string } }
  'cloud:sign-out': { params: undefined; result: void }
  'cloud:get-user': { params: undefined; result: { email: string } | null }
  'cloud:sync': { params: { vaultPath: string }; result: { total: number; pushed: number; pulled: number; conflicts: { path: string; localHash: string; remoteHash: string; remoteUpdatedAt: string }[]; errors: string[] } }
  'cloud:push-file': { params: { vaultPath: string; filePath: string }; result: boolean }
  'cloud:pull-file': { params: { vaultPath: string; relPath: string }; result: boolean }
  'cloud:pull-all': { params: { vaultPath: string }; result: { total: number; pushed: number; pulled: number; conflicts: { path: string; localHash: string; remoteHash: string; remoteUpdatedAt: string }[]; errors: string[] } }
  'cloud:get-sync-provider': { params: undefined; result: string }
  'cloud:set-sync-provider': { params: { provider: string }; result: void }
  'cloud:get-all-providers': { params: undefined; result: { type: string; name: string; configured: boolean }[] }
  'cloud:test-connection': { params: { provider: string }; result: { ok: boolean; error?: string } }
  'cloud:onedrive-auth': { params: { clientId: string }; result: { success: boolean; error?: string } }
  'cloud:get-onedrive-config': { params: undefined; result: { clientId: string; folder: string; hasToken: boolean } | null }
  'cloud:save-onedrive-config': { params: { clientId: string; folder: string }; result: void }
  'cloud:get-webdav-config': { params: undefined; result: { url: string; username?: string; password?: string; folder: string } }
  'cloud:save-webdav-config': { params: { url: string; username?: string; password?: string; folder: string }; result: void }
  'cloud:get-s3-config': { params: undefined; result: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string } }
  'cloud:save-s3-config': { params: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string }; result: void }
  'cloud:get-icloud-path': { params: undefined; result: string | null }
  'cloud:set-icloud-path': { params: { path: string }; result: void }
  'cloud:push-index': { params: { vaultPath: string }; result: boolean }
  'cloud:pull-index': { params: { vaultPath: string }; result: boolean }
  'cloud:sync-index': { params: { vaultPath: string }; result: { pushed: boolean; pulled: boolean } }
  'cloud:get-sync-exclude': { params: undefined; result: string[] }
  'cloud:set-sync-exclude': { params: { paths: string[] }; result: void }
  'cloud:set-online': { params: { online: boolean }; result: void }
  'updater:check': { params: undefined; result: { available: boolean; version?: string } }
  'updater:download': { params: undefined; result: void }
  'updater:install': { params: undefined; result: void }
  'app:get-version': { params: undefined; result: string }
  'app:open-external': { params: { url: string }; result: void }
}

export type IPCChannel = keyof IPCChannelMap
