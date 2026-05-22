import { getSupabaseClient, getAdminClient } from './client'
import { clipboard } from 'electron'
import { getErrorMessage } from '@shared/utils/errors'

const SCHEMA_SQL = `-- 在 Supabase SQL Editor 中执行以下 SQL：

create table if not exists note_sync (
  id uuid default gen_random_uuid() primary key,
  file_path text not null unique,
  content_hash text not null,
  updated_at timestamptz default now()
);

-- 允许所有认证用户访问（个人使用）
-- 如需多用户隔离，添加 user_id 列和对应 RLS
alter table note_sync enable row level security;

create policy "Allow all for authenticated" on note_sync
  for all to authenticated
  using (true) with check (true);

-- 如果不需要登录（仅用 anon key），用以下策略替代上面的：
-- create policy "Allow all" on note_sync for all using (true) with check (true);
`

export async function initializeCloud(): Promise<{ success: boolean; error?: string; needsManualSetup?: boolean }> {
  const client = getSupabaseClient()
  const adminClient = getAdminClient()
  if (!client) return { success: false, error: '未配置 Supabase' }

  try {
    // 检查 note_sync 表是否存在
    const { error: tableError } = await client.from('note_sync').select('id').limit(1)

    if (tableError && tableError.code === '42P01') {
      // 表不存在，复制 SQL 到剪贴板
      clipboard.writeText(SCHEMA_SQL)
      return {
        success: false,
        needsManualSetup: true,
        error: 'SQL 已复制到剪贴板。请打开 Supabase Dashboard → SQL Editor，粘贴执行后重试。'
      }
    }

    if (tableError && tableError.message?.includes('JWT')) {
      return { success: false, error: '认证失败，请检查 Supabase URL 和 Key 是否正确' }
    }

    // 用 admin client 创建 bucket（需要 service_role key）
    const initClient = adminClient || client
    const { data: buckets, error: bucketListError } = await initClient.storage.listBuckets()

    if (bucketListError) {
      if (bucketListError.message?.includes('row-level security') && !adminClient) {
        return { success: false, error: '创建 Storage 需要 Service Role Key。请在设置中填写，或在 Supabase Dashboard → Storage 手动创建名为 "notes" 的 bucket。' }
      }
      return { success: false, error: `Storage 访问失败: ${bucketListError.message}` }
    }

    const notesBucket = buckets?.find((b) => b.name === 'notes')
    if (!notesBucket) {
      const { error: bucketError } = await initClient.storage.createBucket('notes', {
        public: false,
        fileSizeLimit: 10485760
      })
      if (bucketError && !bucketError.message?.includes('already exists')) {
        if (bucketError.message?.includes('row-level security') && !adminClient) {
          return { success: false, error: '创建 bucket 需要 Service Role Key，或在 Dashboard → Storage 手动创建 "notes" bucket。' }
        }
        return { success: false, error: `创建 bucket 失败: ${bucketError.message}` }
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err, '初始化失败') }
  }
}

export function getSchemaSQL(): string {
  return SCHEMA_SQL
}
