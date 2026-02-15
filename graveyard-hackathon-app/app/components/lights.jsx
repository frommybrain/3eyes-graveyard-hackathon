'use client'

import { useEffect, useRef } from 'react'
import { TileShadowNode } from 'three/addons/tsl/shadows/TileShadowNode.js'

export default function Lights({ config }) {
  const dirLightRef = useRef()

  useEffect(() => {
    const light = dirLightRef.current
    if (!light) return

    light.castShadow = true
    light.shadow.camera.near = 1
    light.shadow.camera.far = 200
    light.shadow.camera.right = 80
    light.shadow.camera.left = -80
    light.shadow.camera.top = 80
    light.shadow.camera.bottom = -80
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.001
    light.shadow.normalBias = 0

    const tsm = new TileShadowNode(light, {
      tilesX: 2,
      tilesY: 2,
    })
    light.shadow.shadowNode = tsm

    return () => {
      light.shadow.shadowNode = null
    }
  }, [])

  return (
    <>
      <directionalLight
        ref={dirLightRef}
        position={config.dirLight.position}
        intensity={config.dirLight.intensity}
        color={config.dirLight.color}
        castShadow
      />
      <ambientLight intensity={config.ambientLight.intensity} />
    </>
  )
}
