import type { ReactNode } from 'react'

const isMac = window.api.platform === 'darwin'

interface TitleBarProps {
  children?: ReactNode
}

export function TitleBar({ children }: TitleBarProps) {
  const hasIntegratedTabs = Boolean(children)

  if (isMac) {
    return (
      <div
        className="titlebar titlebar-mac"
        style={{
          height: children ? 40 : 32,
          position: 'relative',
          background: 'transparent',
          WebkitAppRegion: 'drag',
          userSelect: 'none',
          flexShrink: 0,
        } as React.CSSProperties}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className="titlebar titlebar-windows"
      style={{
        height: hasIntegratedTabs ? 40 : 32,
        position: 'relative',
        padding: '0 0 0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'transparent',
        borderBottom: 'none',
        userSelect: 'none',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', letterSpacing: 0 }}>
          nexusky
        </span>
      </div>

      {children}

      <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.api.windowControls.minimize()}
          style={controlBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={() => window.api.windowControls.maximize()}
          style={controlBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => window.api.windowControls.close()}
          style={controlBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = 'var(--text-on-accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const controlBtnStyle: React.CSSProperties = {
  width: 46,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'background 120ms ease-out, color 120ms ease-out',
}
