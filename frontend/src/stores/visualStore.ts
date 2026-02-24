import { create } from 'zustand'

export type VisualMode = 'realistic' | 'instruction' | 'exploded' | 'x-ray' | 'stress'

export interface VisualStore {
  mode: VisualMode
  explosionFactor: number
  setMode: (mode: VisualMode) => void
  setExplosionFactor: (factor: number) => void
}

export const useVisualStore = create<VisualStore>((set) => ({
  mode: 'realistic',
  explosionFactor: 0,
  setMode: (mode) => set({ mode }),
  setExplosionFactor: (factor) => set({ explosionFactor: factor }),
}))
