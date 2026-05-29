export type GeneratedNoteFailureStage = 'generate' | 'write'

export interface GeneratedNoteFailure {
  title: string
  stage: GeneratedNoteFailureStage
  error: string
}

export interface GenerateNotesCompletion {
  success: boolean
  files: string[]
  failed: number
  total: number
  failedItems: GeneratedNoteFailure[]
  error?: string
}

export function normalizeGeneratedNoteError(error: string): string {
  const trimmed = error.trim()
  if (!trimmed) return 'unknown_error'
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed
}

export function buildGenerateNotesCompletion(params: {
  aborted: boolean
  files: string[]
  total: number
  failedItems: GeneratedNoteFailure[]
}): GenerateNotesCompletion {
  const failedItems = params.failedItems.map((item) => ({
    ...item,
    error: normalizeGeneratedNoteError(item.error)
  }))
  const base = {
    files: params.files,
    failed: failedItems.length,
    total: params.total,
    failedItems
  }
  if (params.aborted) {
    return { ...base, success: false, error: '已取消' }
  }
  if (failedItems.length > 0) {
    const first = failedItems[0]
    return {
      ...base,
      success: false,
      error: `${failedItems.length} 篇笔记生成失败，首个失败：${first.title} - ${first.error}`
    }
  }
  return { ...base, success: true }
}

export function formatGenerateNotesDoneMessage(result: GenerateNotesCompletion): string {
  if (result.error === '已取消') return `已停止，已生成 ${result.files.length} 个文件`
  if (result.failed > 0 && result.files.length > 0) {
    return `完成但有失败：已生成 ${result.files.length} 个文件，失败 ${result.failed} 篇`
  }
  if (result.failed > 0) return `生成失败：${result.failed} 篇未创建`
  return `完成！已生成 ${result.files.length} 个文件`
}
