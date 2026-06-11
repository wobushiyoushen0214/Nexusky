/**
 * AI Provider CRUD Integration Example
 *
 * This file demonstrates how to use the new AI Provider CRUD APIs
 * from the frontend renderer process.
 */

import type { AIProviderConfig, TestResult } from '@shared/types/ipc'

// ============================================================================
// Example 1: Create a new provider
// ============================================================================

async function createProvider() {
  const newProvider: AIProviderConfig = {
    id: '', // Empty ID means create new
    name: 'My OpenAI',
    type: 'openai',
    apiKey: 'sk-xxxxxxxxxxxxx',
    baseUrl: '', // Empty string uses default
    model: 'gpt-4.1-mini',
    enabled: true
  }

  try {
    await window.api.invoke('ai:save-provider', { config: newProvider })
    console.log('✅ Provider created successfully')
  } catch (error) {
    console.error('❌ Failed to create provider:', error.message)
    // Possible errors:
    // - "Provider name is required"
    // - "Model name is required"
    // - "API Key is required for this provider type"
  }
}

// ============================================================================
// Example 2: Update existing provider
// ============================================================================

async function updateProvider(existingId: string) {
  const updatedProvider: AIProviderConfig = {
    id: existingId, // Existing ID means update
    name: 'My OpenAI (Updated)',
    type: 'openai',
    apiKey: '', // Empty string preserves existing API key
    baseUrl: '',
    model: 'gpt-4.1', // Update to new model
    enabled: true
  }

  try {
    await window.api.invoke('ai:save-provider', { config: updatedProvider })
    console.log('✅ Provider updated successfully')
  } catch (error) {
    console.error('❌ Failed to update provider:', error.message)
  }
}

// ============================================================================
// Example 3: Delete provider
// ============================================================================

async function deleteProvider(providerId: string) {
  try {
    await window.api.invoke('ai:delete-provider', { id: providerId })
    console.log('✅ Provider deleted successfully')
  } catch (error) {
    console.error('❌ Failed to delete provider:', error.message)
    // Possible error:
    // - "Cannot delete the last enabled provider"
  }
}

// ============================================================================
// Example 4: Test provider connection
// ============================================================================

async function testProvider(config: AIProviderConfig): Promise<TestResult> {
  try {
    const result = await window.api.invoke('ai:test-provider', { config })

    if (result.ok) {
      console.log(`✅ Connection successful!`)
      console.log(`   Model: ${result.model}`)
      console.log(`   Latency: ${result.latencyMs}ms`)
    } else {
      console.log(`❌ Connection failed: ${result.text}`)
      // Possible error messages:
      // - "Invalid API Key"
      // - "Model not found"
      // - "Network timeout"
      // - "Base URL unreachable"
      // - "Connection failed"
    }

    return result
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return { ok: false, text: error.message }
  }
}

// ============================================================================
// Example 5: Full CRUD workflow with React
// ============================================================================

import { useState, useEffect } from 'react'

function AIProviderManager() {
  const [providers, setProviders] = useState<AIProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Load providers
  useEffect(() => {
    loadProviders()
  }, [])

  async function loadProviders() {
    try {
      const data = await window.api.invoke('ai:get-providers', undefined)
      setProviders(data)
    } catch (error) {
      console.error('Failed to load providers:', error)
    }
  }

  // Create or update provider
  async function saveProvider(config: AIProviderConfig) {
    setLoading(true)
    try {
      await window.api.invoke('ai:save-provider', { config })
      await loadProviders() // Reload list
      alert('Provider saved successfully!')
    } catch (error) {
      alert(`Failed to save: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Delete provider
  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this provider?')) return

    setLoading(true)
    try {
      await window.api.invoke('ai:delete-provider', { id })
      await loadProviders() // Reload list
      alert('Provider deleted successfully!')
    } catch (error) {
      alert(`Failed to delete: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Test provider
  async function handleTest(config: AIProviderConfig) {
    setLoading(true)
    setTestResult(null)
    try {
      const result = await window.api.invoke('ai:test-provider', { config })
      setTestResult(result)

      if (result.ok) {
        alert(`✅ Connection successful!\nLatency: ${result.latencyMs}ms\nModel: ${result.model}`)
      } else {
        alert(`❌ Connection failed:\n${result.text}`)
      }
    } catch (error) {
      alert(`Test failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>AI Providers</h2>

      {/* Provider list */}
      <div>
        {providers.map(provider => (
          <div key={provider.id}>
            <h3>{provider.name}</h3>
            <p>Type: {provider.type}</p>
            <p>Model: {provider.model}</p>
            <p>Enabled: {provider.enabled ? 'Yes' : 'No'}</p>
            <p>Has API Key: {provider.hasApiKey ? 'Yes' : 'No'}</p>

            <button onClick={() => handleTest(provider)} disabled={loading}>
              Test Connection
            </button>
            <button onClick={() => handleDelete(provider.id)} disabled={loading}>
              Delete
            </button>
          </div>
        ))}
      </div>

      {/* Test result display */}
      {testResult && (
        <div className={testResult.ok ? 'success' : 'error'}>
          <h4>Test Result</h4>
          <p>{testResult.text}</p>
          {testResult.latencyMs && <p>Latency: {testResult.latencyMs}ms</p>}
          {testResult.model && <p>Model: {testResult.model}</p>}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Example 6: Form validation before save
// ============================================================================

function validateProviderConfig(config: AIProviderConfig): string | null {
  if (!config.name?.trim()) {
    return 'Provider name is required'
  }

  if (!config.model?.trim()) {
    return 'Model name is required'
  }

  // API key required for OpenAI and Claude (not for Ollama/Codex)
  if (!['ollama', 'codex'].includes(config.type) && !config.apiKey?.trim()) {
    return 'API Key is required for this provider type'
  }

  // Base URL required for custom providers
  if (config.type === 'custom' && !config.baseUrl?.trim()) {
    return 'Base URL is required for custom providers'
  }

  return null // Valid
}

async function saveProviderWithValidation(config: AIProviderConfig) {
  // Client-side validation
  const error = validateProviderConfig(config)
  if (error) {
    alert(error)
    return
  }

  // Save to backend
  try {
    await window.api.invoke('ai:save-provider', { config })
    alert('Provider saved successfully!')
  } catch (error) {
    alert(`Failed to save: ${error.message}`)
  }
}

// ============================================================================
// Example 7: Batch operations (migration from old API)
// ============================================================================

// Old way (still supported for backward compatibility)
async function saveBatch_OLD(providers: AIProviderConfig[]) {
  await window.api.invoke('ai:save-providers', { providers })
}

// New way (recommended)
async function saveBatch_NEW(providers: AIProviderConfig[]) {
  for (const provider of providers) {
    await window.api.invoke('ai:save-provider', { config: provider })
  }
}

export {
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  validateProviderConfig,
  saveProviderWithValidation,
  AIProviderManager
}
