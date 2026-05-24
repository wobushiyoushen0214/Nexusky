import type { ToolDefinition } from '../../services/ai/base-provider'

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '搜索知识库中的笔记',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_similar_notes',
      description: '查找语义相近的跨文件夹笔记对，适合发现潜在双链、合并候选或相关主题。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按来源/目标标题或路径过滤，可选' },
          threshold: { type: 'number', description: '相似度阈值，0-1，默认 0.75' },
          limit: { type: 'number', description: '返回结果数量，1-10,默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_memory_related_notes',
      description: '基于已生成的笔记记忆查找共享概念或主题的跨文件夹笔记对，适合发现高层知识关系。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按来源/目标标题、路径或关联原因过滤，可选' },
          threshold: { type: 'number', description: '关系分数阈值，0-1，默认 0.3' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_connection_opportunities',
      description: '查找尚未互链但共享标签、属性或记忆概念的笔记对，适合主动发现可补 wikilink 的连接机会。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按来源/目标标题、路径或连接理由过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_note_memories',
      description: '列出已生成的笔记记忆摘要、概念和主题，适合先快速了解知识库内容再决定读取哪些笔记。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题、路径、概念、主题或摘要过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_memory_overview',
      description: '获取笔记记忆索引的覆盖率、过期数量、缺失数量以及概念/主题数量。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_memory_folders',
      description: '按文件夹汇总笔记记忆覆盖情况，帮助定位缺少或过期 memory 较多的目录。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按文件夹路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_memory_terms',
      description: '汇总已生成笔记记忆中的概念和主题，帮助发现知识库里的高频知识点。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'concept、topic 或 all，默认 all' },
          query: { type: 'string', description: '按概念或主题名过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_memory_term_pairs',
      description: '汇总笔记记忆中经常共同出现的概念/主题对，帮助发现主题簇和潜在知识结构。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'concept、topic、mixed 或 all，默认 all' },
          query: { type: 'string', description: '按任一概念或主题名过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_by_memory_term',
      description: '按指定记忆概念或主题列出匹配笔记，适合从高频知识点跳转到具体内容。',
      parameters: {
        type: 'object',
        properties: {
          term: { type: 'string', description: '概念或主题名，例如 React Hooks' },
          type: { type: 'string', description: 'concept、topic 或 all，默认 all' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['term']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_missing_memory',
      description: '列出缺少笔记记忆或记忆已过期的笔记，适合诊断 memory 关系结果不完整的原因。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'missing、stale 或 all，默认 all' },
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note_memory',
      description: '读取指定笔记的记忆摘要、概念、主题和是否过期。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_current_note_memory',
      description: '读取当前编辑器正在打开笔记的记忆摘要、概念、主题和是否过期。适合先了解当前笔记的高层语义。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description: '读取指定笔记的完整内容。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_current_note',
      description: '读取当前编辑器正在打开的笔记完整内容。适合用户提到“当前笔记”“这篇笔记”“这里”时直接使用。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_current_note_properties',
      description: '读取当前编辑器正在打开笔记的结构化属性/frontmatter/inline fields，包括 title、aliases、tags、cssclasses 等。适合回答当前笔记的状态、标签、别名或元数据。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_note_lines',
      description: '读取指定笔记的行号范围。适合先通过搜索、目录或块引用定位，再读取局部内容；单次最多 200 行。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' },
          startLine: { type: 'number', description: '起始行号，从 1 开始' },
          endLine: { type: 'number', description: '结束行号，可选；默认读取起始行后的 80 行，最多 200 行' }
        },
        required: ['title', 'startLine']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_current_note_lines',
      description: '读取当前编辑器正在打开笔记的行号范围。适合先用 list_current_note_headings 定位章节，再读取局部内容；单次最多 200 行。',
      parameters: {
        type: 'object',
        properties: {
          startLine: { type: 'number', description: '起始行号，从 1 开始' },
          endLine: { type: 'number', description: '结束行号，可选；默认读取起始行后的 80 行，最多 200 行' }
        },
        required: ['startLine']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_text_in_note',
      description: '在指定笔记内查找文本并返回命中行号。适合定位后再用 read_note_lines 精确读取局部内容。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' },
          query: { type: 'string', description: '要在笔记内查找的文本' },
          limit: { type: 'number', description: '返回命中数量，1-10，默认 5' }
        },
        required: ['title', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_text_in_current_note',
      description: '在当前编辑器正在打开的笔记内查找文本并返回命中行号。适合定位后再用 read_current_note_lines 精确读取局部内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要在当前笔记内查找的文本' },
          limit: { type: 'number', description: '返回命中数量，1-10，默认 5' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_vault_overview',
      description: '获取当前知识库的摘要，包括笔记、标签、任务、属性、链接、断链和孤岛笔记数量。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_note_links',
      description: '列出指定笔记的出链和反链。title 可传笔记标题、alias、Folder/Note 路径或 wikilink。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_current_note_links',
      description: '列出当前编辑器正在打开笔记的出链、反链和未链接提及。适合用户询问当前笔记关系或想补双链时使用。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_current_note_links',
      description: '汇总当前编辑器正在打开笔记的关系健康度，包括出链、已解析出链、断链、反链、未链接提及数量和 orphan/dead-end/unreferenced 信号。适合先判断是否需要展开 list_current_note_links。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_current_note_unlinked_references',
      description: '列出当前笔记正文中提到但尚未写成 wikilink 的已有笔记标题或 alias。适合发现可以补成 [[双向链接]] 的候选目标。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_note_headings',
      description: '列出指定笔记的 Markdown 标题目录。适合先查看长笔记结构，再用 read_note 读取某个 heading。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_current_note_headings',
      description: '列出当前编辑器正在打开笔记的 Markdown 标题目录。适合用户询问当前笔记结构，或在读取全文前先定位章节。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_note_blocks',
      description: '列出指定笔记中的 Obsidian block id。适合先发现块引用，再用 read_note 读取 Note#^block。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题、alias、路径或 wikilink' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_current_note_blocks',
      description: '列出当前编辑器正在打开笔记中的 Obsidian block id。适合先发现块引用，再用 read_current_note 或 read_note 读取 Note#^block。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '查询知识库中从 Markdown 任务列表索引出来的任务，默认返回未完成任务。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'open、done 或 all，默认 open' },
          query: { type: 'string', description: '按任务文本、笔记标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_current_note_tasks',
      description: '列出当前编辑器正在打开笔记中的 Markdown 任务，默认返回未完成任务。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'open、done 或 all，默认 open' },
          query: { type: 'string', description: '按任务文本过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tags',
      description: '列出知识库中的标签及使用次数，可按标签名过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标签名过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_folders',
      description: '列出知识库中的笔记文件夹及其笔记数量，可按文件夹路径过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按文件夹路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_by_folder',
      description: '列出指定文件夹中的笔记。folder 使用相对路径，例如 Projects 或 Daily/2026。',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: '文件夹相对路径' },
          recursive: { type: 'boolean', description: '是否包含子文件夹，默认 true' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['folder']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_by_tag',
      description: '列出指定标签下的笔记。tag 可带或不带 # 前缀。',
      parameters: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: '标签名，例如 project/research 或 #project/research' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['tag']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_properties',
      description: '列出知识库中的结构化属性键、出现次数和样例值。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按属性键过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_by_property',
      description: '按结构化属性键和值列出笔记。可查询 frontmatter 和 Dataview inline fields。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '属性键，例如 status、priority、aliases' },
          value: { type: 'string', description: '按属性值包含匹配过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_property_values',
      description: '列出指定结构化属性的不同取值、数量和样例路径。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '属性键，例如 status、priority、tags' },
          query: { type: 'string', description: '按属性值过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_notes_missing_property',
      description: '列出缺少指定结构化属性或属性值为空的笔记，适合补齐 status、source、priority 等元数据。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '属性键，例如 status、source、priority' },
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_recent_notes',
      description: '列出最近更新的笔记，可按标题或路径过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_unresolved_links',
      description: '列出知识库中尚未解析到现有笔记的 wikilink 断链，可按来源、目标或上下文过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按来源标题、路径、目标或上下文过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_orphan_notes',
      description: '列出没有 resolved 出链且没有反链的孤岛笔记，可按标题或路径过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_unreferenced_notes',
      description: '列出没有任何反链的笔记，可按标题或路径过滤，帮助把笔记接回知识网络。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dead_end_notes',
      description: '列出没有已解析出链的终点笔记，可按标题或路径过滤，帮助发现需要继续延展或补链接的内容。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_link_hubs',
      description: '列出链接最多的枢纽笔记，可按反链、出链或总连接数排序，帮助理解知识库结构。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', description: 'backlinks、outgoing 或 total，默认 total' },
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_knowledge_bridges',
      description: '列出连接多个文件夹或标签簇的桥梁笔记，帮助发现跨主题综合节点和优先维护对象。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题、路径、相邻文件夹或相邻标签过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_knowledge_maintenance',
      description: '生成下一步知识库维护队列，按断链、孤岛、未链接引用和知识桥梁等信号排序，适合回答“我接下来该整理什么”。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题、路径、动作、原因或细节过滤，可选' },
          type: { type: 'string', description: '只返回某类维护项，可选：fix_unresolved_link、review_overdue_tasks、review_due_today_tasks、review_high_priority_tasks、review_scheduled_tasks、review_started_tasks、review_blocked_tasks、review_recurring_tasks、review_upcoming_tasks、connect_orphan、fill_empty_note、resolve_duplicate_title、resolve_duplicate_alias、review_open_tasks、link_unlinked_reference、refresh_memory、split_large_note、fill_missing_property、maintain_bridge' },
          upcomingDays: { type: 'number', description: '即将到期任务窗口天数，默认 7，范围 1-30' },
          minCharacters: { type: 'number', description: '超长笔记字符阈值，默认 8000' },
          requiredProperties: { type: 'string', description: '需要检查的必填属性，逗号或空格分隔，默认 status,summary' },
          limit: { type: 'number', description: '返回维护动作数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_untagged_notes',
      description: '列出没有任何标签的笔记，可按标题或路径过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_empty_notes',
      description: '列出没有正文内容的空壳或占位笔记，可按标题或路径过滤。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_large_notes',
      description: '列出字符数较多的长笔记，便于建议拆分、提炼或建立索引。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          minCharacters: { type: 'number', description: '最小字符数，默认 8000，最低 1000' },
          limit: { type: 'number', description: '返回结果数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_duplicate_note_titles',
      description: '列出标题重复的笔记及其路径，帮助避免 read_note 歧义。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回重复标题组数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_duplicate_aliases',
      description: '列出被多个笔记共用的 alias，帮助排查 read_note 和 wikilink 解析歧义。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '按 alias、标题或路径过滤，可选' },
          limit: { type: 'number', description: '返回重复 alias 组数量，1-10，默认 5' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: '当用户要求在普通 Agent 对话中直接创建笔记时调用。此工具不会写文件，只会返回切换到编辑模式的安全引导。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '用户想创建的笔记标题，可选' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_note',
      description: '当用户要求在普通 Agent 对话中直接修改笔记时调用。此工具不会写文件，只会返回切换到编辑模式的安全引导。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '用户想修改的笔记标题、路径或当前笔记，可选' }
        }
      }
    }
  }
]
