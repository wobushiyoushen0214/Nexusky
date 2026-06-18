import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { verifyAuth } from '@/lib/auth'
import {
  buildLogCorsHeaders,
  buildLogRecord,
  checkLogRateLimit,
  getLogRateLimitKey,
  isLogCorsAllowed,
  verifyLogIngestionRequest,
} from '@/lib/log-ingestion'

function jsonWithCors(body: unknown, status: number, headers: Record<string, string>) {
  return NextResponse.json(body, { status, headers })
}

export async function OPTIONS(req: NextRequest) {
  const corsHeaders = buildLogCorsHeaders(req.headers)
  if (!isLogCorsAllowed(req.headers)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders })
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  const corsHeaders = buildLogCorsHeaders(req.headers)
  if (!isLogCorsAllowed(req.headers)) {
    return jsonWithCors({ error: 'origin is not allowed' }, 403, corsHeaders)
  }

  const rateLimit = checkLogRateLimit({ key: getLogRateLimitKey(req.headers) })
  if (!rateLimit.allowed) {
    return jsonWithCors(
      { error: 'rate limit exceeded' },
      429,
      { ...corsHeaders, 'Retry-After': String(rateLimit.retryAfterSeconds) },
    )
  }

  let rawBody = ''
  try {
    rawBody = await req.text()
  } catch {
    return jsonWithCors({ error: 'request body is required' }, 400, corsHeaders)
  }

  const auth = verifyLogIngestionRequest({ headers: req.headers, rawBody })
  if (!auth.ok) {
    return jsonWithCors({ error: auth.error }, auth.status, corsHeaders)
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    return jsonWithCors({ error: 'valid json body is required' }, 400, corsHeaders)
  }

  const payload = buildLogRecord(parsedBody)
  if (!payload.ok) {
    return jsonWithCors({ error: payload.error }, 400, corsHeaders)
  }

  const { error } = await getSupabase().from('error_logs').insert(payload.record)

  if (error) {
    return jsonWithCors({ error: error.message }, 500, corsHeaders)
  }

  return jsonWithCors({ ok: true }, 200, corsHeaders)
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
