'use client'

import { gameConfig } from '../config/gameConfig'

export default function Buildings() {
  return (
    <>
      {gameConfig.buildings.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
    </>
  )
}
