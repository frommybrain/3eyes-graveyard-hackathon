'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useGameStore } from '../state/useGameStore'

// Module-level ref so we can update gradient color from outside PaletteMaterial
import { _cached } from './materials/PaletteMaterial'

export default function WorldPresets() {
  const outcome = useGameStore((s) => s.outcome)
  const getThree = useThree((s) => s.get)

  useEffect(() => {
    const { scene } = getThree()

    // No fog, no scene.background (Sky sphere handles the sky)
    scene.fog = null
    scene.background = null

    // Gradient mask color — apply preset if active
    const preset = outcome?.preset
    if (preset?.gradientColor && _cached?.gradientUniforms) {
      _cached.gradientUniforms.gradientColor.value.set(preset.gradientColor)
    }
  }, [outcome, getThree])

  return null
}
