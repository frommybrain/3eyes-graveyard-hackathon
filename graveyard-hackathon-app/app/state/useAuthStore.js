import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  // 'wallet' = native wallet (Phantom/Solflare), 'crossmint' = email-based custodial
  authMethod: null,
  email: null,

  setAuth: (method, email = null) => set({ authMethod: method, email }),
  clear: () => set({ authMethod: null, email: null }),
}))
