import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { store } from '../store'

let client: SupabaseClient | null = null

export interface CloudConfig {
  supabaseUrl: string
  supabaseKey: string
  enabled: boolean
}

export function getCloudConfig(): CloudConfig | null {
  const config = store.get('cloudConfig') as CloudConfig | undefined
  if (!config || !config.enabled || !config.supabaseUrl || !config.supabaseKey) return null
  return config
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getCloudConfig()
  if (!config) return null

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseKey)
  }
  return client
}

export function resetClient(): void {
  client = null
}
