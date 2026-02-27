import React, { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { usePaletteMaterial } from './materials/PaletteMaterial'

export function CatSculpture(props) {
    const { scene } = useGLTF('/models/cat.glb')
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
        <group {...props} dispose={null} scale={0.2}>
            <primitive object={scene} />
        </group>
    )
}

useGLTF.preload('/models/cat.glb')
