import { applyVaultContentMutation, type ApplyVaultContentMutationResult } from '../file-content-mutation'

export interface ApplyAiEditParams {
  vaultPath: string
  filePath: string
  content: string
  expectedBeforeHash?: string
  allowCreate?: boolean
}

export type ApplyAiEditResult = ApplyVaultContentMutationResult

export async function applyAiEditMutation(params: ApplyAiEditParams): Promise<ApplyAiEditResult> {
  if (typeof params.content !== 'string') {
    return { success: false, error: 'AI 编辑内容无效' }
  }
  return applyVaultContentMutation(params)
}
