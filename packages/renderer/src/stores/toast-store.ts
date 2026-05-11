import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastState {
  toasts: Toast[]
  add: (type: ToastType, message: string) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (type, message) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    set({ toasts: [...get().toasts, { id, type, message }] })
    setTimeout(() => get().remove(id), 3500)
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export function toast(message: string, type: ToastType = 'info') {
  useToastStore.getState().add(type, message)
}
