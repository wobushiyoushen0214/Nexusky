import { getSupabaseClient } from './client'

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  if (!client) return { success: false, error: '未配置云端' }

  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function signUp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  if (!client) return { success: false, error: '未配置云端' }

  const { error } = await client.auth.signUp({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient()
  if (client) await client.auth.signOut()
}

export async function getUser(): Promise<{ email: string } | null> {
  const client = getSupabaseClient()
  if (!client) return null

  const { data } = await client.auth.getUser()
  if (data.user) return { email: data.user.email || '' }
  return null
}
