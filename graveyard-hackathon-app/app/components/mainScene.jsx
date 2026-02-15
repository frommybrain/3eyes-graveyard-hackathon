'use client'

import NPC from './NPC'
import CameraController from './selfieCamera'
import WorldPresets from './worldPresets'
import Floor from './floor'
import Sky from './sky'

export default function MainScene({ controls }) {
  return (
    <>
      <CameraController config={controls.selfieCamera} />
      <WorldPresets sceneConfig={controls.scene} />

      <Floor controls={controls}/>
      <Sky simple />

      {/* NPC */}
      <NPC config={controls.npc} />
    </>
  )
}
