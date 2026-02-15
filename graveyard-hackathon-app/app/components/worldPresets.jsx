'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useGameStore } from '../state/useGameStore'
import * as THREE from 'three'

export default function WorldPresets({ sceneConfig }) {
  const outcome = useGameStore((s) => s.outcome)
  const { scene } = useThree()

  useEffect(() => {
    const skyColor = outcome?.preset?.skyTint || sceneConfig.sky.color
    scene.fog = null
    scene.background = new THREE.Color(skyColor)
  }, [outcome, sceneConfig, scene])

  return null
}
