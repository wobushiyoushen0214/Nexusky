import { useEffect, useState } from 'react'
import { useVaultStore } from '../../stores/vault-store'
import { useEditorStore } from '../../stores/editor-store'
import type { BacklinkResult, OutgoingLinkResult, UnlinkedMentionResult } from '@shared/types/ipc'

export function BacklinksPanel() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const openFile = useEditorStore((s) => s.openFile)
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLinkResult[]>([])
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([])
  const [unlinkedMentions, setUnlinkedMentions] = useState<UnlinkedMentionResult[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!vaultPath || !currentFilePath) {
      setOutgoingLinks([])
      setBacklinks([])
      setUnlinkedMentions([])
      return
    }
    const relPath = currentFilePath.replace(vaultPath, '').replace(/\\/g, '/').replace(/^\//, '')
    const noteId = md5(relPath)
    Promise.all([
      window.api.invoke('db:get-outgoing-links', { vaultPath, noteId }),
      window.api.invoke('db:get-backlinks', { vaultPath, noteId }),
      window.api.invoke('db:get-unlinked-mentions', { vaultPath, noteId })
    ]).then(([nextOutgoingLinks, nextBacklinks, nextUnlinkedMentions]) => {
      setOutgoingLinks(nextOutgoingLinks)
      setBacklinks(nextBacklinks)
      setUnlinkedMentions(nextUnlinkedMentions)
    }).catch(() => {
      setOutgoingLinks([])
      setBacklinks([])
      setUnlinkedMentions([])
    })
  }, [vaultPath, currentFilePath])

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
  openFile
}: {
  items: OutgoingLinkResult[]
  vaultPath: string | null
  openFile: (path: string) => Promise<void>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, padding: '2px 2px 0' }}>出链</div>
      {items.map((item, i) => (
        <button
          key={`outgoing-${item.targetTitle}-${i}`}
          onClick={() => {
            if (vaultPath && item.targetPath) openFile(`${vaultPath}/${item.targetPath}`)
          }}
          disabled={!item.targetPath}
          style={{
            textAlign: 'left', padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            cursor: item.targetPath ? 'pointer' : 'default', display: 'block', width: '100%',
            opacity: item.targetPath ? 1 : 0.72
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: item.targetPath ? 'var(--accent-text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.targetTitle}</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{item.resolved ? '已解析' : '未创建'}</span>
          </span>
          {item.context && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.context}
            </p>
          )}
        </button>
      ))}
    </div>
  )
}

function LinkSection({
  title,
  items,
  vaultPath,
  openFile
}: {
  title: string
  items: Array<BacklinkResult | UnlinkedMentionResult>
  vaultPath: string | null
  openFile: (path: string) => Promise<void>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, padding: '2px 2px 0' }}>{title}</div>
      {items.map((item, i) => (
        <button
          key={`${title}-${item.sourcePath}-${i}`}
          onClick={() => {
            if (vaultPath) openFile(`${vaultPath}/${item.sourcePath}`)
          }}
          style={{
            textAlign: 'left', padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            cursor: 'pointer', display: 'block', width: '100%'
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sourceTitle}</span>
            {'mention' in item && (
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>提到 {item.mention}</span>
            )}
          </span>
          {item.context && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.context}
            </p>
          )}
        </button>
      ))}
    </div>
  )
}

function md5(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + str.length.toString(16).padStart(8, '0')
}
