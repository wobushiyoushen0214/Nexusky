import { useEffect, useRef } from 'react'

interface ConfirmModalProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title = '确认操作',
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const overlayPointerDownRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div
      className="animate-overlay-in glass-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--overlay-bg)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)',
      }}
      onPointerDown={(e) => {
        overlayPointerDownRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (overlayPointerDownRef.current && e.target === e.currentTarget) onCancel()
        overlayPointerDownRef.current = false
      }}
    >
      <div
        className="animate-scale-in glass-popover"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380, padding: '20px 22px',
          background: 'var(--bg-glass-dense, var(--bg-glass-solid))',
          border: '1px solid var(--glass-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-popover)',
          backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
          WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: '10px 0 18px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6,
              background: 'transparent', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, fontWeight: 500,
              background: danger ? 'var(--danger)' : 'var(--accent)',
              color: 'var(--text-on-accent)', border: 'none', cursor: 'pointer',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
