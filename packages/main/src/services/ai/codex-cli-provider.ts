import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { delimiter, join } from 'path'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, AIProviderConfig } from './base-provider'

function contentToText(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return part.text || ''
    if (part.type === 'image_url') return '[image]'
    return ''
  }).filter(Boolean).join('\n')
}

function buildPrompt(messages: ChatMessage[]): string {
  const transcript = messages.map((message) => {
    const role = message.role === 'system' ? 'System' : message.role === 'assistant' ? 'Assistant' : 'User'
    return `${role}:\n${contentToText(message.content)}`
  }).join('\n\n')

  return [
    'You are running as the Codex CLI provider inside Nexusky.',
    'Return only the final assistant response. Do not modify files or run commands unless the user explicitly asks for analysis that requires reading local files.',
    transcript
  ].join('\n\n')
}

function runProcess(command: string, args: string[], input?: string, signal?: AbortSignal): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: buildProcessEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    const abort = () => {
      child.kill('SIGTERM')
    }

    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.stdin.on('error', () => {})
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      resolve({ code, stdout, stderr })
    })

    child.stdin.end(input || '')
  })
}

function buildProcessEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const pathEntries = [
    process.env.PATH || '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.local', 'bin')
  ]
  const nvmRoot = join(home, '.nvm', 'versions', 'node')

  if (existsSync(nvmRoot)) {
    try {
      for (const version of readdirSync(nvmRoot)) {
        pathEntries.push(join(nvmRoot, version, 'bin'))
      }
    } catch {}
  }

  return {
    ...process.env,
    PATH: pathEntries.filter(Boolean).join(delimiter)
  }
}

export class CodexCliProvider extends BaseAIProvider {
  private get command(): string {
    return this.config.baseUrl.trim() || 'codex'
  }

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const tempDir = await mkdtemp(join(tmpdir(), 'nexusky-codex-'))
    const outputFile = join(tempDir, 'last-message.txt')

    try {
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox', 'read-only',
        '--ask-for-approval', 'never',
        '--color', 'never',
        '--output-last-message', outputFile
      ]

      if (this.config.model.trim()) {
        args.push('--model', this.config.model.trim())
      }

      const result = await runProcess(this.command, args, buildPrompt(messages), signal)
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      if (result.code !== 0) {
        const error = result.stderr.trim() || result.stdout.trim() || 'Codex CLI request failed'
        yield { type: 'error', content: error }
        return
      }

      let content = ''
      try {
        content = await readFile(outputFile, 'utf-8')
      } catch {
        content = result.stdout
      }

      const trimmed = content.trim()
      if (trimmed) yield { type: 'text', content: trimmed }
      yield { type: 'done', content: '' }
    } catch (error: any) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      yield { type: 'error', content: error.message || 'Codex CLI request failed' }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async validate(): Promise<boolean> {
    try {
      const result = await runProcess(this.command, ['--version'])
      return result.code === 0
    } catch {
      return false
    }
  }
}
