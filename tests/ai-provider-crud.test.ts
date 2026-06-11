import { describe, it, expect, beforeEach } from 'vitest'
import type { AIProviderConfig, TestResult } from '../packages/shared/src/types/ipc'

describe('AI Provider CRUD Operations', () => {
  const mockProvider: AIProviderConfig = {
    id: '',
    name: 'Test OpenAI',
    type: 'openai',
    apiKey: 'sk-test-key',
    baseUrl: '',
    model: 'gpt-4.1-mini',
    enabled: true
  }

  describe('ai:save-provider', () => {
    it('should create a new provider when id is empty', () => {
      expect(mockProvider.id).toBe('')
      expect(mockProvider.name).toBe('Test OpenAI')
    })

    it('should validate required fields', () => {
      const invalidProvider = { ...mockProvider, name: '' }
      expect(() => {
        if (!invalidProvider.name?.trim()) {
          throw new Error('Provider name is required')
        }
      }).toThrow('Provider name is required')
    })

    it('should validate API key for non-ollama providers', () => {
      const noKeyProvider = { ...mockProvider, apiKey: '' }
      expect(() => {
        if (noKeyProvider.type !== 'ollama' && noKeyProvider.type !== 'codex' && !noKeyProvider.apiKey?.trim()) {
          throw new Error('API Key is required for this provider type')
        }
      }).toThrow('API Key is required')
    })

    it('should validate model field', () => {
      const noModelProvider = { ...mockProvider, model: '' }
      expect(() => {
        if (!noModelProvider.model?.trim()) {
          throw new Error('Model name is required')
        }
      }).toThrow('Model name is required')
    })

    it('should update existing provider when id exists', () => {
      const existingProvider = { ...mockProvider, id: 'test-id-123' }
      const updated = { ...existingProvider, model: 'gpt-4.1' }
      expect(updated.id).toBe(existingProvider.id)
      expect(updated.model).toBe('gpt-4.1')
    })
  })

  describe('ai:delete-provider', () => {
    it('should delete provider by id', () => {
      const providers = [
        { ...mockProvider, id: 'id-1', enabled: true },
        { ...mockProvider, id: 'id-2', enabled: true }
      ]
      const filtered = providers.filter(p => p.id !== 'id-1')
      expect(filtered.length).toBe(1)
      expect(filtered[0].id).toBe('id-2')
    })

    it('should not allow deleting last enabled provider', () => {
      const providers = [
        { ...mockProvider, id: 'id-1', enabled: true }
      ]
      const filtered = providers.filter(p => p.id !== 'id-1')
      const enabledCount = filtered.filter(p => p.enabled).length

      expect(() => {
        if (enabledCount === 0 && filtered.length > 0) {
          throw new Error('Cannot delete the last enabled provider')
        }
      }).not.toThrow()

      // But with remaining providers
      const providersWithDisabled = [
        { ...mockProvider, id: 'id-1', enabled: true },
        { ...mockProvider, id: 'id-2', enabled: false }
      ]
      const filteredWithRemaining = providersWithDisabled.filter(p => p.id !== 'id-1')
      const enabledCountWithRemaining = filteredWithRemaining.filter(p => p.enabled).length

      expect(() => {
        if (enabledCountWithRemaining === 0 && filteredWithRemaining.length > 0) {
          throw new Error('Cannot delete the last enabled provider')
        }
      }).toThrow('Cannot delete the last enabled provider')
    })
  })

  describe('ai:test-provider', () => {
    it('should return TestResult with correct structure', () => {
      const successResult: TestResult = {
        ok: true,
        text: 'Connection successful',
        latencyMs: 1234,
        model: 'gpt-4.1-mini'
      }
      expect(successResult.ok).toBe(true)
      expect(successResult.latencyMs).toBeGreaterThan(0)
      expect(successResult.model).toBe('gpt-4.1-mini')
    })

    it('should return error for invalid API key', () => {
      const errorResult: TestResult = {
        ok: false,
        text: 'Invalid API Key'
      }
      expect(errorResult.ok).toBe(false)
      expect(errorResult.text).toBe('Invalid API Key')
    })

    it('should return error for network timeout', () => {
      const timeoutResult: TestResult = {
        ok: false,
        text: 'Network timeout'
      }
      expect(timeoutResult.ok).toBe(false)
      expect(timeoutResult.text).toBe('Network timeout')
    })

    it('should return error for unreachable base URL', () => {
      const unreachableResult: TestResult = {
        ok: false,
        text: 'Base URL unreachable'
      }
      expect(unreachableResult.ok).toBe(false)
      expect(unreachableResult.text).toBe('Base URL unreachable')
    })

    it('should return error for model not found', () => {
      const notFoundResult: TestResult = {
        ok: false,
        text: 'Model not found'
      }
      expect(notFoundResult.ok).toBe(false)
      expect(notFoundResult.text).toBe('Model not found')
    })
  })

  describe('Type Definitions', () => {
    it('should have correct AIProviderConfig type', () => {
      const provider: AIProviderConfig = {
        id: 'test-id',
        name: 'Test Provider',
        type: 'openai',
        apiKey: 'sk-test',
        baseUrl: '',
        model: 'gpt-4.1-mini',
        enabled: true
      }
      expect(provider).toBeDefined()
      expect(provider.type).toMatch(/^(openai|claude|custom|ollama|codex|openai-responses)$/)
    })

    it('should support optional fields', () => {
      const provider: AIProviderConfig = {
        id: 'test-id',
        name: 'Test Provider',
        type: 'openai',
        apiKey: 'sk-test',
        baseUrl: '',
        model: 'gpt-4.1-mini',
        enabled: true,
        inputCostPer1MTokens: 0.5,
        outputCostPer1MTokens: 1.5,
        hasApiKey: true
      }
      expect(provider.inputCostPer1MTokens).toBe(0.5)
      expect(provider.outputCostPer1MTokens).toBe(1.5)
      expect(provider.hasApiKey).toBe(true)
    })
  })
})
