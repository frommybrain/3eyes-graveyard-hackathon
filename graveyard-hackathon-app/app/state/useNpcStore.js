import { create } from 'zustand'

export const NPC_STATE = {
  IDLE_ROAM: 'IDLE_ROAM',
  SUMMONED: 'SUMMONED',
  RUN_TO_SPOT: 'RUN_TO_SPOT',
  POSE: 'POSE',
  SELFIE_CAPTURE: 'SELFIE_CAPTURE',
  DONE: 'DONE',
}

export const useNpcStore = create((set) => ({
  state: NPC_STATE.IDLE_ROAM,
  setState: (state) => set({ state }),

  targetSpot: null,
  setTargetSpot: (spot) => set({ targetSpot: spot }),

  currentPose: null,
  setCurrentPose: (pose) => set({ currentPose: pose }),

  position: [0, 0, 0],
  setPosition: (pos) => set({ position: pos }),

  rotation: 0,
  setRotation: (r) => set({ rotation: r }),
}))
