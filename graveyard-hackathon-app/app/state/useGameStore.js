import { create } from 'zustand'

export const GAME_PHASE = {
  IDLE: 'IDLE',
  SUMMONING: 'SUMMONING',
  REVEALED: 'REVEALED',
  CAPTURING: 'CAPTURING',
  VISION_RESULT: 'RESULT',
  MINTING: 'MINTING',
  DONE: 'DONE',
}

export const useGameStore = create((set, get) => ({
  phase: GAME_PHASE.IDLE,
  setPhase: (phase) => set({ phase }),

  // Vision tracking
  visionCount: 0,
  maxFreeVisions: 2,
  incrementVision: () => set((s) => ({ visionCount: s.visionCount + 1 })),
  setVisionCount: (visionCount) => set({ visionCount }),

  // Current session
  sessionId: null,
  setSession: (sessionId) => set({ sessionId }),

  // Current outcome (includes aura)
  outcome: null,
  setOutcome: (outcome) => set({ outcome }),

  // Captured selfie
  capturedBlob: null,
  setCapturedBlob: (blob) => {
    const { visionCount, outcome } = get()
    const entry = { visionNumber: visionCount, aura: outcome?.aura, blob }
    set((s) => ({
      capturedBlob: blob,
      visionHistory: [...s.visionHistory.filter((v) => v.visionNumber !== visionCount), entry],
    }))
  },

  // Vision history
  visionHistory: [],

  // Mint
  mintResult: null,
  hasMinted: false,
  setHasMinted: (hasMinted) => set({ hasMinted }),
  setMintResult: (result) => set({ mintResult: result, hasMinted: true }),

  // Reset for next vision (preserves visionCount, hasMinted, sessionId for aura carry-forward)
  reset: () =>
    set({
      phase: GAME_PHASE.IDLE,
      outcome: null,
      capturedBlob: null,
      mintResult: null,
    }),

  // Full reset (dev only)
  fullReset: () =>
    set({
      phase: GAME_PHASE.IDLE,
      visionCount: 0,
      sessionId: null,
      outcome: null,
      capturedBlob: null,
      visionHistory: [],
      mintResult: null,
      hasMinted: false,
    }),
}))
