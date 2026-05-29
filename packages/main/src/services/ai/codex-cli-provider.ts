import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { homedir, tmpdir, platform } from 'os'
import { delimiter, join } from 'path'
import { BaseAIProvider, ChatMessage, ChatStreamEvent, ChatContentPart, ChatOptions, AIProviderValidationResult } from './base-provider'

export const CODEX_CHAT_TIMEOUT_MS = 120_000
export const CODEX_VALIDATE_TIMEOUT_MS = 10_000
export const CODEX_MAX_OUTPUT_BYTES = 1_000_000
const CODEX_KILL_GRACE_MS = 2_000

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

interface RunProcessOptions {
  input?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputBytes?: number
}

interface RunProcessResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputTruncated: boolean
}

export function appendLimitedProcessOutput(params: {
  current: string
  chunk: string | Buffer
  usedBytes: number
  maxBytes: number
}): { value: string; usedBytes: number; truncated: boolean } {
  const raw = Buffer.isBuffer(params.chunk) ? params.chunk : Buffer.from(params.chunk)
  const remaining = params.maxBytes - params.usedBytes
  if (remaining <= 0) return { value: params.current, usedBytes: params.usedBytes, truncated: true }
  if (raw.byteLength <= remaining) {
    return {
      value: params.current + raw.toString('utf-8'),
      usedBytes: params.usedBytes + raw.byteLength,
      truncated: false
    }
  }
  return {
    value: params.current + raw.subarray(0, remaining).toString('utf-8'),
    usedBytes: params.maxBytes,
    truncated: true
  }
}

async function readLimitedUtf8File(path: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const info = await stat(path)
  if (info.size > maxBytes) return { text: '', truncated: true }
  return { text: await readFile(path, 'utf-8'), truncated: false }
}

function runProcess(command: string, args: string[], options: RunProcessOptions = {}): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: buildProcessEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: platform() === 'win32'
    })

    let stdout = ''
    let stderr = ''
    let usedOutputBytes = 0
    let timedOut = false
    let outputTruncated = false
    let terminated = false
    let forceKillTimer: NodeJS.Timeout | null = null

    const terminate = () => {
      if (terminated) return
      terminated = true
      if (platform() === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true
        })
        killer.on('error', () => {
          try { child.kill('SIGTERM') } catch {}
        })
      } else {
        try { child.kill('SIGTERM') } catch {}
        forceKillTimer = setTimeout(() => {
          try { child.kill('SIGKILL') } catch {}
        }, CODEX_KILL_GRACE_MS)
      }
    }

    const abort = () => terminate()
    const timeout = options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          terminate()
        }, options.timeoutMs)
      : null
    const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      const maxOutputBytes = options.maxOutputBytes ?? CODEX_MAX_OUTPUT_BYTES
      const result = appendLimitedProcessOutput({
        current: target === 'stdout' ? stdout : stderr,
        chunk,
        usedBytes: usedOutputBytes,
        maxBytes: maxOutputBytes
      })
      usedOutputBytes = result.usedBytes
      outputTruncated = outputTruncated || result.truncated
      if (target === 'stdout') stdout = result.value
      else stderr = result.value
      if (result.truncated) terminate()
    }

    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (chunk) => { appendOutput('stdout', Buffer.from(chunk)) })
    child.stderr.on('data', (chunk) => { appendOutput('stderr', Buffer.from(chunk)) })
    child.stdin.on('error', () => {})
    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      options.signal?.removeEventListener('abort', abort)
      resolve({ code, stdout, stderr, timedOut, outputTruncated })
    })

    if (options.input) {
      child.stdin.write(options.input)
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

      const result = await runProcess(this.command, args, {
        input: prompt,
        signal,
        timeoutMs: CODEX_CHAT_TIMEOUT_MS,
        maxOutputBytes: CODEX_MAX_OUTPUT_BYTES
      })
      if (signal?.aborted) {
        yield { type: 'done', content: '' }
        return
      }
      if (result.timedOut) {
        yield { type: 'error', content: `Codex CLI 请求超时（${Math.round(CODEX_CHAT_TIMEOUT_MS / 1000)} 秒）` }
        return
      }
      if (result.outputTruncated) {
        yield { type: 'error', content: `Codex CLI 输出超过 ${CODEX_MAX_OUTPUT_BYTES} 字节上限，已终止` }
        return
      }
      if (result.code !== 0) {
        const error = result.stderr.trim() || result.stdout.trim() || 'Codex CLI 执行失败'
        yield { type: 'error', content: error }
        return
      }

      let content = ''
      let fileOutputTruncated = false
      try {
        const output = await readLimitedUtf8File(outputFile, CODEX_MAX_OUTPUT_BYTES)
        content = output.text
        fileOutputTruncated = output.truncated
      } catch {
        content = result.stdout
      }
      if (fileOutputTruncated) {
        yield { type: 'error', content: `Codex CLI 输出文件超过 ${CODEX_MAX_OUTPUT_BYTES} 字节上限，已拒绝读取` }
        return
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
      const result = await runProcess(this.command, ['--version'], {
        timeoutMs: CODEX_VALIDATE_TIMEOUT_MS,
        maxOutputBytes: 200_000
      })
      if (result.timedOut) {
        return { ok: false, error: `Codex CLI 校验超时（${Math.round(CODEX_VALIDATE_TIMEOUT_MS / 1000)} 秒）` }
      }
      if (result.outputTruncated) {
        return { ok: false, error: 'Codex CLI 校验输出过大，已终止' }
      }
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
