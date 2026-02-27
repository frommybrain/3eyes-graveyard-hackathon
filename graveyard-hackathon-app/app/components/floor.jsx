'use client'

import { GridMaterial } from './materials/GridMaterial'
import { gameConfig } from '../config/gameConfig'

export default function Floor() {
    const size = gameConfig.ground.size

    return (
        <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            position={[0, 0, 0]}
        >
            <planeGeometry args={[size, size]} />
            <GridMaterial />
        </mesh>
    )
}
