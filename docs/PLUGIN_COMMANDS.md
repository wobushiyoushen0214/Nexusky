# 本地插件命令

Nexusky 会读取当前 vault 的 `.nexusky/plugins/*.json`，把其中声明的命令加入命令面板。

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
