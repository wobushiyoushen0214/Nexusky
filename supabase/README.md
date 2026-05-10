# Supabase 云端配置指南

## 1. 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 创建账号
2. 新建项目，记录 **Project URL** 和 **anon public key**

## 2. 执行数据库 Schema

在 Supabase Dashboard > SQL Editor 中执行 `schema.sql` 文件。

## 3. 创建 Storage Bucket

1. 进入 Dashboard > Storage
2. 创建名为 `notes` 的 bucket
3. 设置为 **Private**
4. 添加 RLS 策略：

```sql
-- 允许认证用户上传自己的文件
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check (auth.role() = 'authenticated');

-- 允许认证用户读取自己的文件
create policy "Authenticated users can read own files"
  on storage.objects for select
  using (auth.role() = 'authenticated');

-- 允许认证用户更新自己的文件
create policy "Authenticated users can update own files"
  on storage.objects for update
  using (auth.role() = 'authenticated');
```

## 4. 在 Nexusky 中配置

1. 打开设置 (Ctrl+,)
2. 切换到「云端同步」tab
3. 填入 Supabase URL 和 Anon Key
4. 勾选「启用云端同步」
5. 保存

## 5. 同步机制

- **自动 Push**: 每次保存文件时自动上传到云端
- **手动 Sync**: 全量同步（对比本地和云端 hash，双向同步）
- **冲突处理**: 以最新修改时间为准

## Vercel Edge Functions（可选）

如果需要在云端执行 AI 操作（避免暴露 API Key），可以部署 Vercel Edge Functions：

```
/api/chat    - AI 对话代理
/api/embed   - 向量嵌入代理
/api/search  - 语义搜索
```
