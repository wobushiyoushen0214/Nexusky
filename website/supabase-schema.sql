-- 错误日志表
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'error' check (level in ('error', 'warn', 'info')),
  message text not null,
  stack text,
  context jsonb,
  app_version text,
  platform text,
  device_id text,
  created_at timestamptz not null default now()
);

create index idx_error_logs_created_at on error_logs (created_at desc);
create index idx_error_logs_level on error_logs (level);
create index idx_error_logs_device_id on error_logs (device_id);

-- 启用 RLS
alter table error_logs enable row level security;

-- 允许匿名插入（客户端上报）
create policy "allow_insert" on error_logs for insert with check (true);

-- 只允许 service_role 读取（网站后端用 service_role key）
create policy "allow_service_read" on error_logs for select using (auth.role() = 'service_role');
