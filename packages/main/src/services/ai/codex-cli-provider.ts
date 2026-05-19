import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { homedir, tmpdir, platform } from 'os'
import { delimiter, join } from 'path'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, ChatOptions, AIProviderValidationResult } from './base-provider'

function contentToText(content: string | ChatContentPart[]): string {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return part.text || ''
    if (part.type === 'image_url') return '[image]'
    return ''
  }).filter(Boolean).join('\n')
}

function buildPrompt(messages: ChatMessage[]): string {
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const nonSystem = messages.filter((m) => m.role !== 'system')

  const parts: string[] = []
  if (systemMsgs.length > 0) {
    parts.push(systemMsgs.map((m) => contentToText(m.content)).join('\n'))
  }

  const conversation = nonSystem.map((m) => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User'
    return `${role}: ${contentToText(m.content)}`
  }).join('\n\n')

  parts.push(conversation)
  return parts.join('\n\n')
}

function runProcess(command: string, args: string[], input?: string, signal?: AbortSignal): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: buildProcessEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: platform() === 'win32'
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

    if (input) {
      child.stdin.write(input)
    }
    child.stdin.end()
  })
}

function buildProcessEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const pathEntries = [
    process.env.PATH || '',
  ]

  if (platform() !== 'win32') {
    pathEntries.push('/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'))
    const nvmRoot = join(home, '.nvm', 'versions', 'node')
    if (existsSync(nvmRoot)) {
      try {
        for (const version of readdirSync(nvmRoot)) {
          pathEntries.push(join(nvmRoot, version, 'bin'))
        }
      } catch {}
    }
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

  async *chatStream(messages: ChatMessage[], signal?: AbortSignal, _options?: ChatOptions): AsyncGenerator<ChatStreamEvent> {
    const tempDir = await mkdtemp(join(tmpdir(), 'nexusky-codex-'))
    const outputFile = join(tempDir, 'last-message.txt')

    try {
      const prompt = buildPrompt(messages)

      const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox', 'read-only',
        '--full-auto',
        '--color', 'never',
        '-o', outputFile,
        '-'
      ]

      if (this.config.model.trim()) {
        args.splice(args.length - 1, 0, '--model', this.config.model.trim())
      }

      const result = await runProcess(this.command, args, prompt, signal)
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      if (result.code !== 0) {
        const error = result.stderr.trim() || result.stdout.trim() || 'Codex CLI 执行失败'
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
    } catch (error: unknown) {
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      const message = error instanceof Error ? error.message : String(error || 'Codex CLI 执行失败')
      yield { type: 'error', content: message }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async validate(): Promise<AIProviderValidationResult> {
    try {
      const result = await runProcess(this.command, ['--version'])
      if (result.code !== 0) {
        return { ok: false, error: result.stderr || result.stdout || `Codex CLI 退出码 ${result.code}` }
      }
      return { ok: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || 'Codex CLI 不可用')
      return { ok: false, error: message }
    }
  }
}
