// GridMaterial.jsx - Unreal Engine style grid material
import { useMemo } from 'react'
import {
    Fn, vec3, vec2, fract, mix, float, step, max, abs, positionWorld, normalWorld, select
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { extend } from '@react-three/fiber'
extend(THREE)

export function useGridMaterial({ gridSize = 2, lineWidth = 0.03, bgColor = [0.45, 0.45, 0.45], lineColor = [0.85, 0.85, 0.85] } = {}) {
    const gridColorNode = useMemo(() => {
        // Unreal Engine style grid using world-space coordinates
        // gridSize = size of each grid square in world units
        // Uses dominant axis selection (not blending) for clean lines on angled surfaces
        const gridNode = Fn(() => {
            const cellSize = float(gridSize)
            const width = float(lineWidth)

            // Get world position scaled by cell size
            const worldPos = positionWorld.div(cellSize)

            // Get absolute normal to determine dominant axis
            const absNormal = abs(normalWorld)

            // Determine which axis the surface faces most (dominant axis)
            const xDominant = absNormal.x.greaterThan(absNormal.y).and(absNormal.x.greaterThan(absNormal.z))
            const yDominant = absNormal.y.greaterThan(absNormal.x).and(absNormal.y.greaterThan(absNormal.z))
            // z is dominant if neither x nor y is

            // Select UV coordinates based on dominant axis
            // X-facing: use YZ plane
            // Y-facing: use XZ plane  
            // Z-facing: use XY plane
            const gridUV = select(
                xDominant,
                vec2(worldPos.y, worldPos.z),
                select(
                    yDominant,
                    vec2(worldPos.x, worldPos.z),
                    vec2(worldPos.x, worldPos.y)
                )
            )

            // Get position within each cell (0-1)
            const f = fract(gridUV)

            // Create lines at the edges of each cell
            const line = max(step(f.x, width), step(f.y, width))

            // Colors
            const bg = vec3(bgColor[0], bgColor[1], bgColor[2])
            const ln = vec3(lineColor[0], lineColor[1], lineColor[2])

            return mix(bg, ln, line)
        })

        return gridNode()
    }, [gridSize, lineWidth, bgColor, lineColor])

    return { gridColorNode }
}

export function GridMaterial({ gridSize, lineWidth, bgColor, lineColor, roughness = 1, metalness = 0 }) {
    const { gridColorNode } = useGridMaterial({ gridSize, lineWidth, bgColor, lineColor })

    return (
        <meshStandardNodeMaterial
            colorNode={gridColorNode}
            roughness={roughness}
            metalness={metalness}
            side={THREE.DoubleSide}
        />
    )
}

