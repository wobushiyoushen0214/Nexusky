import { describe, expect, it } from 'vitest'
import { decodeAudioData, extensionForMimeType, isTranscriptionProviderSupported } from '../packages/main/src/services/ai/transcription'
import type { AIProviderConfig } from '../packages/main/src/services/ai/base-provider'

function config(type: AIProviderConfig['type']): AIProviderConfig {
  return {
    id: type,
    name: type,
    type,
    baseUrl: '',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    enabled: true
  }
}

describe('AI audio transcription helpers', () => {
  it('decodes base64 audio from data URLs and raw payloads', () => {
    const raw = Buffer.from('audio bytes').toString('base64')

    expect(decodeAudioData(`data:audio/webm;base64,${raw}`).toString()).toBe('audio bytes')
    expect(decodeAudioData(raw).toString()).toBe('audio bytes')
  })

  it('maps common audio MIME types to upload extensions', () => {
    expect(extensionForMimeType('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForMimeType('audio/mp4')).toBe('mp4')
    expect(extensionForMimeType('audio/mpeg')).toBe('mp3')
    expect(extensionForMimeType('audio/wav')).toBe('wav')
    expect(extensionForMimeType('audio/ogg')).toBe('ogg')
    expect(extensionForMimeType(undefined)).toBe('webm')
  })

  it('allows OpenAI-compatible providers for transcription', () => {
    expect(isTranscriptionProviderSupported(config('openai'))).toBe(true)
    expect(isTranscriptionProviderSupported(config('openai-responses'))).toBe(true)
    expect(isTranscriptionProviderSupported(config('custom'))).toBe(true)
    expect(isTranscriptionProviderSupported(config('claude'))).toBe(false)
    expect(isTranscriptionProviderSupported(config('ollama'))).toBe(false)
    expect(isTranscriptionProviderSupported(config('codex'))).toBe(false)
  })
})
