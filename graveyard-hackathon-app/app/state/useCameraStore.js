import { create } from 'zustand'

const CAMERA_POSITIONS = [
  { position: [1.02, 1.41, 4.19], lookAt: [-1.76, 1.75, -5.41] },
  { position: [-2.38, 1.49, -32.99], lookAt: [1.25, 1.13, -23.68] },
  { position: [0.73, 1.98, -21.28], lookAt: [6.28, 1.53, -29.59] },
  { position: [3.18, 1.38, -31.35], lookAt: [4.31, 2.01, -21.44] },
  { position: [-0.47, 1.67, 1.42], lookAt: [-0.81, 2.15, 11.40] },
  { position: [-17.94, 1.24, -68.74], lookAt: [-26.63, 0.27, -63.88] },
  { position: [1.00, 3.03, -54.30], lookAt: [0.93, 3.24, -64.30] },
  { position: [-3.38, 1.52, -6.01], lookAt: [-10.22, 1.67, 1.28] },
]

export const useCameraStore = create((set, get) => ({
  positions: CAMERA_POSITIONS,
  index: 0,
  next: () => set((s) => ({ index: (s.index + 1) % s.positions.length })),
  prev: () => set((s) => ({ index: (s.index - 1 + s.positions.length) % s.positions.length })),
  setIndex: (index) => set({ index }),
  current: () => {
    const { positions, index } = get()
    return positions[index]
  },
}))
