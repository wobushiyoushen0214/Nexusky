import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../stores/ui-store'
import type { ProactiveSuggestion } from '@shared/types/ipc'
import './proactive.css'

const AUTO_DISMISS_MS = 4000
const IMPORTANCE_THRESHOLD = 80
const MAX_VISIBLE = 3

interface ToastEntry {
  suggestion: ProactiveSuggestion
  expiresAt: number
}

export function ProactiveToast() {
  const focusMode = useUIStore((s) => s.focusMode)
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const hoverRef = useRef<Record<string, boolean>>({})
  const focusModeRef = useRef(focusMode)

  useEffect(() => {
    focusModeRef.current = focusMode
  }, [focusMode])

  useEffect(() => {
    const off = window.api.onProactiveEmitted((suggestion) => {
      if (focusModeRef.current) return
      if (suggestion.importance < IMPORTANCE_THRESHOLD) return
      const now = Date.now()
      setToasts((prev) => {
        const next = prev.filter((entry) => entry.suggestion.id !== suggestion.id)
        next.unshift({ suggestion, expiresAt: now + AUTO_DISMISS_MS })
        return next.slice(0, MAX_VISIBLE)
      })
    })
    return off
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setToasts((prev) => prev.filter((entry) => {
        if (hoverRef.current[entry.suggestion.id]) return true
        return entry.expiresAt > now
      }))
    }, 250)
    return () => clearInterval(timer)
  }, [toasts.length])

  if (focusMode || toasts.length === 0) return null

  return (
    <div className="proactive-toast-container">
      {toasts.map((entry) => (
        <div
          key={entry.suggestion.id}
          className="proactive-toast"
          onMouseEnter={() => { hoverRef.current[entry.suggestion.id] = true }}
          onMouseLeave={() => {
            hoverRef.current[entry.suggestion.id] = false
            setToasts((prev) => prev.map((current) =>
              current.suggestion.id === entry.suggestion.id
                ? { ...current, expiresAt: Date.now() + AUTO_DISMISS_MS }
                : current
            ))
          }}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('proactive:cta', {
              detail: {
                action: entry.suggestion.ctaAction,
                payload: entry.suggestion.ctaPayload,
                suggestionId: entry.suggestion.id
              }
            }))
            setToasts((prev) => prev.filter((c) => c.suggestion.id !== entry.suggestion.id))
          }}
        >
          <div className="proactive-toast__title">{entry.suggestion.title}</div>
          {entry.suggestion.body && (
            <div className="proactive-toast__body">{entry.suggestion.body}</div>
          )}
        </div>
      ))}
    </div>
  )
}
