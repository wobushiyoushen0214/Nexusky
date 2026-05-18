import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { level, message, stack, context, app_version, platform, device_id } = body

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const { error } = await getSupabase().from('error_logs').insert({
    level: level || 'error',
    message,
    stack: stack || null,
    context: context || null,
    app_version: app_version || null,
    platform: platform || null,
    device_id: device_id || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const isAuthed = await verifyAuth()
  if (!isAuthed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const level = searchParams.get('level')
  const search = searchParams.get('search')

  let query = getSupabase()
    .from('error_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (level && level !== 'all') {
    query = query.eq('level', level)
  }

  if (search) {
    query = query.ilike('message', `%${search}%`)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data, total: count, page, limit })
}
