'use client'

import React, { useState, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { WebGPURenderer, BasicShadowMap } from 'three/webgpu'
import Lights from './lights'
import MainScene from './mainScene'
import { useSceneControls } from './levaControls'
import HiZRenderer from './HiZRenderer'
import PostProcessing from './postProcessing'

export default function MainCanvas() {
    const [frameloop, setFrameloop] = useState('never')
    const controls = useSceneControls()

    return (
        <div className="w-full h-full fixed inset-0 z-0 flex items-center justify-center bg-black">
            <Canvas
                //style={{ width: '100vh', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' }}
                shadows
                frameloop={frameloop}
                dpr={[0.8, 1]}
                camera={{ position: [0, 22, 48], fov: 55, near: 0.1, far: 1000 }}
                gl={async (props) => {
                    const renderer = new WebGPURenderer(props)
                    await renderer.init()
                    renderer.shadowMap.enabled = true
                    renderer.shadowMap.type = BasicShadowMap
                    setFrameloop('always')
                    return renderer
                }}
            >
                <Lights config={controls.lighting} />
                <Suspense>
                    <MainScene controls={controls} />
                </Suspense>
                <PostProcessing />

            </Canvas>
        </div>
    )
}
