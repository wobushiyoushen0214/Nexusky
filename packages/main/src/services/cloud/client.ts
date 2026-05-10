import { createClient, SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { store } from '../store'

let client: SupabaseClient | null = null

export interface CloudConfig {
  supabaseUrl: string
  supabaseKey: string
  serviceRoleKey: string
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
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      realtime: { transport: WebSocket as any }
    })
  }
  return client
}

export function getAdminClient(): SupabaseClient | null {
  const config = getCloudConfig()
  if (!config || !config.serviceRoleKey) return null

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket as any }
  })
}

export function resetClient(): void {
  client = null
}
