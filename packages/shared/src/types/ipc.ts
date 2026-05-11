export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  mtime?: number
}

export interface NoteSearchResult {
  id: string
  title: string
  filePath: string
}

export interface BacklinkResult {
  sourceTitle: string
  sourcePath: string
  context: string
}

export interface GraphData {
  nodes: { id: string; title: string }[]
  edges: { source: string; target: string }[]
}

export interface IPCChannelMap {
  'file:read': { params: { path: string }; result: string }
  'file:stat': { params: { path: string }; result: { size: number; mtime: number } }
  'file:write': { params: { path: string; content: string; vaultPath?: string }; result: void }
  'file:list': { params: { dirPath: string }; result: FileEntry[] }
  'file:list-shallow': { params: { dirPath: string }; result: FileEntry[] }
  'file:create': { params: { path: string; content?: string }; result: void }
  'file:delete': { params: { path: string; vaultPath?: string }; result: void }
  'file:rename': { params: { oldPath: string; newPath: string; vaultPath?: string }; result: void }
  'file:save-image': { params: { vaultPath: string; imageData: string; fileName: string }; result: string }
  'file:get-history': { params: { vaultPath: string; filePath: string }; result: { fileName: string; path: string; timestamp: string }[] }
  'file:restore-history': { params: { snapshotPath: string; targetPath: string }; result: void }
  'file:encrypt': { params: { path: string; password: string }; result: boolean }
  'file:decrypt': { params: { path: string; password: string }; result: { success: boolean; content?: string; error?: string } }
  'file:list-trash': { params: { vaultPath: string }; result: { fileName: string; originalName: string; path: string }[] }
  'file:restore-trash': { params: { trashPath: string; vaultPath: string }; result: void }
  'file:empty-trash': { params: { vaultPath: string }; result: void }
  'export:html': { params: { content: string; title: string }; result: boolean }
  'export:pdf': { params: { content: string; title: string }; result: boolean }
  'export:share': { params: { content: string; title: string }; result: string }
  'vault:select': { params: undefined; result: string | null }
  'vault:create': { params: { name: string }; result: string | null }
  'vault:get': { params: undefined; result: string | null }
  'vault:get-recent': { params: undefined; result: string[] }
  'vault:clear-current': { params: undefined; result: void }
  'db:index-vault': { params: { vaultPath: string }; result: { indexed: number } }
  'db:index-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:remove-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:get-all-notes': { params: { vaultPath: string }; result: NoteSearchResult[] }
  'db:get-backlinks': { params: { vaultPath: string; noteId: string }; result: BacklinkResult[] }
  'db:get-graph': { params: { vaultPath: string }; result: GraphData }
  'db:search-notes': { params: { vaultPath: string; query: string }; result: NoteSearchResult[] }
  'db:semantic-search': { params: { vaultPath: string; query: string }; result: { noteId: string; title: string; filePath: string; chunk: string; score: number }[] }
  'db:fulltext-search': { params: { vaultPath: string; query: string }; result: { filePath: string; title: string; line: string; lineNumber: number }[] }
  'db:get-tags': { params: { vaultPath: string }; result: { name: string; count: number }[] }
  'db:get-notes-by-tag': { params: { vaultPath: string; tag: string }; result: NoteSearchResult[] }
  'db:embed-note': { params: { vaultPath: string; noteId: string; content: string }; result: void }
  'db:embed-vault': { params: { vaultPath: string }; result: { embedded: number } }
  'ai:get-providers': { params: undefined; result: any[] }
  'ai:save-providers': { params: { providers: any[] }; result: void }
  'ai:set-active': { params: { providerId: string }; result: void }
  'ai:validate': { params: { config: any }; result: boolean }
  'ai:chat': { params: { messages: { role: string; content: string }[] }; result: void }
  'ai:complete': { params: { text: string }; result: string }
  'ai:list-ollama-models': { params: { baseUrl?: string }; result: string[] }
  'ai:suggest-tags': { params: { content: string; existingTags: string[] }; result: string[] }
  'ai:summarize': { params: { content: string }; result: string }
  'ai:detect-local-config': { params: undefined; result: { claude?: { apiKey: string; baseUrl: string }; openai?: { apiKey: string } } }
  'ai:edit': { params: { instruction: string; fileContent: string; filePath: string; images?: string[]; history?: string[] }; result: { success: boolean; content?: string; error?: string } }
  'file:import-obsidian': { params: { sourcePath: string; vaultPath: string }; result: { imported: number; converted: number } }
  'template:daily-note': { params: { vaultPath: string }; result: string }
  'template:get-templates': { params: undefined; result: { id: string; name: string; content: string }[] }
  'template:save-templates': { params: { templates: { id: string; name: string; content: string }[] }; result: void }
  'template:create-from': { params: { vaultPath: string; templateId: string; title: string }; result: string | null }
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
  'cloud:get-icloud-path': { params: undefined; result: string | null }
  'cloud:set-icloud-path': { params: { path: string }; result: void }
  'cloud:push-index': { params: { vaultPath: string }; result: boolean }
  'cloud:pull-index': { params: { vaultPath: string }; result: boolean }
  'cloud:sync-index': { params: { vaultPath: string }; result: { pushed: boolean; pulled: boolean } }
  'cloud:get-sync-exclude': { params: undefined; result: string[] }
  'cloud:set-sync-exclude': { params: { paths: string[] }; result: void }
}

export type IPCChannel = keyof IPCChannelMap
