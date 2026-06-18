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
LOG_INGESTION_TOKEN=your-log-ingestion-token
LOG_INGESTION_HMAC_SECRET=your-log-ingestion-hmac-secret
LOG_INGESTION_ALLOWED_ORIGINS=https://your-domain.com
LOG_RATE_LIMIT_WINDOW_MS=60000
LOG_RATE_LIMIT_MAX=60
```

说明：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL。
- `SUPABASE_SERVICE_ROLE_KEY`：网站后端读取日志用的 service role key，不要暴露到客户端。
- `ADMIN_PASSWORD`：`/login` 管理入口密码。
- `AUTH_SECRET`：JWT 签名密钥，生产环境必须使用随机强密钥。
- `LOG_INGESTION_TOKEN`：日志写入 token。桌面端运行环境提供 `NEXUSKY_LOG_INGESTION_TOKEN` 时，会用 `Authorization: Bearer ...` 上报。
- `LOG_INGESTION_HMAC_SECRET`：日志写入 HMAC 密钥。桌面端运行环境提供 `NEXUSKY_LOG_INGESTION_HMAC_SECRET` 时，会发送 `X-Nexusky-Log-Timestamp` 和 `X-Nexusky-Log-Signature`。
- `LOG_INGESTION_ALLOWED_ORIGINS`：允许浏览器跨域写入日志的来源白名单，逗号分隔；Electron 上报通常没有 `Origin`，不需要配置通配符。
- `LOG_RATE_LIMIT_WINDOW_MS` / `LOG_RATE_LIMIT_MAX`：按来源 IP 的基础写入限流窗口和次数。

## 日志后台

Supabase 表结构在 `supabase-schema.sql`。部署前在 Supabase SQL Editor 执行该文件。

路由：

- `POST /api/logs`：桌面端错误上报入口。
- `GET /api/logs`：日志列表，要求管理员 cookie。
- `/login`：管理员登录页。
- `/logs`：日志浏览、筛选和分页页面。

写入边界：

- `POST /api/logs` 默认 fail closed；生产环境必须配置 `LOG_INGESTION_TOKEN` 或 `LOG_INGESTION_HMAC_SECRET`。
- 路由会先做 CORS 来源检查、基础限流、token/HMAC 校验，再解析 JSON 并进行服务端脱敏。
- `GET /api/logs` 不使用日志写入 token，继续要求 `/login` 设置的管理员 cookie。
- `supabase-schema.sql` 不再允许匿名 insert，日志写入只通过网站后端的 service role key。

密钥轮换：

- 优先在 Vercel/Supabase 控制台新增新密钥并重新部署网站，再切换桌面端运行环境变量。
- 确认新 token/HMAC 生效后，移除旧环境变量并再次部署。
- 轮换 `AUTH_SECRET` 会使现有管理员 cookie 失效；轮换日志写入密钥不会影响后台登录。

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
