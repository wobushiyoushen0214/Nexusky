import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'
import { useUIStore } from '../stores/ui-store'
import { toast } from '../stores/toast-store'
import { isCancellationError } from '../utils/errors'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Empty, EmptyDescription } from './ui/empty'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Spinner } from './ui/spinner'
import './graph-generator.css'

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
  const language = useUIStore((s) => s.language)
  const progressRef = useRef('')
  const generatingRef = useRef(false)

  useEffect(() => { generatingRef.current = generating }, [generating])

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
    const res = await window.api.invoke('ai:generate-graph', { filePaths, vaultPath, language })
    if (res.success && res.content) {
      setResult(res.content)
    } else if (isCancellationError(res.error)) {
      setProgress('')
    } else {
      toast(res.error || '生成失败', 'error')
    }
    setGenerating(false)
  }

  const handleClose = () => {
    if (generatingRef.current) {
      window.api.invoke('ai:stop', undefined).catch(() => {})
      setGenerating(false)
    }
    onClose()
  }

  const handleSave = async () => {
    if (!vaultPath || !result) return
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const fileName = `知识图谱_${dateStr}.md`
    const content = `# 知识图谱\n\n> 基于 ${filePaths.length} 篇笔记自动生成\n\n\`\`\`mermaid\n${result}\n\`\`\`\n`
    const path = `${vaultPath}/${fileName}`
    await window.api.invoke('file:create', { path, content, vaultPath })
    await useVaultStore.getState().refreshFiles([path])
    useEditorStore.getState().openFile(path)
    toast('知识图谱已保存', 'success')
    onClose()
  }

  useEffect(() => {
    if (open && filePaths.length > 0 && !generating && !result) {
      handleGenerate()
    }
  }, [open, filePaths])

  const fileNames = filePaths.map((p) => p.split(/[\\/]/).pop()?.replace(/\.md$/, '') || '')

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="animate-scale-in glass-popover"
        style={{ width: 560, maxHeight: '80vh', background: 'var(--bg-glass-dense, var(--bg-glass-solid))', borderRadius: 14, border: '1px solid var(--glass-panel-border)', boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}
      >
        {/* Header */}
        <DialogHeader className="glass-divider-bottom" style={{ height: 44, padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0', flexShrink: 0, background: 'var(--panel-bg-soft)', boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-divider-shadow-bottom)' }}>
          <DialogTitle style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI 知识图谱生成</DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={handleClose} aria-label="关闭" style={{ width: 24, height: 24, borderRadius: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </Button>
        </DialogHeader>

        {/* File list */}
        <div className="glass-divider-bottom" style={{ padding: '12px 18px', borderBottom: '0', flexShrink: 0, boxShadow: 'var(--glass-divider-shadow-bottom)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>分析 {filePaths.length} 个文件</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {fileNames.slice(0, 10).map((name, i) => (
              <Badge key={i} variant="outline">
                {name}
              </Badge>
            ))}
            {fileNames.length > 10 && (
              <Badge variant="secondary">+{fileNames.length - 10} 个</Badge>
            )}
          </div>
        </div>

        {/* Progress / Result */}
        <ScrollArea style={{ flex: 1, minHeight: 200 }}>
          <div style={{ padding: '16px 18px', minHeight: 200 }}>
          {generating && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Spinner aria-hidden="true" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                <span style={{ fontSize: 12, color: 'var(--accent-text)' }}>正在分析笔记关系...</span>
              </div>
              {progress && (
                <GraphCodeBlock maxHeight={300} color="var(--text-secondary)">{progress}</GraphCodeBlock>
              )}
            </div>
          )}
          {!generating && result && (
            <GraphCodeBlock maxHeight={400} color="var(--text-primary)">{result}</GraphCodeBlock>
          )}
          {!generating && !result && !progress && (
            <Empty className="graph-generator-empty">
              <EmptyDescription>准备生成...</EmptyDescription>
            </Empty>
          )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="glass-divider-top" style={{ padding: '12px 18px', borderTop: '0', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0, boxShadow: 'var(--glass-divider-shadow-top)' }}>
          {!generating && result && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                重新生成
              </Button>
              <Button type="button" size="sm" onClick={handleSave}>
                保存为笔记
              </Button>
            </>
          )}
          {generating && (
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              取消
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GraphCodeBlock({ children, color, maxHeight }: { children: string; color: string; maxHeight: number }) {
  const height = getGraphCodeBlockHeight(children, maxHeight)

  return (
    <ScrollArea style={{ height, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}>
      <pre style={{ ...graphCodeBlockStyle, color }}>{children}</pre>
    </ScrollArea>
  )
}

function getGraphCodeBlockHeight(content: string, maxHeight: number): number {
  const hardLines = content.split('\n').length
  const wrappedLines = Math.ceil(content.length / 96)
  const estimatedLines = Math.max(hardLines, wrappedLines, 1)
  return Math.min(maxHeight, Math.max(64, estimatedLines * 20 + 28))
}

const graphCodeBlockStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}
