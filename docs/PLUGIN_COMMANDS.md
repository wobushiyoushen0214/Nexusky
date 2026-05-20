# 本地插件 API

Nexusky 会读取当前 vault 的 `.nexusky/plugins/*.json`。插件目前采用声明式 API：可以注册 AI 命令、只读插件面板和编辑器扩展能力描述，不执行任意本地脚本。

示例：

```json
{
  "id": "research-tools",
  "name": "研究助手",
  "version": "0.1.0",
  "commands": [
    {
      "id": "summarize-topic",
      "title": "总结当前主题",
      "description": "让 AI 汇总当前知识库中的相关材料",
      "mode": "chat",
      "prompt": "请基于当前知识库，总结这个主题的关键观点、证据和待验证问题："
    }
  ],
  "panels": [
    {
      "id": "reading-queue",
      "title": "阅读队列",
      "description": "展示插件提供的工作流说明",
      "content": "1. 收集论文\n2. 生成摘要\n3. 输出待验证问题"
    }
  ],
  "editorExtensions": [
    {
      "id": "paper-callout",
      "title": "论文批注语法",
      "description": "声明插件会提供 Markdown / Slash / Toolbar 扩展能力",
      "kind": "markdown"
    }
  ]
}
```

字段：

- `id`: 插件唯一标识。
- `name`: 插件显示名称。
- `version`: 可选版本号。
- `commands`: 命令列表。
- `commands[].prompt`: 执行命令时投递到 AI 工作台的提示词。
- `commands[].mode`: `chat` 或 `edit`，默认 `chat`。
- `panels`: 只读插件面板列表。面板会出现在命令面板“插件”分组中，打开后显示在右侧面板。
- `panels[].content`: 面板正文，当前作为安全纯文本展示。
- `editorExtensions`: 编辑器扩展能力声明列表，用于显示和后续沙箱运行时注册。
- `editorExtensions[].kind`: `markdown`、`toolbar` 或 `slash`。
