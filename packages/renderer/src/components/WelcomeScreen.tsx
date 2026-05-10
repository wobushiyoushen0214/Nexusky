import { useVaultStore } from '../stores/vault-store'

export function WelcomeScreen() {
  const selectVault = useVaultStore((s) => s.selectVault)

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0c0c1a 0%, #09090b 50%, #0a0a14 100%)' }}>

      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', animation: 'float 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', animation: 'float 10s ease-in-out infinite reverse' }} />
        <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', animation: 'float 12s ease-in-out infinite 2s' }} />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(var(--text-tertiary) 1px, transparent 1px), linear-gradient(90deg, var(--text-tertiary) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-12 animate-fade-up">
        {/* Logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center relative"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)', boxShadow: '0 20px 60px -10px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.1)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          {/* Glow ring */}
          <div className="absolute -inset-3 rounded-3xl opacity-20 blur-xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
        </div>

        {/* Text */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">My Note</h1>
          <p className="text-[15px] text-[var(--text-secondary)] max-w-[280px] leading-relaxed">
            AI 驱动的知识库，让笔记自动建立关联
          </p>
        </div>

        {/* CTA Button */}
        <button
          onClick={selectVault}
          className="group relative px-8 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)', boxShadow: '0 8px 32px -4px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}
        >
          <span className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            打开笔记库
          </span>
        </button>

        {/* Feature hints */}
        <div className="flex items-center gap-6 text-[12px] text-[var(--text-tertiary)]">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6366f1]" />
            双向链接
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]" />
            AI 语义搜索
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#06b6d4]" />
            知识图谱
          </div>
        </div>
      </div>
    </div>
  )
}
