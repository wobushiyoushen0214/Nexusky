import { useState, useEffect, useRef } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { toast } from '../stores/toast-store'

interface GraphGeneratorProps {
  open: boolean
  filePaths: string[]
  onClose: () => void
}

export function GraphGenerator({ open, filePaths, onClose }: GraphGeneratorProps) {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState('')
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const progressRef = useRef('')

  useEffect(() => {
    if (!open) { setProgress(''); setResult(''); setGenerating(false); return }
    const cleanupProgress = window.api.onAiGraphProgress((data) => {
      progressRef.current += data.content
      setProgress(progressRef.current)
    })
    const cleanupDone = window.api.onAiGraphDone(() => {
      setGenerating(false)
    })
    return () => { cleanupProgress(); cleanupDone() }
  }, [open])

  const handleGenerate = async () => {
    if (!vaultPath || filePaths.length === 0) return
    setGenerating(true)
    setProgress('')
    setResult('')
    progressRef.current = ''
    const res = await window.api.invoke('ai:generate-graph', { filePaths, vaultPath })
    if (res.success && res.content) {
      setResult(res.content)
    } else {
      toast(res.error || '生成失败', 'error')
    }
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!vaultPath || !result) return
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const fileName = `知识图谱_${dateStr}.md`
    const content = `# 知识图谱\n\n> 基于 ${filePaths.length} 篇笔记自动生成\n\n\`\`\`mermaid\n${result}\n\`\`\`\n`
    const path = `${vaultPath}/${fileName}`
    await window.api.invoke('file:create', { path, content })
    useEditorStore.getState().openFile(path)
    toast('知识图谱已保存', 'success')
    onClose()
  }

  useEffect(() => {
    if (open && filePaths.length > 0 && !generating && !result) {
      handleGenerate()
    }
  }, [open, filePaths])

  if (!open) return null

  const fileNames = filePaths.map((p) => p.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="animate-scale-in"
        style={{ width: 560, maxHeight: '80vh', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ height: 44, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI 知识图谱生成</span>
          <button onClick={onClose} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* File list */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>分析 {filePaths.length} 个文件</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {fileNames.slice(0, 10).map((name, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                {name}
              </span>
            ))}
            {fileNames.length > 10 && (
              <span style={{ fontSize: 11, padding: '2px 8px', color: 'var(--text-tertiary)' }}>+{fileNames.length - 10} 个</span>
            )}
          </div>
        </div>

        {/* Progress / Result */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px', minHeight: 200 }}>
          {generating && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--accent-text)' }}>正在分析笔记关系...</span>
              </div>
              {progress && (
                <pre style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-base)', padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', maxHeight: 300, overflow: 'auto' }}>
                  {progress}
                </pre>
              )}
            </div>
          )}
          {!generating && result && (
            <pre style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-base)', padding: 12, borderRadius: 8, border: '1px solid var(--border-subtle)', maxHeight: 400, overflow: 'auto' }}>
              {result}
            </pre>
          )}
          {!generating && !result && !progress && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-tertiary)', fontSize: 13 }}>
              准备生成...
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          {!generating && result && (
            <>
              <button onClick={handleGenerate} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}>
                重新生成
              </button>
              <button onClick={handleSave} style={{ height: 32, padding: '0 14px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                保存为笔记
              </button>
            </>
          )}
          {generating && (
            <button onClick={onClose} style={{ height: 32, padding: '0 14px', fontSize: 12, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer' }}>
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
