-- Nexusky Supabase Schema
-- 在 Supabase SQL Editor 中执行此文件

-- 启用 pgvector 扩展（用于向量搜索）
create extension if not exists vector;

-- 笔记同步状态表
create table if not exists note_sync (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  file_path text not null,
  content_hash text not null,
  updated_at timestamptz default now(),
  unique(user_id, file_path)
);

-- 笔记向量索引（云端语义搜索）
create table if not exists note_embeddings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  file_path text not null,
  chunk_index int not null,
  content text not null,
  heading text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- 向量搜索索引
create index if not exists idx_note_embeddings_vector
  on note_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- RLS 策略：用户只能访问自己的数据
alter table note_sync enable row level security;
alter table note_embeddings enable row level security;

create policy "Users can manage own sync data"
  on note_sync for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own embeddings"
  on note_embeddings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket for markdown files
-- 需要在 Supabase Dashboard > Storage 中手动创建 'notes' bucket
-- 并设置 RLS 策略允许认证用户上传/下载自己的文件

-- 向量搜索函数
create or replace function search_notes(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10,
  p_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  file_path text,
  chunk_index int,
  content text,
  heading text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ne.id,
    ne.file_path,
    ne.chunk_index,
    ne.content,
    ne.heading,
    1 - (ne.embedding <=> query_embedding) as similarity
  from note_embeddings ne
  where ne.user_id = p_user_id
    and 1 - (ne.embedding <=> query_embedding) > match_threshold
  order by ne.embedding <=> query_embedding
  limit match_count;
end;
$$;
