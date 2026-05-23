import type { TFunction } from 'i18next'
import { toast } from '../../stores/toast-store'

interface EditorToolMenuParams {
  t: TFunction
  vaultPath: string | null
  currentFilePath: string | null
}

interface MenuItem {
  label: string
  disabled?: boolean
  onClick: () => void
}

const EDITOR_CONTEXT_TOOLS: { name: string; labelKey: string }[] = [
  { name: 'find_similar_notes', labelKey: 'commandPalette.toolSurface.find_similar_notes.label' },
  { name: 'find_connection_opportunities', labelKey: 'commandPalette.toolSurface.find_connection_opportunities.label' },
  { name: 'list_current_note_links', labelKey: 'commandPalette.toolSurface.list_current_note_links.label' },
  { name: 'summarize_current_note_links', labelKey: 'commandPalette.toolSurface.summarize_current_note_links.label' },
  { name: 'list_current_note_unlinked_references', labelKey: 'commandPalette.toolSurface.list_current_note_unlinked_references.label' },
  { name: 'read_current_note_memory', labelKey: 'commandPalette.toolSurface.read_current_note_memory.label' },
  { name: 'list_current_note_tasks', labelKey: 'commandPalette.toolSurface.list_current_note_tasks.label' }
]

export const EDITOR_CONTEXT_TOOL_NAMES = EDITOR_CONTEXT_TOOLS.map((entry) => entry.name)

export function buildEditorToolMenuItems(params: EditorToolMenuParams): MenuItem[] {
  const { t, vaultPath, currentFilePath } = params
  const disabled = !vaultPath || !currentFilePath

  return EDITOR_CONTEXT_TOOLS.map((entry) => ({
    label: t(entry.labelKey, { defaultValue: entry.name }),
    disabled,
    onClick: () => {
      if (!vaultPath) return
      if (!currentFilePath) return
      void runEditorTool(entry, vaultPath, currentFilePath, t)
    }
  }))
}

async function runEditorTool(
  entry: { name: string; labelKey: string },
  vaultPath: string,
  currentFilePath: string,
  t: TFunction
): Promise<void> {
  const result = await window.api.invoke('ai:run-tool', {
    vaultPath,
    toolName: entry.name,
    currentFilePath
  })
  if (result.ok) {
    window.dispatchEvent(new CustomEvent('tool-surface-result', {
      detail: {
        toolName: entry.name,
        labelKey: entry.labelKey,
        content: result.content,
        sources: result.sources ?? []
      }
    }))
  } else {
    toast(result.error, 'error')
  }
}
