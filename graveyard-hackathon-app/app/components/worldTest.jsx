'use client'

import React, { useEffect, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { usePaletteMaterial } from './materials/PaletteMaterial'

const MODEL_PATH = '/models/nftSelfieWorld-draco.glb'

export function WorldTest(props) {
  const { scene } = useGLTF(MODEL_PATH)
  const groupRef = useRef()
  const { paletteMat, fallbackMat } = usePaletteMaterial()

  useEffect(() => {
    if (!scene) return

    let meshCount = 0
    let vertCount = 0
    let coloredCount = 0

    scene.traverse((child) => {
      if (!child.isMesh) return
      meshCount++
      child.frustumCulled = true
      child.castShadow = true
      child.receiveShadow = true

      const hasColor = !!child.geometry?.attributes?.color
      child.material = hasColor ? paletteMat : fallbackMat
      if (hasColor) coloredCount++

      if (child.geometry) {
        if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere()
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
        const posAttr = child.geometry.attributes.position
        if (posAttr) vertCount += posAttr.count
      }
    })

    console.log(
      `[World] ${meshCount} meshes, ${vertCount.toLocaleString()} verts, ` +
      `${coloredCount} with palette, ${meshCount - coloredCount} fallback`
    )
  }, [scene, paletteMat, fallbackMat])

  return (
    <group ref={groupRef} {...props} dispose={null} scale={0.2} position={[0, 1, 0]}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
