# Nexusky Website

Next.js 官网和日志后台。首页用于展示 Nexusky 桌面应用，`/login` 和 `/logs` 用于查看桌面端上报的错误日志。

## 运行

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm run build
```

本地开发地址默认是 `http://localhost:3000`。

## 环境变量

复制 `.env.local.example` 为 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=your-admin-password
AUTH_SECRET=your-random-secret-string
```

说明：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL。
- `SUPABASE_SERVICE_ROLE_KEY`：网站后端读取日志用的 service role key，不要暴露到客户端。
- `ADMIN_PASSWORD`：`/login` 管理入口密码。
- `AUTH_SECRET`：JWT 签名密钥，生产环境必须使用随机强密钥。

## 日志后台

Supabase 表结构在 `supabase-schema.sql`。部署前在 Supabase SQL Editor 执行该文件。

路由：

- `POST /api/logs`：桌面端错误上报入口。
- `GET /api/logs`：日志列表，要求管理员 cookie。
- `/login`：管理员登录页。
- `/logs`：日志浏览、筛选和分页页面。

当前日志入口仍应按根项目 `docs/PROJECT_SCORE_OPTIMIZATION_PLAN.md` 的 P0-4 加固：生产环境需要 ingestion token 或 HMAC、限流、服务端脱敏和更严格 CORS。

## 首页资产

首页使用 `public/product/` 下的应用图标：

- `icon.png`

该文件来自仓库根部 `resources/` 目录。首页不再引用旧 guide 截图；若以后加入产品截图，应使用当前版本重新截取的图片。

## 部署

建议部署到 Vercel 或任意支持 Next.js 16 的 Node 环境。

部署检查：

```bash
pnpm run lint
pnpm run build
```

生产环境不要使用 `.env.local.example` 中的示例密钥。
