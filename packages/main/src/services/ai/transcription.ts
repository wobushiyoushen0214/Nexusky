import OpenAI, { toFile } from 'openai'
import type { AIProviderConfig } from './base-provider'
import { normalizeProviderError } from './provider-errors'

export interface TranscribeAudioParams {
  audioData: string
  mimeType?: string
  fileName?: string
  model?: string
  language?: string
}

export interface TranscribeAudioResult {
  success: boolean
  text?: string
  error?: string
}

const SUPPORTED_PROVIDER_TYPES = new Set(['openai', 'openai-responses', 'custom'])
const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1'

export function isTranscriptionProviderSupported(config: AIProviderConfig): boolean {
  return SUPPORTED_PROVIDER_TYPES.has(config.type)
}

export function decodeAudioData(data: string): Buffer {
  const match = data.match(/^data:([^;]+);base64,(.+)$/)
  const base64 = match ? match[2] : data
  return Buffer.from(base64, 'base64')
}

export function extensionForMimeType(mimeType?: string): string {
  if (!mimeType) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  return 'webm'
}

export async function transcribeAudio(config: AIProviderConfig, params: TranscribeAudioParams): Promise<TranscribeAudioResult> {
  if (!isTranscriptionProviderSupported(config)) {
    return { success: false, error: '当前 AI 提供商不支持语音转文字，请切换到 OpenAI 或 OpenAI 兼容服务。' }
  }

  try {
    const mimeType = params.mimeType || 'audio/webm'
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined
    })
    const audio = decodeAudioData(params.audioData)
    if (audio.length === 0) return { success: false, error: '录音为空，请重新录制。' }

    const fileName = params.fileName || `recording.${extensionForMimeType(mimeType)}`
    const file = await toFile(audio, fileName, { type: mimeType })
    const response = await client.audio.transcriptions.create({
      file,
      model: params.model || DEFAULT_TRANSCRIPTION_MODEL,
      ...(params.language ? { language: params.language } : {})
    })
    const text = response.text?.trim() || ''
    return text ? { success: true, text } : { success: false, error: '语音转写没有返回文本。' }
  } catch (error) {
    const normalized = normalizeProviderError(error)
    return { success: false, error: normalized.message || '语音转写失败。' }
  }
}
