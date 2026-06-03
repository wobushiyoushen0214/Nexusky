import { describe, expect, it } from 'vitest'
import {
  getAiOutputLanguageInstruction,
  getJsonValueLanguageInstruction
} from '../packages/main/src/services/ai/language'
import { buildGeneratedNoteSystemPrompt } from '../packages/main/src/services/ai/note-writing'
import type { IPCChannelMap } from '../packages/shared/src/types/ipc'

describe('AI language prompts', () => {
  it('describes the selected UI language for generated content', () => {
    expect(getAiOutputLanguageInstruction('zh-CN')).toContain('Simplified Chinese')
    expect(getAiOutputLanguageInstruction('en')).toContain('English')
    expect(getJsonValueLanguageInstruction('en')).toContain('JSON keys must stay exactly')
  })

  it('adds the selected language to generated note prompts', () => {
    expect(buildGeneratedNoteSystemPrompt('en')).toContain('English')
    expect(buildGeneratedNoteSystemPrompt('zh-CN')).toContain('Simplified Chinese')
  })

  it('allows language on AI generation IPC payloads', () => {
    const editParams: IPCChannelMap['ai:edit']['params'] = {
      instruction: 'Improve this note',
      fileContent: '# Draft',
      filePath: 'Draft.md',
      language: 'en'
    }
    const applyEditParams: IPCChannelMap['ai:apply-edit']['params'] = {
      filePath: '/vault/Draft.md',
      content: '# Draft\n\nDone',
      vaultPath: '/vault',
      expectedBeforeHash: 'before',
      allowCreate: false
    }
    const graphParams: IPCChannelMap['ai:generate-graph']['params'] = {
      vaultPath: '/vault',
      filePaths: ['/vault/A.md'],
      language: 'zh-CN'
    }
    const noteParams: IPCChannelMap['ai:generate-notes']['params'] = {
      instruction: 'Create notes',
      vaultPath: '/vault',
      language: 'en'
    }

    expect(editParams.language).toBe('en')
    expect(applyEditParams.expectedBeforeHash).toBe('before')
    expect(graphParams.language).toBe('zh-CN')
    expect(noteParams.language).toBe('en')
  })
})
