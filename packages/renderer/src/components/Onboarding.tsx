import { useState } from 'react'

const ONBOARDING_KEY = 'nexusky-onboarding-done'

const steps = [
  {
    title: '欢迎使用 Nexusky',
    desc: 'AI 驱动的知识库笔记应用。本地优先，隐私安全。',
    icon: '✨',
  },
  {
    title: '双向链接',
    desc: '输入 [[笔记名]] 创建链接，构建知识网络。Ctrl+G 查看知识图谱。',
    icon: '🔗',
  },
  {
    title: 'AI 助手',
    desc: 'Ctrl+L 打开 AI 对话，@ 引用笔记作为上下文。切换编辑模式可直接修改文档。',
    icon: '🤖',
  },
  {
    title: '云端同步',
    desc: '支持 Supabase / iCloud / OneDrive，多设备无缝同步。',
    icon: '☁️',
  },
  {
    title: '快捷操作',
    desc: 'Ctrl+Shift+P 命令面板 | Ctrl+O 快速切换 | Ctrl+N 新建 | Ctrl+H 搜索替换',
    icon: '⌨️',
  },
]

interface OnboardingProps {
  onDone: () => void
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0)

  const handleFinish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    onDone()
  }

  const current = steps[step]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div style={{ width: 400, background: 'var(--bg-elevated)', borderRadius: 16, padding: '40px 32px 32px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>{current.icon}</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{current.title}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>{current.desc}</p>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: 9999, background: i === step ? 'var(--accent)' : 'var(--border-default)', transition: 'background 200ms' }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} style={{ height: 36, padding: '0 20px', fontSize: 13, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer' }}>
              上一步
            </button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(step + 1)} style={{ height: 36, padding: '0 20px', fontSize: 13, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
              下一步
            </button>
          ) : (
            <button onClick={handleFinish} style={{ height: 36, padding: '0 20px', fontSize: 13, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
              开始使用
            </button>
          )}
          {step < steps.length - 1 && (
            <button onClick={handleFinish} style={{ height: 36, padding: '0 12px', fontSize: 12, background: 'transparent', color: 'var(--text-tertiary)', border: 'none', cursor: 'pointer' }}>
              跳过
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(ONBOARDING_KEY)
}
