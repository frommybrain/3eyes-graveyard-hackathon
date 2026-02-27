import { create } from 'zustand'

let nextId = 0

export const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'info', duration = 4000) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type, createdAt: Date.now() }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
    return id
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

// Convenience helpers
export const toast = {
  success: (msg, duration) => useToastStore.getState().addToast(msg, 'success', duration),
  error: (msg, duration) => useToastStore.getState().addToast(msg, 'error', duration ?? 6000),
  info: (msg, duration) => useToastStore.getState().addToast(msg, 'info', duration),
}
