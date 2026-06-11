# UI 实施状态

> 基于 IMPLEMENTATION_PLAN_2026-06.md  
> 开始日期：2026-06-11

## P0-1: Demo Transformation Showcase UI

### 已完成 ✅

1. **核心组件**
   - `packages/renderer/src/components/demo/DemoTransformationFlow.tsx` ✅
   - `packages/renderer/src/components/demo/DemoTransformationFlow.css` ✅

2. **WelcomeScreen 集成**
   - 添加 `DemoTransformationFlow` 导入 ✅
   - 添加 `showDemo` 状态 ✅
   - 添加 "Try Demo" 按钮 ✅
   - 添加按钮样式 ✅

### 待完成 ⏳

#### 1. 翻译文本添加

需要手动合并以下翻译到对应文件：

**中文翻译** (`packages/renderer/src/i18n/locales/zh-CN.json`)：

在 `"welcome"` 部分添加：
```json
"demo": {
  "button": "查看演示"
}
```

添加新的 `"demo"` 顶级键：
```json
"demo": {
  "title": "Vault 转化演示",
  "intro": "选择一个混乱的样例 vault，看看 Nexusky 如何在 30 秒内让它变得井然有序。",
  "notes": "笔记",
  "issues": "问题",
  "scanning": "正在扫描 {{name}}...",
  "issues": {
    "found": "发现以下问题",
    "brokenLinks": "断链",
    "orphanNotes": "孤岛笔记",
    "missingProperties": "缺失属性"
  },
  "healthScore": "健康分",
  "applyFix": "一键修复",
  "fixing": "修复中...",
  "before": "修复前",
  "after": "修复后",
  "transformation": {
    "complete": "转化完成！"
  },
  "fixesApplied": "已应用修复",
  "done": "完成",
  "error": {
    "scan": "扫描失败",
    "fix": "修复失败"
  }
}
```

**英文翻译** (`packages/renderer/src/i18n/locales/en.json`)：

在 `"welcome"` 部分添加：
```json
"demo": {
  "button": "Try Demo"
}
```

添加新的 `"demo"` 顶级键：
```json
"demo": {
  "title": "Vault Transformation Showcase",
  "intro": "Select a messy sample vault and see how Nexusky transforms it in 30 seconds.",
  "notes": "notes",
  "issues": "issues",
  "scanning": "Scanning {{name}}...",
  "issues": {
    "found": "Issues Found",
    "brokenLinks": "Broken Links",
    "orphanNotes": "Orphan Notes",
    "missingProperties": "Missing Properties"
  },
  "healthScore": "Health Score",
  "applyFix": "Apply AI Fix",
  "fixing": "Fixing...",
  "before": "Before",
  "after": "After",
  "transformation": {
    "complete": "Transformation Complete!"
  },
  "fixesApplied": "Fixes Applied",
  "done": "Done",
  "error": {
    "scan": "Scan failed",
    "fix": "Fix failed"
  }
}
```

#### 2. 等待 Codex 完成后端

需要 Codex 实现以下 IPC 接口：
- `demo:get-sample-vaults`
- `demo:run-transformation`
- `demo:get-before-after-stats`

在 `packages/shared/src/types/ipc.ts` 中添加类型定义。

#### 3. 测试流程

1. 启动应用 `pnpm dev`
2. 打开欢迎页
3. 点击 "查看演示" 按钮
4. 选择样例 vault（研究者/开发者/作家）
5. 查看扫描结果
6. 点击 "一键修复"
7. 查看 Before/After 对比

---

## P0-2: 产品叙事调整（正向化）

### 待实施

需要更新以下文件的翻译：

#### 全局文案替换

在 `zh-CN.json` 和 `en.json` 中：

```diff
- "Vault Health" → "Knowledge Vitality" (知识活力)
- "Maintenance Queue" → "Growth Opportunities" (成长机会)
- "Problems found" → "Opportunities to grow" (成长机会)
- "Fix issues" → "Unlock potential" (释放潜力)
```

#### Overview 界面调整

文件：`packages/renderer/src/components/overview/OverviewPanel.tsx`

需要添加：
1. 健康分相对排名显示
2. 趋势箭头
3. Growth Opportunities 卡片式布局
4. Vitality 徽章动画

---

## P0-3: Memory Timeline

### 待实施

需要创建：
1. `packages/renderer/src/components/memory/MemoryTimelinePanel.tsx`
2. `packages/renderer/src/components/memory/MemoryCard.tsx`
3. `packages/renderer/src/components/memory/MemoryExplanationModal.tsx`
4. `packages/renderer/src/components/ai/ChatMemoryPrompt.tsx`

---

## 依赖关系

```
P0-1 (Demo UI) ─── 等待 Codex 后端 ───> 可测试
       ↓
P0-2 (叙事调整) ─── 等待 Codex 健康分逻辑 ───> 可实施
       ↓
P0-3 (Memory Timeline) ─── 等待 Codex 数据层 ───> 可实施
```

---

## 下一步行动

### 立刻可做（无依赖）

1. ✅ 添加翻译文本到 `zh-CN.json` 和 `en.json`
2. ⏳ 准备 P0-2 的文案替换清单
3. ⏳ 设计 Memory Timeline 的视觉稿

### 等待 Codex

1. ⏳ P0-1 后端接口完成后测试 Demo 流程
2. ⏳ P0-2 健康分逻辑完成后实施 UI
3. ⏳ P0-3 数据层完成后实施 Memory Timeline

---

**更新时间**: 2026-06-11  
**下次更新**: Codex 完成 P0-1 后端后
