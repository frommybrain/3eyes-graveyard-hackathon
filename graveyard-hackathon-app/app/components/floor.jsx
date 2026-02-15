'use client'

import { GridMaterial } from './materials/GridMaterial'

export default function Floor({controls}) {


    return (
        <>

            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
                position={[0, 0, 0]}
            >
                <planeGeometry args={[controls.scene.ground.size, controls.scene.ground.size]} />
                <GridMaterial />
            </mesh>


        </>
    )
}
