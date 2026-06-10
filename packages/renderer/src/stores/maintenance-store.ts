import { create } from 'zustand'
import type {
  MaintenanceOverview,
  MaintenanceSession,
  MaintenanceSessionSummary,
  KnowledgeMaintenanceItem,
  MaintenanceFeedbackStatus
} from '@shared/types/ipc'

type ViewMode = 'session' | 'summary' | 'legacy'

interface MaintenanceStore {
  // 状态
  overview: MaintenanceOverview | null
  currentSession: MaintenanceSession | null
  sessionSummary: MaintenanceSessionSummary | null
  viewMode: ViewMode
  loading: boolean
  error: string | null

  // 操作
  loadOverview: (vaultPath: string) => Promise<void>
  startSession: (vaultPath: string, packageId: string) => Promise<boolean>
  processCurrentItem: (vaultPath: string, action: MaintenanceFeedbackStatus) => Promise<void>
  completeSession: (vaultPath: string) => Promise<void>
  setViewMode: (mode: ViewMode) => void
  reset: () => void
}

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  // 初始状态
  overview: null,
  currentSession: null,
  sessionSummary: null,
  viewMode: 'legacy',
  loading: false,
  error: null,

  // 加载维护概览
  loadOverview: async (vaultPath: string) => {
    set({ loading: true, error: null })
    try {
      const overview = await window.api.invoke('maintenance:get-overview', { vaultPath })
      set({ overview, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false
      })
    }
  },

  // 开始维护会话
  startSession: async (vaultPath: string, packageId: string) => {
    set({ currentSession: null, loading: true, error: null })
    try {
      const session = await window.api.invoke('maintenance:start-session', {
        vaultPath,
        packageId
      })
      set({
        currentSession: session,
        loading: false,
        viewMode: 'session'
      })
      return true
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false
      })
      return false
    }
  },

  // 处理当前维护项
  processCurrentItem: async (vaultPath: string, action: MaintenanceFeedbackStatus) => {
    const { currentSession } = get()
    if (!currentSession) return

    set({ loading: true, error: null })
    try {
      // 获取当前项
      const currentItem = await window.api.invoke('maintenance:session-next-item', {
        vaultPath,
        sessionId: currentSession.id
      })

      if (!currentItem) {
        // 没有下一项了，完成会话
        await get().completeSession(vaultPath)
        return
      }

      // 记录操作
      await window.api.invoke('maintenance:session-record-action', {
        vaultPath,
        sessionId: currentSession.id,
        item: currentItem,
        action
      })

      // 重新获取会话状态
      const updatedSession = await window.api.invoke('maintenance:get-session', {
        vaultPath,
        sessionId: currentSession.id
      })

      set({ currentSession: updatedSession, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false
      })
    }
  },

  // 完成会话
  completeSession: async (vaultPath: string) => {
    const { currentSession } = get()
    if (!currentSession) return

    set({ loading: true, error: null })
    try {
      const summary = await window.api.invoke('maintenance:complete-session', {
        vaultPath,
        sessionId: currentSession.id
      })

      set({
        sessionSummary: summary,
        currentSession: null,
        loading: false,
        viewMode: 'summary'
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false
      })
    }
  },

  // 切换视图模式
  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode })
  },

  // 重置状态
  reset: () => {
    set({
      overview: null,
      currentSession: null,
      sessionSummary: null,
      viewMode: 'legacy',
      loading: false,
      error: null
    })
  }
}))
