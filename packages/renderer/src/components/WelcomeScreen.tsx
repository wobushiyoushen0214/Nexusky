import { useVaultStore } from '../stores/vault-store'

export function WelcomeScreen() {
  const selectVault = useVaultStore((s) => s.selectVault)

  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
      <div className="text-center space-y-8 animate-fade-in">
        <div className="space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--primary)] flex items-center justify-center glow">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L2 7l10 4 10-4-10-4z" />
              <path d="M2 17l10 4 10-4" />
              <path d="M2 12l10 4 10-4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">My Note</h1>
          <p className="text-[var(--muted-foreground)] text-sm max-w-xs mx-auto">
            AI 驱动的知识库，让你的笔记自动建立关联
          </p>
        </div>

        <button
          onClick={selectVault}
          className="px-6 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-sm font-medium hover:bg-[var(--primary-hover)] transition-all duration-200 shadow-lg shadow-[var(--primary)]/20"
        >
          打开笔记库
        </button>

        <p className="text-xs text-[var(--muted-foreground)]">
          选择一个文件夹作为你的知识库
        </p>
      </div>
    </div>
  )
}
