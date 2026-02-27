'use client'

import React, { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { usePaletteMaterial } from './materials/PaletteMaterial'

const MODEL_PATH = '/models/terrain.glb'

export function Terrain(props) {
  const { scene } = useGLTF(MODEL_PATH)
  const { paletteMat, fallbackMat } = usePaletteMaterial()

  useEffect(() => {
    if (!scene) return
    scene.traverse((child) => {
      if (!child.isMesh) return
      child.frustumCulled = true
      child.receiveShadow = true
      const hasColor = !!child.geometry?.attributes?.color
      child.material = hasColor ? paletteMat : fallbackMat
    })
  }, [scene, paletteMat, fallbackMat])

  return (
    <group {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
