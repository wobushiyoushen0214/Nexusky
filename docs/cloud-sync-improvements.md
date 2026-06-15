# 云端同步功能改进

## 概览

本次更新完善了云端同步功能，新增了 iCloud 和 OneDrive 支持，并修复了现有实现中的问题。

## 新增功能

### 1. iCloud Drive 支持

- **自动路径检测**：支持多种 iCloud 路径模式
  - 专用容器：`~/Library/Mobile Documents/iCloud~com~nexusky~notes/Documents`
  - 通用 iCloud Drive：`~/Library/Mobile Documents/com~apple~CloudDocs/Nexusky`
  - 自定义路径配置

- **功能特性**：
  - 文件推送/拉取
  - 完整同步和仅拉取模式
  - 冲突检测和解决
  - 版本快照备份
  - 增强的日志记录

### 2. OneDrive 支持

- **OAuth 2.0 认证**：
  - 使用 Microsoft Graph API
  - 自动 token 刷新机制
  - 支持自定义 Client ID

- **功能特性**：
  - 文件推送/拉取/删除
  - 递归文件夹列表（优化性能）
  - SHA256 哈希验证
  - 二进制文件安全处理
  - 完善的错误处理和日志

### 3. 现有提供者改进

#### WebDAV
- 保持原有功能
- 已有完整实现

#### S3
- 保持原有功能  
- 已有完整实现

## 架构改进

### 类型系统

更新了共享类型定义以支持所有提供者：

```typescript
// packages/shared/src/types/ipc.ts
export interface SettingsSyncStatus {
  configured: boolean
  provider?: 'icloud' | 'onedrive' | 'webdav' | 's3' | 'supabase'
  // ...
}
```

### 前端组件

**CloudSyncSettings.tsx** 完全重构：

- **提供者选择**：支持 iCloud、OneDrive、WebDAV、S3
- **动态配置表单**：根据选择的提供者显示相应的配置字段
- **实时状态显示**：
  - 同步状态（idle/ok/conflict/error）
  - 最后同步时间和方向
  - 统计信息（总文件数、推送/拉取数量、冲突/错误数）
  - 离线队列大小
- **连接测试**：配置前可测试连接
- **重新配置**：已配置的提供者可重新设置

### 后端服务

#### iCloud Provider
```typescript
// packages/main/src/services/cloud/icloud-provider.ts
- 增强的路径检测逻辑
- 完善的错误处理
- 详细的日志记录
```

#### OneDrive Provider
```typescript
// packages/main/src/services/cloud/onedrive-provider.ts
- 优化的递归文件列表（并行处理文件夹）
- 改进的 token 刷新逻辑
- 详细的错误日志
```

## 配置示例

### iCloud 配置

```typescript
// 自动检测（推荐）
// 系统会自动查找 iCloud 路径

// 或手动指定
{
  path: '/Users/username/Library/Mobile Documents/com~apple~CloudDocs/Nexusky'
}
```

### OneDrive 配置

```typescript
{
  clientId: 'your-azure-app-client-id',
  folder: '/Nexusky',
  // OAuth token 通过认证流程自动获取
}
```

### WebDAV 配置

```typescript
{
  url: 'https://webdav.example.com',
  username: 'user',
  password: 'pass',
  folder: '/Nexusky'
}
```

### S3 配置

```typescript
{
  endpoint: 'https://s3.amazonaws.com',
  region: 'us-east-1',
  bucket: 'nexusky-sync',
  prefix: 'vault/',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
}
```

## UI 改进

### 样式增强

新增 CSS 样式支持：
- 表单字段布局
- 统计信息网格
- 状态颜色编码（ok/conflict/error/idle）
- 离线队列提示
- 响应式设计

### 国际化

需要添加以下翻译键：

```json
{
  "settings.cloudSync.icloud.path": "iCloud 路径",
  "settings.cloudSync.icloud.pathPlaceholder": "自动检测或手动输入",
  "settings.cloudSync.icloud.pathHint": "留空以自动检测 iCloud Drive 路径",
  
  "settings.cloudSync.onedrive.clientId": "客户端 ID",
  "settings.cloudSync.onedrive.clientIdPlaceholder": "Azure 应用程序客户端 ID",
  "settings.cloudSync.onedrive.clientIdHint": "在 Azure Portal 中创建应用并获取客户端 ID",
  "settings.cloudSync.onedrive.folder": "OneDrive 文件夹",
  "settings.cloudSync.onedrive.authenticated": "已认证",
  
  "settings.cloudSync.testConnection": "测试连接",
  "settings.cloudSync.authenticate": "认证",
  "settings.cloudSync.save": "保存",
  "settings.cloudSync.reconfigure": "重新配置",
  
  "settings.cloudSync.stats.total": "总文件数",
  "settings.cloudSync.stats.pushed": "已推送",
  "settings.cloudSync.stats.pulled": "已拉取",
  "settings.cloudSync.stats.conflicts": "冲突",
  "settings.cloudSync.stats.errors": "错误",
  
  "settings.cloudSync.direction_sync": "双向同步",
  "settings.cloudSync.direction_pull": "仅拉取",
  
  "settings.cloudSync.offlineQueue": "离线队列中有 {count} 个文件等待同步"
}
```

## IPC 接口

所有必需的 IPC 处理器已在 `cloud.ipc.ts` 中实现：

- `cloud:get-icloud-path` - 获取 iCloud 路径
- `cloud:set-icloud-path` - 设置自定义 iCloud 路径
- `cloud:onedrive-auth` - 启动 OneDrive OAuth 认证
- `cloud:get-onedrive-config` - 获取 OneDrive 配置
- `cloud:save-onedrive-config` - 保存 OneDrive 配置
- `cloud:get-all-providers` - 获取所有可用提供者
- `cloud:test-connection` - 测试连接
- 其他已有接口保持不变

## 测试建议

由于时间限制，集成测试尚未完成。建议测试：

1. **iCloud 测试**：
   - 在 macOS 上测试自动路径检测
   - 测试文件同步、冲突处理
   - 验证版本快照创建

2. **OneDrive 测试**：
   - 测试 OAuth 认证流程
   - 测试 token 自动刷新
   - 测试大文件上传/下载
   - 测试递归文件夹同步

3. **跨提供者测试**：
   - 切换提供者
   - 配置持久化
   - 错误处理

## 已知限制

1. **iCloud**：
   - 仅支持 macOS
   - 需要用户已登录 iCloud
   - 依赖文件系统访问

2. **OneDrive**：
   - 需要用户提供 Azure 应用 Client ID
   - OAuth 认证需要打开浏览器窗口
   - Token 过期时间为 1 小时

3. **通用**：
   - 大文件同步可能较慢
   - 网络故障会触发离线队列

## 后续改进建议

1. 添加完整的集成测试套件
2. 实现进度条显示（大文件上传/下载）
3. 支持选择性同步（排除特定文件/文件夹）
4. 添加同步日志查看器
5. 实现冲突解决 UI
6. 支持更多云存储提供者（Google Drive、Dropbox 等）
