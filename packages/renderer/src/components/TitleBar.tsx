import type { ReactNode } from 'react'

const isMac = window.api.platform === 'darwin'

interface TitleBarProps {
  children?: ReactNode
}

export function TitleBar({ children }: TitleBarProps) {
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
        height: 40,
        position: 'relative',
        padding: '0 0 0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'transparent',
        borderBottom: '1px solid color-mix(in srgb, var(--glass-border) 50%, transparent)',
        userSelect: 'none',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 512 512" fill="none">
            <g stroke="var(--accent)" strokeWidth="12" strokeOpacity="0.5">
              <path d="M256 180 L180 260"/><path d="M256 180 L330 240"/><path d="M256 180 L256 100"/>
              <path d="M180 260 L140 340"/><path d="M180 260 L240 340"/>
              <path d="M330 240 L380 320"/><path d="M330 240 L290 340"/>
              <path d="M240 340 L290 340"/>
            </g>
            <circle cx="256" cy="100" r="16" fill="var(--accent)" fillOpacity="0.5"/>
            <circle cx="140" cy="340" r="14" fill="var(--accent)" fillOpacity="0.5"/>
            <circle cx="240" cy="340" r="14" fill="var(--accent)" fillOpacity="0.5"/>
            <circle cx="290" cy="340" r="14" fill="var(--accent)" fillOpacity="0.5"/>
            <circle cx="380" cy="320" r="14" fill="var(--accent)" fillOpacity="0.5"/>
            <circle cx="180" cy="260" r="22" fill="var(--accent)"/>
            <circle cx="330" cy="240" r="20" fill="var(--accent)"/>
            <circle cx="256" cy="180" r="32" fill="var(--accent)"/>
            <circle cx="256" cy="180" r="14" fill="var(--text-on-accent)" fillOpacity="0.8"/>
          </svg>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          Nexusky
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
