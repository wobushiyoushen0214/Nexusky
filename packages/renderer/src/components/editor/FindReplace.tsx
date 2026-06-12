import { useState, useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

interface FindReplaceProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
}

export function FindReplace({ editor, open, onClose }: FindReplaceProps) {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => findRef.current?.focus(), 50)
      const selection = editor?.state.selection
      if (selection && !selection.empty) {
        const text = editor?.state.doc.textBetween(selection.from, selection.to)
        if (text) setFindText(text)
      }
    } else {
      clearHighlights()
    }
  }, [open])

  const clearHighlights = useCallback(() => {
    if (!editor) return
    editor.commands.unsetHighlight()
  }, [editor])

  const findMatches = useCallback((): { from: number; to: number }[] => {
    if (!editor || !findText) return []
    const doc = editor.state.doc
    const matches: { from: number; to: number }[] = []
    const searchText = caseSensitive ? findText : findText.toLowerCase()

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const nodeText = caseSensitive ? node.text : node.text.toLowerCase()
      let index = 0
      while (true) {
        const found = nodeText.indexOf(searchText, index)
        if (found === -1) break
        matches.push({ from: pos + found, to: pos + found + findText.length })
        index = found + 1
      }
    })

    return matches
  }, [editor, findText, caseSensitive])

  useEffect(() => {
    if (!open || !findText) { setMatchCount(0); return }
    const matches = findMatches()
    setMatchCount(matches.length)
  }, [findText, open])

  const handleFind = useCallback(() => {
    const matches = findMatches()
    if (matches.length === 0) return
    const next = currentMatch < matches.length ? currentMatch : 0
    setCurrentMatch(next)
    const match = matches[next]
    editor?.commands.setTextSelection(match)
    editor?.commands.scrollIntoView()
  }, [findMatches, currentMatch, editor])

  const handleFindNext = () => {
    const matches = findMatches()
    setMatchCount(matches.length)
    if (matches.length === 0) return
    const next = (currentMatch + 1) % matches.length
    setCurrentMatch(next)
    const match = matches[next]
    editor?.commands.setTextSelection(match)
    editor?.commands.scrollIntoView()
  }

  const handleFindPrev = () => {
    const matches = findMatches()
    setMatchCount(matches.length)
    if (matches.length === 0) return
    const prev = (currentMatch - 1 + matches.length) % matches.length
    setCurrentMatch(prev)
    const match = matches[prev]
    editor?.commands.setTextSelection(match)
    editor?.commands.scrollIntoView()
  }

  const handleReplace = () => {
    if (!editor || !findText) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to)
    const match = caseSensitive ? selectedText === findText : selectedText.toLowerCase() === findText.toLowerCase()
    if (match) {
      editor.chain().focus().deleteSelection().insertContent(replaceText).run()
      handleFindNext()
    } else {
      handleFindNext()
    }
  }

  const handleReplaceAll = () => {
    if (!editor || !findText) return
    const matches = findMatches()
    if (matches.length === 0) return

    let offset = 0
    const tr = editor.state.tr
    for (const match of matches) {
      tr.replaceWith(match.from + offset, match.to + offset, editor.schema.text(replaceText))
      offset += replaceText.length - findText.length
    }
    editor.view.dispatch(tr)
    setMatchCount(0)
    setCurrentMatch(0)
  }

  if (!open) return null

  return (
    <div className="glass-popover" style={{
      position: 'absolute', top: 8, right: 16, zIndex: 40,
      background: 'var(--bg-glass-dense, var(--bg-glass-solid))', border: '1px solid var(--glass-panel-border)',
      borderRadius: 10, padding: '10px 12px', boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)',
      display: 'flex', flexDirection: 'column', gap: 8, width: 320,
      backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
      WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
    }}>
      {/* Find row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Input
          ref={findRef}
          value={findText}
          onChange={(e) => { setFindText(e.target.value); setCurrentMatch(0) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.shiftKey ? handleFindPrev() : handleFind() }
            if (e.key === 'Escape') onClose()
          }}
          placeholder="查找"
          style={{ flex: 1, height: 28, padding: '0 8px', fontSize: 12, background: 'var(--control-bg)', border: '1px solid var(--control-border)', borderRadius: 5, color: 'var(--text-primary)', outline: 'none', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="大小写敏感"
          style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: caseSensitive ? '1px solid var(--accent)' : '1px solid var(--border-subtle)', background: caseSensitive ? 'var(--accent-muted)' : 'transparent', color: caseSensitive ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4, fontSize: 10, fontWeight: 700 }}
        >
          Aa
        </Button>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : findText ? '0' : ''}
        </span>
        <Button type="button" variant="ghost" size="icon" onClick={handleFindPrev} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }} title="上一个">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={handleFindNext} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }} title="下一个">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </Button>
      </div>
      {/* Replace row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Input
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleReplace(); if (e.key === 'Escape') onClose() }}
          placeholder="替换"
          style={{ flex: 1, height: 28, padding: '0 8px', fontSize: 12, background: 'var(--control-bg)', border: '1px solid var(--control-border)', borderRadius: 5, color: 'var(--text-primary)', outline: 'none', boxShadow: 'inset 0 1px 0 var(--glass-highlight)' }}
        />
        <Button type="button" variant="secondary" size="xs" onClick={handleReplace} style={{ height: 22, padding: '0 8px', fontSize: 10, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4 }}>替换</Button>
        <Button type="button" variant="secondary" size="xs" onClick={handleReplaceAll} style={{ height: 22, padding: '0 8px', fontSize: 10, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap' }}>全部</Button>
      </div>
    </div>
  )
}
