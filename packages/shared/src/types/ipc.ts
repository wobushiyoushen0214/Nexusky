export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
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
  'file:write': { params: { path: string; content: string }; result: void }
  'file:list': { params: { dirPath: string }; result: FileEntry[] }
  'file:create': { params: { path: string; content?: string }; result: void }
  'file:delete': { params: { path: string }; result: void }
  'file:rename': { params: { oldPath: string; newPath: string }; result: void }
  'vault:select': { params: undefined; result: string | null }
  'vault:create': { params: { name: string }; result: string | null }
  'vault:get': { params: undefined; result: string | null }
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
  'cloud:sync': { params: { vaultPath: string }; result: { total: number; synced: number; errors: string[] } }
  'cloud:push-file': { params: { vaultPath: string; filePath: string }; result: boolean }
}

export type IPCChannel = keyof IPCChannelMap
