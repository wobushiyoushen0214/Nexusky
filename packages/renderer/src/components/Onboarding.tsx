import { useState } from 'react'
import { safeGet, safeSet } from '../utils/storage'

const ONBOARDING_KEY = 'nexusky-onboarding-done'

const steps = [
  {
    title: 'Nexusky',
    subtitle: '你的第二大脑',
    desc: '所有笔记存在本地，Markdown 原生格式，随时可迁移。\n没有账号体系，没有锁定，你的数据只属于你。',
    visual: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="28" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
        <circle cx="32" cy="32" r="16" stroke="var(--accent)" strokeWidth="1.5" opacity="0.7" />
        <circle cx="32" cy="32" r="5" fill="var(--accent)" opacity="0.9" />
        <circle cx="18" cy="20" r="3" fill="var(--accent)" opacity="0.5" />
        <circle cx="46" cy="24" r="2.5" fill="var(--accent)" opacity="0.4" />
        <circle cx="44" cy="44" r="3" fill="var(--accent)" opacity="0.5" />
        <circle cx="20" cy="46" r="2" fill="var(--accent)" opacity="0.3" />
        <line x1="32" y1="32" x2="18" y2="20" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
        <line x1="32" y1="32" x2="46" y2="24" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
        <line x1="32" y1="32" x2="44" y2="44" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
        <line x1="32" y1="32" x2="20" y2="46" stroke="var(--accent)" strokeWidth="0.5" opacity="0.3" />
      </svg>
    ),
  },
  {
    title: '知识图谱',
    subtitle: '看见思维的形状',
    desc: '笔记之间用 [[双向链接]] 连接，自动生成可视化图谱。\n文件夹即分组，连接越多的节点越亮。',
    visual: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="20" r="6" stroke="#7c6ef5" strokeWidth="1.5" fill="none" />
        <circle cx="18" cy="42" r="4" stroke="#10b981" strokeWidth="1.2" fill="none" />
        <circle cx="46" cy="42" r="4" stroke="#f59e0b" strokeWidth="1.2" fill="none" />
        <circle cx="32" cy="52" r="3" stroke="#06b6d4" strokeWidth="1" fill="none" />
        <line x1="32" y1="26" x2="18" y2="38" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <line x1="32" y1="26" x2="46" y2="38" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <line x1="18" y1="42" x2="46" y2="42" stroke="var(--text-tertiary)" strokeWidth="0.5" opacity="0.3" />
        <line x1="18" y1="45" x2="32" y2="50" stroke="var(--text-tertiary)" strokeWidth="0.5" opacity="0.3" />
        <line x1="46" y1="45" x2="32" y2="50" stroke="var(--text-tertiary)" strokeWidth="0.5" opacity="0.3" />
        <text x="32" y="22" textAnchor="middle" fontSize="5" fill="var(--text-secondary)" fontWeight="600">Hub</text>
      </svg>
    ),
  },
  {
    title: 'AI 深度集成',
    subtitle: '不只是聊天',
    desc: '对话中 @ 引用任意笔记作为上下文，AI 直接读取你的 vault 证据。\n切换到编辑模式，AI 先生成可预览的修改方案。',
    visual: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="12" y="16" width="40" height="32" rx="8" stroke="var(--accent)" strokeWidth="1.2" opacity="0.5" />
        <rect x="18" y="24" width="20" height="3" rx="1.5" fill="var(--text-tertiary)" opacity="0.4" />
        <rect x="18" y="30" width="14" height="3" rx="1.5" fill="var(--text-tertiary)" opacity="0.3" />
        <rect x="18" y="36" width="24" height="3" rx="1.5" fill="var(--accent)" opacity="0.5" />
        <circle cx="48" cy="40" r="8" fill="var(--accent)" opacity="0.15" />
        <path d="M45 38 L48 42 L51 38" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        <line x1="48" y1="35" x2="48" y2="42" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      </svg>
    ),
  },
  {
    title: '多端同步',
    subtitle: '随处继续',
    desc: '支持自选同步后端，笔记在多台设备间保持一致。\n离线时正常编辑，联网后自动合并。',
    visual: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="24" width="18" height="24" rx="3" stroke="var(--text-secondary)" strokeWidth="1" opacity="0.5" />
        <rect x="38" y="20" width="20" height="28" rx="3" stroke="var(--text-secondary)" strokeWidth="1" opacity="0.5" />
        <path d="M26 36 C30 36 34 36 38 36" stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
        <circle cx="32" cy="36" r="4" stroke="var(--accent)" strokeWidth="1" fill="none" opacity="0.7" />
        <path d="M30.5 36 L31.5 37 L33.5 35" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      </svg>
    ),
  },
  {
    title: '准备好了',
    subtitle: '几个快捷键就够了',
    desc: '',
    shortcuts: [
      { keys: 'Ctrl+N', label: '新建笔记' },
      { keys: 'Ctrl+G', label: '知识图谱' },
      { keys: 'Ctrl+L', label: 'AI 对话' },
      { keys: 'Ctrl+O', label: '快速切换' },
      { keys: 'Ctrl+Shift+P', label: '命令面板' },
    ],
    visual: (
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="14" y="22" width="36" height="22" rx="4" stroke="var(--text-secondary)" strokeWidth="1" opacity="0.4" />
        <rect x="18" y="26" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="26" y="26" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="34" y="26" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="42" y="26" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="20" y="33" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="28" y="33" width="6" height="5" rx="1" stroke="var(--accent)" strokeWidth="1" opacity="0.7" />
        <rect x="36" y="33" width="6" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
        <rect x="44" y="33" width="4" height="5" rx="1" stroke="var(--text-tertiary)" strokeWidth="0.8" opacity="0.4" />
      </svg>
    ),
  },
]

const isMac = navigator.platform.toUpperCase().includes('MAC')
function formatKey(key: string): string {
  if (isMac) return key.replace(/Ctrl/g, 'Cmd')
  return key
}

interface OnboardingProps {
  onDone: () => void
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)

  const handleFinish = () => {
    safeSet(ONBOARDING_KEY, '1')
    onDone()
  }

  const current = steps[step]

  return (
    <div className="glass-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(150%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(150%)' }}>
      <div className="glass-popover" style={{ width: 420, background: 'var(--bg-glass-dense, var(--bg-glass-solid))', borderRadius: 16, padding: '36px 32px 28px', textAlign: 'center', boxShadow: 'var(--shadow-popover), var(--glass-panel-edge-shadow)', border: '1px solid var(--glass-panel-border)', backdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)', WebkitBackdropFilter: 'blur(var(--glass-blur-strong)) saturate(170%)' }}>
        <div style={{ marginBottom: 20, opacity: 0.9 }}>{current.visual}</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.3px' }}>{current.title}</h2>
        <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 14, fontWeight: 500 }}>{current.subtitle}</p>

        {current.desc && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20, whiteSpace: 'pre-line' }}>{current.desc}</p>
        )}

        {current.shortcuts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, textAlign: 'left', padding: '0 20px' }}>
            {current.shortcuts.map((s) => (
              <div key={s.keys} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                <kbd style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 8px', fontFamily: 'inherit' }}>{formatKey(s.keys)}</kbd>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 20 }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? 'var(--accent)' : 'var(--border-default)',
                transition: 'all 250ms ease',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} style={{ height: 34, padding: '0 18px', fontSize: 13, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}>
              上一步
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(step + 1)} style={{ height: 34, padding: '0 22px', fontSize: 13, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
              继续
            </button>
          ) : (
            <button onClick={handleFinish} style={{ height: 34, padding: '0 22px', fontSize: 13, background: 'var(--accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
              开始使用
            </button>
          )}
          {step < steps.length - 1 && (
            <button onClick={handleFinish} style={{ height: 34, padding: '0 12px', fontSize: 12, background: 'transparent', color: 'var(--text-tertiary)', border: 'none', cursor: 'pointer' }}>
              跳过
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function shouldShowOnboarding(): boolean {
  return !safeGet(ONBOARDING_KEY)
}
