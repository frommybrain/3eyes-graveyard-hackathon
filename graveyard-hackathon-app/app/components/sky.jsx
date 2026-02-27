'use client'

import { useRef, useMemo, useEffect } from 'react'
import {
  Fn, vec4, float, mix, smoothstep, positionLocal,
  uniform, color,
} from 'three/tsl'
import { BackSide } from 'three'
import { useControls } from 'leva'
import { useGameStore } from '../state/useGameStore'
import { gameConfig } from '../config/gameConfig'

export default function Sky({ radius = 500 }) {
  const outcome = useGameStore((s) => s.outcome)

  const { topColor, middleColor, bottomColor, horizonBias, middlePosition } = useControls('Sky', {
    topColor:        { value: '#000000', label: 'Top' },
    middleColor:     { value: '#53b2ff', label: 'Middle' },
    bottomColor:     { value: '#ffffff', label: 'Bottom' },
    horizonBias:     { value: 0.49, min: 0, max: 1, step: 0.01, label: 'Horizon Bias' },
    middlePosition:  { value: 0.31, min: 0, max: 1, step: 0.01, label: 'Middle Pos' },
  })

  const uniforms = useRef({
    topColor: uniform(color(topColor)),
    middleColor: uniform(color(middleColor)),
    bottomColor: uniform(color(bottomColor)),
    horizonBias: uniform(horizonBias),
    middlePosition: uniform(middlePosition),
  })

  // Update uniforms from leva
  useEffect(() => {
    uniforms.current.topColor.value.set(topColor)
    uniforms.current.middleColor.value.set(middleColor)
    uniforms.current.bottomColor.value.set(bottomColor)
    uniforms.current.horizonBias.value = horizonBias
    uniforms.current.middlePosition.value = middlePosition
  }, [topColor, middleColor, bottomColor, horizonBias, middlePosition])

  // Override with preset sky colors when active
  useEffect(() => {
    const preset = outcome?.preset
    if (preset?.skyTop) uniforms.current.topColor.value.set(preset.skyTop)
    if (preset?.skyMiddle) uniforms.current.middleColor.value.set(preset.skyMiddle)
    if (preset?.skyBottom) uniforms.current.bottomColor.value.set(preset.skyBottom)
  }, [outcome])

  const gradientNode = useMemo(() => {
    const u = uniforms.current

    return Fn(() => {
      const pos = positionLocal.normalize()
      const t = pos.y.add(1.0).mul(0.5)

      const biasedT = t.sub(u.horizonBias).div(float(1.0).sub(u.horizonBias)).clamp(0.0, 1.0)

      const lowerBlend = smoothstep(float(0.0), u.middlePosition, biasedT)
      const upperBlend = smoothstep(u.middlePosition, float(1.0), biasedT)

      const lowerGradient = mix(u.bottomColor, u.middleColor, lowerBlend)
      const gradientColor = mix(lowerGradient, u.topColor, upperBlend)

      return vec4(gradientColor, float(1.0))
    })()
  }, [])

  return (
    <mesh>
      <sphereGeometry args={[radius, 32, 16]} />
      <meshBasicNodeMaterial colorNode={gradientNode} side={BackSide} depthWrite={false} />
    </mesh>
  )
}
