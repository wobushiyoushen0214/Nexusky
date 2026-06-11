# Codex 任务：AI Provider 后端重构

> 来自：UI 开发  
> 日期：2026-06-11  
> 优先级：P1  
> 相关文档：docs/SETTINGS_REFACTOR_PLAN.md

---

## 🎯 任务目标

重构 AI Provider 的后端逻辑，简化配置结构，提供清晰的 IPC 接口给新的 UI。

---

## 📋 具体任务

### 1. 简化 AIProviderConfig 类型

**目标类型定义**：
```typescript
interface AIProviderConfig {
  id: string              // UUID
  name: string           // 用户自定义名称，如 "My OpenAI"
  type: 'openai' | 'claude' | 'custom' | 'ollama'
  apiKey: string         // API 密钥
  baseUrl: string        // API 端点，空字符串表示使用默认
  model: string          // 模型名称，如 "gpt-4.1-mini"
  enabled: boolean       // 是否启用
}
```

**要求**：
- 移除不必要的字段
- 统一命名规范
- 保持类型简洁

---

### 2. 实现 IPC 接口

#### 2.1 `ai:get-providers`
```typescript
'ai:get-providers': () => AIProviderConfig[]
```
- 返回所有已配置的 Provider
- 按创建时间排序
- 包含启用和禁用的

#### 2.2 `ai:save-provider`
```typescript
'ai:save-provider': (config: AIProviderConfig) => void
```
- 如果 `id` 为空，创建新 Provider（生成 UUID）
- 如果 `id` 存在，更新现有 Provider
- 验证必填字段
- 抛出友好的错误信息

#### 2.3 `ai:delete-provider`
```typescript
'ai:delete-provider': (params: { id: string }) => void
```
- 根据 ID 删除 Provider
- 如果 Provider 不存在，静默忽略
- 不允许删除最后一个启用的 Provider

#### 2.4 `ai:test-provider`
```typescript
interface TestResult {
  ok: boolean
  text: string
  latencyMs?: number
  model?: string
}

'ai:test-provider': (config: AIProviderConfig) => TestResult
```

**测试逻辑**：
1. 发送简单测试请求（如 "hi"）
2. 测量响应时间
3. 验证连接和 API Key
4. 返回结果：
   - `ok: true` - 连接成功，返回模型名和延迟
   - `ok: false` - 连接失败，返回错误信息

**错误类型**：
- API Key 无效
- Base URL 无法连接
- 模型不存在
- 网络超时

---

### 3. 存储实现

**建议方案**：
- 存储在 SQLite 数据库的 `ai_providers` 表
- 或者存储在配置文件 `.nexusky/ai-providers.json`

**Schema（数据库方案）**：
```sql
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

### 4. 迁移现有配置

**兼容性要求**：
- 读取旧的 Provider 配置（如果存在）
- 自动转换为新格式
- 保留用户设置

---

### 5. 类型定义更新

**需要更新的文件**：
- `packages/shared/src/types/ipc.ts` - 添加新的 IPC 接口
- 导出 `AIProviderConfig` 和 `TestResult` 类型
- 确保前后端类型一致

---

## 📝 实现清单

- [ ] 定义 `AIProviderConfig` 类型
- [ ] 实现 `ai:get-providers` IPC
- [ ] 实现 `ai:save-provider` IPC
- [ ] 实现 `ai:delete-provider` IPC
- [ ] 实现 `ai:test-provider` IPC
- [ ] 创建数据库表或配置文件
- [ ] 实现存储逻辑（增删改查）
- [ ] 实现测试逻辑
- [ ] 实现错误处理
- [ ] 实现配置迁移
- [ ] 更新类型定义文件
- [ ] 单元测试

---

## 🧪 测试用例

### Provider CRUD
```typescript
// 1. 创建新 Provider
const provider = {
  id: '',
  name: 'My OpenAI',
  type: 'openai',
  apiKey: 'sk-test',
  baseUrl: '',
  model: 'gpt-4.1-mini',
  enabled: true
}
await api.invoke('ai:save-provider', provider)

// 2. 获取所有 Providers
const providers = await api.invoke('ai:get-providers', null)
console.log(providers.length) // 应该包含新创建的

// 3. 更新 Provider
provider.model = 'gpt-4.1'
await api.invoke('ai:save-provider', provider)

// 4. 删除 Provider
await api.invoke('ai:delete-provider', { id: provider.id })
```

### Provider 测试
```typescript
// 成功案例
const result = await api.invoke('ai:test-provider', {
  id: '',
  name: 'Test',
  type: 'openai',
  apiKey: 'sk-valid-key',
  baseUrl: '',
  model: 'gpt-4.1-mini',
  enabled: true
})
// result.ok === true
// result.latencyMs < 3000

// 失败案例：无效 API Key
const result = await api.invoke('ai:test-provider', {
  ...provider,
  apiKey: 'invalid'
})
// result.ok === false
// result.text === 'Invalid API Key'
```

---

## ✅ 验收标准

1. **功能完整**：所有 IPC 接口正常工作
2. **类型安全**：前后端类型完全对齐，无类型错误
3. **错误处理**：友好的错误信息，覆盖所有失败场景
4. **性能**：测试响应 <3s，增删改查 <100ms
5. **兼容性**：支持旧配置迁移

---

## 📚 参考资料

- 现有实现：`packages/renderer/src/components/settings/Settings.tsx`
- UI 重构方案：`docs/SETTINGS_REFACTOR_PLAN.md`
- 类型定义：`packages/shared/src/types/ipc.ts`

---

**状态**：等待 Codex 实现  
**预计完成时间**：8 小时  
**下一步**：Codex 实现后，我对接新的 IPC 接口到 UI
