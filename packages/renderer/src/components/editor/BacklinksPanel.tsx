import { useCallback, useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import { toast } from '../../stores/toast-store'
import { linkPlainMentionAtLine, linkPlainMentionsAtLines } from '../../utils/wikilink'
import type { BacklinkResult, OutgoingLinkResult, UnlinkedMentionResult } from '@shared/types/ipc'

export const DEFAULT_BACKLINKS_PANEL_COLLAPSED = true

export function BacklinksPanel() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const refreshFiles = useVaultStore((s) => s.refreshFiles)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const openFile = useEditorStore((s) => s.openFile)
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLinkResult[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])
  const [unlinkedMentions, setUnlinkedMentions] = useState<UnlinkedMentionResult[]>([])
  const [collapsed, setCollapsed] = useState(DEFAULT_BACKLINKS_PANEL_COLLAPSED)
  const [linkingAll, setLinkingAll] = useState(false)

  const loadLinks = useCallback(async () => {
    if (!vaultPath || !currentFilePath) {
      setOutgoingLinks([])
      setBacklinks([])
      setUnlinkedMentions([])
      return
    }
    try {
      const [nextOutgoingLinks, nextBacklinks, nextUnlinkedMentions] = await Promise.all([
        window.api.invoke('db:get-outgoing-links', { vaultPath, filePath: currentFilePath }),
        window.api.invoke('db:get-backlinks', { vaultPath, filePath: currentFilePath }),
        window.api.invoke('db:get-unlinked-mentions', { vaultPath, filePath: currentFilePath })
      ])
      setOutgoingLinks(nextOutgoingLinks)
      setBacklinks(nextBacklinks)
      setUnlinkedMentions(nextUnlinkedMentions)
    } catch {
      setOutgoingLinks([])
      setBacklinks([])
      setUnlinkedMentions([])
    }
  }, [vaultPath, currentFilePath])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  useEffect(() => {
    setCollapsed(DEFAULT_BACKLINKS_PANEL_COLLAPSED)
  }, [currentFilePath])

  const handleLinkMention = useCallback(async (item: UnlinkedMentionResult) => {
    if (!vaultPath) return
    try {
      const path = `${vaultPath}/${item.sourcePath}`
      const read = await window.api.invoke('file:read-with-hash', { path, vaultPath })
      const next = linkPlainMentionAtLine(read.content, item.line, item.mention)
      if (!next.changed) {
        toast(`未找到可转换的提及「${item.mention}」`, 'info')
        return
      }
      const applied = await window.api.invoke('file:apply-content-mutation', {
        path,
        content: next.content,
        vaultPath,
        expectedBeforeHash: read.hash
      })
      if (!applied.success) throw new Error(applied.error || '应用文件修改失败')
      await loadLinks()
      toast(`已转为链接: [[${item.mention}]]`, 'success')
    } catch {
      toast('转换链接失败', 'error')
    }
  }, [loadLinks, vaultPath])

  const handleLinkAllMentions = useCallback(async () => {
    if (!vaultPath || unlinkedMentions.length === 0 || linkingAll) return
    setLinkingAll(true)
    try {
      const grouped = new Map<string, UnlinkedMentionResult[]>()
      for (const item of unlinkedMentions) {
        const group = grouped.get(item.sourcePath) || []
        group.push(item)
        grouped.set(item.sourcePath, group)
      }

      let changedCount = 0
      for (const [sourcePath, items] of grouped) {
        const path = `${vaultPath}/${sourcePath}`
        const read = await window.api.invoke('file:read-with-hash', { path, vaultPath })
        const next = linkPlainMentionsAtLines(read.content, items.map((item) => ({ line: item.line, mention: item.mention })))
        if (next.changedCount === 0) continue
        const applied = await window.api.invoke('file:apply-content-mutation', {
          path,
          content: next.content,
          vaultPath,
          expectedBeforeHash: read.hash
        })
        if (!applied.success) throw new Error(applied.error || '应用文件修改失败')
        changedCount += next.changedCount
      }

      await loadLinks()
      toast(changedCount > 0 ? `已转换 ${changedCount} 条未链接提及` : '没有可转换的未链接提及', changedCount > 0 ? 'success' : 'info')
    } catch {
      toast('批量转换链接失败', 'error')
    } finally {
      setLinkingAll(false)
    }
  }, [linkingAll, loadLinks, unlinkedMentions, vaultPath])

  const total = outgoingLinks.length + backlinks.length + unlinkedMentions.length

  if (total === 0) return null

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%', height: 32, padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 150ms' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        链接概览 ({total})
      </button>
      {!collapsed && (
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {outgoingLinks.length > 0 && (
            <OutgoingSection
              items={outgoingLinks}
              vaultPath={vaultPath}
              currentFilePath={currentFilePath}
              refreshFiles={refreshFiles}
              openFile={openFile}
            />
          )}
          {backlinks.length > 0 && (
            <LinkSection
              title="已链接"
              items={backlinks}
              vaultPath={vaultPath}
              openFile={openFile}
            />
          )}
          {unlinkedMentions.length > 0 && (
            <LinkSection
              title="未链接提及"
              items={unlinkedMentions}
              vaultPath={vaultPath}
              openFile={openFile}
              onLinkMention={handleLinkMention}
              onLinkAllMentions={handleLinkAllMentions}
              linkingAll={linkingAll}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OutgoingSection({
  items,
  vaultPath,
  currentFilePath,
  refreshFiles,
  openFile
}: {
  items: OutgoingLinkResult[]
  vaultPath: string | null
  currentFilePath: string | null
  refreshFiles: () => Promise<void>
  openFile: (path: string) => Promise<void>
}) {
  const handleOpenOrCreate = async (item: OutgoingLinkResult) => {
    if (!vaultPath) return
    if (item.targetPath) {
      openFile(`${vaultPath}/${item.targetPath}`)
      return
    }
    const title = item.targetTitle.trim().replace(/[\\/:*?"<>|]/g, '')
    if (!title) return
    const path = await getAvailableNotePath(vaultPath, title)
    try {
      const applied = await window.api.invoke('file:apply-content-mutation', {
        path,
        content: `# ${title}\n\n`,
        vaultPath,
        allowCreate: true
      })
      if (!applied.success) throw new Error(applied.error || '创建笔记失败')
      await refreshFiles()
      await openFile(path)
      toast(`已创建笔记「${title}」`, 'success')
    } catch {
      toast('创建目标笔记失败', 'error')
    }
  }

  const jumpToSourceLine = async (item: OutgoingLinkResult) => {
    if (currentFilePath) await openFile(currentFilePath)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: { line: item.line } }))
    }, 200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, padding: '2px 2px 0' }}>出链</div>
      {items.map((item, i) => (
        <div
          key={`outgoing-${item.targetTitle}-${i}`}
          role="button"
          tabIndex={0}
          onClick={() => { jumpToSourceLine(item) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            void jumpToSourceLine(item)
          }}
          style={{
            textAlign: 'left', padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            cursor: 'pointer', display: 'block', width: '100%', position: 'relative',
            opacity: item.targetPath ? 1 : 0.72
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: item.targetPath ? 'var(--accent-text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.targetTitle}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>L{item.line}</span>
          </span>
          {item.context && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.context}
            </p>
          )}
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); void handleOpenOrCreate(item) }}
            style={{ display: 'inline-flex', alignItems: 'center', marginTop: 6, padding: 0, border: 'none', background: 'transparent', fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            {item.resolved ? '打开目标' : '创建目标'}
          </button>
        </div>
      ))}
    </div>
  )
}

async function getAvailableNotePath(vaultPath: string, title: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const suffix = i === 0 ? '' : ` ${i + 1}`
    const path = `${vaultPath}/${title}${suffix}.md`
    try {
      await window.api.invoke('file:stat', { path })
    } catch {
      return path
    }
  }
  return `${vaultPath}/${title} ${Date.now()}.md`
}

function LinkSection({
  title,
  items,
  vaultPath,
  openFile,
  onLinkMention,
  onLinkAllMentions,
  linkingAll
}: {
  title: string
  items: Array<BacklinkResult | UnlinkedMentionResult>
  vaultPath: string | null
  openFile: (path: string) => Promise<void>
  onLinkMention?: (item: UnlinkedMentionResult) => void
  onLinkAllMentions?: () => void
  linkingAll?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 2px 0' }}>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>{title}</span>
        {onLinkAllMentions && (
          <button
            type="button"
            disabled={linkingAll}
            onClick={onLinkAllMentions}
            style={{ padding: 0, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 10, cursor: linkingAll ? 'not-allowed' : 'pointer', opacity: linkingAll ? 0.5 : 1 }}
          >
            {linkingAll ? '转换中...' : '全部转为链接'}
          </button>
        )}
      </div>
      {items.map((item, i) => {
        const jumpToItem = () => {
          if (!vaultPath) return
          openFile(`${vaultPath}/${item.sourcePath}`)
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('editor-goto-line', { detail: { line: item.line } }))
          }, 200)
        }

        return (
          <div
            key={`${title}-${item.sourcePath}-${i}`}
            style={{
              textAlign: 'left', padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              display: 'block', width: '100%'
            }}
          >
            <button
              type="button"
              onClick={() => {
                jumpToItem()
              }}
              style={{
                textAlign: 'left', padding: 0, border: 'none',
                background: 'transparent', cursor: 'pointer', display: 'block', width: '100%'
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sourceTitle}</span>
                {'mention' in item && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>L{item.line} · 提到 {item.mention}</span>
                )}
                {!('mention' in item) && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>L{item.line}</span>
                )}
              </span>
              {item.context && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 0, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.context}
                </p>
              )}
            </button>
            {'mention' in item && onLinkMention && (
              <button
                type="button"
                onClick={() => {
                  onLinkMention(item)
                }}
                style={{ display: 'inline-flex', alignItems: 'center', marginTop: 6, padding: 0, border: 'none', background: 'transparent', fontSize: 10, color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >
                转为链接
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
